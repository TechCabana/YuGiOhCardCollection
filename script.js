// Card data
const allCards = [
    { name: 'Polymerization', type: 'spell', rarity: 'common', cardType: 'Normal Spell', serial: 'LOB-059', gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', emoji: '🌟', stats: [{label: 'Type', value: 'Spell'}, {label: 'Category', value: 'Fusion'}, {label: 'Serial', value: 'LOB-059'}] },
    { name: 'Dark Magician', type: 'monster', rarity: 'ultra', cardType: 'Spellcaster / Effect', serial: 'LOB-005', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', emoji: '🐉', stats: [{label: 'ATK', value: '2500'}, {label: 'DEF', value: '2100'}, {label: 'Level', value: '⭐7'}] },
    { name: 'Blue-Eyes White Dragon', type: 'monster', rarity: 'secret', cardType: 'Dragon / Normal', serial: 'SDK-001', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', emoji: '🐲', stats: [{label: 'ATK', value: '3000'}, {label: 'DEF', value: '2500'}, {label: 'Level', value: '⭐8'}] },
    { name: 'Mirror Force', type: 'trap', rarity: 'rare', cardType: 'Normal Trap', serial: 'MRD-138', gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', emoji: '⚡', stats: [{label: 'Type', value: 'Trap'}, {label: 'Category', value: 'Normal'}, {label: 'Serial', value: 'MRD-138'}] },
    { name: 'Red-Eyes Black Dragon', type: 'monster', rarity: 'super', cardType: 'Dragon / Normal', serial: 'LOB-070', gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', emoji: '🔥', stats: [{label: 'ATK', value: '2400'}, {label: 'DEF', value: '2000'}, {label: 'Level', value: '⭐7'}] },
    { name: 'Mystical Space Typhoon', type: 'spell', rarity: 'rare', cardType: 'Quick-Play Spell', serial: 'MRL-049', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', emoji: '🎴', stats: [{label: 'Type', value: 'Spell'}, {label: 'Speed', value: 'Quick'}, {label: 'Serial', value: 'MRL-049'}] },
    { name: 'Exodia the Forbidden One', type: 'monster', rarity: 'ultra', cardType: 'Spellcaster / Effect', serial: 'LOB-124', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', emoji: '👁️', stats: [{label: 'ATK', value: '1000'}, {label: 'DEF', value: '1000'}, {label: 'Level', value: '⭐3'}] },
    { name: 'Pot of Greed', type: 'spell', rarity: 'common', cardType: 'Normal Spell', serial: 'LOB-119', gradient: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)', emoji: '🏺', stats: [{label: 'Type', value: 'Spell'}, {label: 'Category', value: 'Draw'}, {label: 'Serial', value: 'LOB-119'}] },
    { name: 'Torrential Tribute', type: 'trap', rarity: 'super', cardType: 'Normal Trap', serial: 'LON-025', gradient: 'linear-gradient(135deg, #a8c0ff 0%, #3f2b96 100%)', emoji: '🌊', stats: [{label: 'Type', value: 'Trap'}, {label: 'Category', value: 'Normal'}, {label: 'Serial', value: 'LON-025'}] },
    { name: 'Summoned Skull', type: 'monster', rarity: 'rare', cardType: 'Fiend / Normal', serial: 'LOB-017', gradient: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)', emoji: '💀', stats: [{label: 'ATK', value: '2500'}, {label: 'DEF', value: '1200'}, {label: 'Level', value: '⭐6'}] },
    { name: 'Monster Reborn', type: 'spell', rarity: 'ultra', cardType: 'Normal Spell', serial: 'LOB-118', gradient: 'linear-gradient(135deg, #faaca8 0%, #ddd6f3 100%)', emoji: '♻️', stats: [{label: 'Type', value: 'Spell'}, {label: 'Category', value: 'Revival'}, {label: 'Serial', value: 'LOB-118'}] },
    { name: 'Call of the Haunted', type: 'trap', rarity: 'common', cardType: 'Continuous Trap', serial: 'PSV-012', gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', emoji: '📞', stats: [{label: 'Type', value: 'Trap'}, {label: 'Category', value: 'Continuous'}, {label: 'Serial', value: 'PSV-012'}] }
];

let filteredCards = [...allCards];
let currentIndex = 0;
let activeFilters = new Set();
let currentView = 'carousel';
let currentPage = 1;
const cardsPerPage = 18;

const rarityMap = {
    'common': 'Common',
    'rare': 'Rare',
    'super': 'Super Rare',
    'ultra': 'Ultra Rare',
    'secret': 'Secret Rare'
};

function createCardHTML(card, isGrid = false) {
    const statsHTML = card.stats.map(stat => `
        <div class="stat-box">
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value" style="${stat.label === 'Serial' ? 'font-size: 0.8rem;' : ''}">${stat.value}</div>
        </div>
    `).join('');

    return `
        <div class="card-image-area" style="background: ${card.gradient};">
            ${card.emoji}
            <div class="rarity-badge">${rarityMap[card.rarity]}</div>
        </div>
        <div class="card-info-area">
            <div class="card-name">${card.name}</div>
            <div class="card-type">${card.cardType}</div>
            <div class="card-stats-grid">
                ${statsHTML}
            </div>
        </div>
    `;
}

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
        cardEl.innerHTML = createCardHTML(card);
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
        cardEl.innerHTML = createCardHTML(card, true);
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

// Initialize
updateCarousel();