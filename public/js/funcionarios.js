// ===== B4 Bar — Gestão de Funcionários =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const ROLE_LABELS = {
  admin: 'Administrador',
  gerente: 'Gerente',
  garcom: 'Garçom',
  cozinha: 'Cozinha',
  funcionario: 'Funcionário',
};

const PERM_LABELS = {
  cardapio: 'Cardápio',
  dashboard: 'Dashboard',
  garcom: 'Garçom',
  pedidos: 'Pedidos',
  produtos: 'Produtos',
  funcionarios: 'Funcionários',
  configuracoes: 'Configurações',
  fechamento: 'Fechamento',
};

const state = {
  staff: [],
  search: '',
  editing: null,
};

(async () => {
  const user = await Auth.init('funcionarios');
  if (!user) return;
  $('#pageContent').style.display = '';
  loadStaff();
})();

async function apiFetch(url, opts = {}) {
  const headers = { ...Auth.authHeaders(), ...(opts.headers || {}) };
  return fetch(url, { ...opts, headers });
}

async function loadStaff() {
  const res = await apiFetch('/api/admin/staff');
  if (!res.ok) return;
  state.staff = await res.json();
  renderList();
}

function renderList() {
  const wrap = $('#staffList');
  const term = state.search.trim().toLowerCase();
  const list = state.staff.filter(s =>
    !term || s.name.toLowerCase().includes(term) || s.username.toLowerCase().includes(term)
  );

  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">${term ? 'Nenhum resultado' : 'Nenhum funcionário'}</div>
        <div class="empty-state-text">${term ? 'Tente outra busca.' : 'Cadastre o primeiro funcionário.'}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = list.map(s => `
    <div class="staff-card ${!s.active ? 'inactive' : ''}" data-id="${s.id}">
      <div class="staff-avatar">${s.name.charAt(0).toUpperCase()}</div>
      <div class="staff-info">
        <div class="staff-name">${s.name} ${!s.active ? '<span class="staff-inactive-badge">Inativo</span>' : ''}</div>
        <div class="staff-meta">@${s.username} · ${ROLE_LABELS[s.role] || s.role}</div>
        <div class="staff-perms">
          ${s.permissions.map(p => `<span class="perm-badge">${PERM_LABELS[p] || p}</span>`).join('')}
        </div>
      </div>
      <div class="staff-actions">
        <button class="icon-btn" data-action="edit" data-id="${s.id}" title="Editar">✎</button>
        ${s.id !== 'admin' ? `
          <button class="icon-btn ${s.active ? 'danger' : ''}" data-action="toggle" data-id="${s.id}" title="${s.active ? 'Desativar' : 'Ativar'}">
            ${s.active ? '⏸' : '▶'}
          </button>
          <button class="icon-btn danger" data-action="delete" data-id="${s.id}" title="Excluir">🗑</button>
        ` : ''}
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'edit') openModal(id);
      else if (action === 'toggle') toggleActive(id);
      else if (action === 'delete') deleteStaff(id);
    });
  });
}

// ====== Modal ======
function openModal(staffId) {
  state.editing = staffId ? state.staff.find(s => s.id === staffId) : null;
  const m = state.editing;

  $('#staffModalTitle').textContent = m ? 'Editar funcionário' : 'Novo funcionário';
  $('#staffName').value = m ? m.name : '';
  $('#staffUsername').value = m ? m.username : '';
  $('#staffRole').value = m ? m.role : 'garcom';
  $('#staffPassword').value = '';
  $('#pwHint').textContent = m ? '(deixe vazio para manter)' : '';
  $('#saveStaff').textContent = m ? 'Salvar alterações' : 'Cadastrar';

  $$('#permGrid input[type="checkbox"]:not(:disabled)').forEach(cb => {
    cb.checked = m ? m.permissions.includes(cb.value) : false;
  });

  $('#staffModal').classList.add('open');
  setTimeout(() => $('#staffName').focus(), 80);
}

function closeModal() {
  $('#staffModal').classList.remove('open');
  state.editing = null;
}

function getSelectedPerms() {
  const perms = ['cardapio'];
  $$('#permGrid input[type="checkbox"]:not(:disabled)').forEach(cb => {
    if (cb.checked) perms.push(cb.value);
  });
  return perms;
}

async function saveStaff() {
  const name = $('#staffName').value.trim();
  const username = $('#staffUsername').value.trim();
  const password = $('#staffPassword').value;
  const role = $('#staffRole').value;
  const permissions = getSelectedPerms();

  if (!name) return toast('Informe o nome', 'error');
  if (!username) return toast('Informe o usuário', 'error');
  if (!state.editing && (!password || password.length < 4)) return toast('Senha deve ter no mínimo 4 caracteres', 'error');
  if (state.editing && password && password.length < 4) return toast('Senha deve ter no mínimo 4 caracteres', 'error');

  const payload = { name, username, role, permissions };
  if (password) payload.password = password;

  const btn = $('#saveStaff');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Salvando...';

  try {
    let res;
    if (state.editing) {
      res = await apiFetch(`/api/admin/staff/${state.editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await apiFetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha');
    toast(state.editing ? 'Funcionário atualizado' : 'Funcionário cadastrado', 'success');
    closeModal();
    await loadStaff();
  } catch (e) {
    toast(e.message || 'Falha ao salvar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function toggleActive(id) {
  const s = state.staff.find(x => x.id === id);
  if (!s) return;
  try {
    const res = await apiFetch(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !s.active }),
    });
    if (!res.ok) throw new Error();
    toast(s.active ? 'Funcionário desativado' : 'Funcionário ativado', 'info');
    await loadStaff();
  } catch {
    toast('Falha ao atualizar', 'error');
  }
}

async function deleteStaff(id) {
  const s = state.staff.find(x => x.id === id);
  if (!s || !confirm(`Excluir "${s.name}" definitivamente?`)) return;
  try {
    const res = await apiFetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    toast('Funcionário excluído', 'info');
    await loadStaff();
  } catch (e) {
    toast(e.message || 'Falha ao excluir', 'error');
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
  setTimeout(() => { el.style.animation = 'toast-out 0.3s ease forwards'; setTimeout(() => el.remove(), 300); }, 2500);
}

// ====== Bindings ======
let searchTimer;
$('#staffSearch').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value; renderList(); }, 150);
});

$('#newStaffBtn').addEventListener('click', () => openModal());
$('#saveStaff').addEventListener('click', saveStaff);
$('#cancelStaff').addEventListener('click', closeModal);
$('#closeStaffModal').addEventListener('click', closeModal);
$('#staffModal').addEventListener('click', (e) => { if (e.target.id === 'staffModal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#staffModal').classList.contains('open')) closeModal(); });
