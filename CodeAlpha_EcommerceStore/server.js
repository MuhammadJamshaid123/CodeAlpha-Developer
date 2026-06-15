const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const { ready } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
let db;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'codealpha-ecommerce-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, database: db?.isPostgres ? 'postgresql' : 'sqlite' }));

app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.prepare('INSERT INTO users (username, password, email) VALUES (?, ?, ?)').run(username, hash, email || '');
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ success: true, username });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, username: req.session.username } });
});

app.get('/api/products', async (req, res) => {
  res.json(await db.prepare('SELECT * FROM products').all());
});

app.get('/api/products/:id', async (req, res) => {
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.get('/api/cart', async (req, res) => {
  const cart = req.session.cart || {};
  const items = [];
  let total = 0;
  for (const [pid, qty] of Object.entries(cart)) {
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    if (product) {
      items.push({ product, quantity: qty, subtotal: product.price * qty });
      total += product.price * qty;
    }
  }
  res.json({ items, total });
});

app.post('/api/cart/add', async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!req.session.cart) req.session.cart = {};
  req.session.cart[productId] = (req.session.cart[productId] || 0) + quantity;
  res.json({ success: true, cart: req.session.cart });
});

app.post('/api/cart/update', (req, res) => {
  const { productId, quantity } = req.body;
  if (!req.session.cart) req.session.cart = {};
  if (quantity <= 0) delete req.session.cart[productId];
  else req.session.cart[productId] = quantity;
  res.json({ success: true });
});

app.post('/api/cart/remove', (req, res) => {
  const { productId } = req.body;
  if (req.session.cart) delete req.session.cart[productId];
  res.json({ success: true });
});

app.post('/api/orders', requireAuth, async (req, res) => {
  const cart = req.session.cart || {};
  const entries = Object.entries(cart);
  if (entries.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  let total = 0;
  const items = [];
  for (const [pid, qty] of entries) {
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    if (product) {
      total += product.price * qty;
      items.push({ product, quantity: qty });
    }
  }

  const orderResult = await db.prepare('INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)').run(req.session.userId, total, 'confirmed');
  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
  for (const { product, quantity } of items) {
    await insertItem.run(orderResult.lastInsertRowid, product.id, quantity, product.price);
  }

  req.session.cart = {};
  res.json({ success: true, orderId: orderResult.lastInsertRowid, total });
});

app.get('/api/orders', requireAuth, async (req, res) => {
  const orders = await db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
  const ordersWithItems = await Promise.all(orders.map(async (order) => {
    const items = await db.prepare(`
      SELECT oi.*, p.name, p.image FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).all(order.id);
    return { ...order, items };
  }));
  res.json(ordersWithItems);
});

ready.then((d) => {
  db = d;
  app.listen(PORT, () => console.log(`E-commerce Store running at http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Database connection failed:', err);
  process.exit(1);
});
