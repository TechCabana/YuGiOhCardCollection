import { loadCards } from './assets/js/data.js';
import { buildCardHTML } from './assets/js/render.js';
import {
    filterCards,
    matchesSearch,
    getCarouselSlots,
    wrapIndex,
    getTotalPages,
    getPageSlice,
    clampPage
} from './assets/js/filters.js';
import { FACETS, facetOptions, selectionChips } from './assets/js/facets.js';
import { focusIndexAfterRemoval } from './assets/js/focus.js';
import { debounce } from './assets/js/debounce.js';
import { isTextEntryTarget } from './assets/js/keyboard.js';
import { setToggleState, setExclusiveToggle } from './assets/js/toggle.js';
import { VIEW_CAROUSEL, normaliseView, getViewVisibility } from './assets/js/view.js';

// Populated from data/cards.json once the fetch resolves.
let allCards = [];
let filteredCards = [];
let currentIndex = 0;
// Selected values keyed by facet. Facets AND against each other, values within
// a facet OR — see matchesSelection() in assets/js/facets.js. One object rather
// than a variable per group, so adding a facet needs no new state here.
let activeFacets = {};
let currentView = VIEW_CAROUSEL;
let currentPage = 1;
const cardsPerPage = 18;

// Views stay hidden until the fetch resolves, so the page never flashes empty
// controls over a blank stage. Held here because view visibility depends on it
// as much as it depends on which view is selected.
let isDataReady = false;

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
    // Belt and braces. This element is injected after the filter runs, and a
    // live region created at the same moment as its content is announced
    // inconsistently across screen readers — so the reliable announcement is
    // the visible-count region going to 0, which is already live and already
    // in the document. This helps where it does work and costs nothing where
    // it does not.
    wrapper.setAttribute('role', 'status');

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
 * Wrap the empty state in a list item.
 *
 * Both views render into a <ul> now, and only <li> is valid there. A bare
 * <div> child would put the block outside the list as far as assistive
 * technology is concerned, which is precisely the message that must not be
 * missed.
 *
 * @returns {HTMLElement} an li containing the empty-state block
 */
function buildEmptyStateItem() {
    const item = document.createElement('li');
    item.className = 'empty-state-item';
    item.appendChild(buildEmptyState());
    return item;
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
        stage.appendChild(buildEmptyStateItem());
        resetCarouselControls();
        return;
    }

    document.getElementById('prevBtn').disabled = false;
    document.getElementById('nextBtn').disabled = false;

    // Slots narrow below 5 cards instead of wrapping, so no card index repeats.
    const slots = getCarouselSlots(filteredCards, currentIndex);

    slots.forEach(({ card, index, position, isCenter }) => {
        // li, not div: the stage is a <ul> now, so assistive technology can
        // announce how many cards are in the window rather than reading a
        // wall of unrelated groups.
        const cardEl = document.createElement('li');
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
        const empty = buildEmptyStateItem();
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
        const cardEl = document.createElement('li');
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
    // Facets AND against each other; values inside a facet OR. The search term
    // ANDs on top of all of them, all handled inside filterCards().
    filteredCards = filterCards(allCards, {
        facets: activeFacets,
        query: searchQuery
    });

    currentIndex = 0;
    currentPage = 1;

    // After filtering, not before: every count in every menu is stated against
    // the filters that are actually applied now.
    renderFilterControls();

    document.getElementById('visibleCardsCount').textContent = filteredCards.length;
    document.getElementById('totalCardsCount').textContent = allCards.length;

    if (currentView === VIEW_CAROUSEL) {
        updateCarousel();
    } else {
        updateGrid();
    }
}

/**
 * Toggle one value of one facet, then re-render.
 *
 * @param {string} facetKey - a key from FACETS
 * @param {string} value - the value being ticked or unticked
 * @returns {void}
 */
function toggleFacetValue(facetKey, value) {
    const selected = activeFacets[facetKey] ?? [];

    activeFacets[facetKey] = selected.includes(value)
        ? selected.filter(existing => existing !== value)
        : [...selected, value];

    // An empty array and an absent key mean the same thing to matchesSelection,
    // but only the absent key keeps the selection object readable in a debugger
    // and keeps countSelected honest.
    if (activeFacets[facetKey].length === 0) delete activeFacets[facetKey];

    applyFilters();
}

/**
 * Close every open facet panel.
 *
 * @param {HTMLElement} [except] - a panel to leave open
 * @returns {void}
 */
function closeFacetPanels(except = null) {
    for (const panel of document.querySelectorAll('.facet-panel')) {
        if (panel === except) continue;
        panel.hidden = true;
        document.getElementById(panel.dataset.buttonId)?.setAttribute('aria-expanded', 'false');
    }
}

/**
 * Build one facet's button and panel.
 *
 * Built with DOM calls rather than innerHTML: every value here comes from
 * Airtable by way of data/cards.json, and textContent cannot be talked into
 * executing anything, whereas an escaping mistake in a template string can.
 *
 * @param {object} facet - an entry from FACETS
 * @returns {HTMLElement} the facet's wrapper element
 */
function buildFacet(facet) {
    const wrapper = document.createElement('div');
    wrapper.className = 'facet';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'facet-btn';
    button.id = `facet-btn-${facet.key}`;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `facet-panel-${facet.key}`);

    const label = document.createElement('span');
    label.textContent = facet.label;

    // Shows how many values are ticked, so a collapsed panel still says
    // whether it is doing anything.
    const badge = document.createElement('span');
    badge.className = 'facet-btn-count';
    badge.hidden = true;

    button.append(label, badge);

    const panel = document.createElement('div');
    panel.className = 'facet-panel';
    panel.id = `facet-panel-${facet.key}`;
    panel.dataset.buttonId = button.id;
    panel.dataset.facetKey = facet.key;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = true;

    button.addEventListener('click', () => {
        const willOpen = panel.hidden;
        closeFacetPanels(panel);
        panel.hidden = !willOpen;
        button.setAttribute('aria-expanded', String(willOpen));
    });

    wrapper.append(button, panel);
    return wrapper;
}

