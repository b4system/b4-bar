// ===== B4 Bar — Cardápio do cliente =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const state = {
  menu: null,
  search: '',
  activeCategory: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    state.menu = await res.json();
    renderCategoryTabs();
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
      state.activeCategory = cat || null;
      renderCategoryTabs();
      if (cat) {
        const el = document.getElementById(`cat-${cat}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

function renderMenu() {
  const content = $('#menuContent');
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
        ${cat.items.map(it => `
          <article class="menu-item">
            <div class="menu-item-body">
              <h3 class="menu-item-name">${it.name}</h3>
              <p class="menu-item-desc">${it.description || ''}</p>
              <div class="menu-item-footer">
                <div class="menu-item-price">${fmt(it.price)}</div>
              </div>
            </div>
            <div class="menu-item-thumb ${!it.image ? 'empty' : ''}"
                 ${it.image ? `style="background-image:url('${it.image}');"` : ''}
                 data-icon="${cat.icon}"></div>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');
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

Auth.init();
loadMenu();
