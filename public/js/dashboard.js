// ===== B4 Bar — Dashboard =====
const fmt = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (n) => n.toLocaleString('pt-BR');
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const PERIOD_LABELS = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
};

const COLOR_MAP = {
  warn:    { bg: 'var(--warn-soft)',    color: 'var(--warn)' },
  info:    { bg: 'var(--info-soft)',    color: 'var(--info)' },
  success: { bg: 'var(--success-soft)', color: 'var(--success)' },
  neutral: { bg: 'var(--bg-3)',         color: 'var(--text-2)' },
  danger:  { bg: 'var(--danger-soft)',  color: 'var(--danger)' },
};

function statusColorStyle(color) {
  if (/^#[0-9A-Fa-f]{6}$/.test(color || '')) {
    return `background:${color}22;color:${color};`;
  }
  const m = COLOR_MAP[color] || COLOR_MAP.neutral;
  return `background:${m.bg};color:${m.color};`;
}

// Pluraliza para o card (mantém compat com nomes do usuário)
function pluralizeStatus(name) {
  const map = { 'Pendente': 'Pendentes', 'Preparando': 'Preparando', 'Pronto': 'Prontos', 'Entregue': 'Entregues', 'Cancelado': 'Cancelados' };
  return map[name] || name;
}

const state = {
  range: 'today',
  data: null,
  statuses: [], // workflow dinâmico
  chartTime: null,
  chartCategory: null,
};

async function loadStatuses() {
  try {
    const res = await fetch('/api/statuses');
    state.statuses = (await res.json()).sort((a, b) => a.order - b.order);
  } catch { state.statuses = []; }
}

(async () => {
  const user = await Auth.init('dashboard');
  if (!user) return;
  $('#pageContent').style.display = '';
  await loadStatuses();
  bindRangeTabs();
  await loadData();
  setInterval(loadData, 60000); // refresh a cada 60s
})();

function bindRangeTabs() {
  $$('.dash-range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('.dash-range-btn').forEach(b => b.classList.toggle('active', b === btn));
      state.range = btn.dataset.range;
      $('#periodLabel').textContent = PERIOD_LABELS[state.range];
      await loadData();
    });
  });
}

async function loadData() {
  try {
    const res = await fetch(`/api/dashboard/summary?range=${state.range}`, {
      headers: Auth.authHeaders(),
    });
    if (!res.ok) throw new Error();
    state.data = await res.json();
    render();
  } catch (e) {
    toast('Falha ao carregar dados', 'error');
  }
}

function render() {
  const d = state.data;

  // KPIs
  $('#kpiRevenue').textContent = fmt(d.revenue);
  $('#kpiOrders').textContent = fmtInt(d.orderCount);
  $('#kpiAvg').textContent = fmt(d.avgTicket);
  $('#kpiItems').textContent = fmtInt(d.itemCount);

  renderStatus(d.statusCounts);
  renderLateOrders(d.lateOrders || []);
  renderChartTime(d);
  renderChartCategory(d.byCategory);
  renderTopItems(d.topItems);
  renderTopWaiters(d.topWaiters);
}

