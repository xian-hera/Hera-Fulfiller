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
      lookups TEXT,
      picker_status TEXT DEFAULT 'picking',
      packer_status TEXT DEFAULT 'packing',
      version INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Picker sessions table
  await client.query(`
    CREATE TABLE IF NOT EXISTS picker_sessions (
      session_id TEXT PRIMARY KEY,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

  // Manifest Shipments table（shipment/label 日志，用于 refund 查找 + 历史记录）
  await client.query(`
    CREATE TABLE IF NOT EXISTS manifest_shipments (
      id SERIAL PRIMARY KEY,
      shopify_order_id TEXT,
      order_name TEXT NOT NULL,
      tracking_number TEXT,
      group_id TEXT,
      shipment_id TEXT,
      service_code TEXT,
      refund_link TEXT,
      refund_status TEXT,
      label_bought_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      transmitted INTEGER DEFAULT 0
    )
  `);

  // Connecteam tasks table
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

  // Shopify transfers table
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

  // Connecteam settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS connecteam_settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Shopify transfer settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS shopify_transfer_settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Connecteam users cache table
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

  // ============================================================
  // 🆕 Return Management — 新增表
  // ============================================================

  // Returns 主表（订单相关信息做软引用，不建外键，避免被 cleanup.js 的 60 天清理逻辑连带影响）
  await client.query(`
    CREATE TABLE IF NOT EXISTS returns (
      id SERIAL PRIMARY KEY,
      shopify_order_id TEXT NOT NULL,
      order_name TEXT NOT NULL,
      customer_id TEXT,
      customer_email TEXT,
      customer_first_name TEXT,
      customer_last_name TEXT,
      status TEXT DEFAULT 'awaiting_approval',
      auto_approved BOOLEAN DEFAULT FALSE,
      return_method TEXT,
      return_location_id TEXT,
      return_location_name TEXT,
      tracking_number TEXT,
      label_url TEXT,
      label_fee NUMERIC,
      internal_return_note TEXT,
      order_fulfilled_date TIMESTAMP,
      order_subtotal NUMERIC,
      customer_paid_shipping NUMERIC,
      actual_shipping_charge NUMERIC,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP,
      archived_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Return items（对应每个 line item 的退货明细）
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_items (
      id SERIAL PRIMARY KEY,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      shopify_line_item_id TEXT,
      product_id TEXT,
      variant_id TEXT,
      product_title TEXT,
      variant_title TEXT,
      image_url TEXT,
      price NUMERIC,
      requested_quantity INTEGER NOT NULL DEFAULT 1,
      approved_quantity INTEGER DEFAULT 0,
      received_quantity INTEGER DEFAULT 0,
      refunded_quantity INTEGER DEFAULT 0,
      replacement_provided_quantity INTEGER DEFAULT 0,
      approve_status TEXT DEFAULT 'pending',
      reason_id INTEGER,
      reason_name_snapshot TEXT,
      customer_note TEXT,
      photos TEXT,
      refund_option TEXT,
      pos_rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Return item 的 Question/Answer 作答记录
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_item_question_answers (
      id SERIAL PRIMARY KEY,
      return_item_id INTEGER NOT NULL REFERENCES return_items(id) ON DELETE CASCADE,
      question_id INTEGER,
      question_body_snapshot TEXT,
      answer TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Return 状态流转记录（History timeline）
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_status_history (
      id SERIAL PRIMARY KEY,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      note TEXT,
      staff_member_id TEXT,
      staff_user_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Return reasons（Settings > Reasons）
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_reasons (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      name_fr TEXT,
      note_requirement TEXT DEFAULT 'disabled',
      photo_requirement TEXT DEFAULT 'disabled',
      sort_order INTEGER DEFAULT 0,
      is_archived BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Return questions（Settings > Questions，支持 follow-up 自引用）
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_questions (
      id SERIAL PRIMARY KEY,
      parent_question_id INTEGER REFERENCES return_questions(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      body_fr TEXT,
      trigger_mode TEXT DEFAULT 'always',
      condition_logic TEXT DEFAULT 'AND',
      conditions TEXT,
      answer_type TEXT DEFAULT 'text',
      options TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Return rules（Rules 页面）
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_rules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      condition_groups TEXT,
      group_logic TEXT DEFAULT 'AND',
      actions TEXT,
      priority INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Return 功能专属的 key-value 设置（Policy / Photo upload / Klaviyo / Canada Post 等）
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Portal > Location mapping
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_portal_locations (
      id SERIAL PRIMARY KEY,
      shopify_location_id TEXT NOT NULL,
      store_name TEXT,
      store_address TEXT,
      store_city TEXT,
      opening_hours TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Portal > Messages before submitting
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_portal_messages (
      id SERIAL PRIMARY KEY,
      title TEXT,
      title_fr TEXT,
      body TEXT,
      body_fr TEXT,
      condition_type TEXT DEFAULT 'always',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Portal > Wording and translation
  await client.query(`
    CREATE TABLE IF NOT EXISTS return_wording (
      id SERIAL PRIMARY KEY,
      wording_key TEXT UNIQUE NOT NULL,
      default_text TEXT NOT NULL,
      modified_text TEXT,
      french_text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Migrations ─────────────────────────────────────────────────────────────
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
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS connecteam_tasked INTEGER DEFAULT 0`, 'connecteam_tasked to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS connecteam_task_id TEXT`, 'connecteam_task_id to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS connecteam_task_title_date TEXT`, 'connecteam_task_title_date to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS shopify_transferred INTEGER DEFAULT 0`, 'shopify_transferred to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS shopify_transfer_id TEXT`, 'shopify_transfer_id to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS shopify_transfer_number TEXT`, 'shopify_transfer_number to transfer_items'],
    [`ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS from_location_changed INTEGER DEFAULT 0`, 'from_location_changed to transfer_items'],
    [`ALTER TABLE line_items ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0`, 'version to line_items'],
    // 🆕 Pack & Label It migrations
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_status TEXT`, 'label_status to orders'],
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_error TEXT`, 'label_error to orders'],
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_tracking_number TEXT`, 'label_tracking_number to orders'],
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfill_status TEXT`, 'fulfill_status to orders'],
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfill_error TEXT`, 'fulfill_error to orders'],
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_options TEXT`, 'label_options to orders'],
    [`ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_transmitted INTEGER DEFAULT 0`, 'manifest_transmitted to orders'],
    // 🆕 manifest_shipments refund 相关迁移
    [`ALTER TABLE manifest_shipments ADD COLUMN IF NOT EXISTS refund_link TEXT`, 'refund_link to manifest_shipments'],
    [`ALTER TABLE manifest_shipments ADD COLUMN IF NOT EXISTS refund_status TEXT`, 'refund_status to manifest_shipments'],
    // 🆕 Lookup barcode (variant metafield custom.lookups)
    [`ALTER TABLE line_items ADD COLUMN IF NOT EXISTS lookups TEXT`, 'lookups to line_items'],
    // 🆕 Phone Numbers modal — capture mobile number from Connecteam
    [`ALTER TABLE connecteam_users ADD COLUMN IF NOT EXISTS phone_number TEXT`, 'phone_number to connecteam_users'],
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
    // 🆕 Pack & Label It settings
    ['pack_label_enabled', 'false'],
    ['sender_company', 'HERA BEAUTÉ'],
    ['sender_contact', ''],
    ['sender_address1', '22-2877 Ch De Chambly'],
    ['sender_address2', ''],
    ['sender_city', 'Longueuil'],
    ['sender_province', 'QC'],
    ['sender_postal_code', 'J4L1M8'],
    // 🆕 单位开关（控制发给 Canada Post 前是否换算）默认 inch + gram = 当前现状
    ['length_unit', 'inch'],
    ['weight_unit', 'gram'],
    ['refund_email', ''],
    ['refund_history_cleared_at', ''],
  ];
  for (const [key, value] of appSettings) {
    await client.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // Default Connecteam settings
  const connecteamDefaults = [
    ['default_assignee_ids', JSON.stringify([10952088, 8922246, 14153542, 6785478, 6793918])],
    ['default_description', 'Please double check the SKU and quantity, Thank you.'],
    ['location_members', JSON.stringify({
      '01': [], '02': [], '03': [], '04': [], '05': [],
      '06': [], '07': [], '08': [], '09': [], '10': [], '11': []
    })],
  ];
  for (const [key, value] of connecteamDefaults) {
    await client.query(
      'INSERT INTO connecteam_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // Default Shopify transfer settings
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
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS line_items_shopify_line_item_id_unique ON line_items(shopify_line_item_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_status ON transfer_items(status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_connecteam_tasked ON transfer_items(connecteam_tasked)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_shopify_transferred ON transfer_items(shopify_transferred)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_from ON transfer_items(transfer_from)');

  // 🆕 Return Management indexes
  await client.query('CREATE INDEX IF NOT EXISTS idx_returns_shopify_order_id ON returns(shopify_order_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_return_status_history_return_id ON return_status_history(return_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_return_item_question_answers_item_id ON return_item_question_answers(return_item_id)');

  console.log('PostgreSQL database initialized successfully');

  await client.end();
}

if (require.main === module) {
  initPostgres().catch(console.error);
}

module.exports = initPostgres;