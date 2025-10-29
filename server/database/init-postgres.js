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
      status TEXT DEFAULT 'transferring',
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🆕 Add new columns to existing tables (migrations)
  console.log('Running database migrations...');

  try {
    // Add packer_note to orders
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS packer_note TEXT
    `);
    console.log('✓ Added packer_note column to orders');
  } catch (error) {
    console.log('✓ Column packer_note already exists in orders');
  }

  try {
    // Add wig_number to line_items
    await client.query(`
      ALTER TABLE line_items ADD COLUMN IF NOT EXISTS wig_number TEXT
    `);
    console.log('✓ Added wig_number column to line_items');
  } catch (error) {
    console.log('✓ Column wig_number already exists in line_items');
  }

  try {
    // Add custom_name to line_items
    await client.query(`
      ALTER TABLE line_items ADD COLUMN IF NOT EXISTS custom_name TEXT
    `);
    console.log('✓ Added custom_name column to line_items');
  } catch (error) {
    console.log('✓ Column custom_name already exists in line_items');
  }

  try {
    // Add custom_name to transfer_items
    await client.query(`
      ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS custom_name TEXT
    `);
    console.log('✓ Added custom_name column to transfer_items');
  } catch (error) {
    console.log('✓ Column custom_name already exists in transfer_items');
  }

  try {
    // Add transfer_date to transfer_items
    await client.query(`
      ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS transfer_date TEXT
    `);
    console.log('✓ Added transfer_date column to transfer_items');
  } catch (error) {
    console.log('✓ Column transfer_date already exists in transfer_items');
  }

  console.log('Migrations completed!');

  // Insert default box types
  const boxTypes = [
    ['A', '5x20x5'],
    ['B', '18x10x4'],
    ['BB', ''],
    ['C', '18x10x5'],
    ['D', '18x12x4'],
    ['E', '18x12x8'],
    ['F', '18x14x5'],
    ['G', '26x8x8'],
    ['H', '12x6x6']
  ];

  for (const [code, dimensions] of boxTypes) {
    await client.query(
      'INSERT INTO box_types (code, dimensions) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
      [code, dimensions]
    );
  }

  // Insert default settings
  const settings = [
    ['transfer_csv_column', 'D'],
    ['picker_wig_column', 'E'],
    ['sku_column', 'A'],
    ['csv_uploaded_at', '']
  ];

  for (const [key, value] of settings) {
    await client.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // Indexes
  await client.query('CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON orders(shopify_order_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_shopify_order_id ON line_items(shopify_order_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_picker_status ON line_items(picker_status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_packer_status ON line_items(packer_status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_status ON transfer_items(status)');

  console.log('PostgreSQL database initialized successfully');

  await client.end();
}

if (require.main === module) {
  initPostgres().catch(console.error);
}

module.exports = initPostgres;