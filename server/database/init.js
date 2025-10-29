const DatabaseAdapter = require('./adapter');
const path = require('path');

const db = new DatabaseAdapter();

const initDatabase = async () => {
  try {
    if (db.type === 'postgres') {
      // PostgreSQL: 使用异步初始化
      await db.connect();
      const initPostgres = require('./init-postgres');
      await initPostgres();
      console.log('PostgreSQL database initialized successfully');
    } else {
      // SQLite: 同步初始化
      // Orders table
      db.db.exec(`
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
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS line_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shopify_order_id TEXT NOT NULL,
          order_number TEXT NOT NULL,
          shopify_line_item_id TEXT NOT NULL,
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
          wig_number TEXT,
          has_weight_warning INTEGER DEFAULT 0,
          variant_title TEXT,
          picker_status TEXT DEFAULT 'picking',
          packer_status TEXT DEFAULT 'packing',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Transfer Items table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS transfer_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          line_item_id INTEGER NOT NULL,
          shopify_order_id TEXT NOT NULL,
          order_number TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          image_url TEXT,
          title TEXT,
          name TEXT,
          brand TEXT,
          size TEXT,
          weight REAL DEFAULT 0,
          weight_unit TEXT DEFAULT 'g',
          sku TEXT,
          url_handle TEXT,
          product_type TEXT,
          variant_title TEXT,
          transfer_from TEXT,
          estimate_month INTEGER,
          estimate_day INTEGER,
          status TEXT DEFAULT 'transferring',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Settings table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // CSV Data table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS csv_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT UNIQUE NOT NULL,
          data TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Box Types table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS box_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          dimensions TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert default box types
      const insertBoxType = db.db.prepare(`
        INSERT OR IGNORE INTO box_types (code, dimensions) VALUES (?, ?)
      `);

      insertBoxType.run('A', '5x20x5');
      insertBoxType.run('B', '18x10x4');
      insertBoxType.run('BB', '');
      insertBoxType.run('C', '18x10x5');
      insertBoxType.run('D', '18x12x4');
      insertBoxType.run('E', '18x12x8');
      insertBoxType.run('F', '18x14x5');
      insertBoxType.run('G', '26x8x8');
      insertBoxType.run('H', '12x6x6');

      // Insert default settings
      const insertSetting = db.db.prepare(`
        INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
      `);

      insertSetting.run('transfer_csv_column', 'D');
      insertSetting.run('picker_wig_column', 'E');
      insertSetting.run('sku_column', 'A');
      insertSetting.run('csv_uploaded_at', '');

      console.log('SQLite database initialized successfully');
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

initDatabase();

module.exports = db;