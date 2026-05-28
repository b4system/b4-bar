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
    { path: '/',              label: 'Cardápio',      perm: null,           icon: '📖' },
    { path: '/dashboard',     label: 'Dashboard',     perm: 'dashboard',    icon: '📊' },
    { path: '/garcom',        label: 'Garçom',        perm: 'garcom',       icon: '📝' },
    { path: '/pedidos',       label: 'Pedidos',       perm: 'pedidos',      icon: '🧾' },
    { path: '/admin',         label: 'Produtos',      perm: 'produtos',     icon: '🍽️' },
    { path: '/funcionarios',  label: 'Funcionários',  perm: 'funcionarios', icon: '👥' },
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

  function getAllowedPages() {
    const user = getUser();
    return PAGES.filter(p => p.perm === null || (user && user.permissions && user.permissions.includes(p.perm)));
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('b4_theme', next);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = next === 'dark' ? '#0A0A0C' : '#EFEBE0';
    // Atualiza ícones nos botões
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.innerHTML = next === 'dark' ? '☀️' : '🌙';
      btn.title = next === 'dark' ? 'Modo claro' : 'Modo escuro';
    });
    document.querySelectorAll('[data-theme-label]').forEach(el => {
      el.textContent = next === 'dark' ? 'Modo claro' : 'Modo escuro';
    });
  }

  function buildNav() {
    const nav = document.getElementById('mainNav');
    if (!nav) return;

    const user = getUser();
    const current = window.location.pathname;
    const allowed = getAllowedPages();

    // ===== Nav desktop (inline) =====
    let links = allowed.map(p =>
      `<a href="${p.path}" class="nav-tab ${current === p.path ? 'active' : ''}">${p.label}</a>`
    ).join('');
    if (!user) {
      links += `<a href="/login" class="nav-tab ${current === '/login' ? 'active' : ''}">Entrar</a>`;
    }
    nav.innerHTML = links;

    // ===== Controles do header (avatar + tema + hamburger) =====
    const existingControls = document.getElementById('headerControls');
    if (existingControls) existingControls.remove();

    const controls = document.createElement('div');
    controls.id = 'headerControls';
    controls.className = 'header-controls';

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
    toggle.setAttribute('data-theme-toggle', '');
    toggle.title = isLight ? 'Modo escuro' : 'Modo claro';
    toggle.innerHTML = isLight ? '🌙' : '☀️';
    toggle.addEventListener('click', toggleTheme);
    controls.appendChild(toggle);

    // Hamburger (visível apenas no mobile via CSS)
    const hamb = document.createElement('button');
    hamb.className = 'nav-hamburger';
    hamb.id = 'navHamburger';
    hamb.setAttribute('aria-label', 'Abrir menu');
    hamb.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    `;
    hamb.addEventListener('click', openDrawer);
    controls.appendChild(hamb);

    nav.parentElement.appendChild(controls);

    buildDrawer();
  }

  function buildDrawer() {
    let drawer = document.getElementById('navDrawer');
    if (drawer) drawer.remove();

    const user = getUser();
    const current = window.location.pathname;
    const allowed = getAllowedPages();

    const items = allowed.map(p => `
      <a href="${p.path}" class="drawer-item ${current === p.path ? 'active' : ''}">
        <span class="drawer-item-icon">${p.icon}</span>
        <span class="drawer-item-label">${p.label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drawer-item-chev">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </a>
    `).join('');

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    drawer = document.createElement('div');
    drawer.id = 'navDrawer';
    drawer.className = 'nav-drawer';
    drawer.innerHTML = `
      <div class="nav-drawer-backdrop" data-close></div>
      <aside class="nav-drawer-panel" role="dialog" aria-label="Menu de navegação">
        <header class="nav-drawer-head">
          <div class="brand">
            <div class="brand-logo">B4</div>
            <div>
              <div class="brand-name">B4 Bar</div>
              <div class="brand-sub">Menu</div>
            </div>
          </div>
          <button class="drawer-close" data-close aria-label="Fechar menu">&times;</button>
        </header>

        ${user ? `
          <div class="nav-drawer-user">
            <div class="nav-drawer-avatar">${user.name.charAt(0).toUpperCase()}</div>
            <div>
              <div class="nav-drawer-user-name">${user.name}</div>
              <div class="nav-drawer-user-role">@${user.username}</div>
            </div>
          </div>
        ` : ''}

        <nav class="nav-drawer-list" aria-label="Páginas">
          ${items}
          ${!user ? `
            <a href="/login" class="drawer-item ${current === '/login' ? 'active' : ''}">
              <span class="drawer-item-icon">🔑</span>
              <span class="drawer-item-label">Entrar</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drawer-item-chev">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </a>
          ` : ''}
        </nav>

        <footer class="nav-drawer-foot">
          <button class="drawer-item" id="drawerThemeBtn">
            <span class="drawer-item-icon" data-theme-toggle>${isDark ? '☀️' : '🌙'}</span>
            <span class="drawer-item-label" data-theme-label>${isDark ? 'Modo claro' : 'Modo escuro'}</span>
          </button>
          ${user ? `
            <button class="drawer-item drawer-item-danger" id="drawerLogoutBtn">
              <span class="drawer-item-icon">🚪</span>
              <span class="drawer-item-label">Sair</span>
            </button>
          ` : ''}
        </footer>
      </aside>
    `;

    document.body.appendChild(drawer);

    drawer.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeDrawer));
    drawer.querySelectorAll('.drawer-item[href]').forEach(el => el.addEventListener('click', closeDrawer));

    const themeBtn = drawer.querySelector('#drawerThemeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const logoutBtn = drawer.querySelector('#drawerLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  function openDrawer() {
    const d = document.getElementById('navDrawer');
    if (!d) return;
    d.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    const d = document.getElementById('navDrawer');
    if (!d) return;
    d.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Fechar drawer com Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

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
