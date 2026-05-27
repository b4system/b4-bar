// ===== B4 Bar — Cadastro de Mercadoria =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const EMOJIS = ['🍺','🍻','🍷','🥂','🍸','🍹','🥃','☕','🍵','🥤','🧃','🧉','🍔','🌭','🍕','🌮','🌯','🥪','🍟','🥗','🍝','🍜','🍣','🥟','🍢','🍤','🍖','🥩','🍗','🥘','🥣','🍛','🍲','🍰','🧁','🍮','🍩','🍪','🍫','🍦','🍧','🍨','🍌','🍓','🍒','🍑','🍍','🥭','🍇','🥥','🌶️','🧄','🧅','🥔','🍅','🍆'];

const state = {
  menu: null,
  search: '',
  filterCategory: null,
  editing: null,
  imageUrl: '',
  uploading: false,
  categoryEditing: null,
};

// ====== Carrega cardápio ======
async function loadMenu() {
  const res = await fetch('/api/menu');
  state.menu = await res.json();
  renderCategoryFilters();
  renderCategorySelect();
  renderList();
}

// ====== Filtros de categoria (chips) ======
function renderCategoryFilters() {
  const wrap = $('#adminCatFilters');
  const cats = state.menu.categories;
  const totalItems = cats.reduce((s, c) => s + c.items.length, 0);

  wrap.innerHTML = `
    <button class="category-chip ${!state.filterCategory ? 'active' : ''}" data-cat="">
      Todas <span class="chip-count">${totalItems}</span>
    </button>
    ${cats.map(c => `
      <button class="category-chip ${state.filterCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
        ${c.icon} ${c.name} <span class="chip-count">${c.items.length}</span>
      </button>
    `).join('')}
  `;

  wrap.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filterCategory = btn.dataset.cat || null;
      renderCategoryFilters();
      renderList();
    });
  });
}

function renderCategorySelect() {
  const sel = $('#itemCategory');
  sel.innerHTML = state.menu.categories.map(c =>
    `<option value="${c.id}">${c.icon} ${c.name}</option>`
  ).join('');
}

// ====== Lista de produtos ======
function renderList() {
  const wrap = $('#adminList');
  const term = state.search.trim().toLowerCase();
  const catFilter = state.filterCategory;

  const catsToShow = state.menu.categories
    .filter(cat => !catFilter || cat.id === catFilter)
    .map(cat => {
      const items = cat.items.filter(it =>
        !term ||
        it.name.toLowerCase().includes(term) ||
        (it.description || '').toLowerCase().includes(term)
      );
      return { ...cat, filteredItems: items };
    })
    .filter(cat => !term || cat.filteredItems.length > 0);

  if (state.menu.categories.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <div class="empty-state-title">Nenhuma categoria</div>
        <div class="empty-state-text">Crie uma categoria para começar a cadastrar produtos.</div>
      </div>`;
    return;
  }

  if (catsToShow.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Nenhum resultado</div>
        <div class="empty-state-text">Tente outro termo de busca ou outra categoria.</div>
      </div>`;
    return;
  }

  wrap.innerHTML = catsToShow.map(cat => `
    <article class="admin-category">
      <header class="admin-category-head">
        <div class="admin-category-title">
          <span class="icon">${cat.icon}</span>
          <span>${cat.name}</span>
          <span style="font-size:12px;color:var(--text-2);font-weight:400;">(${cat.items.length})</span>
        </div>
        <div class="admin-category-actions">
          <button class="icon-btn" data-action="add-to-cat" data-cat="${cat.id}" title="Adicionar item nesta categoria">+</button>
          <button class="icon-btn" data-action="edit-cat" data-cat="${cat.id}" title="Editar categoria">✎</button>
          <button class="icon-btn danger" data-action="del-cat" data-cat="${cat.id}" title="Excluir categoria">🗑</button>
        </div>
      </header>
      <div class="admin-items">
        ${cat.filteredItems.length === 0
          ? `<div class="admin-empty-cat">Nenhum item ${term ? 'encontrado' : 'nesta categoria'}</div>`
          : cat.filteredItems.map(it => `
            <div class="admin-item" data-action="edit-item" data-id="${it.id}" role="button" tabindex="0">
              <div class="admin-item-thumb" ${it.image ? `style="background-image:url('${it.image}');"` : ''}>${!it.image ? '🖼' : ''}</div>
              <div class="admin-item-info">
                <div class="admin-item-name">${it.name}</div>
                <div class="admin-item-meta">${it.description ? it.description.slice(0, 50) + (it.description.length > 50 ? '…' : '') + ' · ' : ''}<b>${fmt(it.price)}</b></div>
              </div>
              <div class="admin-item-actions">
                <button class="icon-btn" data-action="edit-item" data-id="${it.id}" title="Editar">✎</button>
                <button class="icon-btn danger" data-action="del-item" data-id="${it.id}" title="Excluir">🗑</button>
              </div>
            </div>
          `).join('')
        }
      </div>
    </article>
  `).join('');

  wrap.querySelectorAll('[data-action]').forEach(el => {
    const action = el.dataset.action;
    const handler = (e) => {
      e.stopPropagation();
      if (action === 'add-to-cat') openProductModal(null, el.dataset.cat);
      else if (action === 'edit-cat') openCategoryModal(el.dataset.cat);
      else if (action === 'del-cat') deleteCategory(el.dataset.cat);
      else if (action === 'edit-item') openProductModal(el.dataset.id);
      else if (action === 'del-item') deleteItem(el.dataset.id);
    };
    el.addEventListener('click', handler);
    if (el.tagName !== 'BUTTON') {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handler(e); });
    }
  });
}

