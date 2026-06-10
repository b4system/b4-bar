// ===== B4 Bar — Fechamento de comandas =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  comandas: [],
  filterType: '',
  search: '',
};

(async () => {
  const user = await Auth.init('fechamento');
  if (!user) return;
  $('#pageContent').style.display = '';
  fetchComandas();
  setInterval(fetchComandas, 10000);
})();

async function apiFetch(url, opts = {}) {
  const headers = { ...Auth.authHeaders(), ...(opts.headers || {}) };
  return fetch(url, { ...opts, headers });
}

async function fetchComandas() {
  try {
    const res = await apiFetch('/api/comandas');
    if (!res.ok) throw new Error();
    state.comandas = await res.json();
    render();
  } catch {
    toast('Falha ao carregar comandas', 'error');
  }
}

function comandaDisplay(c) {
  // Usa o objeto comandas se disponível, mostra todas as labels preenchidas
  const cc = c.comandas || { [c.type]: c.identifier };
  const parts = [];
  if (cc.mesa)   parts.push({ icon: '🪑', label: `Mesa ${cc.mesa}` });
  if (cc.codigo) parts.push({ icon: '🎫', label: `Comanda #${cc.codigo}` });
  if (cc.nome)   parts.push({ icon: '🪪', label: cc.nome });
  if (parts.length === 0) parts.push({ icon: '🪑', label: `Mesa ${c.identifier}` });
  return { icon: parts[0].icon, label: parts.map(p => p.label).join(' · '), parts };
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `há ${diff}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

function render() {
  const term = state.search.trim().toLowerCase();
  const filtered = state.comandas
    .filter(c => !state.filterType || c.type === state.filterType)
    .filter(c => !term || c.identifier.toLowerCase().includes(term));

  const summary = state.comandas;
  const totalComandas = summary.length;
  const totalValor = summary.reduce((s, c) => s + c.totalValue, 0);
  const totalPedidos = summary.reduce((s, c) => s + c.ordersCount, 0);

  $('#comandaSummary').innerHTML = totalComandas === 0 ? '' : `
    <div class="summary-item">
      <div class="summary-label">Comandas abertas</div>
      <div class="summary-value">${totalComandas}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Pedidos</div>
      <div class="summary-value">${totalPedidos}</div>
    </div>
    <div class="summary-item summary-primary">
      <div class="summary-label">A receber</div>
      <div class="summary-value">${fmt(totalValor)}</div>
    </div>
  `;

  const wrap = $('#comandasContent');
  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💵</div>
        <div class="empty-state-title">${state.comandas.length === 0 ? 'Nenhuma comanda em aberto' : 'Nenhum resultado'}</div>
        <div class="empty-state-text">${state.comandas.length === 0 ? 'Todas as comandas foram fechadas.' : 'Tente outro filtro ou busca.'}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `<div class="comandas-grid">${filtered.map(renderComanda).join('')}</div>`;
  wrap.querySelectorAll('[data-action="close"]').forEach(btn => {
    btn.addEventListener('click', () => closeComanda(btn.dataset.type, btn.dataset.identifier));
  });
  wrap.querySelectorAll('.comanda-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.comanda-card');
      card.classList.toggle('expanded');
    });
  });
}

function renderComanda(c) {
  const d = comandaDisplay(c);
  const ordersHtml = c.orders.map(o => `
    <div class="comanda-order">
      <div class="comanda-order-head">
        <span class="comanda-order-num">#${o.number.toString().padStart(4, '0')}</span>
        <span class="comanda-order-status status-color-${o.status === 'cancelado' ? 'danger' : 'info'}">${o.status}</span>
        <span class="comanda-order-time">${timeAgo(o.createdAt)}</span>
        <span class="comanda-order-total">${fmt(o.total)}</span>
      </div>
      <div class="comanda-order-items">
        ${(o.items || []).map(i => `<span class="comanda-order-item"><b>${i.qty}×</b> ${i.name}</span>`).join('')}
      </div>
      ${o.notes ? `<div class="order-line-note">💬 ${o.notes}</div>` : ''}
    </div>
  `).join('');

  return `
    <article class="comanda-card">
      <header class="comanda-head">
        <div class="comanda-title">
          <span class="comanda-icon">${d.icon}</span>
          <span class="comanda-label">${d.label}</span>
        </div>
        <div class="comanda-meta">
          <span>${c.ordersCount} ped.</span>
          <span>•</span>
          <span>${c.itemsCount} itens</span>
          <span>•</span>
          <span>${timeAgo(c.firstAt)}</span>
        </div>
      </header>
      <div class="comanda-body">
        <button type="button" class="comanda-toggle">Ver detalhes</button>
        <div class="comanda-orders-list">${ordersHtml}</div>
      </div>
      <footer class="comanda-foot">
        <div class="comanda-total">
          <div class="comanda-total-label">Total</div>
          <div class="comanda-total-value">${fmt(c.totalValue)}</div>
        </div>
        <button class="btn btn-primary btn-sm" data-action="close" data-type="${c.type}" data-identifier="${escapeAttr(c.identifier)}">
          ✓ Fechar comanda
        </button>
      </footer>
    </article>
  `;
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

async function closeComanda(type, identifier) {
  if (!confirm(`Fechar a comanda? Os pedidos serão marcados como pagos.`)) return;
  try {
    const res = await apiFetch('/api/comandas/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, identifier }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Falha');
    }
    const data = await res.json();
    toast(`Comanda fechada · ${data.closedCount} pedidos · ${fmt(data.totalValue)}`, 'success');
    fetchComandas();
  } catch (e) {
    toast(e.message || 'Falha ao fechar', 'error');
  }
}

function toast(msg, kind = 'info') {
  const c = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const icon = { success: '✓', error: '✕', info: 'ℹ' }[kind] || 'ℹ';
  el.innerHTML = `<span style="font-weight:700;">${icon}</span> <span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.style.animation = 'toast-out 0.3s ease forwards'; setTimeout(() => el.remove(), 300); }, 2500);
}

// Filtros
$('#comandaFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-type]');
  if (!btn) return;
  state.filterType = btn.dataset.type;
  $('#comandaFilters').querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b === btn));
  render();
});

let searchTimer;
$('#searchComanda').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value; render(); }, 150);
});
