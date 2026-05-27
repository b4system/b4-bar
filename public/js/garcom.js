// ===== B4 Bar — Área do Garçom =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const state = {
  menu: null,
  search: '',
  activeCategory: null,
  cart: [],
};

const $ = (sel) => document.querySelector(sel);

// ====== Persistência local do rascunho ======
function saveDraft() {
  const draft = {
    cart: state.cart,
    table: $('#tableNumber').value,
    waiter: $('#waiterName').value,
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
    if (d.waiter) $('#waiterName').value = d.waiter;
    if (d.notes) $('#notes').value = d.notes;
  } catch {}
}

// ====== Carregar cardápio ======
async function loadMenu() {
  const res = await fetch('/api/menu');
  state.menu = await res.json();
  state.activeCategory = state.menu.categories[0]?.id || null;
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
  wrap.innerHTML = items.map(it => `
    <button class="waiter-item" data-id="${it.id}" data-name="${escapeAttr(it.name)}" data-price="${it.price}">
      <div class="waiter-item-thumb" ${it.image ? `style="background-image:url('${it.image}');"` : ''}>${!it.image ? '🖼' : ''}</div>
      <div class="waiter-item-name">${it.name}</div>
      <div class="waiter-item-price">${fmt(it.price)}</div>
    </button>
  `).join('');
  wrap.querySelectorAll('.waiter-item').forEach(btn => {
    btn.addEventListener('click', () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: parseFloat(btn.dataset.price),
      });
    });
  });
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

// ====== Carrinho ======
function addToCart(item) {
  const existing = state.cart.find(c => c.id === item.id);
  if (existing) existing.qty += 1;
  else state.cart.push({ ...item, qty: 1 });
  renderCart();
  haptic();
}

function changeQty(id, delta) {
  const it = state.cart.find(c => c.id === id);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) state.cart = state.cart.filter(c => c.id !== id);
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
  const submitBtn = $('#submitOrder');
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  const total = state.cart.reduce((s, i) => s + i.price * i.qty, 0);

  $('#cartCount').textContent = count;
  $('#cartTotal').textContent = fmt(total);
  const miniTotal = $('#cartTotalMini');
  if (miniTotal) miniTotal.textContent = fmt(total);

  if (state.cart.length === 0) {
    wrap.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <div>Nenhum item adicionado</div>
        <div style="font-size:12px;margin-top:4px;">Toque nos itens do cardápio</div>
      </div>`;
    submitBtn.disabled = true;
  } else {
    wrap.innerHTML = state.cart.map(it => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${it.name}</div>
          <div class="cart-item-price">${fmt(it.price)} · ${fmt(it.price * it.qty)}</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn" data-action="dec" data-id="${it.id}" aria-label="Diminuir">−</button>
          <span class="qty-value">${it.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${it.id}" aria-label="Aumentar">+</button>
        </div>
      </div>
    `).join('');
    wrap.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const delta = btn.dataset.action === 'inc' ? 1 : -1;
        changeQty(id, delta);
      });
    });
    submitBtn.disabled = false;
  }

  saveDraft();
}

// ====== Enviar pedido ======
async function submitOrder() {
  const table = $('#tableNumber').value.trim();
  const waiter = $('#waiterName').value.trim();
  const notes = $('#notes').value.trim();
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
        waiter: waiter || 'Garçom',
        items: state.cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
        notes,
      }),
    });
    if (!res.ok) throw new Error('Falha ao enviar');
    const order = await res.json();
    toast(`Pedido #${order.number} enviado · Mesa ${order.table}`, 'success');
    state.cart = [];
    $('#notes').value = '';
    localStorage.removeItem('b4-draft');
    renderCart();
    haptic([60, 30, 60]);
  } catch (err) {
    toast('Erro ao enviar pedido. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Enviar pedido <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
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
['tableNumber', 'waiterName', 'notes'].forEach(id => {
  $(`#${id}`).addEventListener('input', saveDraft);
});

(async function init() {
  const user = await Auth.init('garcom');
  if (!user) return;
  await loadMenu();
  loadDraft();
  renderCart();
})();
