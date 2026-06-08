// ===== B4 Bar — Cardápio do cliente =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const state = {
  menu: null,
  search: '',
  activeCategory: null,
  scrollingTo: 0,
  spyObserver: null,
  viewMode: localStorage.getItem('b4_view_mode') || 'lista', // lista | grade
  gradeCategory: null, // categoria aberta dentro do modo grade
};

const CAT_PALETTE = [
  ['#F5A524', '#D97706'], // amber
  ['#E03E3E', '#9B1C1C'], // red
  ['#2D7DD2', '#1E40AF'], // blue
  ['#1CA94C', '#15803D'], // green
  ['#8B5CF6', '#5B21B6'], // purple
  ['#EC4899', '#9D174D'], // pink
  ['#06B6D4', '#0E7490'], // cyan
  ['#F472B6', '#9D174D'], // rose
];

function catGradient(idx) {
  const [c1, c2] = CAT_PALETTE[idx % CAT_PALETTE.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

function primaryImage(it) {
  if (Array.isArray(it.images) && it.images.length > 0) return it.images[0];
  return it.image || '';
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    state.menu = await res.json();
    applyViewMode();
    renderCategoryTabs();
    renderCategoryGrid();
    renderMenu();
  } catch (err) {
    $('#menuContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Não foi possível carregar o cardápio</div>
        <div class="empty-state-text">Verifique sua conexão e tente novamente.</div>
      </div>`;
  }
}

function setViewMode(mode) {
  state.viewMode = mode;
  localStorage.setItem('b4_view_mode', mode);
  state.gradeCategory = null; // reseta drill-in ao trocar de modo
  $$('.view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  applyViewMode();
  renderMenu();
}

function applyViewMode() {
  const isGrade = state.viewMode === 'grade';
  const inGradeRoot = isGrade && !state.gradeCategory;

  // Chip filter (com sticky wrap) só aparece no modo lista
  const chipWrap = document.querySelector('.chip-scroller-wrap');
  if (chipWrap) chipWrap.style.display = isGrade ? 'none' : '';

  // Search e hero só na lista OU dentro de uma categoria (drill-in)
  const hero = document.querySelector('.hero');
  const search = document.querySelector('.search-bar');
  if (hero) hero.style.display = inGradeRoot ? 'none' : '';
  if (search) search.style.display = inGradeRoot ? 'none' : '';

  // Grid de categorias só visível no "root" do modo grade
  $('#categoryGrid').style.display = inGradeRoot ? 'grid' : 'none';
}

function renderCategoryGrid() {
  if (!state.menu) return;
  const wrap = $('#categoryGrid');
  wrap.innerHTML = state.menu.categories.map((c, idx) => `
    <button class="cat-grid-item" data-cat="${c.id}">
      <div class="cat-grid-icon" style="background: ${catGradient(idx)};">${c.icon}</div>
      <div class="cat-grid-name">${c.name}</div>
      <div class="cat-grid-count">${c.items.length} ${c.items.length === 1 ? 'item' : 'itens'}</div>
    </button>
  `).join('');
  wrap.querySelectorAll('.cat-grid-item').forEach(btn => {
    btn.addEventListener('click', () => openGradeCategory(btn.dataset.cat));
  });
}

function openGradeCategory(catId) {
  state.gradeCategory = catId;
  applyViewMode();
  renderMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToGrade() {
  state.gradeCategory = null;
  applyViewMode();
  renderMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCategoryTabs() {
  const tabs = $('#categoryTabs');
  tabs.innerHTML = `
    <button class="category-chip ${!state.activeCategory ? 'active' : ''}" data-cat="">Tudo</button>
    ${state.menu.categories.map(c => `
      <button class="category-chip ${state.activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
        <span>${c.icon}</span> ${c.name}
      </button>
    `).join('')}
  `;
  tabs.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      setActiveCategory(cat || null);
      state.scrollingTo = Date.now();
      if (cat) {
        const el = document.getElementById(`cat-${cat}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// Atualiza só a classe ativa dos chips, sem re-render
function setActiveCategory(cat) {
  if (state.activeCategory === cat) return;
  state.activeCategory = cat;
  $$('#categoryTabs .category-chip').forEach(chip => {
    chip.classList.toggle('active', (chip.dataset.cat || null) === cat);
  });
  // Scrolla o chip ativo horizontalmente para ficar visível
  const active = $('#categoryTabs .category-chip.active');
  if (active) {
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

// Observa as seções de categoria visíveis e atualiza o chip ativo
function setupScrollSpy() {
  if (state.spyObserver) state.spyObserver.disconnect();
  const sections = $$('.category-section');
  if (sections.length === 0) return;

  state.spyObserver = new IntersectionObserver((entries) => {
    // Ignora durante scroll programático (clique em chip)
    if (Date.now() - state.scrollingTo < 700) return;
    // Pega seções intersectantes ordenadas pelo topo
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length === 0) return;
    const id = visible[0].target.id; // 'cat-xyz'
    const catId = id.replace(/^cat-/, '');
    setActiveCategory(catId);
  }, {
    // Faixa de detecção: 180px abaixo do topo (header + filtro) até 60% da viewport
    rootMargin: '-180px 0px -60% 0px',
    threshold: 0,
  });

  sections.forEach(sec => state.spyObserver.observe(sec));
}

function renderMenu() {
  const content = $('#menuContent');
  if (!state.menu) return;

  // Modo grade no "root" (só botões): esconde o conteúdo
  if (state.viewMode === 'grade' && !state.gradeCategory) {
    content.innerHTML = '';
    return;
  }

  // Modo grade com categoria aberta: mostra só ela com botão "voltar"
  if (state.viewMode === 'grade' && state.gradeCategory) {
    const cat = state.menu.categories.find(c => c.id === state.gradeCategory);
    if (!cat) { backToGrade(); return; }
    content.innerHTML = `
      <button class="grade-back-btn" id="gradeBack">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Voltar às categorias
      </button>
      <section class="category-section" id="cat-${cat.id}">
        <header class="category-header">
          <span class="category-icon">${cat.icon}</span>
          <h2 class="category-title">${cat.name}</h2>
        </header>
        <div class="menu-grid">
          ${cat.items.map(it => {
            const img = primaryImage(it);
            return `
            <article class="menu-item">
              <div class="menu-item-body">
                <h3 class="menu-item-name">${it.name}</h3>
                <p class="menu-item-desc">${it.description || ''}</p>
                <div class="menu-item-footer">
                  <div class="menu-item-price">${fmt(it.price)}</div>
                </div>
              </div>
              <div class="menu-item-thumb ${!img ? 'empty' : ''}"
                   ${img ? `style="background-image:url('${img}');"` : ''}
                   data-icon="${cat.icon}"></div>
            </article>
          `;}).join('')}
        </div>
      </section>
    `;
    $('#gradeBack').addEventListener('click', backToGrade);
    return;
  }

  // Modo lista (default)
  const term = state.search.trim().toLowerCase();

  const filteredCats = state.menu.categories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(it =>
        !term ||
        it.name.toLowerCase().includes(term) ||
        (it.description && it.description.toLowerCase().includes(term))
      )
    }))
    .filter(cat => cat.items.length > 0);

  if (filteredCats.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Nada encontrado</div>
        <div class="empty-state-text">Tente outra palavra-chave.</div>
      </div>`;
    return;
  }

  content.innerHTML = filteredCats.map(cat => `
    <section class="category-section" id="cat-${cat.id}">
      <header class="category-header">
        <span class="category-icon">${cat.icon}</span>
        <h2 class="category-title">${cat.name}</h2>
      </header>
      <div class="menu-grid">
        ${cat.items.map(it => {
          const img = primaryImage(it);
          return `
          <article class="menu-item">
            <div class="menu-item-body">
              <h3 class="menu-item-name">${it.name}</h3>
              <p class="menu-item-desc">${it.description || ''}</p>
              <div class="menu-item-footer">
                <div class="menu-item-price">${fmt(it.price)}</div>
              </div>
            </div>
            <div class="menu-item-thumb ${!img ? 'empty' : ''}"
                 ${img ? `style="background-image:url('${img}');"` : ''}
                 data-icon="${cat.icon}"></div>
          </article>
        `;}).join('')}
      </div>
    </section>
  `).join('');

  // Reativa scroll spy após cada render
  setTimeout(setupScrollSpy, 100);
}

// Search debounce
let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value;
    renderMenu();
  }, 150);
});

$$('.view-mode-btn').forEach(b => {
  b.classList.toggle('active', b.dataset.view === state.viewMode);
  b.addEventListener('click', () => setViewMode(b.dataset.view));
});

Auth.init();
loadMenu();

// Detecta quando o filtro está "grudado" no topo para realçar a sombra
(function setupStickyFilter() {
  const wrap = document.getElementById('categoryTabs');
  if (!wrap) return;
  // Espera o auth.js envolver com .chip-scroller-wrap
  setTimeout(() => {
    const scrollerWrap = wrap.closest('.chip-scroller-wrap');
    if (!scrollerWrap) return;
    // Sentinela invisível antes do wrap para detectar quando ele "gruda"
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;';
    scrollerWrap.parentNode.insertBefore(sentinel, scrollerWrap);
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => scrollerWrap.classList.toggle('is-stuck', !e.isIntersecting));
    }, { threshold: 0 });
    obs.observe(sentinel);
  }, 200);
})();
