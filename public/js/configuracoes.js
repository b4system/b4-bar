// ===== B4 Bar — Configurações (status dos pedidos) =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  statuses: [],
  editing: null,
  selectedColor: 'neutral',
  customColor: '#9C27B0',
};

const PRESETS = ['warn', 'info', 'success', 'neutral', 'danger'];
const isHex = (c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c);

(async () => {
  const user = await Auth.init('configuracoes');
  if (!user) return;
  $('#pageContent').style.display = '';
  await loadStatuses();
  await loadSettings();
  bindComandaToggles();
})();

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    const enabled = s.enabledComandaTypes || ['mesa'];
    $('#ctMesa').checked = enabled.includes('mesa');
    $('#ctNome').checked = enabled.includes('nome');
    $('#ctCodigo').checked = enabled.includes('codigo');
  } catch {}
}

function bindComandaToggles() {
  ['ctMesa', 'ctNome', 'ctCodigo'].forEach(id => {
    $(`#${id}`).addEventListener('change', saveComandaSettings);
  });
}

async function saveComandaSettings(e) {
  const enabled = [];
  if ($('#ctMesa').checked) enabled.push('mesa');
  if ($('#ctNome').checked) enabled.push('nome');
  if ($('#ctCodigo').checked) enabled.push('codigo');
  if (enabled.length === 0) {
    toast('Pelo menos um tipo deve ficar ativo', 'error');
    if (e?.target) e.target.checked = true; // reverte
    return;
  }
  try {
    const res = await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledComandaTypes: enabled }),
    });
    if (!res.ok) throw new Error();
    toast('Configuração salva', 'success');
  } catch {
    toast('Falha ao salvar', 'error');
  }
}

async function apiFetch(url, opts = {}) {
  const headers = { ...Auth.authHeaders(), ...(opts.headers || {}) };
  return fetch(url, { ...opts, headers });
}

async function loadStatuses() {
  const res = await apiFetch('/api/statuses');
  state.statuses = (await res.json()).sort((a, b) => a.order - b.order);
  renderList();
}

function renderList() {
  const wrap = $('#statusList');
  if (state.statuses.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚙️</div>
        <div class="empty-state-title">Nenhum status</div>
        <div class="empty-state-text">Crie o primeiro status do fluxo de pedidos.</div>
      </div>`;
    return;
  }
  wrap.innerHTML = state.statuses.map((s, idx) => {
    const customStyle = isHex(s.color) ? `style="background:${s.color}22;color:${s.color};border-color:${s.color}55;"` : '';
    const customTagClass = isHex(s.color) ? '' : `color-${s.color}`;
    const inactive = s.active === false;
    return `
    <div class="status-config-row ${inactive ? 'is-inactive' : ''}" data-id="${s.id}" draggable="true">
      <button class="status-drag" aria-label="Arrastar para reordenar">⋮⋮</button>
      <div class="status-icon-preview">${s.icon || '•'}</div>
      <div class="status-info">
        <div class="status-config-name">${s.name} ${inactive ? '<span class="status-inactive-pill">Inativo</span>' : ''}</div>
        <div class="status-config-meta">
          <span class="color-tag ${customTagClass}" ${customStyle}>${isHex(s.color) ? s.color : colorLabel(s.color)}</span>
          <span class="status-config-id">id: ${s.id}</span>
        </div>
      </div>
      <div class="status-config-actions">
        <button class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''} title="Subir">↑</button>
        <button class="icon-btn" data-action="down" ${idx === state.statuses.length - 1 ? 'disabled' : ''} title="Descer">↓</button>
        <button class="icon-btn" data-action="edit" title="Editar">✎</button>
        <button class="icon-btn ${inactive ? '' : 'warn'}" data-action="toggle" title="${inactive ? 'Reativar' : 'Inativar'}">${inactive ? '▶' : '⏸'}</button>
        <button class="icon-btn danger" data-action="del" title="Excluir">🗑</button>
      </div>
    </div>
  `;}).join('') + `
    <div class="status-config-row status-locked">
      <div class="status-icon-preview">✕</div>
      <div class="status-info">
        <div class="status-config-name">Cancelado</div>
        <div class="status-config-meta">
          <span class="color-tag color-danger">Crítico</span>
          <span class="status-config-id">sempre disponível · não pode ser removido</span>
        </div>
      </div>
    </div>
  `;

  wrap.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.status-config-row');
      const id = row.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') openModal(id);
      else if (action === 'del') deleteStatus(id);
      else if (action === 'up') move(id, -1);
      else if (action === 'down') move(id, 1);
      else if (action === 'toggle') toggleActive(id);
    });
  });
}

async function toggleActive(id) {
  const s = state.statuses.find(x => x.id === id);
  if (!s) return;
  const newActive = s.active === false;
  try {
    const res = await apiFetch(`/api/admin/statuses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: newActive }),
    });
    if (!res.ok) throw new Error();
    toast(newActive ? 'Status reativado' : 'Status inativado', 'info');
    await loadStatuses();
  } catch {
    toast('Falha ao atualizar', 'error');
  }
}

