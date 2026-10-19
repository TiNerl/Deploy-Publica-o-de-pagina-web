(async () => {
    const receipt = document.querySelector('#receipt');
    const orderId = new URLSearchParams(window.location.search).get('order');
    try {
        await ReVendasApi.ensureSession();
        if (!orderId) throw new Error('Identificador do pedido não informado.');
        const { order } = await ReVendasApi.request(`/api/orders/${encodeURIComponent(orderId)}`);
        const invoiceRows = order.invoices.map((invoice) => `
            <div><dt>Nota fiscal demonstrativa</dt><dd>${ReVendasApi.escape(invoice.invoiceNumber)} · ${ReVendasApi.escape(invoice.status)}</dd></div>`).join('');
        receipt.innerHTML = `
            <h2>Comprovante demonstrativo</h2>
            <dl class="receipt-details">
                <div><dt>Pedido</dt><dd>${ReVendasApi.escape(order.receiptNumber)}</dd></div>
                <div><dt>Data</dt><dd>${new Date(order.createdAt).toLocaleString('pt-BR')}</dd></div>
                ${order.items.map((item) => `<div><dt>${ReVendasApi.escape(item.name)} × ${item.quantity}</dt><dd>${ReVendasApi.money(item.lineTotal)}</dd></div>`).join('')}
                <div><dt>Subtotal</dt><dd>${ReVendasApi.money(order.subtotal)}</dd></div>
                ${order.discount ? `<div><dt>Desconto</dt><dd>- ${ReVendasApi.money(order.discount)}</dd></div>` : ''}
                <div class="total-line"><dt>Total da compra fictícia</dt><dd>${ReVendasApi.money(order.total)}</dd></div>
                ${invoiceRows}
            </dl>
            <p class="flow-feedback">Status do pedido: aguardando resposta do vendedor. A nota fiscal acima é apenas ilustrativa.</p>`;
    } catch (error) {
        receipt.innerHTML = `<p class="flow-feedback">${ReVendasApi.escape(error.message)}</p>`;
    }
})();