// ====== Modal de produto ======
function openProductModal(itemId, preselectedCat) {
  state.editing = null;
  state.imageUrl = '';

  if (itemId) {
    let found = null, foundCat = null;
    for (const cat of state.menu.categories) {
      const it = cat.items.find(i => i.id === itemId);
      if (it) { found = it; foundCat = cat; break; }
    }
    if (!found) return;
    state.editing = { ...found, categoryId: foundCat.id };
    state.imageUrl = found.image || '';
    $('#productModalTitle').textContent = 'Editar produto';
    $('#itemName').value = found.name;
    $('#itemDesc').value = found.description || '';
    $('#itemPrice').value = found.price;
    $('#itemCategory').value = foundCat.id;
    $('#saveItem').textContent = 'Salvar alterações';
  } else {
    $('#productModalTitle').textContent = 'Novo produto';
    $('#itemName').value = '';
    $('#itemDesc').value = '';
    $('#itemPrice').value = '';
    $('#saveItem').textContent = 'Cadastrar produto';
    if (preselectedCat) $('#itemCategory').value = preselectedCat;
    else if (state.filterCategory) $('#itemCategory').value = state.filterCategory;
  }

  updateImagePreview(state.imageUrl);
  $('#productModal').classList.add('open');
  setTimeout(() => $('#itemName').focus(), 80);
}

function closeProductModal() {
  $('#productModal').classList.remove('open');
  state.editing = null;
  state.imageUrl = '';
}

