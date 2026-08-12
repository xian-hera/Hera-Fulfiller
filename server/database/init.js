const DatabaseAdapter = require('./adapter');

const db = new DatabaseAdapter();

const initDatabase = async () => {
  try {
    if (db.type === 'postgres') {
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
          lookups TEXT,
          picker_status TEXT DEFAULT 'picking',
          packer_status TEXT DEFAULT 'packing',
          version INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Picker sessions table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS picker_sessions (
          session_id TEXT PRIMARY KEY,
          last_seen TEXT DEFAULT CURRENT_TIMESTAMP
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
          transfer_date TEXT,
          out_of_stock INTEGER DEFAULT 0,
          status TEXT DEFAULT 'transferring',
          connecteam_tasked INTEGER DEFAULT 0,
          connecteam_task_id TEXT,
          connecteam_task_title_date TEXT,
          shopify_transferred INTEGER DEFAULT 0,
          shopify_transfer_id TEXT,
          shopify_transfer_number TEXT,
          from_location_changed INTEGER DEFAULT 0,
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
          usage_count INTEGER DEFAULT 0,
          quantity INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 🆕 Connecteam tasks table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS connecteam_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          title_date TEXT NOT NULL,
          locations TEXT,
          item_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'published',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 🆕 Shopify transfers table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS shopify_transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transfer_id TEXT UNIQUE NOT NULL,
          transfer_number TEXT NOT NULL,
          from_location TEXT NOT NULL,
          destination TEXT DEFAULT 'MTL10',
          reference_name TEXT DEFAULT 'Online Transfer',
          tags TEXT DEFAULT '["Online Transfer","WEB"]',
          status TEXT DEFAULT 'draft',
          item_count INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 🆕 Connecteam settings table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS connecteam_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 🆕 Shopify transfer settings table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS shopify_transfer_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 🆕 Connecteam users cache table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS connecteam_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          first_name TEXT,
          last_name TEXT,
          email TEXT,
          user_type TEXT,
          is_archived INTEGER DEFAULT 0,
          synced_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── Migrations ──────────────────────────────────────────────────────────
      const addColumnIfNotExists = (table, column, definition) => {
        try {
          db.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
          console.log(`✓ Added ${column} to ${table}`);
        } catch {
          console.log(`✓ ${column} already exists in ${table}`);
        }
      };

      // Existing migrations
      addColumnIfNotExists('transfer_items', 'custom_name', 'TEXT');
      addColumnIfNotExists('line_items', 'custom_name', 'TEXT');
      addColumnIfNotExists('box_types', 'usage_count', 'INTEGER DEFAULT 0');
      addColumnIfNotExists('box_types', 'quantity', 'INTEGER DEFAULT 0');
      addColumnIfNotExists('transfer_items', 'out_of_stock', 'INTEGER DEFAULT 0');

      // 🆕 New Transfer redesign migrations
      addColumnIfNotExists('transfer_items', 'connecteam_tasked', 'INTEGER DEFAULT 0');
      addColumnIfNotExists('transfer_items', 'connecteam_task_id', 'TEXT');
      addColumnIfNotExists('transfer_items', 'connecteam_task_title_date', 'TEXT');
      addColumnIfNotExists('transfer_items', 'shopify_transferred', 'INTEGER DEFAULT 0');
      addColumnIfNotExists('transfer_items', 'shopify_transfer_id', 'TEXT');
      addColumnIfNotExists('transfer_items', 'shopify_transfer_number', 'TEXT');
      addColumnIfNotExists('transfer_items', 'from_location_changed', 'INTEGER DEFAULT 0');
      // 🆕 Picker optimistic locking
      addColumnIfNotExists('line_items', 'version', 'INTEGER DEFAULT 0');

      // 🆕 Pack & Label It — orders table
      addColumnIfNotExists('orders', 'label_status', 'TEXT');
      addColumnIfNotExists('orders', 'label_error', 'TEXT');
      addColumnIfNotExists('orders', 'label_tracking_number', 'TEXT');
      addColumnIfNotExists('orders', 'fulfill_status', 'TEXT');
      addColumnIfNotExists('orders', 'fulfill_error', 'TEXT');
      addColumnIfNotExists('orders', 'label_options', 'TEXT');
      addColumnIfNotExists('orders', 'manifest_transmitted', 'INTEGER DEFAULT 0');
      addColumnIfNotExists('orders', 'packer_note', 'TEXT');
      addColumnIfNotExists('orders', 'shipping_title', 'TEXT');

      // 🆕 Lookup barcode (variant metafield custom.lookups)
      addColumnIfNotExists('line_items', 'lookups', 'TEXT');

      // 🆕 Phone Numbers modal — capture mobile number from Connecteam
      addColumnIfNotExists('connecteam_users', 'phone_number', 'TEXT');

      // ── Default data ────────────────────────────────────────────────────────

      // Box types
      const boxTypeCount = db.db.prepare('SELECT COUNT(*) as count FROM box_types').get();
      if (boxTypeCount.count === 0) {
        const insertBoxType = db.db.prepare(
          'INSERT INTO box_types (code, dimensions, usage_count, quantity) VALUES (?, ?, 0, 0)'
        );
        ['A','B','C','D','E','F','G','H'].forEach((code, i) => {
          const dims = ['5x20x5','18x10x4','18x10x5','18x12x4','18x12x8','18x14x5','26x8x8','12x6x6'][i];
          insertBoxType.run(code, dims);
        });
        console.log('✓ Default box types inserted');
      }

      // App settings
      const insertSetting = db.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
      insertSetting.run('transfer_csv_column', 'D');
      insertSetting.run('picker_wig_column', 'E');
      insertSetting.run('sku_column', 'A');
      insertSetting.run('csv_uploaded_at', '');

      // 🆕 Pack & Label It settings
      insertSetting.run('pack_label_enabled', 'false');
      insertSetting.run('sender_company', 'HERA BEAUTÉ');
      insertSetting.run('sender_contact', '');
      insertSetting.run('sender_address1', '22-2877 Ch De Chambly');
      insertSetting.run('sender_address2', '');
      insertSetting.run('sender_city', 'Longueuil');
      insertSetting.run('sender_province', 'QC');
      insertSetting.run('sender_postal_code', 'J4L1M8');

      // 🆕 Default Connecteam settings
      const insertCtSetting = db.db.prepare('INSERT OR IGNORE INTO connecteam_settings (key, value) VALUES (?, ?)');
      insertCtSetting.run('default_assignee_ids', JSON.stringify([10952088, 8922246, 14153542, 6785478, 6793918]));
      insertCtSetting.run('default_description', 'Please double check the SKU and quantity, Thank you.');
      insertCtSetting.run('location_members', JSON.stringify({
        '01': [], '02': [], '03': [], '04': [], '05': [],
        '06': [], '07': [], '08': [], '09': [], '10': [], '11': []
      }));

      // 🆕 Default Shopify transfer settings
      const insertStSetting = db.db.prepare('INSERT OR IGNORE INTO shopify_transfer_settings (key, value) VALUES (?, ?)');
      insertStSetting.run('default_destination', 'MTL10');
      insertStSetting.run('default_reference_name', 'Online Transfer');
      insertStSetting.run('default_tags', JSON.stringify(['Online Transfer', 'WEB']));

      console.log('SQLite database initialized successfully');
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

initDatabase();

module.exports = db;