function renderLateOrders(list) {
  const section = $('#lateSection');
  const wrap = $('#lateList');
  if (!list || list.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  $('#lateCount').textContent = list.length;
  wrap.innerHTML = list.map(o => `
    <a href="/pedidos" class="late-card">
      <div class="late-card-head">
        <div>
          <div class="late-card-table">Mesa ${o.table}</div>
          <div class="late-card-num">#${o.number.toString().padStart(4, '0')} · ${o.waiter}</div>
        </div>
        <div class="late-card-time">⚠ ${o.lateMinutes} min</div>
      </div>
      <div class="late-card-items">
        ${o.lateItems.map(i => `<span class="late-item">${i.qty}× ${i.name}</span>`).join('')}
      </div>
    </a>
  `).join('');
}

function renderStatus(counts) {
  // Workflow dinâmico + "Cancelado" sempre no final
  const list = [
    ...state.statuses.map(s => ({ id: s.id, name: pluralizeStatus(s.name), icon: s.icon || '•', color: s.color })),
    { id: 'cancelado', name: 'Cancelados', icon: '✕', color: 'danger' },
  ];

  // Inclui status presentes nos pedidos mas que NÃO estão no workflow ativo (legado/inativado)
  const knownIds = new Set(list.map(s => s.id));
  Object.keys(counts || {}).forEach(k => {
    if (!knownIds.has(k) && (counts[k] || 0) > 0) {
      list.push({ id: k, name: k.charAt(0).toUpperCase() + k.slice(1), icon: '•', color: 'neutral' });
    }
  });

  $('#statusGrid').innerHTML = list.map(s => `
    <a href="/pedidos?status=${encodeURIComponent(s.id)}" class="status-card" title="Ver pedidos: ${s.name}">
      <div class="status-card-icon" style="${statusColorStyle(s.color)}">${s.icon}</div>
      <div class="status-card-meta">
        <div class="status-card-label">${s.name}</div>
        <div class="status-card-value">${fmtInt(counts[s.id] || 0)}</div>
      </div>
    </a>
  `).join('');
}

// ====== Cores baseadas no tema ======
function chartColors() {
  const css = getComputedStyle(document.documentElement);
  return {
    text: css.getPropertyValue('--text-1').trim() || '#2E2C28',
    text2: css.getPropertyValue('--text-2').trim() || '#7A7570',
    grid: css.getPropertyValue('--border').trim() || '#EDEAE4',
    accent: '#F5A524',
    palette: ['#F5A524', '#2D7DD2', '#1CA94C', '#E03E3E', '#B8860B', '#8B5CF6', '#06B6D4', '#F472B6', '#A3A3A3', '#0EA5E9'],
  };
}

function renderChartTime(d) {
  const c = chartColors();
  const ctx = $('#chartTime').getContext('2d');
  const bucket = d.range === 'today' ? d.hourly : d.daily;
  const labels = bucket.map(b => b.label);
  const data = bucket.map(b => b.revenue);

  $('#chartTimeTitle').textContent = d.range === 'today' ? 'Vendas por hora' : 'Vendas por dia';

  if (state.chartTime) state.chartTime.destroy();
  state.chartTime = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Vendas',
        data,
        backgroundColor: c.accent,
        borderRadius: 6,
        maxBarThickness: 32,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => fmt(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: { ticks: { color: c.text2 }, grid: { display: false } },
        y: {
          ticks: { color: c.text2, callback: (v) => 'R$ ' + v },
          grid: { color: c.grid },
        },
      },
    },
  });
}

function renderChartCategory(data) {
  const c = chartColors();
  const ctx = $('#chartCategory').getContext('2d');
  const labels = data.map(x => x.name);
  const values = data.map(x => x.revenue);
  const colors = labels.map((_, i) => c.palette[i % c.palette.length]);

  if (state.chartCategory) state.chartCategory.destroy();

  if (data.length === 0) {
    $('#chartCategory').style.display = 'none';
    $('#categoryLegend').innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">📭</div><div class="empty-state-title">Sem vendas no período</div></div>';
    return;
  }
  $('#chartCategory').style.display = '';

  state.chartCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-1').trim() || '#fff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)}`,
          },
        },
      },
    },
  });

  const total = values.reduce((s, v) => s + v, 0);
  $('#categoryLegend').innerHTML = data.map((cat, i) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${colors[i]};"></span>
      <span class="legend-name">${cat.name}</span>
      <span class="legend-value">${fmt(cat.revenue)} <span class="legend-pct">${((cat.revenue / total) * 100).toFixed(0)}%</span></span>
    </div>
  `).join('');
}

function renderTopItems(items) {
  $('#topItemsCount').textContent = items.length === 0 ? '' : `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
  if (items.length === 0) {
    $('#topItemsList').innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">🍽️</div><div class="empty-state-title">Nenhum item vendido</div></div>';
    return;
  }
  const max = items[0].qty;
  $('#topItemsList').innerHTML = items.map((it, i) => `
    <div class="top-row">
      <div class="top-rank">${i + 1}</div>
      <div class="top-info">
        <div class="top-name">${it.name}</div>
        <div class="top-bar"><span style="width:${(it.qty / max * 100).toFixed(0)}%;"></span></div>
      </div>
      <div class="top-stats">
        <div class="top-qty">${it.qty}×</div>
        <div class="top-revenue">${fmt(it.revenue)}</div>
      </div>
    </div>
  `).join('');
}

function renderTopWaiters(waiters) {
  if (waiters.length === 0) {
    $('#topWaitersList').innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">👥</div><div class="empty-state-title">Nenhuma venda</div></div>';
    return;
  }
  const max = waiters[0].revenue;
  $('#topWaitersList').innerHTML = waiters.map((w, i) => `
    <div class="top-row">
      <div class="top-avatar">${w.name.charAt(0).toUpperCase()}</div>
      <div class="top-info">
        <div class="top-name">${w.name}</div>
        <div class="top-bar"><span style="width:${(w.revenue / max * 100).toFixed(0)}%;"></span></div>
      </div>
      <div class="top-stats">
        <div class="top-qty">${w.orders} ped.</div>
        <div class="top-revenue">${fmt(w.revenue)}</div>
      </div>
    </div>
  `).join('');
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
