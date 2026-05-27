// ===== B4 Bar — Auth + Navegação Dinâmica =====

// Aplica o tema salvo antes de qualquer render (evita flash)
(function() {
  const saved = localStorage.getItem('b4_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

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

    if (!user) {
      links += `<a href="/login" class="nav-tab ${current === '/login' ? 'active' : ''}">Entrar</a>`;
    }

    nav.innerHTML = links;

    // Remove controles anteriores
    const existingControls = document.getElementById('headerControls');
    if (existingControls) existingControls.remove();

    const controls = document.createElement('div');
    controls.id = 'headerControls';
    controls.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

    if (user) {
      const btn = document.createElement('button');
      btn.className = 'nav-user';
      btn.id = 'navLogout';
      btn.title = 'Sair da conta';
      btn.innerHTML = `
        <span class="nav-user-avatar">${user.name.charAt(0).toUpperCase()}</span>
        <span class="nav-user-name">${user.name.split(' ')[0]}</span>
      `;
      btn.addEventListener('click', logout);
      controls.appendChild(btn);
    }

    const isLight = document.documentElement.getAttribute('data-theme') !== 'dark';
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.id = 'themeToggle';
    toggle.title = isLight ? 'Modo escuro' : 'Modo claro';
    toggle.innerHTML = isLight ? '🌙' : '☀️';
    toggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('b4_theme', next);
      toggle.innerHTML = next === 'dark' ? '☀️' : '🌙';
      toggle.title = next === 'dark' ? 'Modo claro' : 'Modo escuro';
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.content = next === 'dark' ? '#0A0A0C' : '#F6F3EE';
    });
    controls.appendChild(toggle);

    nav.parentElement.appendChild(controls);
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