function colorLabel(c) {
  return { warn: 'Alerta', info: 'Em andamento', success: 'Concluído', neutral: 'Neutro', danger: 'Crítico' }[c] || c;
}

async function move(id, delta) {
  const idx = state.statuses.findIndex(s => s.id === id);
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= state.statuses.length) return;
  const arr = [...state.statuses];
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  try {
    const res = await apiFetch('/api/admin/statuses/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: arr.map(s => s.id) }),
    });
    if (!res.ok) throw new Error();
    await loadStatuses();
  } catch {
    toast('Falha ao reordenar', 'error');
  }
}

function openModal(statusId) {
  state.editing = statusId ? state.statuses.find(s => s.id === statusId) : null;
  const s = state.editing;
  $('#statusModalTitle').textContent = s ? 'Editar status' : 'Novo status';
  $('#statusName').value = s ? s.name : '';
  $('#statusIcon').value = s ? s.icon : '';
  const initialColor = s ? s.color : 'neutral';
  if (isHex(initialColor)) {
    state.customColor = initialColor;
    $('#customSwatch').style.background = initialColor;
    $('#customColorInput').value = initialColor;
  }
  selectColor(initialColor);
  $('#statusModal').classList.add('open');
  setTimeout(() => $('#statusName').focus(), 80);
}

function closeModal() {
  $('#statusModal').classList.remove('open');
  state.editing = null;
}

function selectColor(c) {
  state.selectedColor = c;
  $$('#colorPicker button').forEach(b => {
    if (isHex(c)) {
      b.classList.toggle('active', b.dataset.color === 'custom');
    } else {
      b.classList.toggle('active', b.dataset.color === c);
    }
  });
}

async function saveStatus() {
  const name = $('#statusName').value.trim();
  const icon = $('#statusIcon').value.trim() || '•';
  const color = state.selectedColor;
  if (!name) return toast('Informe o nome', 'error');
  const payload = { name, icon, color };
  const btn = $('#saveStatus');
  btn.disabled = true;
  try {
    let res;
    if (state.editing) {
      res = await apiFetch(`/api/admin/statuses/${state.editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await apiFetch('/api/admin/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Falha');
    }
    toast(state.editing ? 'Status atualizado' : 'Status criado', 'success');
    closeModal();
    await loadStatuses();
  } catch (e) {
    toast(e.message || 'Falha ao salvar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteStatus(id) {
  const s = state.statuses.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Excluir o status "${s.name}"?`)) return;
  try {
    const res = await apiFetch(`/api/admin/statuses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Falha');
    }
    toast('Status excluído', 'info');
    await loadStatuses();
  } catch (e) {
    toast(e.message || 'Falha ao excluir', 'error');
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

// Bindings
$('#newStatusBtn').addEventListener('click', () => openModal());
$('#saveStatus').addEventListener('click', saveStatus);
$('#cancelStatus').addEventListener('click', closeModal);
$('#closeStatusModal').addEventListener('click', closeModal);
$('#statusModal').addEventListener('click', (e) => { if (e.target.id === 'statusModal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#statusModal').classList.contains('open')) closeModal(); });
$$('#colorPicker button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.color === 'custom') {
    $('#customColorInput').click();
  } else {
    selectColor(b.dataset.color);
  }
}));

$('#customColorInput').addEventListener('input', (e) => {
  const hex = e.target.value.toUpperCase();
  state.customColor = hex;
  $('#customSwatch').style.background = hex;
  selectColor(hex);
});
