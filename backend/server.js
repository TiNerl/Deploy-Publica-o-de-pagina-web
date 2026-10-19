'use strict';

const http = require('node:http');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const initialProducts = [
    ['fone-wave', 'Fone Bluetooth Wave', 'tecnologia', 21990, 'ÁUDIO+', 'photo-1505740420928-5e560c06d30e'],
    ['luminaria-nordica', 'Luminária Nórdica', 'casa', 17900, 'CASA BONITA', 'photo-1507473885765-e6ed057f782c'],
    ['mochila-urbana', 'Mochila Urbana 20L', 'moda', 18990, 'TRILHA & CIA', 'photo-1553062407-98eeb64c6a62'],
    ['smartwatch-pulse', 'Smartwatch Pulse', 'tecnologia', 34900, 'TECHNOW', 'photo-1523275335684-37898b6baf30'],
    ['vaso-terracota', 'Vaso Terracota P', 'casa', 8990, 'FEITO POR AQUI', 'photo-1578500494198-246f612d3b3d'],
    ['garrafa-termica', 'Garrafa Térmica 750ml', 'esportes', 10990, 'MOVIMENTO LIVRE', 'photo-1602143407151-7111542de6e8'],
    ['serum-vitamina-c', 'Sérum Vitamina C', 'beleza', 7990, 'PELE & CUIDADO', 'photo-1608248543803-ba4f8c70ae0b'],
    ['oculos-solar', 'Óculos Solar Urban', 'moda', 12990, 'ÓTICA DO CENTRO', 'photo-1517841905240-472988babdf9'],
].map(([id, name, category, price, sellerName, photo]) => ({
    id, name, category, price, sellerName, ownerId: 'seller-demo',
    image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=720&q=85`,
    stock: 50, active: true, safeInvoice: true,
}));

const emptyStore = () => ({
    users: [{
        id: 'seller-demo', name: 'Vendedor demonstração', email: 'vendedor@revendas.test',
        role: 'seller', password: hashPassword('vendedor123'), createdAt: new Date().toISOString(),
    }],
    products: structuredClone(initialProducts),
    coupons: [{
        id: 'coupon-welcome', code: 'BEMVINDO10', type: 'percent', value: 10,
        ownerId: null, active: true, description: '10% de desconto na loja',
    }],
    carts: {},
    sessions: {},
    orders: [],
    messages: [],
});

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createServer(options = {}) {
    const dataFile = options.dataFile || path.join(__dirname, 'data', 'store.json');
    const adminToken = options.adminToken || process.env.ADMIN_TOKEN;
    const allowedOrigin = options.allowedOrigin || process.env.API_ORIGIN || '*';
    let store;
    let queue = Promise.resolve();

    async function persist() {
        await fs.mkdir(path.dirname(dataFile), { recursive: true });
        const temporaryFile = `${dataFile}.${process.pid}.tmp`;
        await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
        await fs.rename(temporaryFile, dataFile);
    }

    async function initialize() {
        try {
            store = JSON.parse(await fs.readFile(dataFile, 'utf8'));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            store = emptyStore();
            await persist();
        }
    }

    function mutate(callback) {
        const operation = queue.then(async () => {
            const result = callback();
            await persist();
            return result;
        });
        queue = operation.catch(() => {});
        return operation;
    }

    function fail(status, message) {
        const error = new Error(message);
        error.status = status;
        throw error;
    }

    function send(response, status, payload) {
        response.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify(payload));
    }

    async function readBody(request) {
        let text = '';
        for await (const chunk of request) {
            text += chunk;
            if (text.length > 1_000_000) fail(413, 'Corpo da requisição muito grande.');
        }
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch {
            fail(400, 'O corpo da requisição deve ser JSON válido.');
        }
    }

    function sessionFor(request) {
        const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
        const session = token && store.sessions[token];
        const user = session && store.users.find((candidate) => candidate.id === session.userId);
        if (!user) fail(401, 'Sessão inválida ou expirada.');
        return { user, token };
    }

    function requireRole(user, role) {
        if (user.role !== role) fail(403, 'Você não tem permissão para esta operação.');
    }

    function requireAdmin(request) {
        if (!adminToken || request.headers['x-admin-token'] !== adminToken) {
            fail(403, 'Operação disponível somente para administradores.');
        }
    }

    function cartFor(userId) {
        if (!store.carts[userId]) store.carts[userId] = { items: [], couponId: null };
        return store.carts[userId];
    }

    function cartSummary(userId) {
        const cart = cartFor(userId);
        const items = cart.items.map((entry) => {
            const product = store.products.find((candidate) => candidate.id === entry.productId && candidate.active);
            if (!product) return null;
            return { productId: product.id, name: product.name, sellerName: product.sellerName, quantity: entry.quantity, unitPrice: product.price, lineTotal: product.price * entry.quantity, image: product.image };
        }).filter(Boolean);
        const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
        const coupon = store.coupons.find((candidate) => candidate.id === cart.couponId && candidate.active);
        let discount = 0;
        let couponError;
        if (coupon) {
            const eligibleSubtotal = coupon.ownerId === null
                ? subtotal
                : items.reduce((sum, item) => sum + (store.products.find((product) => product.id === item.productId)?.ownerId === coupon.ownerId ? item.lineTotal : 0), 0);
            if (!eligibleSubtotal) couponError = 'Este cupom não se aplica aos produtos do carrinho.';
            else discount = coupon.type === 'percent'
                ? Math.floor(eligibleSubtotal * coupon.value / 100)
                : Math.min(eligibleSubtotal, coupon.value);
        }
        return { items, coupon: coupon && !couponError ? { code: coupon.code, description: coupon.description } : null, couponError, subtotal, discount, total: subtotal - discount, itemCount: items.reduce((sum, item) => sum + item.quantity, 0) };
    }

    function safeOrder(order) {
        return {
            id: order.id, createdAt: order.createdAt, status: order.status,
            items: order.items, subtotal: order.subtotal, discount: order.discount,
            total: order.total, receiptNumber: order.receiptNumber,
            invoices: order.invoices, sellerStatuses: order.sellerStatuses,
        };
    }

    async function route(request, response) {
        if (request.method === 'OPTIONS') return send(response, 204, {});
        const url = new URL(request.url, 'http://localhost');
        const method = request.method;
        const parts = url.pathname.split('/').filter(Boolean);
        const body = ['POST', 'PATCH', 'DELETE'].includes(method) ? await readBody(request) : {};

        if (method === 'GET' && url.pathname === '/api/health') return send(response, 200, { status: 'ok' });
        if (method === 'GET' && url.pathname === '/api/products') {
            const products = store.products.filter((product) => product.active && product.ownerId !== 'placeholder-admin');
            return send(response, 200, { products });
        }
        if (method === 'POST' && url.pathname === '/api/session') {
            const token = randomBytes(32).toString('hex');
            const user = { id: randomUUID(), name: 'Visitante', role: 'guest', createdAt: new Date().toISOString() };
            await mutate(() => {
                store.users.push(user);
                store.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() };
                store.carts[user.id] = { items: [], couponId: null };
            });
            return send(response, 201, { token, user: { id: user.id, name: user.name, role: user.role } });
        }
        if (method === 'POST' && url.pathname === '/api/auth/register') {
            const name = String(body.name || '').trim();
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');
            if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
                fail(400, 'Informe nome, e-mail válido e senha com pelo menos 8 caracteres.');
            }
            const { user: guest, token } = sessionFor(request);
            requireRole(guest, 'guest');
            if (store.users.some((user) => user.email === email)) fail(409, 'Este e-mail já possui uma conta.');
            const client = { id: randomUUID(), name, email, role: 'client', password: hashPassword(password), createdAt: new Date().toISOString() };
            await mutate(() => {
                const guestCart = cartFor(guest.id);
                store.carts[client.id] = guestCart;
                delete store.carts[guest.id];
                Object.assign(guest, { id: client.id, name, email, role: 'client', password: client.password });
                store.sessions[token].userId = client.id;
            });
            return send(response, 201, { user: { id: client.id, name, email, role: 'client' } });
        }
        if (method === 'POST' && url.pathname === '/api/auth/login') {
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');
            const user = store.users.find((candidate) => candidate.email === email);
            if (!user?.password || !verifyPassword(password, user.password)) fail(401, 'E-mail ou senha inválidos.');
            const existingToken = request.headers.authorization?.replace(/^Bearer\s+/i, '');
            const existingSession = existingToken && store.sessions[existingToken];
            const guest = existingSession && store.users.find((candidate) => candidate.id === existingSession.userId && candidate.role === 'guest');
            const token = guest ? existingToken : randomBytes(32).toString('hex');
            await mutate(() => {
                if (guest) {
                    const source = cartFor(guest.id);
                    const destination = cartFor(user.id);
                    const combined = new Map(destination.items.map((item) => [item.productId, item.quantity]));
                    for (const item of source.items) combined.set(item.productId, (combined.get(item.productId) || 0) + item.quantity);
                    for (const [productId, quantity] of combined) {
                        const product = store.products.find((candidate) => candidate.id === productId && candidate.active);
                        if (!product || quantity > 20 || quantity > product.stock) fail(409, 'Não foi possível migrar o carrinho: ajuste os itens ou o estoque antes de entrar.');
                    }
                    destination.items = [...combined].map(([productId, quantity]) => ({ productId, quantity }));
                    if (!destination.couponId) destination.couponId = source.couponId;
                    delete store.carts[guest.id];
                }
                store.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() };
            });
            return send(response, 201, { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        }
        if (method === 'GET' && url.pathname === '/api/me') {
            const { user } = sessionFor(request);
            return send(response, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        }
        if (method === 'GET' && url.pathname === '/api/cart') {
            const { user } = sessionFor(request);
            return send(response, 200, cartSummary(user.id));
        }
        if (method === 'POST' && url.pathname === '/api/cart/items') {
            const { user } = sessionFor(request);
            const product = store.products.find((candidate) => candidate.id === body.productId && candidate.active && candidate.ownerId !== 'placeholder-admin');
            if (!product) fail(404, 'Produto não encontrado.');
            const quantity = Number(body.quantity ?? 1);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) fail(400, 'A quantidade deve ser um número inteiro entre 1 e 20.');
            const cart = cartFor(user.id);
            const current = cart.items.find((item) => item.productId === product.id);
            if ((current?.quantity || 0) + quantity > product.stock) fail(409, 'Estoque insuficiente.');
            if (current) current.quantity += quantity;
            else cart.items.push({ productId: product.id, quantity });
            await mutate(() => {});
            return send(response, 200, cartSummary(user.id));
        }
        if (parts[0] === 'api' && parts[1] === 'cart' && parts[2] === 'items' && parts[3] && method === 'PATCH') {
            const { user } = sessionFor(request);
            const quantity = Number(body.quantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) fail(400, 'A quantidade deve ser um número inteiro entre 1 e 20.');
            const cart = cartFor(user.id);
            const item = cart.items.find((entry) => entry.productId === parts[3]);
            if (!item) fail(404, 'Este produto não está no carrinho.');
            const product = store.products.find((candidate) => candidate.id === item.productId);
            if (!product || quantity > product.stock) fail(409, 'Estoque insuficiente.');
            item.quantity = quantity;
            await mutate(() => {});
            return send(response, 200, cartSummary(user.id));
        }
        if (parts[0] === 'api' && parts[1] === 'cart' && parts[2] === 'items' && parts[3] && method === 'DELETE') {
            const { user } = sessionFor(request);
            const cart = cartFor(user.id);
            cart.items = cart.items.filter((item) => item.productId !== parts[3]);
            await mutate(() => {});
            return send(response, 200, cartSummary(user.id));
        }
        if (method === 'POST' && url.pathname === '/api/cart/coupons') {
            const { user } = sessionFor(request);
            const code = String(body.code || '').trim().toUpperCase();
            const coupon = store.coupons.find((candidate) => candidate.code === code && candidate.active);
            if (!coupon) fail(404, 'Cupom inválido ou expirado.');
            const cart = cartFor(user.id);
            const currentCoupon = cart.couponId;
            cart.couponId = coupon.id;
            const summary = cartSummary(user.id);
            if (summary.couponError || !summary.items.length) {
                cart.couponId = currentCoupon;
                fail(400, summary.couponError || 'Adicione produtos antes de aplicar um cupom.');
            }
            await mutate(() => {});
            return send(response, 200, cartSummary(user.id));
        }
        if (method === 'DELETE' && url.pathname === '/api/cart/coupons') {
            const { user } = sessionFor(request);
            cartFor(user.id).couponId = null;
            await mutate(() => {});
            return send(response, 200, cartSummary(user.id));
        }
        if (method === 'POST' && url.pathname === '/api/orders') {
            const { user } = sessionFor(request);
            if (!['client', 'seller'].includes(user.role)) fail(403, 'Crie uma conta de cliente para confirmar a compra.');
            const order = await mutate(() => {
                const summary = cartSummary(user.id);
                if (!summary.items.length) fail(400, 'Seu carrinho está vazio.');
                for (const item of summary.items) {
                    const product = store.products.find((candidate) => candidate.id === item.productId);
                    if (product.stock < item.quantity) fail(409, `Estoque insuficiente para ${product.name}.`);
                }
                const sellerIds = [...new Set(summary.items.map((item) => store.products.find((product) => product.id === item.productId).ownerId))];
                const createdOrder = {
                    id: randomUUID(), buyerId: user.id, createdAt: new Date().toISOString(),
                    status: 'confirmed', items: summary.items, subtotal: summary.subtotal,
                    discount: summary.discount, total: summary.total,
                    receiptNumber: `RV-${Date.now().toString(36).toUpperCase()}`,
                    sellerStatuses: Object.fromEntries(sellerIds.map((id) => [id, 'pending'])),
                    invoices: sellerIds.map((sellerId) => ({
                        invoiceNumber: `NF-DEMO-${randomBytes(4).toString('hex').toUpperCase()}`,
                        sellerId, issuedAt: new Date().toISOString(), status: 'simulada',
                    })),
                };
                for (const item of summary.items) {
                    const product = store.products.find((candidate) => candidate.id === item.productId);
                    product.stock -= item.quantity;
                }
                store.orders.push(createdOrder);
                store.carts[user.id] = { items: [], couponId: null };
                return createdOrder;
            });
            return send(response, 201, { order: safeOrder(order) });
        }
        if (method === 'GET' && url.pathname === '/api/orders') {
            const { user } = sessionFor(request);
            return send(response, 200, { orders: store.orders.filter((order) => order.buyerId === user.id).map(safeOrder) });
        }
        if (parts[0] === 'api' && parts[1] === 'orders' && parts[2] && parts.length === 3 && method === 'GET') {
            const { user } = sessionFor(request);
            const order = store.orders.find((candidate) => candidate.id === parts[2]);
            if (!order) fail(404, 'Pedido não encontrado.');
            if (user.role !== 'admin' && order.buyerId !== user.id && !Object.hasOwn(order.sellerStatuses, user.id)) fail(403, 'Este pedido não pertence à sua conta.');
            return send(response, 200, { order: safeOrder(order) });
        }
        if (method === 'GET' && url.pathname === '/api/seller/dashboard') {
            const { user } = sessionFor(request);
            requireRole(user, 'seller');
            const products = store.products.filter((product) => product.ownerId === user.id);
            const orders = store.orders.filter((order) => Object.hasOwn(order.sellerStatuses, user.id)).map((order) => ({
                ...safeOrder(order), sellerStatus: order.sellerStatuses[user.id],
                items: order.items.filter((item) => products.some((product) => product.id === item.productId)),
                invoice: order.invoices.find((invoice) => invoice.sellerId === user.id),
            }));
            return send(response, 200, { products, orders, coupons: store.coupons.filter((coupon) => coupon.ownerId === user.id) });
        }
        if (method === 'POST' && url.pathname === '/api/seller/products') {
            const { user } = sessionFor(request);
            requireRole(user, 'seller');
            const name = String(body.name || '').trim();
            const category = String(body.category || '').trim();
            const price = Number(body.price);
            const stock = Number(body.stock ?? 1);
            if (name.length < 2 || name.length > 120 || !/^[a-z0-9-]{2,30}$/.test(category) || !Number.isSafeInteger(price) || price < 1 || !Number.isInteger(stock) || stock < 1 || stock > 10000) {
                fail(400, 'Informe nome, categoria válida, preço em centavos e estoque válido.');
            }
            const product = {
                id: randomUUID(), name, category, price, stock, ownerId: user.id,
                sellerName: user.name, image: String(body.image || ''), active: true,
                safeInvoice: false,
            };
            await mutate(() => store.products.push(product));
            return send(response, 201, { product });
        }
        if (parts[0] === 'api' && parts[1] === 'seller' && parts[2] === 'products' && parts[3] && method === 'DELETE') {
            const { user } = sessionFor(request);
            requireRole(user, 'seller');
            const product = store.products.find((candidate) => candidate.id === parts[3] && candidate.ownerId === user.id);
            if (!product) fail(404, 'Produto não encontrado na sua loja.');
            if (store.orders.some((order) => order.items.some((item) => item.productId === product.id))) fail(409, 'Não é possível remover um produto que já esteja vinculado a um pedido.');
            await mutate(() => { product.active = false; });
            return send(response, 200, { message: 'Produto removido da loja.' });
        }
        if (method === 'POST' && url.pathname === '/api/seller/coupons') {
            const { user } = sessionFor(request);
            requireRole(user, 'seller');
            const code = String(body.code || '').trim().toUpperCase();
            const value = Number(body.value);
            const type = body.type || 'percent';
            if (!/^[A-Z0-9_-]{3,20}$/.test(code) || !['percent', 'fixed'].includes(type) || !Number.isInteger(value) || value < 1 || (type === 'percent' && value > 90) || (type === 'fixed' && value > 1_000_000)) {
                fail(400, 'Cupom inválido: use código de 3 a 20 caracteres e valor permitido.');
            }
            if (store.coupons.some((coupon) => coupon.code === code)) fail(409, 'Este código de cupom já existe.');
            const coupon = { id: randomUUID(), code, type, value, ownerId: user.id, active: true, description: type === 'percent' ? `${value}% na loja ${user.name}` : `${value} centavos de desconto na loja ${user.name}` };
            await mutate(() => store.coupons.push(coupon));
            return send(response, 201, { coupon });
        }
        if (parts[0] === 'api' && parts[1] === 'seller' && parts[2] === 'coupons' && parts[3] && method === 'DELETE') {
            const { user } = sessionFor(request);
            requireRole(user, 'seller');
            const coupon = store.coupons.find((candidate) => candidate.id === parts[3] && candidate.ownerId === user.id);
            if (!coupon) fail(404, 'Cupom não encontrado na sua loja.');
            await mutate(() => { coupon.active = false; });
            return send(response, 200, { message: 'Cupom desativado.' });
        }
        if (parts[0] === 'api' && parts[1] === 'seller' && parts[2] === 'orders' && parts[3] && method === 'PATCH') {
            const { user } = sessionFor(request);
            requireRole(user, 'seller');
            if (!['accepted', 'rejected'].includes(body.status)) fail(400, 'O status deve ser accepted ou rejected.');
            const order = store.orders.find((candidate) => candidate.id === parts[3]);
            if (!order || !Object.hasOwn(order.sellerStatuses, user.id)) fail(404, 'Pedido não encontrado na sua loja.');
            if (order.sellerStatuses[user.id] !== 'pending') fail(409, 'Este pedido já foi respondido.');
            await mutate(() => {
                order.sellerStatuses[user.id] = body.status;
                if (body.status === 'rejected') {
                    order.status = Object.values(order.sellerStatuses).every((status) => status === 'rejected')
                        ? 'rejected'
                        : 'partially_rejected';
                    for (const item of order.items) {
                        if (store.products.find((product) => product.id === item.productId)?.ownerId === user.id) {
                            const product = store.products.find((candidate) => candidate.id === item.productId);
                            product.stock += item.quantity;
                        }
                    }
                } else if (Object.values(order.sellerStatuses).every((status) => status === 'accepted')) {
                    order.status = 'accepted';
                }
            });
            return send(response, 200, { order: safeOrder(order) });
        }
        if (parts[0] === 'api' && parts[1] === 'orders' && parts[2] && parts[3] === 'messages' && method === 'GET') {
            const { user } = sessionFor(request);
            const sellerId = url.searchParams.get('sellerId');
            const order = store.orders.find((candidate) => candidate.id === parts[2]);
            if (!order || !sellerId) fail(404, 'Pedido ou vendedor não encontrado.');
            if (order.buyerId !== user.id && user.id !== sellerId) fail(403, 'Conversa não autorizada.');
            if (!Object.hasOwn(order.sellerStatuses, sellerId) || order.sellerStatuses[sellerId] !== 'accepted' || !order.invoices.some((invoice) => invoice.sellerId === sellerId)) {
                fail(409, 'A conversa ficará disponível após o aceite do pedido pelo vendedor.');
            }
            return send(response, 200, { messages: store.messages.filter((message) => message.orderId === order.id && message.sellerId === sellerId) });
        }
        if (parts[0] === 'api' && parts[1] === 'orders' && parts[2] && parts[3] === 'messages' && method === 'POST') {
            const { user } = sessionFor(request);
            const order = store.orders.find((candidate) => candidate.id === parts[2]);
            const sellerId = String(body.sellerId || '');
            const text = String(body.text || '').trim();
            if (!order || !sellerId) fail(404, 'Pedido ou vendedor não encontrado.');
            if (order.buyerId !== user.id && user.id !== sellerId) fail(403, 'Conversa não autorizada.');
            if (!Object.hasOwn(order.sellerStatuses, sellerId) || order.sellerStatuses[sellerId] !== 'accepted') fail(409, 'A conversa ficará disponível após o aceite do pedido pelo vendedor.');
            if (text.length < 1 || text.length > 1000) fail(400, 'A mensagem deve ter entre 1 e 1000 caracteres.');
            const message = { id: randomUUID(), orderId: order.id, sellerId, senderId: user.id, text, createdAt: new Date().toISOString() };
            await mutate(() => store.messages.push(message));
            return send(response, 201, { message });
        }
        if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'sellers' && method === 'POST') {
            requireAdmin(request);
            const email = String(body.email || '').trim().toLowerCase();
            const name = String(body.name || '').trim();
            const password = String(body.password || '');
            if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) fail(400, 'Informe nome, e-mail válido e senha com pelo menos 12 caracteres.');
            if (store.users.some((user) => user.email === email)) fail(409, 'Este e-mail já possui uma conta.');
            const seller = { id: randomUUID(), name, email, role: 'seller', password: hashPassword(password), createdAt: new Date().toISOString() };
            await mutate(() => store.users.push(seller));
            return send(response, 201, { user: { id: seller.id, name, email, role: seller.role } });
        }
        if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'products' && method === 'POST') {
            requireAdmin(request);
            const name = String(body.name || '').trim();
            const price = Number(body.price);
            const stock = Number(body.stock ?? 1);
            if (name.length < 2 || !Number.isSafeInteger(price) || price < 1 || !Number.isInteger(stock) || stock < 1) fail(400, 'Dados de produto administrativo inválidos.');
            const product = { id: randomUUID(), name, category: 'seguro', price, stock, ownerId: 'placeholder-admin', sellerName: 'PlaceHolder-admin', image: '', active: true, safeInvoice: true };
            await mutate(() => store.products.push(product));
            return send(response, 201, { product });
        }

        fail(404, 'Rota não encontrada.');
    }

    const server = http.createServer(async (request, response) => {
        try {
            await route(request, response);
        } catch (error) {
            const status = error.status || 500;
            if (status >= 500) console.error(error);
            if (!response.headersSent) send(response, status, { error: status >= 500 ? 'Erro interno do servidor.' : error.message });
            else response.destroy();
        }
    });

    return { server, initialize, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (require.main === module) {
    const app = createServer();
    app.initialize().then(() => {
        const port = Number(process.env.PORT || 3000);
        app.server.listen(port, () => console.log(`RE:Vendas API disponível em http://localhost:${port}`));
    }).catch((error) => {
        console.error('Não foi possível iniciar a API:', error);
        process.exitCode = 1;
    });
}

module.exports = { createServer };
