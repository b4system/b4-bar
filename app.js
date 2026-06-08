const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const STAFF_FILE = path.join(DATA_DIR, 'staff.json');
const STATUSES_FILE = path.join(DATA_DIR, 'statuses.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const genId = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const BCRYPT_ROUNDS = 10;
const genToken = () => crypto.randomBytes(32).toString('hex');

// Inicializa statuses.json com workflow padrão (cancelado é implícito, sempre disponível)
if (!fs.existsSync(STATUSES_FILE)) {
  writeJSON(STATUSES_FILE, [
    { id: 'pendente', name: 'Pendente', icon: '⏱', color: 'warn', order: 1 },
    { id: 'preparando', name: 'Preparando', icon: '🍳', color: 'info', order: 2 },
    { id: 'pronto', name: 'Pronto', icon: '✓', color: 'success', order: 3 },
    { id: 'entregue', name: 'Entregue', icon: '📦', color: 'neutral', order: 4 },
  ]);
}

// Inicializa settings.json com defaults
if (!fs.existsSync(SETTINGS_FILE)) {
  writeJSON(SETTINGS_FILE, {
    enabledComandaTypes: ['mesa', 'nome', 'codigo'],
  });
}

// Inicializa staff.json com admin padrão se não existir
if (!fs.existsSync(STAFF_FILE)) {
  writeJSON(STAFF_FILE, [
    {
      id: 'admin',
      name: 'Administrador',
      username: 'admin',
      password: bcrypt.hashSync('admin123', BCRYPT_ROUNDS),
      role: 'admin',
      permissions: ['cardapio', 'garcom', 'pedidos', 'produtos', 'funcionarios', 'dashboard', 'configuracoes'],
      active: true,
      createdAt: Date.now(),
    }
  ]);
} else {
  // Migração: garante permissões 'dashboard' e 'configuracoes' no admin
  const staff = readJSON(STAFF_FILE);
  let changed = false;
  staff.forEach(s => {
    if (s.id === 'admin') {
      ['dashboard', 'configuracoes'].forEach(p => {
        if (!s.permissions.includes(p)) { s.permissions.push(p); changed = true; }
      });
    }
  });
  if (changed) writeJSON(STAFF_FILE, staff);
}

// ===== Sessões: tokens assinados (sobrevivem a restarts do servidor) =====
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
if (!fs.existsSync(SECRET_FILE)) {
  fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'));
}
const SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function signToken(staffId) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `${staffId}.${expiry}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [staffId, expiryStr, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(`${staffId}.${expiryStr}`).digest('hex');
  if (sig.length !== expectedSig.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) return null;
  } catch { return null; }
  const expiry = parseInt(expiryStr);
  if (!expiry || Date.now() > expiry) return null;
  return staffId;
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Helpers de autenticação =====
function getSession(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const staffId = verifyToken(token);
  if (!staffId) return null;
  const staff = readJSON(STAFF_FILE).find(s => s.id === staffId && s.active);
  if (!staff) return null;
  return staff;
}

function requireAuth(permissions = []) {
  return (req, res, next) => {
    const staff = getSession(req);
    if (!staff) return res.status(401).json({ error: 'Não autenticado' });
    if (permissions.length > 0 && !permissions.some(p => staff.permissions.includes(p))) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    req.staff = staff;
    next();
  };
}

// ===== Multer (upload de imagens) =====
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Formato de imagem inválido'));
  },
});

// ===== ROTAS DE PÁGINAS =====
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/garcom', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'garcom.html')));
app.get('/pedidos', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'pedidos.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/funcionarios', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'funcionarios.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/configuracoes', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'configuracoes.html')));
// Área Interna entra na primeira aba disponível para o usuário (decidido no client)
app.get('/area-interna', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'area-interna.html')));

// ===== API: AUTENTICAÇÃO =====
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  const staff = readJSON(STAFF_FILE);
  const user = staff.find(s => s.username === username && s.active);
  if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions: user.permissions },
  });
});

app.get('/api/auth/me', (req, res) => {
  const staff = getSession(req);
  if (!staff) return res.status(401).json({ error: 'Não autenticado' });
  res.json({ id: staff.id, name: staff.name, username: staff.username, role: staff.role, permissions: staff.permissions });
});

app.post('/api/auth/logout', (_req, res) => {
  // Token é stateless — cliente apaga localmente
  res.json({ ok: true });
});

// ===== API: FUNCIONÁRIOS (CRUD) =====
app.get('/api/admin/staff', requireAuth(['funcionarios']), (_req, res) => {
  const staff = readJSON(STAFF_FILE).map(s => ({
    id: s.id, name: s.name, username: s.username, role: s.role,
    permissions: s.permissions, active: s.active, createdAt: s.createdAt,
  }));
  res.json(staff);
});

app.post('/api/admin/staff', requireAuth(['funcionarios']), async (req, res) => {
  const { name, username, password, role, permissions } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
  }
  const staff = readJSON(STAFF_FILE);
  if (staff.find(s => s.username === username)) {
    return res.status(409).json({ error: 'Nome de usuário já existe' });
  }
  const newUser = {
    id: genId('u'),
    name,
    username,
    password: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: role || 'funcionario',
    permissions: Array.isArray(permissions) ? permissions : ['cardapio'],
    active: true,
    createdAt: Date.now(),
  };
  staff.push(newUser);
  writeJSON(STAFF_FILE, staff);
  res.status(201).json({ id: newUser.id, name: newUser.name, username: newUser.username, role: newUser.role, permissions: newUser.permissions, active: newUser.active });
});

app.patch('/api/admin/staff/:id', requireAuth(['funcionarios']), async (req, res) => {
  const staff = readJSON(STAFF_FILE);
  const user = staff.find(s => s.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Funcionário não encontrado' });

  const { name, username, password, role, permissions, active } = req.body;
  if (name !== undefined) user.name = name;
  if (username !== undefined) {
    if (staff.find(s => s.username === username && s.id !== user.id)) {
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    }
    user.username = username;
  }
  if (password) user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (role !== undefined) user.role = role;
  if (Array.isArray(permissions)) user.permissions = permissions;
  if (active !== undefined) user.active = active;

  writeJSON(STAFF_FILE, staff);
  res.json({ id: user.id, name: user.name, username: user.username, role: user.role, permissions: user.permissions, active: user.active });
});

app.delete('/api/admin/staff/:id', requireAuth(['funcionarios']), (req, res) => {
  const staff = readJSON(STAFF_FILE);
  if (req.params.id === 'admin') return res.status(403).json({ error: 'Não é possível excluir o admin padrão' });
  const filtered = staff.filter(s => s.id !== req.params.id);
  if (filtered.length === staff.length) return res.status(404).json({ error: 'Funcionário não encontrado' });
  writeJSON(STAFF_FILE, filtered);
  res.json({ ok: true });
});

// ===== API: STATUSES (workflow dos pedidos) =====
function sanitizeColor(c) {
  if (!c) return 'neutral';
  const presets = ['warn', 'info', 'success', 'neutral', 'danger'];
  if (presets.includes(c)) return c;
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c.toUpperCase();
  return 'neutral';
}

function getStatuses() {
  try {
    const list = readJSON(STATUSES_FILE);
    if (!Array.isArray(list)) return [];
    // Migra status legados: active = true por padrão
    return list.map(s => ({ ...s, active: s.active !== false }))
      .sort((a, b) => a.order - b.order);
  } catch { return []; }
}

function isValidStatus(id) {
  if (id === 'cancelado') return true; // sempre disponível
  return getStatuses().some(s => s.id === id);
}

// Público: pedidos.js usa para renderizar labels
app.get('/api/statuses', (_req, res) => res.json(getStatuses()));

app.post('/api/admin/statuses', requireAuth(['configuracoes']), (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const statuses = getStatuses();
  const id = (name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || genId('s');
  if (id === 'cancelado' || statuses.some(s => s.id === id)) {
    return res.status(409).json({ error: 'Já existe um status com esse identificador' });
  }
  const order = (statuses[statuses.length - 1]?.order || 0) + 1;
  const newStatus = { id, name, icon: icon || '•', color: sanitizeColor(color), order, active: true };
  statuses.push(newStatus);
  writeJSON(STATUSES_FILE, statuses);
  res.status(201).json(newStatus);
});

app.patch('/api/admin/statuses/:id', requireAuth(['configuracoes']), (req, res) => {
  const statuses = getStatuses();
  const s = statuses.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Status não encontrado' });
  const { name, icon, color, active } = req.body;
  if (name !== undefined) s.name = name;
  if (icon !== undefined) s.icon = icon;
  if (color !== undefined) s.color = sanitizeColor(color);
  if (active !== undefined) s.active = !!active;
  writeJSON(STATUSES_FILE, statuses);
  res.json(s);
});

app.delete('/api/admin/statuses/:id', requireAuth(['configuracoes']), (req, res) => {
  const statuses = getStatuses();
  const idx = statuses.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Status não encontrado' });
  // Bloqueia exclusão se houver pedidos usando esse status
  const orders = readJSON(ORDERS_FILE);
  if (orders.some(o => o.status === req.params.id)) {
    return res.status(409).json({ error: 'Existem pedidos usando este status. Mude-os antes de excluir.' });
  }
  if (statuses.length <= 1) {
    return res.status(409).json({ error: 'É necessário manter pelo menos um status.' });
  }
  statuses.splice(idx, 1);
  writeJSON(STATUSES_FILE, statuses);
  res.json({ ok: true });
});

app.put('/api/admin/statuses/reorder', requireAuth(['configuracoes']), (req, res) => {
  const { order } = req.body; // array de ids na nova ordem
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order precisa ser uma lista' });
  const statuses = getStatuses();
  order.forEach((id, idx) => {
    const s = statuses.find(x => x.id === id);
    if (s) s.order = idx + 1;
  });
  writeJSON(STATUSES_FILE, statuses);
  res.json(getStatuses());
});

// ===== API: SETTINGS (globais) =====
function getSettings() {
  try {
    const s = readJSON(SETTINGS_FILE);
    return {
      enabledComandaTypes: Array.isArray(s.enabledComandaTypes) && s.enabledComandaTypes.length > 0
        ? s.enabledComandaTypes.filter(t => ['mesa', 'nome', 'codigo'].includes(t))
        : ['mesa'],
    };
  } catch { return { enabledComandaTypes: ['mesa'] }; }
}

app.get('/api/settings', (_req, res) => res.json(getSettings()));

app.patch('/api/admin/settings', requireAuth(['configuracoes']), (req, res) => {
  const cur = getSettings();
  const { enabledComandaTypes } = req.body;
  if (Array.isArray(enabledComandaTypes)) {
    const cleaned = enabledComandaTypes.filter(t => ['mesa', 'nome', 'codigo'].includes(t));
    if (cleaned.length === 0) return res.status(400).json({ error: 'Pelo menos um tipo de comanda deve estar ativo' });
    cur.enabledComandaTypes = cleaned;
  }
  writeJSON(SETTINGS_FILE, cur);
  res.json(cur);
});

// ===== API: CARDÁPIO =====
app.get('/api/menu', (_req, res) => {
  try { res.json(readJSON(MENU_FILE)); }
  catch { res.status(500).json({ error: 'Falha ao ler cardápio' }); }
});

// ===== API: UPLOAD DE IMAGEM =====
app.post('/api/admin/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// ===== API: CATEGORIAS (CRUD) =====
app.post('/api/admin/categories', (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const menu = readJSON(MENU_FILE);
  const cat = { id: genId('c'), name, icon: icon || '🍽️', items: [] };
  menu.categories.push(cat);
  writeJSON(MENU_FILE, menu);
  res.status(201).json(cat);
});

app.patch('/api/admin/categories/:id', (req, res) => {
  const menu = readJSON(MENU_FILE);
  const cat = menu.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  if (req.body.name) cat.name = req.body.name;
  if (req.body.icon) cat.icon = req.body.icon;
  writeJSON(MENU_FILE, menu);
  res.json(cat);
});

app.delete('/api/admin/categories/:id', (req, res) => {
  const menu = readJSON(MENU_FILE);
  const idx = menu.categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Categoria não encontrada' });
  menu.categories.splice(idx, 1);
  writeJSON(MENU_FILE, menu);
  res.json({ ok: true });
});

// ===== API: ITENS (CRUD) =====
function sanitizeAddons(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(a => a && a.name && a.price != null)
    .map(a => ({
      id: a.id || genId('a'),
      name: String(a.name).trim(),
      price: parseFloat(a.price) || 0,
    }));
}

function sanitizeImages(images, fallbackImage) {
  let arr = Array.isArray(images) ? images.filter(Boolean) : [];
  if (arr.length === 0 && fallbackImage) arr = [fallbackImage];
  return arr.slice(0, 5);
}

app.post('/api/admin/items', (req, res) => {
  const { categoryId, name, description, price, image, images, observable, addons, prepTime } = req.body;
  if (!categoryId || !name || price == null) {
    return res.status(400).json({ error: 'categoryId, name e price são obrigatórios' });
  }
  const menu = readJSON(MENU_FILE);
  const cat = menu.categories.find(c => c.id === categoryId);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  const imgs = sanitizeImages(images, image);
  const item = {
    id: genId('i'),
    name,
    description: description || '',
    price: parseFloat(price),
    image: imgs[0] || '', // compat com clients antigos
    images: imgs,
    observable: !!observable,
    addons: sanitizeAddons(addons),
    prepTime: Math.max(0, parseInt(prepTime) || 0),
  };
  cat.items.push(item);
  writeJSON(MENU_FILE, menu);
  res.status(201).json({ ...item, categoryId });
});

app.patch('/api/admin/items/:id', (req, res) => {
  const menu = readJSON(MENU_FILE);
  let found = null, foundCat = null;
  for (const cat of menu.categories) {
    const it = cat.items.find(i => i.id === req.params.id);
    if (it) { found = it; foundCat = cat; break; }
  }
  if (!found) return res.status(404).json({ error: 'Item não encontrado' });
  const { name, description, price, image, images, categoryId, observable, addons, prepTime } = req.body;
  if (name !== undefined) found.name = name;
  if (description !== undefined) found.description = description;
  if (price !== undefined) found.price = parseFloat(price);
  if (images !== undefined) {
    found.images = sanitizeImages(images, image);
    found.image = found.images[0] || '';
  } else if (image !== undefined) {
    found.image = image;
    found.images = image ? [image] : [];
  }
  if (observable !== undefined) found.observable = !!observable;
  if (addons !== undefined) found.addons = sanitizeAddons(addons);
  if (prepTime !== undefined) found.prepTime = Math.max(0, parseInt(prepTime) || 0);
  if (categoryId && categoryId !== foundCat.id) {
    const newCat = menu.categories.find(c => c.id === categoryId);
    if (!newCat) return res.status(404).json({ error: 'Categoria de destino inválida' });
    foundCat.items = foundCat.items.filter(i => i.id !== found.id);
    newCat.items.push(found);
  }
  writeJSON(MENU_FILE, menu);
  res.json(found);
});

app.delete('/api/admin/items/:id', (req, res) => {
  const menu = readJSON(MENU_FILE);
  let removed = false, removedImages = [];
  for (const cat of menu.categories) {
    const idx = cat.items.findIndex(i => i.id === req.params.id);
    if (idx !== -1) {
      const it = cat.items[idx];
      removedImages = Array.isArray(it.images) && it.images.length > 0 ? it.images : (it.image ? [it.image] : []);
      cat.items.splice(idx, 1);
      removed = true;
      break;
    }
  }
  if (!removed) return res.status(404).json({ error: 'Item não encontrado' });
  writeJSON(MENU_FILE, menu);
  removedImages.forEach(url => {
    if (url && url.startsWith('/uploads/')) fs.unlink(path.join(__dirname, 'public', url), () => {});
  });
  res.json({ ok: true });
});

// ===== API: DASHBOARD =====
app.get('/api/dashboard/summary', requireAuth(['dashboard']), (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const menu = readJSON(MENU_FILE);

  // Período: hoje | 7d | 30d | custom (from/to em ms)
  const range = req.query.range || 'today';
  const now = new Date();
  let dateFrom, dateTo;

  if (req.query.from && req.query.to) {
    dateFrom = parseInt(req.query.from);
    dateTo = parseInt(req.query.to);
  } else if (range === '7d') {
    dateTo = now.getTime();
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  } else if (range === '30d') {
    dateTo = now.getTime();
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime();
  } else {
    // today
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  }

  const filtered = orders.filter(o => o.createdAt >= dateFrom && o.createdAt <= dateTo);
  const validOrders = filtered.filter(o => o.status !== 'cancelado');

  const revenue = validOrders.reduce((s, o) => s + o.total, 0);
  const orderCount = validOrders.length;
  const itemCount = validOrders.reduce((s, o) => s + o.items.reduce((sum, i) => sum + i.qty, 0), 0);
  const avgTicket = orderCount > 0 ? revenue / orderCount : 0;

  // Vendas por hora (apenas para "today")
  const hourly = Array.from({ length: 24 }, (_, i) => ({ label: i.toString().padStart(2, '0') + 'h', revenue: 0, count: 0 }));
  // Vendas por dia (para 7d / 30d)
  const daysSpan = Math.ceil((dateTo - dateFrom) / (24 * 3600 * 1000));
  const daily = [];
  for (let i = 0; i < daysSpan; i++) {
    const d = new Date(dateFrom);
    d.setDate(d.getDate() + i);
    daily.push({ label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), revenue: 0, count: 0, ts: d.getTime() });
  }

  validOrders.forEach(o => {
    const d = new Date(o.createdAt);
    if (range === 'today') {
      hourly[d.getHours()].revenue += o.total;
      hourly[d.getHours()].count += 1;
    } else {
      const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const bucket = daily.find(b => b.ts === dayKey);
      if (bucket) { bucket.revenue += o.total; bucket.count += 1; }
    }
  });

  // Top items
  const itemMap = {};
  validOrders.forEach(o => {
    o.items.forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { name: i.name, qty: 0, revenue: 0 };
      itemMap[i.name].qty += i.qty;
      itemMap[i.name].revenue += i.price * i.qty;
    });
  });
  const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Por categoria
  const categoryMap = {};
  validOrders.forEach(o => {
    o.items.forEach(i => {
      let catName = 'Outros';
      for (const cat of menu.categories) {
        if (cat.items.find(mi => mi.id === i.id)) { catName = cat.name; break; }
      }
      if (!categoryMap[catName]) categoryMap[catName] = { name: catName, revenue: 0, qty: 0 };
      categoryMap[catName].revenue += i.price * i.qty;
      categoryMap[catName].qty += i.qty;
    });
  });
  const byCategory = Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue);

  // Status counts (todos os pedidos do período, incluindo cancelados)
  const statusCounts = { pendente: 0, preparando: 0, pronto: 0, entregue: 0, cancelado: 0 };
  filtered.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

  // Top garçons
  const waiterMap = {};
  validOrders.forEach(o => {
    const w = o.waiter || 'Sem nome';
    if (!waiterMap[w]) waiterMap[w] = { name: w, orders: 0, revenue: 0 };
    waiterMap[w].orders += 1;
    waiterMap[w].revenue += o.total;
  });
  const topWaiters = Object.values(waiterMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // ===== Pedidos atrasados (a partir da criação) =====
  // Considera pedidos abertos (não entregues/cancelados) cujo prazo já passou
  const nowMs = Date.now();
  const lateOrders = [];
  const closedStatuses = ['entregue', 'cancelado'];
  orders.forEach(o => {
    if (closedStatuses.includes(o.status)) return;
    if (!Array.isArray(o.items) || o.items.length === 0) return;
    const startTs = o.createdAt;
    const lateItems = o.items.filter(i =>
      !i.ready && i.prepTime > 0 && (startTs + i.prepTime * 60000) < nowMs
    );
    if (lateItems.length === 0) return;
    const maxLateMs = Math.max(...lateItems.map(i =>
      nowMs - (startTs + i.prepTime * 60000)
    ));
    lateOrders.push({
      id: o.id, number: o.number, table: o.table,
      comandaType: o.comandaType || 'mesa',
      waiter: o.waiter,
      createdAt: o.createdAt, status: o.status,
      lateMinutes: Math.floor(maxLateMs / 60000),
      lateItems: lateItems.map(i => ({ name: i.name, qty: i.qty, prepTime: i.prepTime })),
    });
  });
  lateOrders.sort((a, b) => b.lateMinutes - a.lateMinutes);

  res.json({
    range,
    period: { from: dateFrom, to: dateTo },
    revenue, orderCount, itemCount, avgTicket,
    hourly: range === 'today' ? hourly : null,
    daily: range !== 'today' ? daily : null,
    topItems, byCategory, statusCounts, topWaiters,
    lateOrders,
  });
});

// ===== API: PEDIDOS =====
app.get('/api/orders', (_req, res) => {
  const orders = readJSON(ORDERS_FILE);
  orders.sort((a, b) => b.createdAt - a.createdAt);
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { table, comandaType, waiter, items, notes } = req.body;
  if (!table || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Identificação da comanda e itens são obrigatórios' });
  }
  const enabled = getSettings().enabledComandaTypes;
  const tipo = enabled.includes(comandaType) ? comandaType : (enabled[0] || 'mesa');
  const orders = readJSON(ORDERS_FILE);
  const total = items.reduce((sum, it) => sum + (it.price * it.qty), 0);

  // Garante prepTime e estado de cada item; busca no menu se não vier no payload
  const menu = readJSON(MENU_FILE);
  const findPrepTime = (id) => {
    for (const cat of menu.categories) {
      const it = cat.items.find(i => i.id === id);
      if (it) return parseInt(it.prepTime) || 0;
    }
    return 0;
  };
  const enrichedItems = items.map(it => ({
    ...it,
    prepTime: it.prepTime != null ? parseInt(it.prepTime) || 0 : findPrepTime(it.id),
    ready: false,
    readyAt: null,
  }));

  const order = {
    id: genId(), number: orders.length + 1,
    table, comandaType: tipo,
    waiter: waiter || 'Garçom',
    items: enrichedItems, notes: notes || '', total,
    status: 'pendente', createdAt: Date.now(), preparingAt: null,
  };
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json(order);
});

app.patch('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  if (!isValidStatus(status)) return res.status(400).json({ error: 'Status inválido' });
  const orders = readJSON(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
  const now = Date.now();
  orders[idx].status = status;
  orders[idx].updatedAt = now;
  // Registra preparingAt na primeira vez que entra em "preparando" (mantido para histórico)
  if (status === 'preparando' && !orders[idx].preparingAt) {
    orders[idx].preparingAt = now;
  }
  // Quando vira "pronto" ou "entregue", marca todos os itens como prontos
  if ((status === 'pronto' || status === 'entregue') && Array.isArray(orders[idx].items)) {
    orders[idx].items.forEach(it => {
      if (!it.ready) {
        it.ready = true;
        it.readyAt = now;
      }
    });
  }
  writeJSON(ORDERS_FILE, orders);
  res.json(orders[idx]);
});

// Marca/desmarca item individual como pronto
app.patch('/api/orders/:id/items/:idx', (req, res) => {
  const { ready } = req.body;
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  const itemIdx = parseInt(req.params.idx);
  if (!order.items[itemIdx]) return res.status(404).json({ error: 'Item não encontrado' });
  order.items[itemIdx].ready = !!ready;
  order.items[itemIdx].readyAt = ready ? Date.now() : null;
  order.updatedAt = Date.now();
  writeJSON(ORDERS_FILE, orders);
  res.json(order);
});

app.delete('/api/orders/:id', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const filtered = orders.filter(o => o.id !== req.params.id);
  if (filtered.length === orders.length) return res.status(404).json({ error: 'Pedido não encontrado' });
  writeJSON(ORDERS_FILE, filtered);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  B4 Bar rodando em http://localhost:${PORT}`);
  console.log(`  • Cardápio:       http://localhost:${PORT}/`);
  console.log(`  • Login:          http://localhost:${PORT}/login`);
  console.log(`  • Garçom:         http://localhost:${PORT}/garcom`);
  console.log(`  • Pedidos:        http://localhost:${PORT}/pedidos`);
  console.log(`  • Produtos:       http://localhost:${PORT}/admin`);
  console.log(`  • Funcionários:   http://localhost:${PORT}/funcionarios\n`);
  console.log(`  Admin padrão: admin / admin123\n`);
});
