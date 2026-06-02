// ===== B4 Bar — Área do Garçom =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const state = {
  menu: null,
  search: '',
  activeCategory: null,
  cart: [],
  pendingItem: null, // item aguardando observação
};

const $ = (sel) => document.querySelector(sel);

// ====== Persistência local do rascunho ======
function saveDraft() {
  const draft = {
    cart: state.cart,
    table: $('#tableNumber').value,
    notes: $('#notes').value,
  };
  localStorage.setItem('b4-draft', JSON.stringify(draft));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem('b4-draft');
    if (!raw) return;
    const d = JSON.parse(raw);
    state.cart = d.cart || [];
    if (d.table) $('#tableNumber').value = d.table;
    if (d.notes) $('#notes').value = d.notes;
  } catch {}
}

// ====== Carregar cardápio ======
async function loadMenu() {
  const res = await fetch('/api/menu');
  state.menu = await res.json();
  state.activeCategory = null; // sempre inicia em "Todas"
  renderWaiterCategories();
  renderWaiterItems();
  updateItemCount();
}

function updateItemCount() {
  const total = state.menu.categories.reduce((s, c) => s + c.items.length, 0);
  $('#itemCount').textContent = `${total} itens`;
}

function renderWaiterCategories() {
  const wrap = $('#waiterCategories');
  wrap.innerHTML = `
    <button class="waiter-cat-chip ${!state.activeCategory ? 'active' : ''}" data-cat="">Todas</button>
    ${state.menu.categories.map(c => `
      <button class="waiter-cat-chip ${state.activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
        ${c.icon} ${c.name}
      </button>
    `).join('')}
  `;
  wrap.querySelectorAll('.waiter-cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.cat || null;
      renderWaiterCategories();
      renderWaiterItems();
    });
  });
}

function renderWaiterItems() {
  const wrap = $('#waiterItems');
  const term = state.search.trim().toLowerCase();
  let items = [];
  state.menu.categories.forEach(cat => {
    if (state.activeCategory && cat.id !== state.activeCategory) return;
    cat.items.forEach(it => {
      if (term && !it.name.toLowerCase().includes(term) && !(it.description || '').toLowerCase().includes(term)) return;
      items.push({ ...it, categoryName: cat.name });
    });
  });
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:30px;"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Nenhum item</div></div>`;
    return;
  }
  wrap.innerHTML = items.map(it => {
    const hasAddons = Array.isArray(it.addons) && it.addons.length > 0;
    const needsModal = it.observable || hasAddons;
    const img = (Array.isArray(it.images) && it.images[0]) || it.image || '';
    return `
      <button class="waiter-item" data-id="${it.id}">
        <div class="waiter-item-thumb" ${img ? `style="background-image:url('${img}');"` : ''}>${!img ? '🖼' : ''}</div>
        <div class="waiter-item-name">${it.name}${needsModal ? ' <span class="obs-tag" title="Personalizável">✎</span>' : ''}</div>
        <div class="waiter-item-price">${fmt(it.price)}</div>
      </button>
    `;
  }).join('');
  wrap.querySelectorAll('.waiter-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items.find(x => x.id === btn.dataset.id);
      if (!item) return;
      const hasAddons = Array.isArray(item.addons) && item.addons.length > 0;
      if (item.observable || hasAddons) openObsModal(item);
      else addToCart({ id: item.id, name: item.name, price: item.price, notes: '', addons: [] });
    });
  });
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

