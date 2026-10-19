'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('./server');

async function setup(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'revendas-api-'));
    const app = createServer({ dataFile: path.join(directory, 'store.json'), adminToken: 'test-admin-token' });
    await app.initialize();
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    t.after(async () => {
        await app.close();
        await fs.rm(directory, { recursive: true, force: true });
    });
    return `http://127.0.0.1:${address.port}`;
}

async function call(base, route, { method = 'GET', token, body, headers = {} } = {}) {
    const response = await fetch(`${base}${route}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
}

async function createCustomer(base, name = 'Cliente Teste', email = 'cliente@example.test') {
    const guest = await call(base, '/api/session', { method: 'POST' });
    const token = guest.body.token;
    const registration = await call(base, '/api/auth/register', {
        method: 'POST', token, body: { name, email, password: 'senha-segura-123' },
    });
    assert.equal(registration.status, 201);
    return { token, user: registration.body.user };
}

test('guest accumulates items, coupon migrates to client and creates receipt', async (t) => {
    const base = await setup(t);
    const guest = await call(base, '/api/session', { method: 'POST' });
    const token = guest.body.token;
    assert.equal(guest.body.user.role, 'guest');
    await call(base, '/api/cart/items', { method: 'POST', token, body: { productId: 'fone-wave', quantity: 2 } });
    const applied = await call(base, '/api/cart/coupons', { method: 'POST', token, body: { code: 'bemvindo10' } });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.subtotal, 43980);
    assert.equal(applied.body.discount, 4398);
    const registered = await call(base, '/api/auth/register', {
        method: 'POST', token, body: { name: 'Cliente Teste', email: 'cliente@example.test', password: 'senha-segura-123' },
    });
    assert.equal(registered.body.user.role, 'client');
    assert.equal((await call(base, '/api/cart', { token })).body.itemCount, 2);
    const checkout = await call(base, '/api/orders', { method: 'POST', token, body: {} });
    assert.equal(checkout.status, 201);
    assert.equal(checkout.body.order.total, 39582);
    assert.equal(checkout.body.order.invoices.length, 1);
    assert.equal(checkout.body.order.status, 'confirmed');
    assert.equal((await call(base, '/api/cart', { token })).body.itemCount, 0);
    assert.equal((await call(base, '/api/orders', { token })).body.orders.length, 1);
});

test('existing customer login also transfers the current guest cart', async (t) => {
    const base = await setup(t);
    const account = await call(base, '/api/session', { method: 'POST' });
    await call(base, '/api/auth/register', {
        method: 'POST', token: account.body.token,
        body: { name: 'Conta Existente', email: 'existente@example.test', password: 'senha-segura-123' },
    });
    const guest = await call(base, '/api/session', { method: 'POST' });
    await call(base, '/api/cart/items', { method: 'POST', token: guest.body.token, body: { productId: 'vaso-terracota' } });
    const login = await call(base, '/api/auth/login', {
        method: 'POST', token: guest.body.token,
        body: { email: 'existente@example.test', password: 'senha-segura-123' },
    });
    assert.equal(login.body.user.role, 'client');
    assert.equal((await call(base, '/api/cart', { token: guest.body.token })).body.itemCount, 1);
});

test('seller accepts orders, can chat, and cannot delete a product tied to a purchase', async (t) => {
    const base = await setup(t);
    const { token: buyerToken } = await createCustomer(base);
    await call(base, '/api/cart/items', { method: 'POST', token: buyerToken, body: { productId: 'fone-wave' } });
    const created = await call(base, '/api/orders', { method: 'POST', token: buyerToken, body: {} });
    const orderId = created.body.order.id;
    const buyerConversation = `/api/orders/${orderId}/messages`;
    assert.equal((await call(base, `${buyerConversation}?sellerId=seller-demo`, { token: buyerToken })).status, 409);

    const login = await call(base, '/api/auth/login', {
        method: 'POST', body: { email: 'vendedor@revendas.test', password: 'vendedor123' },
    });
    assert.equal(login.body.user.role, 'seller');
    const sellerToken = login.body.token;
    const decision = await call(base, `/api/seller/orders/${orderId}`, { method: 'PATCH', token: sellerToken, body: { status: 'accepted' } });
    assert.equal(decision.body.order.status, 'accepted');
    const sent = await call(base, buyerConversation, { method: 'POST', token: buyerToken, body: { sellerId: 'seller-demo', text: 'Olá, tenho uma dúvida.' } });
    assert.equal(sent.status, 201);
    assert.equal((await call(base, `${buyerConversation}?sellerId=seller-demo`, { token: sellerToken })).body.messages.length, 1);
    assert.equal((await call(base, '/api/seller/products/fone-wave', { method: 'DELETE', token: sellerToken })).status, 409);
});

test('seller rejection updates the order and restores available stock', async (t) => {
    const base = await setup(t);
    const { token: buyerToken } = await createCustomer(base, 'Cliente', 'recusa@example.test');
    await call(base, '/api/cart/items', { method: 'POST', token: buyerToken, body: { productId: 'smartwatch-pulse' } });
    const { body: created } = await call(base, '/api/orders', { method: 'POST', token: buyerToken, body: {} });
    const seller = await call(base, '/api/auth/login', {
        method: 'POST', body: { email: 'vendedor@revendas.test', password: 'vendedor123' },
    });
    const rejected = await call(base, `/api/seller/orders/${created.order.id}`, {
        method: 'PATCH', token: seller.body.token, body: { status: 'rejected' },
    });
    assert.equal(rejected.body.order.status, 'rejected');
    const product = (await call(base, '/api/products')).body.products.find((item) => item.id === 'smartwatch-pulse');
    assert.equal(product.stock, 50);
});

test('seller-scoped coupons discount only their own items and seller removal is ownership checked', async (t) => {
    const base = await setup(t);
    const adminHeaders = { 'X-Admin-Token': 'test-admin-token' };
    await call(base, '/api/admin/sellers', {
        method: 'POST', headers: adminHeaders,
        body: { name: 'Vendedora Independente', email: 'independente@example.test', password: 'senha-de-vendedor-123' },
    });
    const seller = await call(base, '/api/auth/login', {
        method: 'POST', body: { email: 'independente@example.test', password: 'senha-de-vendedor-123' },
    });
    const token = seller.body.token;
    const product = await call(base, '/api/seller/products', {
        method: 'POST', token, body: { name: 'Produto do vendedor', category: 'casa', price: 10000, stock: 5 },
    });
    assert.equal(product.status, 201);
    const coupon = await call(base, '/api/seller/coupons', {
        method: 'POST', token, body: { code: 'LOJA20', type: 'percent', value: 20 },
    });
    assert.equal(coupon.status, 201);
    const { token: buyerToken } = await createCustomer(base);
    await call(base, '/api/cart/items', { method: 'POST', token: buyerToken, body: { productId: 'fone-wave' } });
    await call(base, '/api/cart/items', { method: 'POST', token: buyerToken, body: { productId: product.body.product.id } });
    const result = await call(base, '/api/cart/coupons', { method: 'POST', token: buyerToken, body: { code: 'LOJA20' } });
    assert.equal(result.body.subtotal, 31990);
    assert.equal(result.body.discount, 2000);
    assert.equal((await call(base, `/api/seller/products/${product.body.product.id}`, { method: 'DELETE', token })).status, 200);
    assert.equal((await call(base, '/api/products')).body.products.some((item) => item.id === product.body.product.id), false);
});

test('checkout validates stock atomically and guests cannot confirm orders', async (t) => {
    const base = await setup(t);
    const guest = await call(base, '/api/session', { method: 'POST' });
    await call(base, '/api/cart/items', { method: 'POST', token: guest.body.token, body: { productId: 'fone-wave' } });
    assert.equal((await call(base, '/api/orders', { method: 'POST', token: guest.body.token, body: {} })).status, 403);

    const { token } = await createCustomer(base, 'Comprador', 'comprador@example.test');
    await call(base, '/api/cart/items', { method: 'POST', token, body: { productId: 'fone-wave', quantity: 20 } });
    const results = await Promise.all([
        call(base, '/api/orders', { method: 'POST', token, body: {} }),
        call(base, '/api/orders', { method: 'POST', token, body: {} }),
    ]);
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal(results.filter((result) => result.status === 400).length, 1);
});

test('admin-only safe products stay outside the public catalog', async (t) => {
    const base = await setup(t);
    const denied = await call(base, '/api/admin/products', {
        method: 'POST', body: { name: 'Produto Seguro', price: 1000, stock: 3 },
    });
    assert.equal(denied.status, 403);
    const created = await call(base, '/api/admin/products', {
        method: 'POST',
        headers: { 'X-Admin-Token': 'test-admin-token' },
        body: { name: 'Produto Seguro', price: 1000, stock: 3 },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.product.ownerId, 'placeholder-admin');
    assert.equal((await call(base, '/api/products')).body.products.some((item) => item.id === created.body.product.id), false);
});
