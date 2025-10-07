const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.db');
const db = new Database(dbPath);

// Initialize database schema
const initDatabase = () => {
  // Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_order_id TEXT UNIQUE NOT NULL,
      order_number TEXT NOT NULL,
      name TEXT NOT NULL,
      fulfillment_status TEXT,
      total_quantity INTEGER,
      subtotal_price TEXT,
      created_at TEXT,
      shipping_code TEXT,
      shipping_name TEXT,
      shipping_address1 TEXT,
      shipping_address2 TEXT,
      shipping_city TEXT,
      shipping_province TEXT,
      shipping_zip TEXT,
      shipping_country TEXT,
      status TEXT DEFAULT 'packing',
      box_type TEXT,
      weight TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Line Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      shopify_line_item_id TEXT UNIQUE NOT NULL,
      quantity INTEGER NOT NULL,
      image_url TEXT,
      title TEXT,
      name TEXT,
      brand TEXT,
      size TEXT,
      weight REAL,
      weight_unit TEXT,
      sku TEXT,
      url_handle TEXT,
      product_type TEXT,
      picker_status TEXT DEFAULT 'picking',
      packer_status TEXT DEFAULT 'packing',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shopify_order_id) REFERENCES orders(shopify_order_id) ON DELETE CASCADE
    )
  `);

  // Transfer Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_item_id INTEGER NOT NULL,
      shopify_order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      sku TEXT,
      transfer_from TEXT,
      estimate_month INTEGER,
      estimate_day INTEGER,
      status TEXT DEFAULT 'transferring',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE CASCADE
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // CSV Data table
  db.exec(`
    CREATE TABLE IF NOT EXISTS csv_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      data TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Box Types table
  db.exec(`
    CREATE TABLE IF NOT EXISTS box_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      dimensions TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default box types
  const insertBoxType = db.prepare(`
    INSERT OR IGNORE INTO box_types (code, dimensions) VALUES (?, ?)
  `);

  insertBoxType.run('A', '10x8x4');
  insertBoxType.run('B', '12x10x6');
  insertBoxType.run('C', '14x12x8');
  insertBoxType.run('D', '16x14x10');
  insertBoxType.run('E', '18x16x12');
  insertBoxType.run('F', '20x18x14');
  insertBoxType.run('G', '22x20x16');
  insertBoxType.run('H', '24x22x18');

  // Insert default settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  insertSetting.run('transfer_csv_column', 'E');
  insertSetting.run('picker_wig_column', 'E');
  insertSetting.run('csv_uploaded_at', '');

  console.log('Database initialized successfully');
};

initDatabase();

module.exports = db;