const express = require('express');
const multer = require('multer');
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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const genId = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const hashPw = (pw) => crypto.createHash('sha256').update(pw).digest('hex');
const genToken = () => crypto.randomBytes(32).toString('hex');

// Inicializa staff.json com admin padrão se não existir
if (!fs.existsSync(STAFF_FILE)) {
  writeJSON(STAFF_FILE, [
    {
      id: 'admin',
      name: 'Administrador',
      username: 'admin',
      password: hashPw('admin123'),
      role: 'admin',
      permissions: ['cardapio', 'garcom', 'pedidos', 'produtos', 'funcionarios'],
      active: true,
      createdAt: Date.now(),
    }
  ]);
}

// Sessões em memória (token → { staffId, createdAt })
const sessions = new Map();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Helpers de autenticação =====
function getSession(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const session = sessions.get(token);
  if (!session) return null;
  const staff = readJSON(STAFF_FILE).find(s => s.id === session.staffId && s.active);
  if (!staff) { sessions.delete(token); return null; }
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

// ===== API: AUTENTICAÇÃO =====
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  const staff = readJSON(STAFF_FILE);
  const user = staff.find(s => s.username === username && s.active);
  if (!user || user.password !== hashPw(password)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  const token = genToken();
  sessions.set(token, { staffId: user.id, createdAt: Date.now() });
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

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) sessions.delete(header.slice(7));
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

app.post('/api/admin/staff', requireAuth(['funcionarios']), (req, res) => {
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
    password: hashPw(password),
    role: role || 'funcionario',
    permissions: Array.isArray(permissions) ? permissions : ['cardapio'],
    active: true,
    createdAt: Date.now(),
  };
  staff.push(newUser);
  writeJSON(STAFF_FILE, staff);
  res.status(201).json({ id: newUser.id, name: newUser.name, username: newUser.username, role: newUser.role, permissions: newUser.permissions, active: newUser.active });
});

app.patch('/api/admin/staff/:id', requireAuth(['funcionarios']), (req, res) => {
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
  if (password) user.password = hashPw(password);
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
app.post('/api/admin/items', (req, res) => {
  const { categoryId, name, description, price, image } = req.body;
  if (!categoryId || !name || price == null) {
    return res.status(400).json({ error: 'categoryId, name e price são obrigatórios' });
  }
  const menu = readJSON(MENU_FILE);
  const cat = menu.categories.find(c => c.id === categoryId);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  const item = { id: genId('i'), name, description: description || '', price: parseFloat(price), image: image || '' };
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
  const { name, description, price, image, categoryId } = req.body;
  if (name !== undefined) found.name = name;
  if (description !== undefined) found.description = description;
  if (price !== undefined) found.price = parseFloat(price);
  if (image !== undefined) found.image = image;
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
  let removed = false, removedImage = '';
  for (const cat of menu.categories) {
    const idx = cat.items.findIndex(i => i.id === req.params.id);
    if (idx !== -1) { removedImage = cat.items[idx].image || ''; cat.items.splice(idx, 1); removed = true; break; }
  }
  if (!removed) return res.status(404).json({ error: 'Item não encontrado' });
  writeJSON(MENU_FILE, menu);
  if (removedImage && removedImage.startsWith('/uploads/')) fs.unlink(path.join(__dirname, 'public', removedImage), () => {});
  res.json({ ok: true });
});

// ===== API: PEDIDOS =====
app.get('/api/orders', (_req, res) => {
  const orders = readJSON(ORDERS_FILE);
  orders.sort((a, b) => b.createdAt - a.createdAt);
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { table, waiter, items, notes } = req.body;
  if (!table || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Mesa e itens são obrigatórios' });
  }
  const orders = readJSON(ORDERS_FILE);
  const total = items.reduce((sum, it) => sum + (it.price * it.qty), 0);
  const order = {
    id: genId(), number: orders.length + 1, table, waiter: waiter || 'Garçom',
    items, notes: notes || '', total, status: 'pendente', createdAt: Date.now()
  };
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json(order);
});

app.patch('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const orders = readJSON(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
  orders[idx].status = status;
  orders[idx].updatedAt = Date.now();
  writeJSON(ORDERS_FILE, orders);
  res.json(orders[idx]);
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