/**
 * Rebuild a facet panel's checkboxes and counts.
 *
 * Counts move as other filters change, so the contents are rewritten rather
 * than built once. The checkbox state is read back from activeFacets, which
 * stays the single source of truth.
 *
 * @param {HTMLElement} panel - the panel element
 * @returns {void}
 */
function renderFacetPanel(panel) {
    const facetKey = panel.dataset.facetKey;
    const options = facetOptions(allCards, facetKey, {
        selection: activeFacets,
        matchesQuery: card => matchesSearch(card, searchQuery)
    });

    // Ticking a box calls this function to redraw the counts, which throws
    // away and recreates the very checkbox that is mid-`change` event. A
    // focused element removed from the document loses focus to <body>, so
    // without remembering which value held it, every tick in an open panel
    // would strand a keyboard or screen-reader user — see focus.js.
    const focusedValue = panel.contains(document.activeElement)
        ? document.activeElement.value
        : null;

    panel.replaceChildren();

    let focusTarget = null;

    for (const option of options) {
        const selected = (activeFacets[facetKey] ?? []).includes(option.value);

        const row = document.createElement('label');
        row.className = 'facet-option';
        // A value that would return nothing is dimmed rather than removed, so
        // the menu does not reshuffle under the cursor as boxes are ticked.
        row.classList.toggle('is-empty', option.count === 0 && !selected);

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = selected;
        box.value = option.value;
        box.addEventListener('change', () => toggleFacetValue(facetKey, option.value));

        if (focusedValue !== null && option.value === focusedValue) {
            focusTarget = box;
        }

        const text = document.createElement('span');
        text.className = 'facet-option-label';
        text.textContent = option.label;

        const count = document.createElement('span');
        count.className = 'facet-option-count';
        count.textContent = String(option.count);

        row.append(box, text, count);
        panel.appendChild(row);
    }

    // The toggled value always survives the rebuild — facetOptions keeps
    // every value the collection has ever shown, even one whose live count is
    // now 0 — so this is a real restore, not a best-effort one.
    focusTarget?.focus();
}

/**
 * Rebuild the chip tray from the current selection.
 *
 * @returns {void}
 */
function renderChipTray() {
    const tray = document.getElementById('chipTray');
    const chips = selectionChips(activeFacets);

    // Removing a chip rebuilds the whole tray, including the chip that was
    // just clicked. Capture its position before it is gone, so focus can land
    // on whichever chip now occupies that slot instead of falling to <body>
    // — see focus.js for the index math.
    const focusedIndex = [...tray.children].indexOf(document.activeElement);

    tray.replaceChildren();
    tray.hidden = chips.length === 0;
    document.getElementById('clearFilters').hidden = chips.length === 0 && searchQuery === '';

    const rendered = [];

    for (const chip of chips) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        // The visible text is just the value; the accessible name says which
        // facet it came from and what pressing it does, because "Earth" alone
        // means nothing announced out of context.
        button.setAttribute('aria-label', `Remove filter ${chip.facetLabel}: ${chip.label}`);
        button.addEventListener('click', () => toggleFacetValue(chip.facetKey, chip.value));

        const text = document.createElement('span');
        text.textContent = chip.label;

        const cross = document.createElement('span');
        cross.className = 'chip-remove';
        cross.setAttribute('aria-hidden', 'true');
        cross.textContent = '×';

        button.append(text, cross);
        tray.appendChild(button);
        rendered.push(button);
    }

    if (focusedIndex === -1) return;

    const nextIndex = focusIndexAfterRemoval(focusedIndex, rendered.length);
    if (nextIndex !== -1) {
        rendered[nextIndex].focus();
        return;
    }

    // The tray is now empty. Land on whatever is next in the toolbar instead
    // of letting focus fall out to <body> — the clear button when it is still
    // visible (a search term can keep it shown after the last chip goes),
    // the search box otherwise.
    const clearButton = document.getElementById('clearFilters');
    if (clearButton && !clearButton.hidden) {
        clearButton.focus();
    } else {
        document.getElementById('searchInput')?.focus();
    }
}

