// ===== B4 Bar — Login =====
const $ = (sel) => document.querySelector(sel);

(async () => {
  const user = await Auth.validate();
  Auth.buildNav();
  if (user) {
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get('redirect') || '/';
    return;
  }
})();

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#username').value.trim();
  const password = $('#password').value;
  const errEl = $('#loginError');
  const btn = $('#loginBtn');

  if (!username || !password) {
    errEl.textContent = 'Preencha usuário e senha';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Falha ao entrar';
      errEl.style.display = 'block';
      return;
    }
    Auth.setSession(data.token, data.user);
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get('redirect') || '/';
  } catch {
    errEl.textContent = 'Erro de conexão. Tente novamente.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});
