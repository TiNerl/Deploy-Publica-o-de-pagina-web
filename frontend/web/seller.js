const loginPanel = document.querySelector('#seller-login');
const sellerArea = document.querySelector('#seller-area');
const feedback = document.querySelector('#seller-feedback');

async function sellerRequest(path, options) {
    const result = await ReVendasApi.request(path, options);
    feedback.textContent = '';
    return result;
}

function renderDashboard(data) {
    document.querySelector('#seller-products').innerHTML = data.products.map((product) => `
        <article class="seller-row"><div><strong>${ReVendasApi.escape(product.name)}</strong><span>${ReVendasApi.money(product.price)} · estoque ${product.stock}</span></div>
        <button class="remove-item" data-delete-product="${ReVendasApi.escape(product.id)}" type="button">Remover</button></article>`).join('') || '<p>Nenhum produto cadastrado.</p>';
    document.querySelector('#seller-coupons').innerHTML = data.coupons.map((coupon) => `
        <article class="seller-row"><div><strong>${ReVendasApi.escape(coupon.code)}</strong><span>${coupon.value}% de desconto</span></div>
        <button class="remove-item" data-delete-coupon="${ReVendasApi.escape(coupon.id)}" type="button">Desativar</button></article>`).join('') || '<p>Nenhum cupom criado.</p>';
    document.querySelector('#seller-orders').innerHTML = data.orders.map((order) => `
        <article class="flow-card order-card"><h3>Pedido ${ReVendasApi.escape(order.receiptNumber)} · ${ReVendasApi.escape(order.sellerStatus)}</h3>
        ${order.items.map((item) => `<p>${ReVendasApi.escape(item.name)} × ${item.quantity}</p>`).join('')}
        <p>Nota fiscal demonstrativa: ${ReVendasApi.escape(order.invoice?.invoiceNumber || '—')}</p>
        ${order.sellerStatus === 'pending' ? `<div class="button-row"><button class="button button-dark" data-order-action="accepted" data-order-id="${ReVendasApi.escape(order.id)}">Aceitar pedido</button><button class="button button-outline" data-order-action="rejected" data-order-id="${ReVendasApi.escape(order.id)}">Recusar pedido</button></div>` : ''}
        ${order.sellerStatus === 'accepted' ? `<section class="seller-chat" data-order="${ReVendasApi.escape(order.id)}"><h4>Chat do pedido</h4><div class="chat-messages">Carregando mensagens…</div><form class="inline-form chat-form"><label>Responder<input name="text" required maxlength="1000"></label><button class="button button-dark" type="submit">Enviar</button></form></section>` : ''}</article>`).join('') || '<article class="flow-card">Ainda não há pedidos.</article>';
    document.querySelectorAll('[data-delete-product]').forEach((button) => button.addEventListener('click', async () => {
        try { await sellerRequest(`/api/seller/products/${encodeURIComponent(button.dataset.deleteProduct)}`, { method: 'DELETE' }); await loadDashboard(); }
        catch (error) { feedback.textContent = error.message; }
    }));
    document.querySelectorAll('[data-delete-coupon]').forEach((button) => button.addEventListener('click', async () => {
        try { await sellerRequest(`/api/seller/coupons/${encodeURIComponent(button.dataset.deleteCoupon)}`, { method: 'DELETE' }); await loadDashboard(); }
        catch (error) { feedback.textContent = error.message; }
    }));
    document.querySelectorAll('[data-order-action]').forEach((button) => button.addEventListener('click', async () => {
        try {
            await sellerRequest(`/api/seller/orders/${encodeURIComponent(button.dataset.orderId)}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.orderAction }) });
            await loadDashboard();
        } catch (error) { feedback.textContent = error.message; }
    }));
    document.querySelectorAll('.seller-chat').forEach((chat) => wireSellerChat(chat));
}

async function wireSellerChat(chat) {
    const orderId = chat.dataset.order;
    const messages = chat.querySelector('.chat-messages');
    const form = chat.querySelector('form');
    try {
        const { messages: entries } = await sellerRequest(`/api/orders/${encodeURIComponent(orderId)}/messages?sellerId=${encodeURIComponent((await ReVendasApi.request('/api/me')).user.id)}`);
        messages.innerHTML = entries.map((entry) => `<p><strong>${ReVendasApi.escape(entry.senderId)}:</strong> ${ReVendasApi.escape(entry.text)}</p>`).join('') || '<p>A conversa começa aqui.</p>';
    } catch (error) { messages.textContent = error.message; }
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const user = (await ReVendasApi.request('/api/me')).user;
            const text = new FormData(form).get('text');
            await sellerRequest(`/api/orders/${encodeURIComponent(orderId)}/messages`, { method: 'POST', body: JSON.stringify({ sellerId: user.id, text }) });
            form.reset();
            await loadDashboard();
        } catch (error) { messages.textContent = error.message; }
    });
}

async function loadDashboard() {
    const data = await sellerRequest('/api/seller/dashboard');
    renderDashboard(data);
}

document.querySelector('#seller-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        const user = await ReVendasApi.login(form.get('email'), form.get('password'));
        if (user.role !== 'seller') throw new Error('Esta conta não possui acesso de vendedor.');
        loginPanel.hidden = true;
        sellerArea.hidden = false;
        await loadDashboard();
    } catch (error) { feedback.textContent = error.message; }
});

document.querySelector('#product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const price = Math.round(Number(form.get('price')) * 100);
    try {
        await sellerRequest('/api/seller/products', { method: 'POST', body: JSON.stringify({
            name: form.get('name'), category: form.get('category'), price, stock: Number(form.get('stock')), image: form.get('image'),
        }) });
        event.currentTarget.reset();
        await loadDashboard();
    } catch (error) { feedback.textContent = error.message; }
});

document.querySelector('#seller-coupon-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        await sellerRequest('/api/seller/coupons', { method: 'POST', body: JSON.stringify({ code: form.get('code'), value: Number(form.get('value')), type: 'percent' }) });
        event.currentTarget.reset();
        await loadDashboard();
    } catch (error) { feedback.textContent = error.message; }
});

(async () => {
    try {
        const user = await ReVendasApi.ensureSession();
        if (user.role === 'seller') {
            loginPanel.hidden = true;
            sellerArea.hidden = false;
            await loadDashboard();
        }
    } catch (error) { feedback.textContent = `API indisponível: ${error.message}`; }
})();