/**
 * Refresh every part of the filter UI that depends on the current selection.
 *
 * @returns {void}
 */
function renderFilterControls() {
    for (const panel of document.querySelectorAll('.facet-panel')) {
        renderFacetPanel(panel);

        const selectedCount = (activeFacets[panel.dataset.facetKey] ?? []).length;
        const badge = document.querySelector(`#${panel.dataset.buttonId} .facet-btn-count`);
        badge.textContent = String(selectedCount);
        badge.hidden = selectedCount === 0;
        document.getElementById(panel.dataset.buttonId)
            .classList.toggle('is-active', selectedCount > 0);
    }

    renderChipTray();
}

/**
 * Build the facet toolbar once the collection is known.
 *
 * @returns {void}
 */
function buildFacetBar() {
    const bar = document.getElementById('facetBar');
    bar.replaceChildren();

    for (const facet of FACETS) {
        // A facet no card has a value for would render an empty menu, so it
        // is skipped entirely. Every facet in FACETS has at least one value
        // today, but Summon Type — Fusion / Synchro / XYZ / Ritual / Link /
        // None, per CLAUDE.md §3 — is exactly this case should it ever be
        // added: every card in the collection currently leaves it null.
        if (facetOptions(allCards, facet.key).length === 0) continue;
        bar.appendChild(buildFacet(facet));
    }

    renderFilterControls();
}

// A click anywhere else closes the open panel. Escape does the same but also
// returns focus to the button that opened it, which a click does not need to.
document.addEventListener('click', (event) => {
    if (!event.target.closest('.facet')) closeFacetPanels();
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    const openPanel = [...document.querySelectorAll('.facet-panel')].find(panel => !panel.hidden);
    if (!openPanel) return;

    closeFacetPanels();
    document.getElementById(openPanel.dataset.buttonId)?.focus();
});

/**
 * Reset every filter and the search term, then re-render.
 *
 * Shared by the toolbar button and the empty state's own action, so both
 * always clear exactly the same state.
 */
function clearAllFilters() {
    activeFacets = {};
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
        // The view buttons are mutually exclusive, so the whole group is set
        // at once rather than clearing and then re-adding.
        setExclusiveToggle(document.querySelectorAll('.view-btn'), btn);
        currentView = normaliseView(btn.dataset.view);

        applyViewVisibility();

        if (currentView === VIEW_CAROUSEL) {
            updateCarousel();
        } else {
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
    // Reuse getTotalPages rather than a second hand-rolled Math.ceil, so the
    // two page-count computations in this file cannot drift apart.
    const totalPages = getTotalPages(filteredCards.length, cardsPerPage);
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

    if (currentView !== VIEW_CAROUSEL || filteredCards.length === 0) return;

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
 * Push the current visibility decision onto the two view containers.
 *
 * The decision itself lives in assets/js/view.js. Visibility is expressed with
 * the `hidden` attribute alone: it is the one mechanism assistive technology
 * reads, and a single convention cannot contradict itself the way the old
 * class pair could.
 */
function applyViewVisibility() {
    const visibility = getViewVisibility(currentView, isDataReady);
    document.getElementById('carouselView').hidden = !visibility.carousel;
    document.getElementById('gridView').hidden = !visibility.grid;
}

/**
 * Record whether the collection has resolved, then refresh what is on screen.
 *
 * @param {boolean} ready - whether the collection has loaded
 */
function setDataReady(ready) {
    isDataReady = ready;
    applyViewVisibility();
}

/**
 * Load the collection, then render it.
 *
 * A failure leaves a readable message on screen rather than a blank page.
 */
async function init() {
    setDataReady(false);
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
        setDataReady(true);
        // The facets and their values are read off the collection, so the
        // toolbar cannot be built until the data is in.
        buildFacetBar();
        applyFilters();
    } catch (error) {
        console.error(error);
        setStatus(error.message, true);
    }
}

init();