async function saveItem() {
  const name = $('#itemName').value.trim();
  const description = $('#itemDesc').value.trim();
  const price = parseFloat($('#itemPrice').value);
  const categoryId = $('#itemCategory').value;

  if (!name) return toast('Informe o nome do produto', 'error');
  if (isNaN(price) || price < 0) return toast('Informe um preço válido', 'error');
  if (!categoryId) return toast('Selecione uma categoria', 'error');

  const payload = { name, description, price, image: state.imageUrl, categoryId };
  const btn = $('#saveItem');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Salvando...';

  try {
    let res;
    if (state.editing) {
      res = await fetch(`/api/admin/items/${state.editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!res.ok) throw new Error();
    toast(state.editing ? 'Produto atualizado' : 'Produto cadastrado', 'success');
    closeProductModal();
    await loadMenu();
  } catch {
    toast('Falha ao salvar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function deleteItem(id) {
  if (!confirm('Excluir este produto?')) return;
  try {
    const res = await fetch(`/api/admin/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    toast('Produto excluído', 'info');
    await loadMenu();
  } catch {
    toast('Falha ao excluir', 'error');
  }
}

// ====== Upload de imagem ======
function updateImagePreview(url) {
  const prev = $('#imagePreview');
  if (url) {
    prev.style.backgroundImage = `url('${url}')`;
    prev.classList.add('has-image');
  } else {
    prev.style.backgroundImage = '';
    prev.classList.remove('has-image');
  }
}

async function uploadFile(file) {
  if (state.uploading) return;
  if (!file.type.startsWith('image/')) return toast('Selecione um arquivo de imagem', 'error');
  if (file.size > 4 * 1024 * 1024) return toast('Imagem maior que 4MB', 'error');

  state.uploading = true;
  const dz = $('#dropzone');
  dz.style.opacity = '0.6';
  const fd = new FormData();
  fd.append('image', file);
  try {
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha no upload');
    }
    const { url } = await res.json();
    state.imageUrl = url;
    updateImagePreview(url);
    toast('Imagem carregada', 'success');
  } catch (e) {
    toast(e.message || 'Falha no upload', 'error');
  } finally {
    state.uploading = false;
    dz.style.opacity = '1';
  }
}

// ====== Modal de categoria ======
function openCategoryModal(catId) {
  state.categoryEditing = catId || null;
  if (catId) {
    const cat = state.menu.categories.find(c => c.id === catId);
    $('#categoryModalTitle').textContent = 'Editar categoria';
    $('#catName').value = cat.name;
    selectEmoji(cat.icon);
  } else {
    $('#categoryModalTitle').textContent = 'Nova categoria';
    $('#catName').value = '';
    selectEmoji('🍽️');
  }
  $('#categoryModal').classList.add('open');
  setTimeout(() => $('#catName').focus(), 80);
}

function closeCategoryModal() {
  $('#categoryModal').classList.remove('open');
  state.categoryEditing = null;
}

function renderEmojiGrid() {
  $('#emojiGrid').innerHTML = EMOJIS.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('');
  $$('#emojiGrid button').forEach(b => b.addEventListener('click', () => selectEmoji(b.dataset.emoji)));
}

function selectEmoji(emoji) {
  $$('#emojiGrid button').forEach(b => b.classList.toggle('active', b.dataset.emoji === emoji));
}

async function saveCategory() {
  const name = $('#catName').value.trim();
  const iconBtn = $('#emojiGrid button.active');
  const icon = iconBtn ? iconBtn.dataset.emoji : '🍽️';
  if (!name) return toast('Informe o nome da categoria', 'error');
  const btn = $('#saveCategory');
  btn.disabled = true;
  try {
    let res;
    if (state.categoryEditing) {
      res = await fetch(`/api/admin/categories/${state.categoryEditing}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon }),
      });
    } else {
      res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon }),
      });
    }
    if (!res.ok) throw new Error();
    toast(state.categoryEditing ? 'Categoria atualizada' : 'Categoria criada', 'success');
    closeCategoryModal();
    await loadMenu();
  } catch {
    toast('Falha ao salvar categoria', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteCategory(id) {
  const cat = state.menu.categories.find(c => c.id === id);
  if (!cat) return;
  const msg = cat.items.length > 0
    ? `Excluir "${cat.name}" e seus ${cat.items.length} item(s)?`
    : `Excluir a categoria "${cat.name}"?`;
  if (!confirm(msg)) return;
  try {
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    toast('Categoria excluída', 'info');
    if (state.filterCategory === id) state.filterCategory = null;
    await loadMenu();
  } catch {
    toast('Falha ao excluir', 'error');
  }
}

// ====== Toasts ======
function toast(msg, kind = 'info') {
  const c = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const icon = { success: '✓', error: '✕', info: 'ℹ' }[kind] || 'ℹ';
  el.innerHTML = `<span style="font-weight:700;">${icon}</span> <span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

// ====== Bindings ======
let searchTimer;
$('#adminSearch').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value; renderList(); }, 150);
});

$('#newProductBtn').addEventListener('click', () => openProductModal());
$('#newCategoryBtn').addEventListener('click', () => openCategoryModal());

$('#saveItem').addEventListener('click', saveItem);
$('#cancelProduct').addEventListener('click', closeProductModal);
$('#closeProductModal').addEventListener('click', closeProductModal);
$('#productModal').addEventListener('click', (e) => {
  if (e.target.id === 'productModal') closeProductModal();
});

$('#saveCategory').addEventListener('click', saveCategory);
$('#cancelCategory').addEventListener('click', closeCategoryModal);
$('#closeCategoryModal').addEventListener('click', closeCategoryModal);
$('#categoryModal').addEventListener('click', (e) => {
  if (e.target.id === 'categoryModal') closeCategoryModal();
});

// Fechar modais com Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#productModal').classList.contains('open')) closeProductModal();
    else if ($('#categoryModal').classList.contains('open')) closeCategoryModal();
  }
});

// Upload de imagem
const dz = $('#dropzone');
const imgInput = $('#imageInput');
dz.addEventListener('click', (e) => {
  if (e.target.id === 'removeImg') return;
  imgInput.click();
});
imgInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) uploadFile(file);
  imgInput.value = '';
});
['dragover', 'dragenter'].forEach(evt => {
  dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(evt => {
  dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove('dragover'); });
});
dz.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});
$('#removeImg').addEventListener('click', (e) => {
  e.stopPropagation();
  state.imageUrl = '';
  updateImagePreview('');
});

renderEmojiGrid();
loadMenu();
