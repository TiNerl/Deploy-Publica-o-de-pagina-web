const itemsHost = document.querySelector('#cart-items');
const message = document.querySelector('#cart-message');
const registration = document.querySelector('#registration');
const checkoutButton = document.querySelector('#checkout-button');
const couponFeedback = document.querySelector('#coupon-feedback');
let currentUser;
let cart;

async function refreshCart() {
    cart = await ReVendasApi.request('/api/cart');
    document.querySelector('#subtotal').textContent = ReVendasApi.money(cart.subtotal);
    document.querySelector('#discount').textContent = `- ${ReVendasApi.money(cart.discount)}`;
    document.querySelector('#discount-row').hidden = !cart.discount;
    document.querySelector('#total').textContent = ReVendasApi.money(cart.total);
    itemsHost.innerHTML = cart.items.length ? cart.items.map((item) => `
        <article class="cart-item">
            <div><h2>${ReVendasApi.escape(item.name)}</h2><p>${ReVendasApi.escape(item.sellerName)}</p><strong>${ReVendasApi.money(item.unitPrice)}</strong></div>
            <div class="cart-item-controls">
                <label>Quantidade <input data-quantity="${ReVendasApi.escape(item.productId)}" type="number" min="1" max="20" value="${item.quantity}"></label>
                <button class="remove-item" type="button" data-remove="${ReVendasApi.escape(item.productId)}">Remover</button>
            </div>
        </article>`).join('') : '<p class="empty-cart">Seu carrinho está vazio. <a href="index.html">Explore os produtos</a>.</p>';
    message.textContent = cart.itemCount ? `${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'itens'} no seu carrinho` : 'Adicione produtos à sua sacola.';
    registration.hidden = currentUser.role !== 'guest' || !cart.itemCount;
    checkoutButton.hidden = !['client', 'seller'].includes(currentUser.role) || !cart.itemCount;
    checkoutButton.disabled = !cart.itemCount;
    if (cart.coupon) couponFeedback.innerHTML = `Cupom <strong>${ReVendasApi.escape(cart.coupon.code)}</strong> aplicado. <button type="button" id="remove-coupon" class="remove-item">Remover</button>`;
    else couponFeedback.textContent = cart.couponError || '';
    document.querySelector('#remove-coupon')?.addEventListener('click', async () => {
        await ReVendasApi.request('/api/cart/coupons', { method: 'DELETE' });
        couponFeedback.textContent = 'Cupom removido.';
        await refreshCart();
    });
    itemsHost.querySelectorAll('[data-quantity]').forEach((input) => input.addEventListener('change', async () => {
        try {
            await ReVendasApi.request(`/api/cart/items/${encodeURIComponent(input.dataset.quantity)}`, {
                method: 'PATCH', body: JSON.stringify({ quantity: Number(input.value) }),
            });
            await refreshCart();
        } catch (error) {
            input.value = cart.items.find((item) => item.productId === input.dataset.quantity)?.quantity || 1;
            message.textContent = error.message;
        }
    }));
    itemsHost.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', async () => {
        try {
            await ReVendasApi.request(`/api/cart/items/${encodeURIComponent(button.dataset.remove)}`, { method: 'DELETE' });
            await refreshCart();
        } catch (error) {
            message.textContent = error.message;
        }
    }));
}

document.querySelector('#coupon-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = document.querySelector('#coupon-code').value;
    try {
        await ReVendasApi.request('/api/cart/coupons', { method: 'POST', body: JSON.stringify({ code }) });
        couponFeedback.textContent = 'Cupom aplicado.';
        await refreshCart();
    } catch (error) {
        couponFeedback.textContent = error.message;
    }
});

async function confirmOrder() {
    try {
        const { order } = await ReVendasApi.request('/api/orders', { method: 'POST', body: JSON.stringify({}) });
        window.location.href = `confirmation.html?order=${encodeURIComponent(order.id)}`;
    } catch (error) {
        message.textContent = error.message;
    }
}

checkoutButton.addEventListener('click', confirmOrder);

document.querySelector('#register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
        currentUser = await ReVendasApi.register(formData.get('name'), formData.get('email'), formData.get('password'));
        await confirmOrder();
    } catch (error) {
        message.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
        currentUser = await ReVendasApi.login(formData.get('email'), formData.get('password'));
        await refreshCart();
        message.textContent = currentUser.role === 'guest'
            ? 'Esta conta ainda não foi autenticada.'
            : 'Carrinho transferido. Revise os itens e confirme sua compra.';
    } catch (error) {
        message.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

(async () => {
    try {
        currentUser = await ReVendasApi.ensureSession();
        await refreshCart();
    } catch (error) {
        message.textContent = `Não foi possível conectar ao serviço: ${error.message}`;
    }
})();