// ====== Modal de observação + adicionais ======
function openObsModal(item) {
  state.pendingItem = item;
  $('#obsItemPreview').innerHTML = `
    <div class="obs-item-name">${item.name}</div>
    <div class="obs-item-price">${fmt(item.price)}</div>
  `;

  const hasAddons = Array.isArray(item.addons) && item.addons.length > 0;
  const section = $('#obsAddonsSection');
  if (hasAddons) {
    section.style.display = '';
    $('#obsAddonsList').innerHTML = item.addons.map((a, idx) => `
      <label class="addon-toggle">
        <input type="checkbox" data-addon-idx="${idx}" />
        <div class="addon-toggle-name">${a.name}</div>
        <div class="addon-toggle-price">+${fmt(a.price)}</div>
      </label>
    `).join('');
    section.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateObsPrice);
    });
  } else {
    section.style.display = 'none';
  }

  // Exibe ou esconde o campo de observação
  $('#obsTextField').style.display = item.observable ? '' : 'none';
  $('#obsText').value = '';

  updateObsPrice();
  $('#obsModal').classList.add('open');
  setTimeout(() => {
    if (item.observable) $('#obsText').focus();
  }, 80);
}

function getSelectedAddons() {
  if (!state.pendingItem || !Array.isArray(state.pendingItem.addons)) return [];
  const selected = [];
  $('#obsAddonsList').querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.addonIdx);
    const addon = state.pendingItem.addons[idx];
    if (addon) selected.push({ name: addon.name, price: addon.price });
  });
  return selected;
}

function updateObsPrice() {
  if (!state.pendingItem) return;
  const addons = getSelectedAddons();
  const total = state.pendingItem.price + addons.reduce((s, a) => s + a.price, 0);
  $('#obsAddPrice').textContent = fmt(total);
}

function closeObsModal() {
  $('#obsModal').classList.remove('open');
  state.pendingItem = null;
}

function confirmObsAdd() {
  if (!state.pendingItem) return;
  const notes = state.pendingItem.observable ? $('#obsText').value.trim() : '';
  const addons = getSelectedAddons();
  addToCart({
    id: state.pendingItem.id,
    name: state.pendingItem.name,
    price: state.pendingItem.price,
    notes,
    addons,
  });
  closeObsModal();
}

// ====== Carrinho ======
function addToCart(item) {
  const addons = Array.isArray(item.addons) ? item.addons : [];
  const notes = item.notes || '';
  // Itens sem observação/adicionais: agrupa por id. Com personalização: entrada separada.
  if (!notes && addons.length === 0) {
    const existing = state.cart.find(c => c.id === item.id && !c.notes && (!c.addons || c.addons.length === 0));
    if (existing) { existing.qty += 1; renderCart(); haptic(); return; }
  }
  state.cart.push({
    cartId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    id: item.id,
    name: item.name,
    price: item.price, // preço base
    notes,
    addons, // [{ name, price }]
    qty: 1,
  });
  renderCart();
  haptic();
}

function changeQty(cartId, delta) {
  const it = state.cart.find(c => c.cartId === cartId);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) state.cart = state.cart.filter(c => c.cartId !== cartId);
  renderCart();
}

function clearCart() {
  if (state.cart.length === 0) return;
  if (!confirm('Limpar o pedido atual?')) return;
  state.cart = [];
  $('#notes').value = '';
  renderCart();
}

function renderCart() {
  const wrap = $('#cartItems');
  const count = state.cart.reduce((s, i) => s + i.qty, 0);

  $('#cartCount').textContent = count;

  if (state.cart.length === 0) {
    wrap.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <div>Nenhum item adicionado</div>
        <div style="font-size:12px;margin-top:4px;">Toque nos itens do cardápio</div>
      </div>`;
  } else {
    wrap.innerHTML = state.cart.map(it => {
      const addonsHtml = (it.addons && it.addons.length > 0)
        ? `<div class="cart-item-addons">${it.addons.map(a => `<span class="cart-addon">+ ${a.name}</span>`).join('')}</div>`
        : '';
      return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${it.name}</div>
          ${addonsHtml}
          ${it.notes ? `<div class="cart-item-notes">💬 ${it.notes}</div>` : ''}
        </div>
        <div class="qty-control">
          <button class="qty-btn" data-action="dec" data-cart-id="${it.cartId}" aria-label="Diminuir">−</button>
          <span class="qty-value">${it.qty}</span>
          <button class="qty-btn" data-action="inc" data-cart-id="${it.cartId}" aria-label="Aumentar">+</button>
        </div>
      </div>
    `;}).join('');
    wrap.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cartId = btn.dataset.cartId;
        const delta = btn.dataset.action === 'inc' ? 1 : -1;
        changeQty(cartId, delta);
      });
    });
  }

  updateSubmitState();
  saveDraft();
}

