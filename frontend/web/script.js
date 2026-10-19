const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const categoryButtons = document.querySelectorAll('.category-tile');
const productCards = document.querySelectorAll('.product-card');
const resultsCount = document.querySelector('#results-count');
const emptyState = document.querySelector('#empty-state');
const searchFeedback = document.querySelector('#search-feedback');
const cartCount = document.querySelector('.cart-count');
const cartButton = document.querySelector('.cart-button');
const toast = document.querySelector('#toast');

let activeCategory = 'todos';
let cartItems = 0;
let toastTimeout;

function updateProducts() {
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    let visibleProducts = 0;

    productCards.forEach((card) => {
        const matchesCategory = activeCategory === 'todos' || card.dataset.category === activeCategory;
        const searchableText = `${card.dataset.search} ${card.querySelector('h3').textContent}`.toLocaleLowerCase('pt-BR');
        const matchesQuery = !query || searchableText.includes(query);
        const isVisible = matchesCategory && matchesQuery;

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

document.querySelectorAll('.add-to-cart').forEach((button) => {
    button.addEventListener('click', () => {
        cartItems += 1;
        cartCount.textContent = String(cartItems);
        cartButton.setAttribute('aria-label', `Carrinho com ${cartItems} ${cartItems === 1 ? 'item' : 'itens'}`);
        showToast(`${button.dataset.product} adicionado ao carrinho.`);
    });
});

document.querySelector('#seller-cta-button').addEventListener('click', () => {
    showToast('A área para vendedores estará disponível em uma próxima etapa.');
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
