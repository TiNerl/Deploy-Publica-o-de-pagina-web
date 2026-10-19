const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const categoryButtons = document.querySelectorAll('.category-tile');
const resultsCount = document.querySelector('#results-count');
const emptyState = document.querySelector('#empty-state');
const searchFeedback = document.querySelector('#search-feedback');
const cartCount = document.querySelector('.cart-count');
const cartButton = document.querySelector('.cart-button');
const toast = document.querySelector('#toast');

let activeCategory = 'todos';
let toastTimeout;

function updateProducts() {
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    let visibleProducts = 0;

    document.querySelectorAll('.product-card').forEach((card) => {
        const matchesCategory = activeCategory === 'todos' || card.dataset.category === activeCategory;
        const searchableText = `${card.dataset.search} ${card.querySelector('h3').textContent}`.toLocaleLowerCase('pt-BR');
        const isVisible = matchesCategory && (!query || searchableText.includes(query));
        card.hidden = !isVisible;
        if (isVisible) visibleProducts += 1;
    });

    resultsCount.textContent = `${visibleProducts} ${visibleProducts === 1 ? 'produto' : 'produtos'}`;
    emptyState.hidden = visibleProducts !== 0;
    searchFeedback.textContent = query ? `Resultados para “${searchInput.value.trim()}”` : '';
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

async function initializeStore() {
    try {
        await ReVendasApi.ensureSession();
        const { products } = await ReVendasApi.request('/api/products');
        const productIds = new Set(products.map((product) => product.id));
        const productGrid = document.querySelector('.product-grid');
        const cardsById = new Map([...productGrid.querySelectorAll('.product-card')].map((card) => [card.dataset.productId, card]));
        for (const product of products) {
            if (cardsById.has(product.id)) continue;
            const card = document.createElement('article');
            card.className = 'product-card';
            card.dataset.productId = product.id;
            card.dataset.category = product.category;
            card.dataset.search = `${product.name} ${product.category}`;
            const image = product.image && /^https?:\/\//i.test(product.image)
                ? `<img src="${ReVendasApi.escape(product.image)}" alt="${ReVendasApi.escape(product.name)}" loading="lazy">`
                : '<span class="seller-product-placeholder" aria-hidden="true">✦</span>';
            card.innerHTML = `
                <div class="product-image">${image}<span class="product-badge badge-green">NOVIDADE</span></div>
                <div class="product-info"><span class="seller-label">${ReVendasApi.escape(product.sellerName)}</span>
                <h3>${ReVendasApi.escape(product.name)}</h3><div class="rating"><span>★★★★★</span> <small>Produto novo</small></div>
                <p class="price">${ReVendasApi.money(product.price)}</p><p class="installments">Preço à vista</p>
                <p class="shipping">✓ Disponível para compra</p><button class="add-to-cart" type="button" data-product-id="${ReVendasApi.escape(product.id)}" data-product="${ReVendasApi.escape(product.name)}">Adicionar ao carrinho</button></div>`;
            productGrid.append(card);
        }
        for (const [id, card] of cardsById) {
            if (!productIds.has(id)) card.hidden = true;
        }
        updateProducts();
        productGrid.addEventListener('click', async (event) => {
            const button = event.target.closest('.add-to-cart');
            if (!button || button.disabled) return;
            button.disabled = true;
            try {
                const result = await ReVendasApi.request('/api/cart/items', {
                    method: 'POST', body: JSON.stringify({ productId: button.dataset.productId }),
                });
                cartCount.textContent = String(result.itemCount);
                cartButton.setAttribute('aria-label', `Carrinho com ${result.itemCount} ${result.itemCount === 1 ? 'item' : 'itens'}`);
                showToast(`${button.dataset.product} adicionado ao carrinho.`);
            } catch (error) {
                showToast(error.message);
            } finally {
                button.disabled = false;
            }
        });
        const cart = await ReVendasApi.request('/api/cart');
        cartCount.textContent = String(cart.itemCount);
        cartButton.setAttribute('aria-label', `Carrinho com ${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'itens'}`);
    } catch (error) {
        showToast(`API indisponível: ${error.message}`);
    }
}

searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    updateProducts();
    document.querySelector('#produtos').scrollIntoView({ behavior: 'smooth' });
});

searchInput.addEventListener('input', updateProducts);

categoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
        activeCategory = button.dataset.category;
        categoryButtons.forEach((categoryButton) => {
            const isActive = categoryButton === button;
            categoryButton.classList.toggle('active', isActive);
            categoryButton.setAttribute('aria-pressed', String(isActive));
        });
        updateProducts();
    });
});

document.querySelectorAll('.favorite-button').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
        const isFavorite = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(isFavorite));
        button.textContent = isFavorite ? '♥' : '♡';
        showToast(isFavorite ? 'Produto adicionado aos favoritos.' : 'Produto removido dos favoritos.');
    });
});

initializeStore();
