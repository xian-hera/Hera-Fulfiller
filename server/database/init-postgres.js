const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

async function initPostgres() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  await client.connect();

  console.log('Initializing PostgreSQL database...');

  // Orders table
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      shopify_order_id TEXT UNIQUE NOT NULL,
      order_number TEXT NOT NULL,
      name TEXT NOT NULL,
      fulfillment_status TEXT,
      total_quantity INTEGER,
      subtotal_price TEXT,
      created_at TIMESTAMP,
      shipping_code TEXT,
      shipping_title TEXT,
      shipping_name TEXT,
      shipping_address1 TEXT,
      shipping_address2 TEXT,
      shipping_city TEXT,
      shipping_province TEXT,
      shipping_zip TEXT,
      shipping_country TEXT,
      status TEXT DEFAULT 'packing',
      box_type TEXT,
      weight NUMERIC,
      is_edited BOOLEAN DEFAULT FALSE,
      packer_note TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Line items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS line_items (
      id SERIAL PRIMARY KEY,
      shopify_order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      shopify_line_item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      image_url TEXT,
      title TEXT,
      name TEXT,
      brand TEXT,
      size TEXT,
      weight NUMERIC DEFAULT 0,
      weight_unit TEXT DEFAULT 'g',
      sku TEXT,
      url_handle TEXT,
      product_type TEXT,
      wig_number TEXT,
      custom_name TEXT,
      has_weight_warning INTEGER DEFAULT 0,
      variant_title TEXT,
      picker_status TEXT DEFAULT 'picking',
      packer_status TEXT DEFAULT 'packing',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transfer items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS transfer_items (
      id SERIAL PRIMARY KEY,
      line_item_id INTEGER NOT NULL,
      shopify_order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      image_url TEXT,
      title TEXT,
      name TEXT,
      brand TEXT,
      size TEXT,
      weight NUMERIC DEFAULT 0,
      weight_unit TEXT DEFAULT 'g',
      sku TEXT,
      url_handle TEXT,
      product_type TEXT,
      variant_title TEXT,
      custom_name TEXT,
      transfer_from TEXT,
      transfer_date TEXT,
      estimate_month INTEGER,
      estimate_day INTEGER,
      out_of_stock INTEGER DEFAULT 0,
      status TEXT DEFAULT 'transferring',
      connecteam_tasked INTEGER DEFAULT 0,
      connecteam_task_id TEXT,
      connecteam_task_title_date TEXT,
      shopify_transferred INTEGER DEFAULT 0,
      shopify_transfer_id TEXT,
      shopify_transfer_number TEXT,
      from_location_changed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // CSV Data table
  await client.query(`
    CREATE TABLE IF NOT EXISTS csv_data (
      id SERIAL PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      data TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Box Types table
  await client.query(`
    CREATE TABLE IF NOT EXISTS box_types (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      dimensions TEXT,
      usage_count INTEGER DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🆕 Connecteam tasks table — records all tasks published via Fulfiller
  await client.query(`
    CREATE TABLE IF NOT EXISTS connecteam_tasks (
      id SERIAL PRIMARY KEY,
      task_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      title_date TEXT NOT NULL,
      locations TEXT,
      item_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🆕 Shopify transfers table — records all transfers created via Fulfiller
  await client.query(`
    CREATE TABLE IF NOT EXISTS shopify_transfers (
      id SERIAL PRIMARY KEY,
      transfer_id TEXT UNIQUE NOT NULL,
      transfer_number TEXT NOT NULL,
      from_location TEXT NOT NULL,
      destination TEXT DEFAULT 'MTL10',
      reference_name TEXT DEFAULT 'Online Transfer',
      tags TEXT DEFAULT '["Online Transfer","WEB"]',
      status TEXT DEFAULT 'draft',
      item_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🆕 Connecteam settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS connecteam_settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🆕 Shopify transfer settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS shopify_transfer_settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🆕 Connecteam users cache table — synced from Connecteam API
  await client.query(`
    CREATE TABLE IF NOT EXISTS connecteam_users (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      user_type TEXT,
      is_archived INTEGER DEFAULT 0,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Migrations for existing tables ────────────────────────────────────────
  console.log('Running database migrations...');

  const migrations = [
    // Existing migrations
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS packer_note TEXT`, 'packer_note to orders'],
    [`ALTER TABLE line_items ADD COLUMN IF NOT EXISTS wig_number TEXT`, 'wig_number to line_items'],
    [`ALTER TABLE line_items ADD COLUMN IF NOT EXISTS custom_name TEXT`, 'custom_name to line_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS custom_name TEXT`, 'custom_name to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS transfer_date TEXT`, 'transfer_date to transfer_items'],
    [`ALTER TABLE box_types ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0`, 'usage_count to box_types'],
    [`ALTER TABLE box_types ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0`, 'quantity to box_types'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS out_of_stock INTEGER DEFAULT 0`, 'out_of_stock to transfer_items'],
    // 🆕 New Transfer redesign migrations
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS connecteam_tasked INTEGER DEFAULT 0`, 'connecteam_tasked to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS connecteam_task_id TEXT`, 'connecteam_task_id to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS connecteam_task_title_date TEXT`, 'connecteam_task_title_date to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS shopify_transferred INTEGER DEFAULT 0`, 'shopify_transferred to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS shopify_transfer_id TEXT`, 'shopify_transfer_id to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS shopify_transfer_number TEXT`, 'shopify_transfer_number to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS from_location_changed INTEGER DEFAULT 0`, 'from_location_changed to transfer_items'],
  ];

  for (const [sql, desc] of migrations) {
    try {
      await client.query(sql);
      console.log(`✓ Added ${desc}`);
    } catch (error) {
      console.log(`✓ ${desc} already exists`);
    }
  }

  console.log('Migrations completed!');

  // ── Default data ───────────────────────────────────────────────────────────

  // Box types
  const boxTypeCountResult = await client.query('SELECT COUNT(*) as count FROM box_types');
  const boxTypeCount = parseInt(boxTypeCountResult.rows[0].count);

  if (boxTypeCount === 0) {
    console.log('Box types table is empty, inserting default values...');
    const boxTypes = [
      ['A', '5x20x5'], ['B', '18x10x4'], ['C', '18x10x5'], ['D', '18x12x4'],
      ['E', '18x12x8'], ['F', '18x14x5'], ['G', '26x8x8'],  ['H', '12x6x6']
    ];
    for (const [code, dimensions] of boxTypes) {
      await client.query(
        'INSERT INTO box_types (code, dimensions, usage_count, quantity) VALUES ($1, $2, 0, 0)',
        [code, dimensions]
      );
    }
    console.log('✓ Default box types inserted');
  }

  // App settings
  const appSettings = [
    ['transfer_csv_column', 'D'],
    ['picker_wig_column', 'E'],
    ['sku_column', 'A'],
    ['csv_uploaded_at', ''],
  ];
  for (const [key, value] of appSettings) {
    await client.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // 🆕 Default Connecteam settings
  const connecteamDefaults = [
    ['default_assignee_ids', JSON.stringify([10952088, 8922246, 14153542, 6785478, 6793918])],
    // Betty Tsui, Xian Wang, Hannah Thibeaud, Jungwook Choi, Sung Yeon Hwang
    ['default_description', 'Please double check the SKU and quantity, Thank you.'],
    ['location_members', JSON.stringify({
      '01': [], '02': [], '03': [], '04': [], '05': [],
      '06': [], '07': [], '08': [], '09': [], '11': []
    })],
  ];
  for (const [key, value] of connecteamDefaults) {
    await client.query(
      'INSERT INTO connecteam_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // 🆕 Default Shopify transfer settings
  const shopifyDefaults = [
    ['default_destination', 'MTL10'],
    ['default_reference_name', 'Online Transfer'],
    ['default_tags', JSON.stringify(['Online Transfer', 'WEB'])],
  ];
  for (const [key, value] of shopifyDefaults) {
    await client.query(
      'INSERT INTO shopify_transfer_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // Indexes
  await client.query('CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON orders(shopify_order_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_shopify_order_id ON line_items(shopify_order_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_picker_status ON line_items(picker_status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_packer_status ON line_items(packer_status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_status ON transfer_items(status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_connecteam_tasked ON transfer_items(connecteam_tasked)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_shopify_transferred ON transfer_items(shopify_transferred)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_from ON transfer_items(transfer_from)');

  console.log('PostgreSQL database initialized successfully');

  await client.end();
}

if (require.main === module) {
  initPostgres().catch(console.error);
}

module.exports = initPostgres;