function updateSubmitState() {
  const submitBtn = $('#submitOrder');
  const hasTable = $('#tableNumber').value.trim().length > 0;
  const hasItems = state.cart.length > 0;
  submitBtn.disabled = !(hasTable && hasItems);
}

// ====== Enviar pedido ======
async function submitOrder() {
  const table = $('#tableNumber').value.trim();
  const notes = $('#notes').value.trim();
  const user = Auth.getUser();
  const waiter = (user && user.name) || 'Garçom';
  if (!table) {
    toast('Informe o número da mesa', 'error');
    $('#tableNumber').focus();
    return;
  }
  if (state.cart.length === 0) {
    toast('Adicione pelo menos um item', 'error');
    return;
  }
  const btn = $('#submitOrder');
  btn.disabled = true;
  btn.innerHTML = 'Enviando...';
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table,
        waiter,
        items: state.cart.map(c => {
          const addons = Array.isArray(c.addons) ? c.addons : [];
          const addonsSum = addons.reduce((s, a) => s + (a.price || 0), 0);
          return {
            id: c.id,
            name: c.name,
            price: c.price + addonsSum, // preço unitário final (base + adicionais)
            qty: c.qty,
            notes: c.notes || '',
            addons,
          };
        }),
        notes,
      }),
    });
    if (!res.ok) throw new Error('Falha ao enviar');
    const order = await res.json();
    toast(`Pedido #${order.number} enviado · Mesa ${order.table}`, 'success');
    resetOrderFlow();
    haptic([60, 30, 60]);
  } catch (err) {
    toast('Erro ao enviar pedido. Tente novamente.', 'error');
    btn.disabled = false;
  } finally {
    btn.innerHTML = `Enviar pedido <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
  }
}

function resetOrderFlow() {
  state.cart = [];
  $('#tableNumber').value = '';
  $('#notes').value = '';
  localStorage.removeItem('b4-draft');
  renderCart();
  // Mobile: fecha a gaveta do carrinho
  if (window.innerWidth <= 900) {
    $('#cart').classList.remove('open');
  }
  // Volta o foco para o campo de mesa (UX para próximo pedido)
  setTimeout(() => $('#tableNumber').focus(), 250);
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
  }, 2800);
}

function haptic(pattern = 25) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ====== Mobile: cart toggle ======
const cartEl = $('#cart');
$('#cartHeader').addEventListener('click', () => {
  if (window.innerWidth <= 900) cartEl.classList.toggle('open');
});

// ====== Bind ======
let searchTimer;
$('#waiterSearch').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value;
    renderWaiterItems();
  }, 120);
});

$('#submitOrder').addEventListener('click', submitOrder);
$('#clearCart').addEventListener('click', clearCart);
['tableNumber', 'notes'].forEach(id => {
  $(`#${id}`).addEventListener('input', () => { saveDraft(); updateSubmitState(); });
});

// Bindings do modal de observação + adicionais
$('#closeObsModal').addEventListener('click', closeObsModal);
$('#obsCancel').addEventListener('click', closeObsModal);
$('#obsAdd').addEventListener('click', confirmObsAdd);
$('#obsModal').addEventListener('click', (e) => { if (e.target.id === 'obsModal') closeObsModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#obsModal').classList.contains('open')) closeObsModal(); });

(async function init() {
  const user = await Auth.init('garcom');
  if (!user) return;
  await loadMenu();
  loadDraft();
  renderCart();
})();
