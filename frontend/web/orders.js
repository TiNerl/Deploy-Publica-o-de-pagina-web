const ordersHost = document.querySelector('#orders-list');

async function loadOrders() {
    try {
        await ReVendasApi.ensureSession();
        const { orders } = await ReVendasApi.request('/api/orders');
        if (!orders.length) {
            ordersHost.innerHTML = '<article class="flow-card">Você ainda não tem pedidos.</article>';
            return;
        }
        ordersHost.innerHTML = orders.map((order) => `
            <article class="flow-card order-card">
                <h2>Pedido ${ReVendasApi.escape(order.receiptNumber)}</h2>
                <p>${new Date(order.createdAt).toLocaleString('pt-BR')} · Status: ${ReVendasApi.escape(order.status)}</p>
                <p>Total fictício: <strong>${ReVendasApi.money(order.total)}</strong></p>
                <div>${order.items.map((item) => `<p>${ReVendasApi.escape(item.name)} × ${item.quantity}</p>`).join('')}</div>
                ${order.invoices.map((invoice) => `<p>Nota fiscal demonstrativa: ${ReVendasApi.escape(invoice.invoiceNumber)}</p>`).join('')}
                <div class="chat-area" data-order="${ReVendasApi.escape(order.id)}">${order.invoices.map((invoice) => `
                    <section class="chat-thread" data-seller="${ReVendasApi.escape(invoice.sellerId)}">
                        <h3>Conversa com o vendedor</h3><div class="chat-messages">Carregando conversa…</div>
                        <form class="inline-form chat-form"><label>Mensagem<input name="text" maxlength="1000" required placeholder="Tire uma dúvida sobre o pedido"></label><button class="button button-dark" type="submit">Enviar</button></form>
                    </section>`).join('')}
            </article>`).join('');
        for (const thread of ordersHost.querySelectorAll('.chat-thread')) {
            const sellerId = thread.dataset.seller;
            const messages = thread.querySelector('.chat-messages');
            const form = thread.querySelector('.chat-form');
            try {
                const result = await ReVendasApi.request(`/api/orders/${encodeURIComponent(thread.closest('.chat-area').dataset.order)}/messages?sellerId=${encodeURIComponent(sellerId)}`);
                messages.innerHTML = result.messages.length ? result.messages.map((entry) => `<p><strong>${entry.senderId === sellerId ? 'Vendedor' : 'Você'}:</strong> ${ReVendasApi.escape(entry.text)}</p>`).join('') : '<p>A conversa começa aqui.</p>';
                form.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    const text = new FormData(form).get('text');
                    try {
                        await ReVendasApi.request(`/api/orders/${encodeURIComponent(thread.closest('.chat-area').dataset.order)}/messages`, { method: 'POST', body: JSON.stringify({ sellerId, text }) });
                        form.reset();
                        await loadOrders();
                    } catch (error) { messages.textContent = error.message; }
                });
            } catch (error) {
                messages.textContent = error.message;
                form.hidden = true;
            }
        }
    } catch (error) {
        ordersHost.textContent = `Não foi possível carregar seus pedidos: ${error.message}`;
    }
}

loadOrders();
