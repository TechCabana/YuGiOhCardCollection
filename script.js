import { loadCards } from './assets/js/data.js';
import { buildCardHTML } from './assets/js/render.js';
import {
    filterCards,
    getFilterGroup,
    getCarouselSlots,
    wrapIndex,
    getTotalPages,
    getPageSlice,
    clampPage
} from './assets/js/filters.js';
import { debounce } from './assets/js/debounce.js';
import { isTextEntryTarget } from './assets/js/keyboard.js';

// Populated from data/cards.json once the fetch resolves.
let allCards = [];
let filteredCards = [];
let currentIndex = 0;
// Two groups so filters AND across groups (type AND rarity) but OR within a
// group (monster OR spell) — see filterCards() in assets/js/filters.js.
let activeTypeFilters = new Set();
let activeRarityFilters = new Set();
let currentView = 'carousel';
let currentPage = 1;
const cardsPerPage = 18;

// Free-text search term, combined on top of the pill filters in applyFilters().
let searchQuery = '';


/**
 * Build the block shown when no cards match the current filters.
 *
 * Carries its own clear action so the user can recover without hunting for
 * the toolbar button, which may be scrolled out of view on a phone.
 *
 * @returns {HTMLElement} the empty-state element
 */
function buildEmptyState() {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state';

    const title = document.createElement('p');
    title.className = 'empty-state-title';
    title.textContent = 'No cards match your filters';

    const hint = document.createElement('p');
    hint.className = 'empty-state-hint';
    hint.textContent = 'Try removing a filter or clearing the search.';

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'empty-state-action';
    action.textContent = 'Clear filters';
    action.addEventListener('click', clearAllFilters);

    wrapper.append(title, hint, action);
    return wrapper;
}

/**
 * Put the carousel counters and navigation into their empty state.
 *
 * Both renderers previously returned before touching their counters, leaving
 * stale numbers such as "Page 1 of 3" beside zero results.
 */
function resetCarouselControls() {
    document.getElementById('currentCard').textContent = '0';
    document.getElementById('totalCardsCarousel').textContent = '0';
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
}

/** Put the grid pagination into its empty state. */
function resetGridControls() {
    document.getElementById('currentPage').textContent = '0';
    document.getElementById('totalPages').textContent = '0';
    document.getElementById('prevPage').disabled = true;
    document.getElementById('nextPage').disabled = true;
}

function updateCarousel() {
    const stage = document.getElementById('carouselStage');
    stage.innerHTML = '';

    if (filteredCards.length === 0) {
        stage.appendChild(buildEmptyState());
        resetCarouselControls();
        return;
    }

    document.getElementById('prevBtn').disabled = false;
    document.getElementById('nextBtn').disabled = false;

    // Slots narrow below 5 cards instead of wrapping, so no card index repeats.
    const slots = getCarouselSlots(filteredCards, currentIndex);

    slots.forEach(({ card, index, position, isCenter }) => {
        const cardEl = document.createElement('div');
        cardEl.className = `carousel-card ${position}`;
        cardEl.innerHTML = buildCardHTML(card);
        cardEl.onclick = () => {
            if (!isCenter) {
                currentIndex = index;
                updateCarousel();
            }
        };
        stage.appendChild(cardEl);
    });

    document.getElementById('currentCard').textContent = currentIndex + 1;
    document.getElementById('totalCardsCarousel').textContent = filteredCards.length;
}

function updateGrid() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    if (filteredCards.length === 0) {
        const empty = buildEmptyState();
        // The grid is a CSS grid; span the full row so the block centres.
        empty.style.gridColumn = '1 / -1';
        grid.appendChild(empty);
        resetGridControls();
        return;
    }

    // getTotalPages and getPageSlice clamp an out-of-range page rather than
    // returning nothing, so a filter that shrinks the set cannot strand the
    // user on a blank page.
    const totalPages = getTotalPages(filteredCards.length, cardsPerPage);
    currentPage = clampPage(currentPage, totalPages);
    const pageCards = getPageSlice(filteredCards, currentPage, cardsPerPage);

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
    // Types and rarities AND against each other; values inside each group OR.
    // The search term ANDs on top of both, all handled inside filterCards().
    filteredCards = filterCards(allCards, {
        types: Array.from(activeTypeFilters),
        rarities: Array.from(activeRarityFilters),
        query: searchQuery
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
        // Route the pill into its group so it ANDs against the other group
        // instead of OR-ing into one flat set (the original bug). A pill
        // matching neither constant list is a markup error, not a filter.
        const filterGroup = getFilterGroup(filter);
        let group;
        if (filterGroup === 'type') {
            group = activeTypeFilters;
        } else if (filterGroup === 'rarity') {
            group = activeRarityFilters;
        } else {
            console.warn(`Unrecognised filter pill: "${filter}"`);
            return;
        }

        if (group.has(filter)) {
            group.delete(filter);
            pill.classList.remove('active');
        } else {
            group.add(filter);
            pill.classList.add('active');
        }
        applyFilters();
    });
});

/**
 * Reset every filter and the search term, then re-render.
 *
 * Shared by the toolbar button and the empty state's own action, so both
 * always clear exactly the same state.
 */
function clearAllFilters() {
    activeTypeFilters.clear();
    activeRarityFilters.clear();
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    searchQuery = '';
    document.getElementById('searchInput').value = '';
    applyFilters();
}

document.getElementById('clearFilters').addEventListener('click', clearAllFilters);

// Live search: debounced so filtering/re-render doesn't run on every keystroke.
document.getElementById('searchInput').addEventListener('input', debounce((e) => {
    searchQuery = e.target.value;
    applyFilters();
}, 150));

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
    currentIndex = wrapIndex(currentIndex - 1, filteredCards.length);
    updateCarousel();
});

document.getElementById('nextBtn').addEventListener('click', () => {
    currentIndex = wrapIndex(currentIndex + 1, filteredCards.length);
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
    // Stand down while the user is typing, or Left and Right would move the
    // text cursor and the carousel at the same time.
    if (isTextEntryTarget(e.target)) return;

    // Escape clears filters from anywhere, including the grid view.
    if (e.key === 'Escape') {
        e.preventDefault();
        clearAllFilters();
        return;
    }

    if (currentView !== 'carousel' || filteredCards.length === 0) return;

    switch (e.key) {
        case 'ArrowLeft':
            currentIndex = wrapIndex(currentIndex - 1, filteredCards.length);
            break;
        case 'ArrowRight':
            currentIndex = wrapIndex(currentIndex + 1, filteredCards.length);
            break;
        case 'Home':
            currentIndex = 0;
            break;
        case 'End':
            currentIndex = filteredCards.length - 1;
            break;
        default:
            return;
    }

    // Only reached for a handled key, so the page never scrolls underneath.
    e.preventDefault();
    updateCarousel();
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
