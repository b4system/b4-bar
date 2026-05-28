// ===== B4 Bar — Painel de pedidos =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (sel) => document.querySelector(sel);

const state = {
  orders: [],
  filter: '',
};

const NEXT_STATUS = {
  pendente: { next: 'preparando', label: 'Iniciar preparo' },
  preparando: { next: 'pronto', label: 'Marcar pronto' },
  pronto: { next: 'entregue', label: 'Entregar' },
};

const STATUS_LABEL = {
  pendente: 'Pendente',
  preparando: 'Preparando',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    state.orders = await res.json();
    render();
  } catch (err) {
    console.error(err);
  }
}

function render() {
  const wrap = $('#ordersContent');
  const list = state.filter
    ? state.orders.filter(o => o.status === state.filter)
    : state.orders;

  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🍽️</div>
        <div class="empty-state-title">Nenhum pedido por aqui</div>
        <div class="empty-state-text">Os novos pedidos aparecerão automaticamente.</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `<div class="orders-grid">${list.map(renderOrder).join('')}</div>`;
  wrap.querySelectorAll('[data-action="advance"]').forEach(btn => {
    btn.addEventListener('click', () => advance(btn.dataset.id, btn.dataset.next));
  });
  wrap.querySelectorAll('[data-action="cancel"]').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.id, 'cancelado'));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.id));
  });
}

function renderOrder(o) {
  const next = NEXT_STATUS[o.status];
  const itemsHtml = o.items.map(i => {
    const addons = Array.isArray(i.addons) ? i.addons : [];
    const addonsHtml = addons.length > 0
      ? `<div class="order-line-addons">${addons.map(a => `<span class="order-addon">+ ${a.name}</span>`).join('')}</div>`
      : '';
    const noteHtml = i.notes ? `<div class="order-line-note">💬 ${i.notes}</div>` : '';
    return `
      <div class="order-line">
        <div class="order-line-main">
          <span class="order-line-name"><b>${i.qty}×</b> ${i.name}</span>
          ${addonsHtml}
          ${noteHtml}
        </div>
        <span style="color:var(--text-2);">${fmt(i.price * i.qty)}</span>
      </div>
    `;
  }).join('');

  return `
    <article class="order-card">
      <header class="order-head">
        <div>
          <div class="order-table">Mesa ${o.table}</div>
          <div class="order-num">#${o.number.toString().padStart(4, '0')}</div>
        </div>
        <div style="text-align:right;">
          <span class="status-badge status-${o.status}">${STATUS_LABEL[o.status]}</span>
          <div class="order-time" style="margin-top:6px;">${timeAgo(o.createdAt)}</div>
        </div>
      </header>
      <div class="order-body">
        <div class="order-meta">
          <span>👤 ${o.waiter}</span>
          <span>•</span>
          <span>${o.items.length} ${o.items.length === 1 ? 'item' : 'itens'}</span>
        </div>
        <div class="order-items-list">${itemsHtml}</div>
        ${o.notes ? `<div class="order-notes">💬 ${o.notes}</div>` : ''}
      </div>
      <footer class="order-foot">
        <div class="order-total">${fmt(o.total)}</div>
        <div class="order-actions">
          ${next ? `<button class="order-action" data-action="advance" data-id="${o.id}" data-next="${next.next}">${next.label}</button>` : ''}
          ${o.status !== 'cancelado' && o.status !== 'entregue' ? `<button class="order-action danger" data-action="cancel" data-id="${o.id}">Cancelar</button>` : ''}
          ${o.status === 'entregue' || o.status === 'cancelado' ? `<button class="order-action danger" data-action="delete" data-id="${o.id}">Remover</button>` : ''}
        </div>
      </footer>
    </article>
  `;
}

async function advance(id, next) {
  await updateStatus(id, next);
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error();
    toast(`Status atualizado: ${STATUS_LABEL[status]}`, 'success');
    fetchOrders();
  } catch {
    toast('Falha ao atualizar', 'error');
  }
}

async function deleteOrder(id) {
  if (!confirm('Remover este pedido do painel?')) return;
  try {
    await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    toast('Pedido removido', 'info');
    fetchOrders();
  } catch {
    toast('Falha ao remover', 'error');
  }
}

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

// Filtros
$('#filters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-status]');
  if (!btn) return;
  state.filter = btn.dataset.status;
  $('#filters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  render();
});

(async () => {
  const user = await Auth.init('pedidos');
  if (!user) return;
  fetchOrders();
  setInterval(fetchOrders, 5000);
})();
