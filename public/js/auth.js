// ===== B4 Bar — Auth + Navegação Dinâmica =====
const Auth = (() => {
  const TOKEN_KEY = 'b4_token';
  const USER_KEY = 'b4_user';

  const PAGES = [
    { path: '/',              label: 'Cardápio',      perm: null },
    { path: '/garcom',        label: 'Garçom',        perm: 'garcom' },
    { path: '/pedidos',       label: 'Pedidos',       perm: 'pedidos' },
    { path: '/admin',         label: 'Produtos',      perm: 'produtos' },
    { path: '/funcionarios',  label: 'Funcionários',  perm: 'funcionarios' },
  ];

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function hasPerm(perm) {
    const user = getUser();
    if (!user) return false;
    return user.permissions && user.permissions.includes(perm);
  }

  function authHeaders() {
    const token = getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function validate() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) { clearSession(); return null; }
      const user = await res.json();
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch { clearSession(); return null; }
  }

  async function logout() {
    const token = getToken();
    if (token) {
      fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }).catch(() => {});
    }
    clearSession();
    window.location.href = '/';
  }

  function buildNav() {
    const nav = document.getElementById('mainNav');
    if (!nav) return;

    const user = getUser();
    const current = window.location.pathname;

    let links = '';

    PAGES.forEach(page => {
      if (page.perm === null) {
        links += `<a href="${page.path}" class="nav-tab ${current === page.path ? 'active' : ''}">${page.label}</a>`;
      } else if (user && user.permissions && user.permissions.includes(page.perm)) {
        links += `<a href="${page.path}" class="nav-tab ${current === page.path ? 'active' : ''}">${page.label}</a>`;
      }
    });

    if (user) {
      links += `<button class="nav-tab nav-user" id="navLogout" title="Sair da conta">
        <span class="nav-user-avatar">${user.name.charAt(0).toUpperCase()}</span>
        <span class="nav-user-name">${user.name.split(' ')[0]}</span>
      </button>`;
    } else {
      links += `<a href="/login" class="nav-tab ${current === '/login' ? 'active' : ''}">Entrar</a>`;
    }

    nav.innerHTML = links;

    const logoutBtn = document.getElementById('navLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  async function guard(requiredPerm) {
    const user = await validate();
    buildNav();
    if (!requiredPerm) return user;
    if (!user || !user.permissions.includes(requiredPerm)) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }
    return user;
  }

  async function init(requiredPerm) {
    return guard(requiredPerm);
  }

  return { getToken, getUser, setSession, clearSession, hasPerm, authHeaders, validate, logout, buildNav, init };
})();
