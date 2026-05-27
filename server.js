const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const genId = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Formato de imagem inválido'));
  },
});

// ===== ROTAS DE PÁGINAS =====
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/garcom', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'garcom.html')));
app.get('/pedidos', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'pedidos.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ===== API: CARDÁPIO =====
app.get('/api/menu', (_req, res) => {
  try {
    res.json(readJSON(MENU_FILE));
  } catch (err) {
    res.status(500).json({ error: 'Falha ao ler cardápio' });
  }
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
  const item = {
    id: genId('i'),
    name,
    description: description || '',
    price: parseFloat(price),
    image: image || '',
  };
  cat.items.push(item);
  writeJSON(MENU_FILE, menu);
  res.status(201).json({ ...item, categoryId });
});

app.patch('/api/admin/items/:id', (req, res) => {
  const menu = readJSON(MENU_FILE);
  let found = null;
  let foundCat = null;
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

  // Mover para outra categoria
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
  let removed = false;
  let removedImage = '';
  for (const cat of menu.categories) {
    const idx = cat.items.findIndex(i => i.id === req.params.id);
    if (idx !== -1) {
      removedImage = cat.items[idx].image || '';
      cat.items.splice(idx, 1);
      removed = true;
      break;
    }
  }
  if (!removed) return res.status(404).json({ error: 'Item não encontrado' });
  writeJSON(MENU_FILE, menu);

  // Remove arquivo de imagem se for um upload local
  if (removedImage && removedImage.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', removedImage);
    fs.unlink(filePath, () => {});
  }

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
    id: genId(),
    number: orders.length + 1,
    table,
    waiter: waiter || 'Garçom',
    items,
    notes: notes || '',
    total,
    status: 'pendente',
    createdAt: Date.now()
  };
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json(order);
});

app.patch('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
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
  if (filtered.length === orders.length) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  writeJSON(ORDERS_FILE, filtered);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  B4 Bar rodando em http://localhost:${PORT}`);
  console.log(`  • Cardápio:    http://localhost:${PORT}/`);
  console.log(`  • Garçom:      http://localhost:${PORT}/garcom`);
  console.log(`  • Pedidos:     http://localhost:${PORT}/pedidos`);
  console.log(`  • Cadastro:    http://localhost:${PORT}/admin\n`);
});
