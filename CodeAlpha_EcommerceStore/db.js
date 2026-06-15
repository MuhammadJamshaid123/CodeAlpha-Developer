const { createDb } = require('../shared/db-factory');
const path = require('path');

const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`;

const pgSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    image TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    total NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    price NUMERIC NOT NULL
  );
`;

async function seed(db) {
  const row = await db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (Number(row.count) === 0) {
    const insert = db.prepare('INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)');
    const products = [
      ['Wireless Headphones', 'Premium noise-cancelling wireless headphones with 30hr battery.', 79.99, '🎧'],
      ['Smart Watch', 'Fitness tracking smartwatch with heart rate monitor.', 149.99, '⌚'],
      ['Laptop Stand', 'Ergonomic aluminum laptop stand for better posture.', 39.99, '💻'],
      ['Mechanical Keyboard', 'RGB mechanical keyboard with Cherry MX switches.', 89.99, '⌨️'],
      ['USB-C Hub', '7-in-1 USB-C hub with HDMI, USB 3.0, and SD card reader.', 49.99, '🔌'],
      ['Webcam HD', '1080p HD webcam with built-in microphone for video calls.', 59.99, '📷'],
    ];
    for (const p of products) await insert.run(...p);
  }
}

const ready = createDb({
  sqliteSchema,
  pgSchema,
  seed,
  projectDir: __dirname,
  sqlitePath: process.env.DATABASE_PATH || path.join(__dirname, 'db.sqlite3')
});

module.exports = { ready };
