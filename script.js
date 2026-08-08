import { loadCards } from './assets/js/data.js';
import { buildCardHTML } from './assets/js/render.js';

// Populated from data/cards.json once the fetch resolves.
let allCards = [];
let filteredCards = [];
let currentIndex = 0;
let activeFilters = new Set();
let currentView = 'carousel';
let currentPage = 1;
const cardsPerPage = 18;


function updateCarousel() {
    const stage = document.getElementById('carouselStage');
    stage.innerHTML = '';

    if (filteredCards.length === 0) {
        stage.innerHTML = '<div style="text-align: center; color: #888;">No cards match your filters</div>';
        return;
    }

    const positions = ['pos-left', 'pos-center-left', 'pos-center', 'pos-center-right', 'pos-right'];
    
    for (let i = -2; i <= 2; i++) {
        let index = (currentIndex + i + filteredCards.length) % filteredCards.length;
        const card = filteredCards[index];
        const cardEl = document.createElement('div');
        cardEl.className = `carousel-card ${positions[i + 2]}`;
        cardEl.innerHTML = buildCardHTML(card);
        cardEl.onclick = () => {
            if (i !== 0) {
                currentIndex = index;
                updateCarousel();
            }
        };
        stage.appendChild(cardEl);
    }

    document.getElementById('currentCard').textContent = currentIndex + 1;
    document.getElementById('totalCardsCarousel').textContent = filteredCards.length;
}

function updateGrid() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    if (filteredCards.length === 0) {
        grid.innerHTML = '<div style="text-align: center; color: #888; grid-column: 1/-1;">No cards match your filters</div>';
        return;
    }

    const totalPages = Math.ceil(filteredCards.length / cardsPerPage);
    const startIndex = (currentPage - 1) * cardsPerPage;
    const endIndex = Math.min(startIndex + cardsPerPage, filteredCards.length);
    const pageCards = filteredCards.slice(startIndex, endIndex);

    pageCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'grid-card';
        cardEl.innerHTML = buildCardHTML(card);
        grid.appendChild(cardEl);
    });

    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
}

function applyFilters() {
    filteredCards = allCards.filter(card => {
        if (activeFilters.size === 0) return true;

        return Array.from(activeFilters).some(filter => {
            if (filter === 'monster') return card.type === 'monster';
            if (filter === 'spell') return card.type === 'spell';
            if (filter === 'trap') return card.type === 'trap';
            if (filter === 'rare') return ['rare', 'super', 'ultra', 'secret'].includes(card.rarity);
            return false;
        });
    });

    currentIndex = 0;
    currentPage = 1;
    
    document.getElementById('visibleCardsCount').textContent = filteredCards.length;
    document.getElementById('totalCardsCount').textContent = allCards.length;

    if (currentView === 'carousel') {
        updateCarousel();
    } else {
        updateGrid();
    }
}

// Filter controls
document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
        const filter = pill.dataset.filter;
        if (activeFilters.has(filter)) {
            activeFilters.delete(filter);
            pill.classList.remove('active');
        } else {
            activeFilters.add(filter);
            pill.classList.add('active');
        }
        applyFilters();
    });
});

document.getElementById('clearFilters').addEventListener('click', () => {
    activeFilters.clear();
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    document.getElementById('searchInput').value = '';
    applyFilters();
});

// View toggle
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;

        if (currentView === 'carousel') {
            document.getElementById('carouselView').classList.remove('hidden');
            document.getElementById('gridView').classList.remove('active');
            updateCarousel();
        } else {
            document.getElementById('carouselView').classList.add('hidden');
            document.getElementById('gridView').classList.add('active');
            updateGrid();
        }
    });
});

// Carousel navigation
document.getElementById('prevBtn').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + filteredCards.length) % filteredCards.length;
    updateCarousel();
});

document.getElementById('nextBtn').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % filteredCards.length;
    updateCarousel();
});

// Grid pagination
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        updateGrid();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredCards.length / cardsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        updateGrid();
    }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (currentView === 'carousel') {
        if (e.key === 'ArrowLeft') {
            currentIndex = (currentIndex - 1 + filteredCards.length) % filteredCards.length;
            updateCarousel();
        } else if (e.key === 'ArrowRight') {
            currentIndex = (currentIndex + 1) % filteredCards.length;
            updateCarousel();
        }
    }
});

// Bootstrap

/**
 * Show or hide the loading / error banner.
 *
 * @param {string|null} message - text to show, or null to hide the banner
 * @param {boolean} [isError] - style the banner as a failure
 */
function setStatus(message, isError = false) {
    const el = document.getElementById('statusMessage');
    if (!el) return;

    el.textContent = message ?? '';
    el.classList.toggle('is-error', isError);
    el.hidden = message === null;
}

/**
 * Show or hide the card views.
 *
 * Views stay hidden until data resolves so the page never flashes empty
 * controls over a blank stage.
 *
 * @param {boolean} visible - whether the active view should be shown
 */
function setViewsVisible(visible) {
    document.getElementById('carouselView').hidden = !visible;
    document.getElementById('gridView').hidden = !visible;
}

/**
 * Load the collection, then render it.
 *
 * A failure leaves a readable message on screen rather than a blank page.
 */
async function init() {
    setViewsVisible(false);
    setStatus('Loading collection…');

    try {
        const { cards, skipped } = await loadCards();
        allCards = cards;

        if (skipped > 0) {
            console.warn(`Skipped ${skipped} card record(s) missing required fields.`);
        }

        if (allCards.length === 0) {
            setStatus('No cards found in the collection.');
            return;
        }

        setStatus(null);
        setViewsVisible(true);
        applyFilters();
    } catch (error) {
        console.error(error);
        setStatus(error.message, true);
    }
}

init();
