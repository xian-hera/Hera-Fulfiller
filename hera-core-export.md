# Hera Fulfiller — 核心代码导出
生成时间：2026-06-03T21:32:38.293Z



## package.json

```javascript
{
  "name": "shopify-warehouse-app",
  "version": "1.0.0",
  "description": "Shopify Warehouse Management System with Picker, Transfer, and Packer",
  "main": "server/index.js",
  "engines": {
    "node": "18.x",
    "npm": "9.x"
  },
  "scripts": {
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "nodemon server/index.js",
    "client": "cd client && npm start",
    "build": "cd client && npm install && npm run build",
    "start": "node server/index.js",
    "setup-webhooks": "node server/scripts/setupWebhooks.js",
    "init-db": "node server/database/init-postgres.js"
  },
  "dependencies": {
    "@shopify/shopify-api": "^9.0.0",
    "axios": "^1.13.6",
    "better-sqlite3": "^9.2.2",
    "concurrently": "^8.2.2",
    "cors": "^2.8.5",
    "csv-parser": "^3.0.0",
    "date-fns": "^2.30.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.16.3",
    "ws": "^8.21.0",
    "xml2js": "^0.6.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}

```


## server/index.js

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const db = require('./database/init');

// Import routes
const pickerRoutes = require('./routes/picker');
const transferRoutes = require('./routes/transfer');
const packerRoutes = require('./routes/packer');
const settingsRoutes = require('./routes/settings');
const webhookRoutes = require('./routes/webhooks');
const connecteamRoutes = require('./routes/connecteam');
const shopifyTransferRoutes = require('./routes/shopify-transfer');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---- Shopify OAuth ----
// 第一步：在浏览器里打开 /auth 来发起授权
app.get('/auth', (req, res) => {
  const shop = req.query.shop || process.env.SHOPIFY_SHOP_NAME;
  if (!shop) return res.status(400).send('Missing shop');

  const redirectUri = `${process.env.HOST}/auth/callback`;
  const state = Math.random().toString(36).slice(2);
  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(installUrl);
});

// 第二步：Shopify 带着 ?code=... 跳回这里，换 token 并存进数据库
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, shop } = req.query;
    if (!code || !shop) return res.status(400).send('Missing code or shop parameter');

    // 用 code 换 access token
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = response.data.access_token;
    const scope = response.data.scope;

    // 存进 sessions 表
    await db.prepare(
      `INSERT INTO sessions (shop, access_token, scope, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (shop) DO UPDATE
         SET access_token = EXCLUDED.access_token,
             scope = EXCLUDED.scope,
             updated_at = CURRENT_TIMESTAMP`
    ).run(shop, accessToken, scope);

    console.log('========== OAUTH CALLBACK RECEIVED ==========');
    console.log('✓ Token saved for shop:', shop);
    console.log('✓ Granted Scopes:', scope);
    console.log('=============================================');

    res.send(`
      <h2>✓ Authentication complete</h2>
      <p><strong>Shop:</strong> ${shop}</p>
      <p><strong>Granted Scopes:</strong></p>
      <pre style="background:#f0f0f0;padding:16px">${scope}</pre>
      <p>Token 已存入数据库，app 可以正常工作了。无需手动填写任何环境变量。</p>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).send(`OAuth error: ${JSON.stringify(error.response?.data || error.message)}`);
  }
});

// API Routes
app.use('/api/picker', pickerRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/packer', packerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/connecteam', connecteamRoutes);
app.use('/api/shopify-transfer', shopifyTransferRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// Start server with WebSocket support
const http = require('http');
const server = http.createServer(app);

// Initialize WebSocket
const { initWebSocket } = require('./websocket');
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
```


## server/database/adapter.js

```javascript
const sqlite3 = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');

const DB_TYPE = process.env.DATABASE_TYPE || 'sqlite';
const DATABASE_URL = process.env.DATABASE_URL;

class DatabaseAdapter {
  constructor() {
    if (DB_TYPE === 'postgres') {
      this.client = new Client({
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      this.type = 'postgres';
    } else {
      const dbPath = path.resolve(__dirname, '../../database.db');
      this.db = sqlite3(dbPath);
      this.type = 'sqlite';
    }
  }

  async connect() {
    if (this.type === 'postgres') {
      await this.client.connect();
    }
  }

  prepare(sql) {
    if (this.type === 'postgres') {
      return new PostgresStatement(this.client, sql);
    } else {
      return this.db.prepare(sql);
    }
  }

  async close() {
    if (this.type === 'postgres') {
      await this.client.end();
    } else {
      this.db.close();
    }
  }
}

class PostgresStatement {
  constructor(client, sql) {
    this.client = client;
    this.sql = this.convertSQLiteToPostgres(sql);
  }

  convertSQLiteToPostgres(sql) {
    // 转换 SQLite 语法到 PostgreSQL
    let converted = sql
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
      .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/REAL/gi, 'NUMERIC');
    
    // 转换 ? 为 $1, $2, $3...
    let paramCount = 0;
    converted = converted.replace(/\?/g, () => {
      paramCount++;
      return `$${paramCount}`;
    });
    
    return converted;
  }

  async run(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async get(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async all(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return result.rows;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseAdapter;
```


## server/database/init-postgres.js

```javascript
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
      '06': [], '07': [], '08': [], '09': [], '11': []
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

  console.log('PostgreSQL database initialized successfully');

  await client.end();
}

if (require.main === module) {
  initPostgres().catch(console.error);
}

module.exports = initPostgres;
```


## server/shopify/client.js

```javascript
require('dotenv').config();
const axios = require('axios');
const db = require('../database/init');

class ShopifyClient {
  constructor() {
    this.shopUrl = process.env.SHOPIFY_SHOP_NAME || process.env.SHOPIFY_STORE_URL;
    this.apiVersion = '2025-01';
    this._client = null;
    this._token = null;

    if (!this.shopUrl) {
      throw new Error('SHOPIFY_SHOP_NAME environment variable is required');
    }
  }

  // 从数据库读 token，构建（并缓存）axios 实例
  async getClient() {
    const row = await db.prepare(
      'SELECT access_token FROM sessions ORDER BY updated_at DESC LIMIT 1'
    ).get();

    const token = row && row.access_token;
    if (!token) {
      throw new Error('No Shopify token in sessions table. Visit /auth to authenticate.');
    }

    if (!this._client || this._token !== token) {
      this._token = token;
      this._client = axios.create({
        baseURL: `https://${this.shopUrl}/admin/api/${this.apiVersion}`,
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      });
    }
    return this._client;
  }

  async getProductVariant(variantId) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/variants/${variantId}.json`);
      return response.data.variant;
    } catch (error) {
      console.error('Error fetching product variant:', error.response?.data || error.message);
      throw error;
    }
  }

  async getProductMetafield(productId, namespace, key) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/products/${productId}/metafields.json`);
      const metafields = response.data.metafields || [];
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      if (metafield) return metafield.value;
      return '';
    } catch (error) {
      console.error(`Error fetching product metafield:`, error.message);
      return '';
    }
  }

  async getVariantMetafield(variantId, namespace, key) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/variants/${variantId}/metafields.json`);
      const metafields = response.data.metafields || [];
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      if (metafield) return metafield.value;
      return '';
    } catch (error) {
      console.error(`Error fetching variant metafield:`, error.message);
      return '';
    }
  }

  async updateVariantWeight(variantId, weightInGrams) {
    try {
      const client = await this.getClient();
      const response = await client.put(`/variants/${variantId}.json`, {
        variant: { id: variantId, weight: weightInGrams, weight_unit: 'g' }
      });
      return response.data.variant;
    } catch (error) {
      console.error('Error updating variant weight:', error.response?.data || error.message);
      throw error;
    }
  }

  async updateVariantWeightBySku(sku, weightInGrams) {
    try {
      const client = await this.getClient();
      const query = `
        query getVariantBySku($query: String!) {
          productVariants(first: 1, query: $query) {
            edges { node { id legacyResourceId sku } }
          }
        }
      `;
      const response = await client.post('/graphql.json', {
        query,
        variables: { query: `sku:${sku}` }
      });

      const edges = response.data.data?.productVariants?.edges || [];
      if (edges.length === 0) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      const variantId = edges[0].node.legacyResourceId;
      return await this.updateVariantWeight(variantId, weightInGrams);
    } catch (error) {
      console.error('Error updating variant weight by SKU (GraphQL):', error.message);
      return await this.updateVariantWeightBySkuREST(sku, weightInGrams);
    }
  }

  async updateVariantWeightBySkuREST(sku, weightInGrams) {
    try {
      const client = await this.getClient();
      let allProducts = [];
      let hasNextPage = true;
      let pageInfo = null;

      while (hasNextPage && allProducts.length < 20000) {
        const params = { limit: 250, fields: 'id,variants' };
        if (pageInfo) params.page_info = pageInfo;

        const response = await client.get('/products.json', { params });
        allProducts = allProducts.concat(response.data.products);

        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
          pageInfo = match ? match[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      }

      let variantId = null;
      for (const product of allProducts) {
        const variant = product.variants.find(v => v.sku === sku);
        if (variant) { variantId = variant.id; break; }
      }

      if (!variantId) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      return await this.updateVariantWeight(variantId, weightInGrams);
    } catch (error) {
      console.error('Error updating variant weight by SKU (REST):', error.message);
      throw error;
    }
  }

  async getOrder(orderId) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/orders/${orderId}.json`);
      return response.data.order;
    } catch (error) {
      console.error('Error fetching order:', error.response?.data || error.message);
      throw error;
    }
  }

  async fulfillOrder(orderId, lineItems) {
    try {
      const client = await this.getClient();
      const response = await client.post(`/orders/${orderId}/fulfillments.json`, {
        fulfillment: {
          line_items: lineItems.map(item => ({ id: item.id, quantity: item.quantity })),
          notify_customer: true
        }
      });
      return response.data.fulfillment;
    } catch (error) {
      console.error('Error fulfilling order:', error.response?.data || error.message);
      throw error;
    }
  }

  async createWebhook(topic, address) {
    try {
      const client = await this.getClient();
      const response = await client.post('/webhooks.json', {
        webhook: { topic, address, format: 'json' }
      });
      return response.data.webhook;
    } catch (error) {
      console.error('Error creating webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  async listWebhooks() {
    try {
      const client = await this.getClient();
      const response = await client.get('/webhooks.json');
      return response.data.webhooks;
    } catch (error) {
      console.error('Error listing webhooks:', error.response?.data || error.message);
      throw error;
    }
  }

  async deleteWebhook(webhookId) {
    try {
      const client = await this.getClient();
      await client.delete(`/webhooks/${webhookId}.json`);
      return true;
    } catch (error) {
      console.error('Error deleting webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  async getFulfillmentOrders(shopifyOrderId) {
    try {
      const client = await this.getClient();
      let numericId = shopifyOrderId;
      if (shopifyOrderId.startsWith('gid://')) {
        numericId = shopifyOrderId.split('/').pop();
      }

      console.log(`\nFetching fulfillment orders for: ${numericId}`);

      const response = await client.get(`/orders/${numericId}/fulfillment_orders.json`);
      const fulfillmentOrders = response.data?.fulfillment_orders || [];

      console.log(`✓ Found ${fulfillmentOrders.length} fulfillment order(s)`);
      fulfillmentOrders.forEach((fo, i) => {
        console.log(`  FO[${i}] id=${fo.id} status=${fo.status} assigned_location=${fo.assigned_location?.name}`);
      });

      return fulfillmentOrders.map(fo => ({
        id: `gid://shopify/FulfillmentOrder/${fo.id}`,
        status: fo.status?.toUpperCase(),
        assignedLocation: fo.assigned_location
      }));
    } catch (error) {
      console.error('Error fetching fulfillment orders:', error.response?.data || error.message);
      throw error;
    }
  }

  async createFulfillment({ fulfillmentOrderId, trackingNumber, trackingCompany = 'Canada Post' }) {
    try {
      const client = await this.getClient();
      console.log(`\nCreating fulfillment for: ${fulfillmentOrderId}`);
      console.log(`Tracking: ${trackingCompany} ${trackingNumber}`);

      const trackingUrl = `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${trackingNumber}`;

      const mutation = `
        mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id status trackingInfo { company number url } }
            userErrors { field message }
          }
        }
      `;

      const variables = {
        fulfillment: {
          notifyCustomer: false,
          trackingInfo: { company: trackingCompany, number: trackingNumber, url: trackingUrl },
          lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }]
        }
      };

      const response = await client.post('/graphql.json', { query: mutation, variables });

      const result = response.data?.data?.fulfillmentCreate;
      const userErrors = result?.userErrors || [];
      if (userErrors.length > 0) {
        const errorMsg = userErrors.map(e => `${e.field}: ${e.message}`).join('; ');
        throw new Error(`Shopify fulfillment error: ${errorMsg}`);
      }

      const fulfillment = result?.fulfillment;
      console.log(`✓ Fulfillment created: ${fulfillment?.id}`);
      console.log(`  Status: ${fulfillment?.status}`);
      return fulfillment;
    } catch (error) {
      console.error('Error creating fulfillment:', error.response?.data || error.message);
      throw error;
    }
  }

  async updateOrderMetafield(orderId, namespace, key, value, type = 'boolean') {
    try {
      const client = await this.getClient();
      console.log(`\n========== UPDATING ORDER METAFIELD ==========`);
      console.log(`Order ID: ${orderId}, Key: ${namespace}.${key}, Value: ${value}`);

      const existingMetafieldsResponse = await client.get(`/orders/${orderId}/metafields.json`);
      const existingMetafields = existingMetafieldsResponse.data.metafields || [];
      const existingMetafield = existingMetafields.find(
        m => m.namespace === namespace && m.key === key
      );

      let response;
      if (existingMetafield) {
        response = await client.put(`/orders/${orderId}/metafields/${existingMetafield.id}.json`, {
          metafield: { id: existingMetafield.id, value: String(value), type }
        });
      } else {
        response = await client.post(`/orders/${orderId}/metafields.json`, {
          metafield: { namespace, key, value: String(value), type }
        });
      }

      console.log(`✓ Order metafield updated successfully`);
      console.log(`=============================================\n`);
      return response.data.metafield;
    } catch (error) {
      console.error('✗ Error updating order metafield:', error.response?.data || error.message);
      console.log(`=============================================\n`);
      throw error;
    }
  }
}

module.exports = new ShopifyClient();
```


## server/websocket.js

```javascript
const { WebSocketServer } = require('ws');

let wss = null;
const connectedAgents = new Set();

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws/print-agent' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WebSocket] Print agent connected from ${ip}`);
    connectedAgents.add(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.type === 'print_done') {
          console.log(`[WebSocket] Print agent confirmed print for order: ${msg.orderName}`);
        }
      } catch (e) {
        console.error('[WebSocket] Invalid message from agent:', e.message);
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Print agent disconnected from ${ip}`);
      connectedAgents.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Agent error:', err.message);
      connectedAgents.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', message: 'Hera Fulfiller print agent connected' }));
  });

  console.log('[WebSocket] Print agent server initialized at /ws/print-agent');
}

// Broadcast label PDF to all connected print agents
function broadcastLabelPrint({ orderName, trackingNumber, pdfBase64 }) {
  if (connectedAgents.size === 0) {
    console.warn('[WebSocket] No print agents connected — label will not be printed');
    return;
  }

  const message = JSON.stringify({
    type: 'print_label',
    orderName,
    trackingNumber,
    pdfBase64
  });

  let sent = 0;
  connectedAgents.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
      sent++;
    }
  });

  console.log(`[WebSocket] Label print broadcast sent to ${sent} agent(s) for order ${orderName}`);
}

function getConnectedAgentCount() {
  return connectedAgents.size;
}

module.exports = { initWebSocket, broadcastLabelPrint, getConnectedAgentCount };
```


## server/routes/packer.js

```javascript
const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Unified function to calculate order status
function calculateOrderStatus(order, lineItems, transferItems) {
  if (order.status === 'holding') {
    return 'holding';
  }

  // 如果有 transferring 或 waiting 状态的 transfer item，订单状态为 waiting
  const waitingOrTransferringItems = transferItems.filter(ti => 
    ti.status === 'waiting' || ti.status === 'transferring'
  );
  if (waitingOrTransferringItems.length > 0) {
    return 'waiting';
  }

  const allReady = lineItems.length > 0 && lineItems.every(item => item.packer_status === 'ready');
  if (allReady) {
    return 'ready';
  }

  return 'packing';
}

// Get all orders for packer
router.get('/orders', async (req, res) => {
  try {
    const orders = await db.prepare(`
      SELECT * FROM orders 
      WHERE fulfillment_status != 'fulfilled'
      ORDER BY created_at DESC
    `).all();

    const ordersWithDetails = await Promise.all(orders.map(async (order) => {
      const lineItems = await db.prepare(`
        SELECT * FROM line_items 
        WHERE shopify_order_id = ?
        ORDER BY id
      `).all(order.shopify_order_id);

      const transferItems = await db.prepare(`
        SELECT ti.*, li.id as line_item_id
        FROM transfer_items ti
        JOIN line_items li ON ti.line_item_id = li.id
        WHERE ti.shopify_order_id = ?
      `).all(order.shopify_order_id);

      // 使用永久标记检查 weight warning
      const hasWeightWarning = lineItems.some(item => item.has_weight_warning === 1);

      // 🆕 检查是否有 out_of_stock items
      const hasOutOfStock = transferItems.some(ti => ti.out_of_stock === 1);

      const orderStatus = calculateOrderStatus(order, lineItems, transferItems);

      let transferInfo = null;
      // 获取所有 waiting 状态的 item
      const waitingItems = transferItems.filter(ti => ti.status === 'waiting');
      
      if (waitingItems.length > 0) {
        const totalQuantity = waitingItems.reduce((sum, item) => sum + item.quantity, 0);
        
        // 获取所有不同的 transfer_from，去重并过滤空值
        const transferFroms = [...new Set(waitingItems.map(item => item.transfer_from))].filter(Boolean);
        
        // 找到最晚的日期
        const latestDate = waitingItems.reduce((latest, item) => {
          if (!item.estimate_month || !item.estimate_day) return latest;
          const itemDate = item.estimate_month * 100 + item.estimate_day;
          return itemDate > latest ? itemDate : latest;
        }, 0);

        transferInfo = {
          quantity: totalQuantity,
          transferFroms: transferFroms, // 所有的 transfer_from
          estimateMonth: Math.floor(latestDate / 100),
          estimateDay: latestDate % 100
        };
      }

      const transferringItems = transferItems.filter(ti => ti.status === 'transferring');

      return {
        ...order,
        lineItems,
        hasWeightWarning,
        hasOutOfStock, // 🆕 添加 out of stock 标记
        orderStatus,
        hasTransferring: transferringItems.length > 0,
        hasWaiting: waitingItems.length > 0,
        transferInfo
      };
    }));

    res.json(ordersWithDetails);
  } catch (error) {
    console.error('Error fetching packer orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders: ' + error.message });
  }
});

// Get single order details
router.get('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    
    const order = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const lineItems = await db.prepare(`
      SELECT * FROM line_items 
      WHERE shopify_order_id = ?
      ORDER BY id
    `).all(shopifyOrderId);

    const lineItemsWithTransfer = await Promise.all(lineItems.map(async (item) => {
      const transferItem = await db.prepare(`
        SELECT * FROM transfer_items 
        WHERE line_item_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(item.id);

      return {
        ...item,
        transferStatus: transferItem?.status || null,
        outOfStock: transferItem?.out_of_stock === 1, // 🆕 添加 out of stock 状态
        transferInfo: transferItem ? {
          transferFrom: transferItem.transfer_from,
          estimateMonth: transferItem.estimate_month,
          estimateDay: transferItem.estimate_day,
          quantity: transferItem.quantity
        } : null
      };
    }));

    res.json({
      ...order,
      lineItems: lineItemsWithTransfer
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details: ' + error.message });
  }
});

// Update order status (holding/packing)
router.patch('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

router.patch('/orders/:shopifyOrderId/status', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

// 🆕 Add or update note
router.patch('/orders/:shopifyOrderId/note', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { note } = req.body;

    // Note 可以为空字符串（删除 note）
    if (note === undefined) {
      return res.status(400).json({ error: 'Note is required' });
    }

    // 限制 50 字符
    if (note.length > 50) {
      return res.status(400).json({ error: 'Note must be 50 characters or less' });
    }

    await db.prepare(`
      UPDATE orders 
      SET packer_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(note, shopifyOrderId);

    res.json({ success: true, note });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note: ' + error.message });
  }
});

// 🆕 Delete order (完全从 APP 中删除订单)
router.delete('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;

    console.log(`Deleting order ${shopifyOrderId} from APP`);

    // ⚠️ 不删除 transfer_items！
    // await db.prepare('DELETE FROM transfer_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 line_items
    await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 order
    await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);

    console.log(`✓ Order ${shopifyOrderId} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order: ' + error.message });
  }
});

router.patch('/items/:id/packer-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE line_items 
      SET packer_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item packer status:', error);
    res.status(500).json({ error: 'Failed to update item status: ' + error.message });
  }
});

// 🆕 Complete order - with optional Pack & Label It flow
router.post('/orders/:shopifyOrderId/complete', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { boxType, weight } = req.body;

    console.log('\n========== ORDER COMPLETION START ==========');
    console.log(`Shopify Order ID parameter: ${shopifyOrderId}`);

    if (!boxType) {
      return res.status(400).json({ error: 'Box type is required' });
    }

    // 获取订单信息
    const order = await db.prepare(
      'SELECT * FROM orders WHERE shopify_order_id = ?'
    ).get(shopifyOrderId);

    if (!order) {
      console.log('✗ Order not found in database');
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`Order found: ${order.name}`);

    // 获取 box type 详情（含 dimensions）
    const boxTypeRecord = await db.prepare(
      'SELECT * FROM box_types WHERE code = ?'
    ).get(boxType);

    // 更新订单状态
    await db.prepare(`
      UPDATE orders 
      SET box_type = ?, weight = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(boxType, weight || null, shopifyOrderId);

    // 更新 box type 使用统计
    await db.prepare(`
      UPDATE box_types 
      SET usage_count = usage_count + 1,
          quantity = CASE WHEN quantity > 0 THEN quantity - 1 ELSE quantity END
      WHERE code = ?
    `).run(boxType);

    console.log(`✓ Box type ${boxType} usage count updated`);

    // 提取真正的 Shopify Order ID（数字格式）
    let realShopifyOrderId = shopifyOrderId;
    if (shopifyOrderId.includes('gid://shopify/Order/')) {
      realShopifyOrderId = shopifyOrderId.split('gid://shopify/Order/')[1];
    } else if (shopifyOrderId.includes('/')) {
      realShopifyOrderId = shopifyOrderId.split('/').pop();
    }

    const shopifyClient = require('../shopify/client');

    // 更新 Shopify metafields（non-critical，不阻止主流程）
    try {
      await shopifyClient.updateOrderMetafield(realShopifyOrderId, 'custom', 'ready', 'true', 'boolean');
      await shopifyClient.updateOrderMetafield(realShopifyOrderId, 'custom', 'packed_time', new Date().toISOString(), 'date_time');
      await shopifyClient.updateOrderMetafield(realShopifyOrderId, 'custom', 'package', boxType, 'single_line_text_field');
      if (weight) {
        await shopifyClient.updateOrderMetafield(
          realShopifyOrderId, 'custom', 'weight',
          JSON.stringify({ value: parseFloat(weight), unit: 'g' }), 'weight'
        );
      }
      console.log(`✓ Shopify metafields updated for ${order.name}`);
    } catch (metafieldError) {
      console.error('⚠️ Error updating Shopify metafields (non-critical):', metafieldError.message);
    }

    // ===== PACK & LABEL IT FLOW =====
    // 检查是否启用了 pack_label_enabled
    const packLabelSetting = await db.prepare(
      "SELECT value FROM settings WHERE key = 'pack_label_enabled'"
    ).get();
    const packLabelEnabled = packLabelSetting?.value === 'true';

    if (!packLabelEnabled) {
      console.log('Pack & Label It is disabled, skipping label purchase');
      console.log('========== ORDER COMPLETION END ==========\n');
      return res.json({ success: true, packLabel: false });
    }

    console.log('Pack & Label It is enabled, proceeding with label purchase...');

    // 获取 sender 地址设置
    const senderSettings = await db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('sender_company','sender_contact','sender_address1','sender_address2','sender_city','sender_province','sender_postal_code')"
    ).all();
    const senderMap = {};
    senderSettings.forEach(s => { senderMap[s.key] = s.value; });

    const senderInfo = {
      company: senderMap.sender_company || 'HERA BEAUTÉ',
      contact: senderMap.sender_contact || '',
      address1: senderMap.sender_address1 || '',
      address2: senderMap.sender_address2 || '',
      city: senderMap.sender_city || '',
      province: senderMap.sender_province || '',
      postalCode: senderMap.sender_postal_code || ''
    };

    // 获取 label options（预设的 optional services）
    let labelOptions = {};
    if (order.label_options) {
      try { labelOptions = JSON.parse(order.label_options); } catch {}
    }

    // 计算实际使用的 weight（grams）
    // 如果用户在 modal 填了 weight，用那个；否则用所有 line items 的 weight 之和
    let totalWeightGrams = weight ? parseFloat(weight) : 0;
    if (!totalWeightGrams) {
      const lineItems = await db.prepare(
        'SELECT weight, weight_unit, quantity FROM line_items WHERE shopify_order_id = ?'
      ).all(shopifyOrderId);
      totalWeightGrams = lineItems.reduce((sum, item) => {
        const w = item.weight_unit === 'g' ? item.weight : item.weight * 1000;
        return sum + (w * item.quantity);
      }, 0);
    }
    // 最小 weight 50g，避免 API 报错
    if (totalWeightGrams < 50) totalWeightGrams = 50;

    // ── Step 1: Canada Post Create Shipment ──
    let labelResult = null;
    let labelStatus = 'failed';
    let labelError = null;
    let labelTrackingNumber = null;

    try {
      const canadaPostClient = require('../canadapost/client');
      labelResult = await canadaPostClient.createShipment({
        order,
        boxType: boxTypeRecord,
        weightGrams: totalWeightGrams,
        labelOptions,
        senderInfo
      });
      labelStatus = 'success';
      labelTrackingNumber = labelResult.trackingPin;
      console.log(`✓ Canada Post label created. Tracking: ${labelTrackingNumber}`);
    } catch (cpError) {
      labelError = cpError.message;
      console.error('✗ Canada Post label creation failed:', cpError.message);
    }

    // 更新 label 状态到数据库
    await db.prepare(`
      UPDATE orders 
      SET label_status = ?, label_error = ?, label_tracking_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(labelStatus, labelError, labelTrackingNumber, shopifyOrderId);

    // 如果 label 失败，停止流程，订单留在 fulfiller
    if (labelStatus === 'failed') {
      console.log('========== ORDER COMPLETION END (label failed) ==========\n');
      return res.json({
        success: false,
        packLabel: true,
        labelStatus: 'failed',
        labelError,
        fulfillStatus: null
      });
    }

    // ── Step 2: Shopify Fulfill + Canada Post Fulfill（并行）──
    let fulfillStatus = 'failed';
    let fulfillError = null;

    // 并行执行：Shopify fulfill 和 WebSocket 推送 label（打印）
    const fulfillPromise = (async () => {
      try {
        const fulfillmentOrders = await shopifyClient.getFulfillmentOrders(shopifyOrderId);
        const openFulfillmentOrder = fulfillmentOrders.find(fo => 
          fo.status === 'OPEN' || fo.status === 'IN_PROGRESS'
        );
        if (!openFulfillmentOrder) {
          throw new Error('No open fulfillment order found');
        }
        await shopifyClient.createFulfillment({
          fulfillmentOrderId: openFulfillmentOrder.id,
          trackingNumber: labelTrackingNumber
        });
        fulfillStatus = 'success';
        console.log(`✓ Shopify order fulfilled with tracking: ${labelTrackingNumber}`);
      } catch (fulfillErr) {
        fulfillError = fulfillErr.message;
        console.error('✗ Shopify fulfillment failed:', fulfillErr.message);
      }
    })();

    // WebSocket 推送 label PDF 给打印机 agent（fire and forget）
    const printPromise = (async () => {
      try {
        const { broadcastLabelPrint } = require('../websocket');
        if (labelResult?.labelHref) {
          const canadaPostClient = require('../canadapost/client');
          const pdfBuffer = await canadaPostClient.getLabelPdf(labelResult.labelHref);
          broadcastLabelPrint({
            orderName: order.name,
            trackingNumber: labelTrackingNumber,
            pdfBase64: pdfBuffer.toString('base64')
          });
          console.log(`✓ Label PDF pushed to print agent for ${order.name}`);
        }
      } catch (printErr) {
        console.error('⚠️ Label print push failed (non-critical):', printErr.message);
      }
    })();

    // 等待 fulfill 完成（print 是 fire-and-forget）
    await fulfillPromise;
    printPromise.catch(() => {}); // suppress unhandled rejection

    // 更新 fulfill 状态到数据库
    await db.prepare(`
      UPDATE orders 
      SET fulfill_status = ?, fulfill_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(fulfillStatus, fulfillError, shopifyOrderId);

    // 如果 fulfill 成功，删除订单（webhook 会处理，但以防万一也手动删）
    // 实际上 Shopify 的 order/fulfilled webhook 会触发删除，这里不重复删
    // 只返回状态让前端决定如何跳转

    console.log('========== ORDER COMPLETION END ==========\n');

    return res.json({
      success: true,
      packLabel: true,
      labelStatus,
      labelTrackingNumber,
      fulfillStatus,
      fulfillError: fulfillStatus === 'failed' ? fulfillError : null
    });

  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).json({ error: 'Failed to complete order: ' + error.message });
  }
});

// 🆕 Get label options for an order
router.get('/orders/:shopifyOrderId/label-options', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const order = await db.prepare(
      'SELECT label_options, label_status, label_error, label_tracking_number, fulfill_status, fulfill_error FROM orders WHERE shopify_order_id = ?'
    ).get(shopifyOrderId);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    let labelOptions = {};
    if (order.label_options) {
      try { labelOptions = JSON.parse(order.label_options); } catch {}
    }

    res.json({
      labelOptions,
      labelStatus: order.label_status,
      labelError: order.label_error,
      labelTrackingNumber: order.label_tracking_number,
      fulfillStatus: order.fulfill_status,
      fulfillError: order.fulfill_error
    });
  } catch (error) {
    console.error('Error fetching label options:', error);
    res.status(500).json({ error: 'Failed to fetch label options: ' + error.message });
  }
});

// 🆕 Save label options for an order
router.patch('/orders/:shopifyOrderId/label-options', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { labelOptions } = req.body;

    await db.prepare(`
      UPDATE orders 
      SET label_options = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(JSON.stringify(labelOptions || {}), shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving label options:', error);
    res.status(500).json({ error: 'Failed to save label options: ' + error.message });
  }
});

// 🆕 Manifest management - get all untransmitted shipments grouped by date
router.get('/manifest/pending', async (req, res) => {
  try {
    const orders = await db.prepare(`
      SELECT name, label_tracking_number, label_status, created_at, box_type, weight
      FROM orders 
      WHERE label_status = 'success' 
        AND fulfill_status = 'success'
        AND manifest_transmitted = 0
      ORDER BY created_at DESC
    `).all();

    // Group by date (group-id format HERA-YYYYMMDD)
    const groups = {};
    orders.forEach(order => {
      const date = new Date(order.created_at);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const groupId = `HERA-${y}${m}${d}`;
      if (!groups[groupId]) groups[groupId] = { groupId, date: `${y}-${m}-${d}`, orders: [] };
      groups[groupId].orders.push(order);
    });

    res.json({ groups: Object.values(groups).sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (error) {
    console.error('Error fetching pending manifests:', error);
    res.status(500).json({ error: 'Failed to fetch pending manifests: ' + error.message });
  }
});

// 🆕 Generate manifest - transmit all pending shipments
router.post('/manifest/generate', async (req, res) => {
  try {
    // 获取 sender 设置
    const senderSettings = await db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('sender_company','sender_contact','sender_address1','sender_address2','sender_city','sender_province','sender_postal_code')"
    ).all();
    const senderMap = {};
    senderSettings.forEach(s => { senderMap[s.key] = s.value; });

    const senderInfo = {
      company: senderMap.sender_company || 'HERA BEAUTÉ',
      contact: senderMap.sender_contact || '',
      address1: senderMap.sender_address1 || '',
      address2: senderMap.sender_address2 || '',
      city: senderMap.sender_city || '',
      province: senderMap.sender_province || '',
      postalCode: senderMap.sender_postal_code || ''
    };

    // 获取所有未 transmit 的 shipment 的 group-ids
    const orders = await db.prepare(`
      SELECT name, label_tracking_number, created_at
      FROM orders 
      WHERE label_status = 'success' 
        AND fulfill_status = 'success'
        AND (manifest_transmitted = 0 OR manifest_transmitted IS NULL)
    `).all();

    if (orders.length === 0) {
      return res.status(400).json({ error: 'No pending shipments to transmit' });
    }

    // 收集所有唯一的 group-ids
    const groupIds = new Set();
    orders.forEach(order => {
      const date = new Date(order.created_at);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      groupIds.add(`HERA-${y}${m}${d}`);
    });

    console.log(`Transmitting ${orders.length} shipments across ${groupIds.size} group(s):`, [...groupIds]);

    const canadaPostClient = require('../canadapost/client');

    // Transmit all groups together
    const manifestLinks = await canadaPostClient.transmitShipments([...groupIds], senderInfo);

    if (manifestLinks.length === 0) {
      throw new Error('No manifest links returned from Canada Post');
    }

    // Download first manifest PDF
    const manifestPdf = await canadaPostClient.getManifestPdf(manifestLinks[0]);

    // Mark orders as transmitted
    await db.prepare(`
      UPDATE orders 
      SET manifest_transmitted = 1, updated_at = CURRENT_TIMESTAMP
      WHERE label_status = 'success' 
        AND fulfill_status = 'success'
        AND (manifest_transmitted = 0 OR manifest_transmitted IS NULL)
    `).run();

    console.log(`✓ Manifest generated. ${orders.length} shipments transmitted.`);

    // Return PDF as base64 for download
    res.json({
      success: true,
      shipmentCount: orders.length,
      groupCount: groupIds.size,
      manifestPdfBase64: manifestPdf.toString('base64')
    });

  } catch (error) {
    console.error('Error generating manifest:', error);
    res.status(500).json({ error: 'Failed to generate manifest: ' + error.message });
  }
});

router.patch('/items/:id/update-weight', async (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    console.log('\n========== WEIGHT UPDATE REQUEST ==========');
    console.log(`Item ID: ${id}`);
    console.log(`New weight: ${weight}g`);

    if (!weight || weight <= 0) {
      console.log('✗ Invalid weight value');
      return res.status(400).json({ error: 'Valid weight is required' });
    }

    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      console.log('✗ Item not found in database');
      return res.status(404).json({ error: 'Item not found' });
    }

    console.log('Item details:');
    console.log(`  SKU: ${item.sku || 'N/A'}`);
    console.log(`  Brand: ${item.brand || 'N/A'}`);
    console.log(`  Title: ${item.title || 'N/A'}`);
    console.log(`  Current weight: ${item.weight}${item.weight_unit}`);
    console.log(`  Has weight warning: ${item.has_weight_warning}`);

    // 只更新 weight 和 weight_unit，不改变 has_weight_warning
    await db.prepare(`
      UPDATE line_items 
      SET weight = ?, weight_unit = 'g', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(weight, id);

    console.log('✓ Local database updated successfully');

    let shopifyUpdateSuccess = false;
    let shopifyError = null;

    if (item.sku) {
      try {
        console.log(`\nAttempting Shopify update for SKU: ${item.sku}`);
        const shopifyClient = require('../shopify/client');
        const result = await shopifyClient.updateVariantWeightBySku(item.sku, weight);
        shopifyUpdateSuccess = true;
        console.log('✓ Shopify update SUCCESS');
        console.log('Updated variant details:');
        console.log(`  Variant ID: ${result.id}`);
        console.log(`  Weight: ${result.weight}${result.weight_unit}`);
      } catch (shopifyErr) {
        shopifyError = shopifyErr.message;
        console.error('✗ Shopify update FAILED');
        console.error('Error message:', shopifyErr.message);
        if (shopifyErr.response) {
          console.error('Response status:', shopifyErr.response.status);
          console.error('Response data:', JSON.stringify(shopifyErr.response.data, null, 2));
        }
        console.error('Full error stack:', shopifyErr.stack);
      }
    } else {
      console.log('⚠ No SKU found for this item, skipping Shopify update');
    }

    console.log('========================================\n');

    res.json({ 
      success: true,
      shopifyUpdated: shopifyUpdateSuccess,
      shopifyError: shopifyError
    });
  } catch (error) {
    console.error('Error updating weight:', error);
    res.status(500).json({ error: 'Failed to update weight: ' + error.message });
  }
});

module.exports = router;
```


## server/routes/picker.js

```javascript
const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

// 🆕 批量查询多个 SKU 在 MTL10 的库存
async function getBatchMTL10Inventory(skus) {
  try {
    if (!skus || skus.length === 0) return {};
    
    // 去重 SKU
    const uniqueSkus = [...new Set(skus.filter(sku => sku))];
    
    if (uniqueSkus.length === 0) return {};
    
    console.log(`📦 Fetching MTL10 inventory for ${uniqueSkus.length} SKUs`);
    
    // 使用 GraphQL 批量查询（每次最多 50 个）
    const results = {};
    const batchSize = 50;
    
    for (let i = 0; i < uniqueSkus.length; i += batchSize) {
      const batch = uniqueSkus.slice(i, i + batchSize);
      
      // 构建查询字符串：(sku:123 OR sku:456 OR sku:789)
      const skuQuery = batch.map(sku => `sku:${sku}`).join(' OR ');
      
      const query = `
        query getInventoryBatch($query: String!) {
          productVariants(first: 50, query: $query) {
            edges {
              node {
                id
                sku
                metafields(first: 10, namespace: "custom") {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
                product {
                  id
                }
                inventoryItem {
                  id
                  inventoryLevels(first: 50) {
                    edges {
                      node {
                        location {
                          name
                        }
                        quantities(names: ["on_hand"]) {
                          name
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const client = await shopifyClient.getClient();
      const response = await client.post('/graphql.json', {
        query,
        variables: { query: skuQuery }
      });

      const edges = response.data.data?.productVariants?.edges || [];
      
      // 处理每个 variant
      edges.forEach(edge => {
        const sku = edge.node.sku;
        const inventoryLevels = edge.node.inventoryItem?.inventoryLevels?.edges || [];
        
        // 🆕 从 variant metafields 提取 discontinued（不是 product）
        const metafields = edge.node.metafields?.edges || [];
        
        // 🔍 调试：打印所有 metafields
        console.log(`\n=== SKU ${sku} - All Metafields ===`);
        console.log(`Total metafields: ${metafields.length}`);
        metafields.forEach((mf, index) => {
          console.log(`  [${index}] key: "${mf.node.key}", value: "${mf.node.value}" (type: ${typeof mf.node.value})`);
        });
        
        const discontinuedMetafield = metafields.find(m => m.node.key === 'discontinued');
        
        // 调试：打印 discontinued metafield
        if (discontinuedMetafield) {
          console.log(`✓ Found discontinued metafield:`, discontinuedMetafield.node);
          console.log(`  Raw value: ${discontinuedMetafield.node.value}`);
          console.log(`  Type: ${typeof discontinuedMetafield.node.value}`);
        } else {
          console.log(`✗ No discontinued metafield found`);
        }
        
        // 忽略大小写判断：true, True, TRUE 都算 true
        let isDiscontinued = false;
        if (discontinuedMetafield?.node?.value) {
          const value = discontinuedMetafield.node.value;
          // 布尔值 true 或字符串 "true" (忽略大小写)
          isDiscontinued = value === true || 
                          String(value).toLowerCase() === 'true';
        }
        
        console.log(`Final result - isDiscontinued: ${isDiscontinued}`);
        
        // 查找 MTL10 的库存
        for (const level of inventoryLevels) {
          if (level.node.location.name === 'MTL10') {
            const onHandQty = level.node.quantities?.find(q => q.name === 'on_hand');
            if (onHandQty) {
              results[sku] = {
                quantity: onHandQty.quantity,
                discontinued: isDiscontinued
              };
            }
            break;
          }
        }
        
        // 如果没有 MTL10 库存但有 discontinued 信息，也记录
        if (!results[sku] && isDiscontinued) {
          results[sku] = {
            quantity: 0,
            discontinued: true
          };
        }
      });
      
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: Processed ${batch.length} SKUs`);
    }
    
    console.log(`✓ Fetched MTL10 inventory for ${Object.keys(results).length}/${uniqueSkus.length} SKUs`);
    return results;
  } catch (error) {
    console.error('❌ Error fetching batch MTL10 inventory:', error.message);
    return {};
  }
}

// Get all line items for picker
router.get('/items', async (req, res) => {
  try {
    const items = await db.prepare(`
      SELECT 
        li.*,
        o.name as order_name,
        o.shipping_code
      FROM line_items li
      JOIN orders o ON li.shopify_order_id = o.shopify_order_id
      WHERE o.fulfillment_status != 'fulfilled'
      ORDER BY li.created_at DESC
    `).all();

    // 🆕 处理 WIG 类型的显示
    const processedItems = items.map(item => {
      let displayType = item.product_type;
      
      // 如果是 WIG 类型且有 wig_number，用 wig_number 替换显示
      if (item.product_type && item.product_type.toUpperCase() === 'WIG' && item.wig_number) {
        displayType = item.wig_number;
        console.log(`Replaced WIG with ${displayType} for item ${item.id}`);
      }

      return {
        ...item,
        display_type: displayType,
        sort_type: item.product_type // 排序时仍使用原始的 product_type
      };
    });

    res.json(processedItems);
  } catch (error) {
    console.error('Error fetching picker items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item status — with optimistic locking and transfer cleanup
router.patch('/items/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, version } = req.body;

    // ── Optimistic locking ──────────────────────────────────────────────────
    // If version is provided, check for conflicts
    if (version !== undefined && version !== null) {
      const current = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
      if (!current) return res.status(404).json({ error: 'Item not found' });

      if (current.version !== version) {
        // Conflict — return current state so frontend can show the right message
        return res.status(409).json({
          conflict: true,
          currentStatus: current.picker_status,
          currentVersion: current.version,
          message: `Item status has been changed by another user`
        });
      }
    }

    // Fetch current item before update
    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const previousStatus = item.picker_status;

    // Update status and increment version
    await db.prepare(`
      UPDATE line_items 
      SET picker_status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    // ── Handle picking (undo) → delete transferring item immediately ──────────
    // When a missing item is undone, immediately remove its transferring entry
    if (status === 'picking') {
      const transferringItem = await db.prepare(
        "SELECT id FROM transfer_items WHERE line_item_id = ? AND status = 'transferring'"
      ).get(id);
      if (transferringItem) {
        await db.prepare("DELETE FROM transfer_items WHERE id = ?").run(transferringItem.id);
        console.log(`Undo: deleted transferring item for line_item ${id}`);
      }
    }

    // ── Handle missing → create transfer item ───────────────────────────────
    if (status === 'missing') {
      // Check if a transferring item already exists to avoid duplicates
      const existingTransfer = await db.prepare(
        'SELECT id FROM transfer_items WHERE line_item_id = ? AND status = ?'
      ).get(id, 'transferring');

      if (!existingTransfer) {
        await db.prepare(`
          INSERT INTO transfer_items (
            line_item_id, shopify_order_id, order_number, quantity, sku, 
            image_url, title, name, brand, size, weight, weight_unit,
            url_handle, product_type, variant_title, custom_name, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
        `).run(
          item.id, item.shopify_order_id, item.order_number, item.quantity, item.sku,
          item.image_url, item.title, item.name, item.brand, item.size, item.weight, item.weight_unit,
          item.url_handle, item.product_type, item.variant_title, item.custom_name
        );
      }
    }

    // ── Handle picked → warn if waiting transfer exists ─────────────────────
    // Note: no auto-delete of transferring here — undo (picking) handles that
    let transferWarning = null;
    if (status === 'picked') {
      const waitingItem = await db.prepare(
        "SELECT transfer_from FROM transfer_items WHERE line_item_id = ? AND status = 'waiting'"
      ).get(id);
      if (waitingItem) {
        transferWarning = {
          type: 'waiting',
          location: waitingItem.transfer_from
        };
      }
    }

    // Get updated item with new version
    const updated = await db.prepare('SELECT version, picker_status FROM line_items WHERE id = ?').get(id);

    res.json({ success: true, newVersion: updated.version, transferWarning });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/picker/active-users — returns count of active picker sessions
router.get('/active-users', async (req, res) => {
  try {
    // Clean up sessions older than 30 seconds
    try {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < NOW() - INTERVAL '30 seconds'"
      ).run();
    } catch {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < datetime('now', '-30 seconds')"
      ).run();
    }

    const result = await db.prepare('SELECT COUNT(*) as count FROM picker_sessions').get();
    res.json({ count: parseInt(result.count) || 0 });
  } catch (error) {
    res.json({ count: 0 });
  }
});

// POST /api/picker/heartbeat — register/refresh active session
router.post('/heartbeat', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.json({ success: false });

    await db.prepare(`
      INSERT INTO picker_sessions (session_id, last_seen)
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT (session_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP
    `).run(sessionId);

    // Clean up old sessions while we're here
    try {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < NOW() - INTERVAL '30 seconds'"
      ).run();
    } catch {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < datetime('now', '-30 seconds')"
      ).run();
    }

    const result = await db.prepare('SELECT COUNT(*) as count FROM picker_sessions').get();
    res.json({ success: true, activeUsers: parseInt(result.count) || 0 });
  } catch (error) {
    res.json({ success: false, activeUsers: 1 });
  }
});

// DELETE /api/picker/heartbeat — remove session on page unload
router.delete('/heartbeat', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      await db.prepare('DELETE FROM picker_sessions WHERE session_id = ?').run(sessionId);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// POST /api/picker/heartbeat/remove — remove session (used by sendBeacon and axios on unmount)
router.post('/heartbeat/remove', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      await db.prepare('DELETE FROM picker_sessions WHERE session_id = ?').run(sessionId);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// Split item (when quantity > 1 and partially picked)
router.post('/items/:id/split', async (req, res) => {
  try {
    const { id } = req.params;
    const { pickedQuantity } = req.body;

    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const missingQuantity = item.quantity - pickedQuantity;

    // Update original item to picked quantity
    await db.prepare(`
      UPDATE line_items 
      SET quantity = ?, picker_status = 'picked', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(pickedQuantity, id);

    // Create new item for missing quantity
    const newItem = await db.prepare(`
      INSERT INTO line_items (
        shopify_order_id, order_number, shopify_line_item_id, quantity,
        image_url, title, name, brand, size, weight, weight_unit, sku,
        url_handle, product_type, wig_number, custom_name, has_weight_warning, 
        variant_title, picker_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'missing', CURRENT_TIMESTAMP)
      RETURNING id
    `).get(
      item.shopify_order_id,
      item.order_number,
      item.shopify_line_item_id + '_split_' + Date.now(),
      missingQuantity,
      item.image_url,
      item.title,
      item.name,
      item.brand,
      item.size,
      item.weight,
      item.weight_unit,
      item.sku,
      item.url_handle,
      item.product_type,
      item.wig_number,
      item.custom_name,
      item.has_weight_warning,
      item.variant_title
    );

    // Create transfer item for missing quantity
    await db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku,
        image_url, title, name, brand, size, weight, weight_unit,
        url_handle, product_type, variant_title, custom_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
    `).run(
      newItem.id, item.shopify_order_id, item.order_number, missingQuantity, item.sku,
      item.image_url, item.title, item.name, item.brand, item.size, item.weight, item.weight_unit,
      item.url_handle, item.product_type, item.variant_title, item.custom_name
    );

    res.json({ success: true, newItemId: newItem.id });
  } catch (error) {
    console.error('Error splitting item:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 批量获取 MTL10 库存
router.post('/items/batch-mtl10-inventory', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.json({ inventory: {} });
    }
    
    console.log(`\n📦 Batch MTL10 inventory request for ${itemIds.length} items`);
    
    // 获取所有 items 的 SKU
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT id, sku FROM line_items WHERE id IN (${placeholders})`
    ).all(...itemIds);
    
    console.log(`  Found ${items.length} items in database`);
    
    // 提取所有 SKU
    const skus = items.map(item => item.sku).filter(sku => sku);
    
    if (skus.length === 0) {
      console.log(`  No SKUs to query`);
      return res.json({ inventory: {} });
    }
    
    // 批量查询 MTL10 库存
    const inventoryBySku = await getBatchMTL10Inventory(skus);
    
    // 将结果映射回 item ID
    const inventoryByItemId = {};
    items.forEach(item => {
      if (item.sku && inventoryBySku[item.sku] !== undefined) {
        inventoryByItemId[item.id] = inventoryBySku[item.sku];
      }
    });
    
    console.log(`✓ Returning inventory for ${Object.keys(inventoryByItemId).length} items\n`);
    
    res.json({ inventory: inventoryByItemId });
  } catch (error) {
    console.error('❌ Error in batch MTL10 inventory:', error);
    res.json({ inventory: {} });
  }
});

// 🆕 检查已完成的订单（用于 Clean 功能）
router.get('/check-fulfilled-orders', async (req, res) => {
  try {
    console.log('\n🧹 Checking for fulfilled orders...');
    
    // 获取所有在 Picker 中的 items 及其订单信息
    const items = await db.prepare(`
      SELECT 
        li.id,
        li.shopify_order_id,
        li.quantity,
        li.name,
        o.name as order_name,
        o.fulfillment_status
      FROM line_items li
      JOIN orders o ON li.shopify_order_id = o.shopify_order_id
      WHERE o.fulfillment_status != 'fulfilled'
    `).all();
    
    console.log(`  Found ${items.length} items in picker`);
    
    // 获取所有唯一的订单
    const uniqueOrders = [...new Set(items.map(item => item.shopify_order_id))];
    
    console.log(`  Checking ${uniqueOrders.length} unique orders in Shopify...`);
    
    // 查询 Shopify 获取最新的 fulfillment status
    const ordersToClean = [];
    const itemsToClean = [];
    
    for (const shopifyOrderId of uniqueOrders) {
      try {
        // 使用 REST API 查询订单状态
        const client = await shopifyClient.getClient();
        const response = await client.get(`/orders/${shopifyOrderId}.json`);
        const order = response.data.order;
        
        // 如果订单已完成（fulfillment_status 不是 null 且不是 unfulfilled）
        if (order.fulfillment_status && order.fulfillment_status !== 'unfulfilled') {
          console.log(`  ✓ Order ${order.name} is ${order.fulfillment_status}`);
          
          // 找到该订单的所有 items
          const orderItems = items.filter(item => item.shopify_order_id === shopifyOrderId);
          
          ordersToClean.push({
            shopify_order_id: shopifyOrderId,
            order_name: order.name,
            fulfillment_status: order.fulfillment_status,
            item_count: orderItems.length,
            total_quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0)
          });
          
          itemsToClean.push(...orderItems.map(item => item.id));
        }
      } catch (error) {
        console.error(`  ❌ Error checking order ${shopifyOrderId}:`, error.message);
      }
    }
    
    console.log(`✓ Found ${ordersToClean.length} orders to clean with ${itemsToClean.length} items\n`);
    
    res.json({
      orders: ordersToClean,
      item_ids: itemsToClean,
      total_items: itemsToClean.length,
      total_quantity: ordersToClean.reduce((sum, order) => sum + order.total_quantity, 0)
    });
  } catch (error) {
    console.error('❌ Error checking fulfilled orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 清理已完成订单的 items
router.post('/clean-fulfilled-items', async (req, res) => {
  try {
    const { item_ids } = req.body;
    
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.json({ success: true, deleted_count: 0 });
    }
    
    console.log(`\n🗑️ Cleaning ${item_ids.length} items from picker...`);
    
    // 删除 items
    const placeholders = item_ids.map(() => '?').join(',');
    const result = await db.prepare(
      `DELETE FROM line_items WHERE id IN (${placeholders})`
    ).run(...item_ids);
    
    console.log(`✓ Deleted ${result.changes} items\n`);
    
    res.json({
      success: true,
      deleted_count: result.changes
    });
  } catch (error) {
    console.error('❌ Error cleaning fulfilled items:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```


## server/routes/transfer.js

```javascript
const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

// Emoji mapping for transfer from
const EMOJI_MAP = {
  '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
  '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
};

// 🆕 固定的 location 列表
const LOCATIONS = [
  'MTL01',
  'MTL02',
  'MTL03',
  'MTL04',
  'MTL05',
  'MTL06',
  'MTL07',
  'MTL08',
  'MTL09',
  'MTL11'
];

// Get all transfer items
router.get('/items', async (req, res) => {
  try {
    // 🔧 FIX: 直接查询 transfer_items，不依赖 line_items（避免订单删除后 transfer items 查询不到）
    const items = await db.prepare(`
      SELECT * FROM transfer_items
      ORDER BY created_at DESC
    `).all();

    console.log(`Transfer: Found ${items.length} items`);
    res.json(items);
  } catch (error) {
    console.error('Error fetching transfer items:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 Get receiving filter options (transfer_from and transfer_date)
router.get('/receiving-options', async (req, res) => {
  try {
    // 获取所有 waiting 和 received 状态的 items
    const items = await db.prepare(`
      SELECT DISTINCT transfer_from, transfer_date
      FROM transfer_items
      WHERE (status = 'waiting' OR status = 'received') 
        AND transfer_from IS NOT NULL 
        AND transfer_date IS NOT NULL
      ORDER BY transfer_from ASC, transfer_date ASC
    `).all();

    // 提取唯一的 transfer_from 和 transfer_date
    const transferFroms = [...new Set(items.map(item => item.transfer_from))].sort();
    const transferDates = [...new Set(items.map(item => item.transfer_date))].sort();

    res.json({
      transferFroms,
      transferDates
    });
  } catch (error) {
    console.error('Error fetching receiving options:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get copy text for an item
router.get('/items/:id/copy-text', async (req, res) => {
  try {
    const { id } = req.params;
    // 🔧 FIX: 直接查询 transfer_items，不依赖 line_items（避免订单删除后查询失败）
    const item = await db.prepare(`
      SELECT * FROM transfer_items
      WHERE id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // 🆕 变量定义
    // A = emoji + transfer_from + emoji (只在 waiting 状态使用)
    // B = quantity (如果 > 1，用 "pcs"，否则用 "pc")
    // C = custom_name (优先级: custom_name > title)，WIG 类型在前面加 wig_number
    // D = SKU
    // E = order_number (只在 waiting 状态使用)

    const B = item.quantity;
    const pcText = B > 1 ? 'pcs' : 'pc';
    const D = item.sku || '';
    const E = item.order_number || '';

    // 对 WIG 类型，从 line_items 查 wig_number 并加在产品名前面
    let wigPrefix = '';
    if (item.product_type && item.product_type.toUpperCase() === 'WIG') {
      const lineItem = await db.prepare(
        'SELECT wig_number FROM line_items WHERE id = ?'
      ).get(item.line_item_id);
      if (lineItem?.wig_number) {
        wigPrefix = `${lineItem.wig_number} `;
      }
    }

    const C = `${wigPrefix}${item.custom_name || item.title || ''}`;

    let copyText = '';

    if (item.status === 'transferring') {
      // 格式: B pc(s) ----- C SKU D
      copyText = `${B} ${pcText} ----- ${C} SKU ${D}`;
    } else if (item.status === 'waiting') {
      // 格式: A  B pc(s) ----- C SKU D  #E
      const emoji = EMOJI_MAP[item.transfer_from] || '⬜';
      const A = `${emoji}${item.transfer_from}${emoji}`;
      copyText = `${A}  ${B} ${pcText} ----- ${C} SKU ${D}  #${E}`;
    }

    console.log(`Transfer: Copy text generated:`, copyText);

    res.json({ copyText });
  } catch (error) {
    console.error('Error generating copy text:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 生成库存报表
router.get('/stock-report', async (req, res) => {
  try {
    console.log('\n========== GENERATING STOCK REPORT ==========');

    // 1. 获取所有 transferring 状态的 items
    const transferringItems = await db.prepare(`
      SELECT sku, MAX(title) as title, SUM(quantity) as total_quantity
      FROM transfer_items
      WHERE status = 'transferring'
      GROUP BY sku
      ORDER BY MAX(title)
    `).all();

    console.log(`Found ${transferringItems.length} unique SKUs in transferring status`);

    if (transferringItems.length === 0) {
      console.log('❌ No transferring items found');
      return res.status(404).json({ 
        error: 'No transferring items found',
        message: 'There are no items in transferring status to generate a report for.'
      });
    }

    // 显示前几个 SKU
    console.log('First few SKUs:');
    transferringItems.slice(0, 3).forEach(item => {
      console.log(`  - ${item.sku}: ${item.title} (qty: ${item.total_quantity})`);
    });

    // 2. 为每个 SKU 查询 Shopify 库存
    const reportData = [];
    let successCount = 0;
    let failCount = 0;

    for (const item of transferringItems) {
      const inventoryData = await getInventoryBySku(item.sku);
      
      reportData.push({
        title: item.title,
        sku: item.sku,
        quantityNeeded: item.total_quantity,
        inventory: inventoryData
      });

      const locationCount = Object.keys(inventoryData).length;
      if (locationCount > 0) {
        successCount++;
        console.log(`✓ SKU ${item.sku}: ${locationCount} locations found`);
      } else {
        failCount++;
        console.log(`✗ SKU ${item.sku}: No inventory data`);
      }
    }

    console.log(`\n========== SUMMARY ==========`);
    console.log(`Total SKUs processed: ${transferringItems.length}`);
    console.log(`Successful: ${successCount} (with inventory data)`);
    console.log(`Failed: ${failCount} (no inventory data)`);
    console.log(`============================\n`);

    // 3. 生成 CSV
    const csv = generateCSV(reportData);

    // 4. 返回 CSV 文件
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stock-report-${Date.now()}.csv"`);
    res.send(csv);

    console.log('========== STOCK REPORT GENERATED SUCCESSFULLY ==========\n');
  } catch (error) {
    console.error('\n========== STOCK REPORT ERROR ==========');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('=======================================\n');
    
    res.status(500).json({ 
      error: 'Failed to generate stock report',
      message: error.message 
    });
  }
});

// 🆕 通过 SKU 查询库存（使用 GraphQL）
async function getInventoryBySku(sku) {
  try {
    console.log(`\n--- Querying inventory for SKU: ${sku} ---`);
    
    const query = `
      query getInventoryBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              inventoryItem {
                id
                inventoryLevels(first: 50) {
                  edges {
                    node {
                      location {
                        name
                      }
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const searchQuery = `sku:${sku}`;
    console.log(`GraphQL search query: "${searchQuery}"`);

    const client = await shopifyClient.getClient();
    const response = await client.post('/graphql.json', {
      query,
      variables: { query: searchQuery }
    });

    console.log(`Response status: ${response.status}`);
    
    // 检查是否有 GraphQL errors
    if (response.data.errors) {
      console.error('❌ GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
      return {};
    }

    // 检查 data 结构
    if (!response.data.data) {
      console.error('❌ No data in response');
      console.error('Response:', JSON.stringify(response.data, null, 2));
      return {};
    }

    const edges = response.data.data?.productVariants?.edges || [];
    console.log(`Found ${edges.length} variant(s) for SKU: ${sku}`);

    if (edges.length === 0) {
      console.log(`❌ No variant found - returning empty inventory`);
      return {};
    }

    const variant = edges[0].node;
    console.log(`✓ Variant ID: ${variant.id}, SKU: ${variant.sku}`);
    
    if (!variant.inventoryItem) {
      console.log(`❌ No inventoryItem for variant`);
      return {};
    }

    const inventoryLevels = variant.inventoryItem.inventoryLevels?.edges || [];
    console.log(`Found ${inventoryLevels.length} inventory level(s)`);

    if (inventoryLevels.length === 0) {
      console.log(`❌ No inventory levels found`);
      return {};
    }

    // 转换为 location => available 的映射
    const inventory = {};
    inventoryLevels.forEach(level => {
      const locationName = level.node.location.name;
      
      // 从 quantities 数组中获取 available 数量
      const availableQty = level.node.quantities?.find(q => q.name === 'available');
      const available = availableQty ? availableQty.quantity : 0;
      
      inventory[locationName] = available;
      console.log(`  ✓ ${locationName}: ${available}`);
    });

    console.log(`✓ SUCCESS: Retrieved inventory for ${sku}: ${Object.keys(inventory).length} locations`);
    return inventory;
  } catch (error) {
    console.error(`❌ EXCEPTION in getInventoryBySku for ${sku}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return {};  // 返回空对象而不是抛出错误
  }
}

// 🆕 生成 CSV 内容
function generateCSV(reportData) {
  // CSV Header
  const headers = ['Title', 'SKU', 'Quantity needed', ...LOCATIONS];
  let csv = headers.join(',') + '\n';

  // CSV Rows
  reportData.forEach(item => {
    const row = [
      `"${item.title.replace(/"/g, '""')}"`,  // 转义引号
      item.sku,
      item.quantityNeeded
    ];

    // 为每个 location 添加列
    LOCATIONS.forEach(location => {
      const available = item.inventory[location];

      // 只有当库存 >= 需求时，才标记
      if (available !== undefined && available >= item.quantityNeeded) {
        row.push(`[OK] ${available}`);
      } else {
        // 库存不足或无库存，留空
        row.push('');
      }
    });

    csv += row.join(',') + '\n';
  });

  return csv;
}

// Update transfer item status
router.patch('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transfer_from, estimate_month, estimate_day, out_of_stock } = req.body;

    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (transfer_from !== undefined) {
      updates.push('transfer_from = ?');
      values.push(transfer_from);
    }
    if (estimate_month !== undefined) {
      updates.push('estimate_month = ?');
      values.push(estimate_month);
    }
    if (estimate_day !== undefined) {
      updates.push('estimate_day = ?');
      values.push(estimate_day);
    }

    // 🆕 处理 out_of_stock 状态
    if (out_of_stock !== undefined) {
      updates.push('out_of_stock = ?');
      values.push(out_of_stock ? 1 : 0);
    }

    // 🆕 如果状态变为 waiting，记录 transfer_date（格式：MM/DD）
    if (status === 'waiting' || (transfer_from !== undefined && estimate_month !== undefined)) {
      const currentDate = new Date();
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const day = currentDate.getDate().toString().padStart(2, '0');
      const transferDate = `${month}/${day}`;
      
      updates.push('transfer_date = ?');
      values.push(transferDate);
      
      console.log(`Setting transfer_date to: ${transferDate}`);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    await db.prepare(`
      UPDATE transfer_items 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transfer item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Split transfer item (when quantity > 1 and user wants to transfer part)
router.post('/items/:id/split', async (req, res) => {
  try {
    const { id } = req.params;
    const { transferQuantity, transfer_from, estimate_month, estimate_day } = req.body;

    const item = await db.prepare('SELECT * FROM transfer_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Transfer item not found' });
    }

    const qty = parseInt(transferQuantity);
    const remainingQty = item.quantity - qty;

    if (qty >= item.quantity || qty < 1) {
      return res.status(400).json({ error: 'Invalid transfer quantity' });
    }

    // 🆕 记录 transfer_date
    const currentDate = new Date();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    const transferDate = `${month}/${day}`;

    // Update original item to transferring quantity
    await db.prepare(`
      UPDATE transfer_items 
      SET 
        quantity = ?,
        transfer_from = ?,
        estimate_month = ?,
        estimate_day = ?,
        transfer_date = ?,
        status = 'waiting',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(qty, transfer_from, estimate_month, estimate_day, transferDate, id);

    // Create new item for remaining quantity
    await db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku,
        image_url, title, name, brand, size, weight, weight_unit,
        url_handle, product_type, variant_title, custom_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
    `).run(
      item.line_item_id,
      item.shopify_order_id,
      item.order_number,
      remainingQty,
      item.sku,
      item.image_url,
      item.title,
      item.name,
      item.brand,
      item.size,
      item.weight,
      item.weight_unit,
      item.url_handle,
      item.product_type,
      item.variant_title,
      item.custom_name
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error splitting transfer item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete transfer items
router.post('/items/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }

    console.log(`Bulk delete request: ${ids.length} items`);

    // 🆕 先检查哪些 ID 实际存在
    const placeholdersCheck = ids.map(() => '?').join(',');
    const existingItems = await db.prepare(
      `SELECT id FROM transfer_items WHERE id IN (${placeholdersCheck})`
    ).all(...ids);

    const existingIds = existingItems.map(item => item.id);
    const notFoundIds = ids.filter(id => !existingIds.includes(id));

    if (notFoundIds.length > 0) {
      console.log(`Warning: ${notFoundIds.length} items not found (already deleted):`, notFoundIds);
    }

    if (existingIds.length === 0) {
      console.log('No items to delete (all already deleted)');
      return res.json({ 
        success: true, 
        deleted: 0,
        message: 'No items found to delete (may have been already deleted)'
      });
    }

    // 🆕 只删除实际存在的 items
    const placeholders = existingIds.map(() => '?').join(',');
    const result = await db.prepare(
      `DELETE FROM transfer_items WHERE id IN (${placeholders})`
    ).run(...existingIds);

    console.log(`Successfully deleted ${existingIds.length} items`);

    res.json({ 
      success: true, 
      deleted: existingIds.length,
      notFound: notFoundIds.length
    });
  } catch (error) {
    console.error('Error bulk deleting transfer items:', error);
    
    // 🆕 返回更详细的错误信息
    res.status(500).json({ 
      error: 'Failed to delete items',
      message: error.message,
      code: error.code
    });
  }
});
// 在 server/routes/transfer.js 中添加以下两个 endpoints

// 🆕 Transfer Planner: 批量查询库存
router.post('/check-planner-stock', async (req, res) => {
  try {
    const { skus, locations } = req.body;
    
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.json({ inventory: [] });
    }
    
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.json({ inventory: [] });
    }

    console.log(`\n📦 Transfer Planner: Checking stock`);
    console.log(`  SKUs: ${skus.length}`);
    console.log(`  Locations: ${locations.join(', ')}`);

    // 使用现有的批量查询函数
    const results = [];
    
    for (const sku of skus) {
      try {
        const query = `
          query getInventoryBySku($query: String!) {
            productVariants(first: 1, query: $query) {
              edges {
                node {
                  id
                  sku
                  inventoryItem {
                    id
                    inventoryLevels(first: 50) {
                      edges {
                        node {
                          location {
                            name
                          }
                          quantities(names: ["available"]) {
                            name
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const client = await shopifyClient.getClient();
        const response = await client.post('/graphql.json', {
          query,
          variables: { query: `sku:${sku}` }
        });

        const edges = response.data.data?.productVariants?.edges || [];
        
        if (edges.length > 0) {
          const inventoryLevels = edges[0].node.inventoryItem?.inventoryLevels?.edges || [];
          
          // 只返回请求的 locations
          inventoryLevels.forEach(level => {
            const locationName = level.node.location.name;
            
            if (locations.includes(locationName)) {
              const availableQty = level.node.quantities?.find(q => q.name === 'available');
              const qoh = availableQty ? availableQty.quantity : 0;
              
              results.push({
                sku,
                location: locationName,
                qoh
              });
            }
          });
        }
      } catch (error) {
        console.error(`Error fetching inventory for SKU ${sku}:`, error.message);
      }
    }

    console.log(`  ✓ Fetched inventory for ${results.length} SKU-location pairs`);
    
    res.json({ inventory: results });
  } catch (error) {
    console.error('Error in check-planner-stock:', error);
    res.status(500).json({ error: 'Failed to check stock' });
  }
});

// 🆕 Transfer Planner: 批量更新 items
router.post('/batch-update-planner', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items to update' });
    }

    console.log(`\n📦 Transfer Planner: Batch update ${items.length} items`);

    // 批量更新
    for (const item of items) {
      const { id, transfer_from, estimate_month, estimate_day, status } = item;
      
      // 生成 transfer_date (MM/DD 格式)
      const transfer_date = `${estimate_month.toString().padStart(2, '0')}/${estimate_day.toString().padStart(2, '0')}`;
      
      await db.prepare(`
        UPDATE transfer_items
        SET transfer_from = ?,
            estimate_month = ?,
            estimate_day = ?,
            transfer_date = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(transfer_from, estimate_month, estimate_day, transfer_date, status, id);

      console.log(`  ✓ Updated item ${id}: ${transfer_from}, ${transfer_date}`);
    }

    console.log(`✓ Batch update complete\n`);
    
    res.json({ success: true, updated: items.length });
  } catch (error) {
    console.error('Error in batch-update-planner:', error);
    res.status(500).json({ error: 'Failed to update items' });
  }
});

module.exports = router;
```


## server/routes/shopify-transfer.js

```javascript
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database/init');

// ============================================================================
// Shopify API 配置
// ============================================================================

const SHOP = process.env.SHOPIFY_SHOP_NAME || 'beaute-hera.myshopify.com';
const API_VERSION = '2025-07';
const GQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

// 从数据库 sessions 表读取当前 access token（token 不再放在环境变量里）
async function getAccessToken() {
  const row = await db.prepare(
    'SELECT access_token FROM sessions ORDER BY updated_at DESC LIMIT 1'
  ).get();
  const token = row && row.access_token;
  if (!token) {
    throw new Error('No Shopify token in sessions table. Visit /auth to authenticate.');
  }
  return token;
}

// Shopify Location IDs (confirmed via API testing)
const LOCATION_IDS = {
  'MTL01': 'gid://shopify/Location/107681349942',
  'MTL02': 'gid://shopify/Location/107681382710',
  'MTL03': 'gid://shopify/Location/107681448246',
  'MTL04': 'gid://shopify/Location/20829700169',
  'MTL05': 'gid://shopify/Location/107681481014',
  'MTL06': 'gid://shopify/Location/107681841462',
  'MTL07': 'gid://shopify/Location/35316531273',
  'MTL08': 'gid://shopify/Location/107681874230',
  'MTL09': 'gid://shopify/Location/107681939766',
  'MTL10': 'gid://shopify/Location/60899721289',
  'MTL11': 'gid://shopify/Location/107681972534',
};

async function gql(query, variables = {}) {
  const token = await getAccessToken();
  const res = await axios.post(
    GQL_URL,
    { query, variables },
    {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    }
  );
  if (res.data.errors) {
    throw new Error(res.data.errors[0]?.message || 'GraphQL error');
  }
  return res.data;
}

// ── Helper: get inventoryItemId by SKU ───────────────────────────────────────
async function getInventoryItemBySku(sku) {
  const data = await gql(`
    query {
      inventoryItems(first: 1, query: "sku:${sku}") {
        edges {
          node {
            id
            sku
          }
        }
      }
    }
  `);
  const edges = data?.data?.inventoryItems?.edges || [];
  return edges[0]?.node?.id || null;
}

// ── Helper: create one Shopify transfer ──────────────────────────────────────
async function createShopifyTransfer(fromLocation, lineItems, settings) {
  const originId = LOCATION_IDS[`MTL${fromLocation}`];
  const destinationId = LOCATION_IDS[settings.default_destination || 'MTL10'];
  const referenceName = settings.default_reference_name || 'Online Transfer';
  const tags = settings.default_tags || ['Online Transfer', 'WEB'];

  if (!originId) throw new Error(`Unknown location: MTL${fromLocation}`);

  const data = await gql(`
    mutation CreateTransfer($input: InventoryTransferCreateInput!) {
      inventoryTransferCreate(input: $input) {
        inventoryTransfer {
          id
          name
          status
          referenceName
          tags
          origin { name }
          destination { name }
        }
        userErrors { field message }
      }
    }
  `, {
    input: {
      originLocationId: originId,
      destinationLocationId: destinationId,
      referenceName,
      tags,
      lineItems,
    },
  });

  const result = data?.data?.inventoryTransferCreate;
  if (result?.userErrors?.length > 0) {
    throw new Error(result.userErrors[0].message);
  }

  return result?.inventoryTransfer;
}

// ── Helper: get draft transfers with Online Transfer or WEB tag ──────────────
async function getDraftTransfers() {
  const data = await gql(`
    query {
      inventoryTransfers(first: 50, query: "tag:WEB status:DRAFT") {
        edges {
          node {
            id
            name
            status
            referenceName
            tags
            origin { name }
            destination { name }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  totalQuantity
                  inventoryItem { id sku }
                }
              }
            }
          }
        }
      }
    }
  `);
  return data?.data?.inventoryTransfers?.edges?.map(e => e.node) || [];
}

// ── Helper: get transfer details by ID ───────────────────────────────────────
async function getTransferById(transferId) {
  const data = await gql(`
    query {
      node(id: "${transferId}") {
        ... on InventoryTransfer {
          id
          name
          status
          referenceName
          tags
          origin { name }
          destination { name }
          lineItems(first: 100) {
            edges {
              node {
                id
                totalQuantity
                inventoryItem { id sku }
              }
            }
          }
        }
      }
    }
  `);
  return data?.data?.node || null;
}

// ── Helper: mark transfer as transferred (full flow) ─────────────────────────
async function markTransferAsTransferred(transferId, lineItems) {
  // 1. Mark as ready to ship
  const readyData = await gql(`
    mutation {
      inventoryTransferMarkAsReadyToShip(id: "${transferId}") {
        inventoryTransfer { id status }
        userErrors { field message }
      }
    }
  `);
  const readyErrors = readyData?.data?.inventoryTransferMarkAsReadyToShip?.userErrors || [];
  if (readyErrors.length > 0) throw new Error(readyErrors[0].message);

  // 2. Create shipment
  const shipLineItems = lineItems.map(li => ({
    inventoryItemId: li.inventoryItem.id,
    quantity: li.totalQuantity,
  }));

  const shipData = await gql(`
    mutation CreateShipment($input: InventoryShipmentCreateInput!) {
      inventoryShipmentCreate(input: $input) {
        inventoryShipment { id status }
        userErrors { field message }
      }
    }
  `, {
    input: {
      movementId: transferId,
      lineItems: shipLineItems,
    },
  });

  const shipErrors = shipData?.data?.inventoryShipmentCreate?.userErrors || [];
  if (shipErrors.length > 0) throw new Error(shipErrors[0].message);
  const shipmentId = shipData?.data?.inventoryShipmentCreate?.inventoryShipment?.id;

  // 3. Mark in transit
  await gql(`
    mutation {
      inventoryShipmentMarkInTransit(id: "${shipmentId}") {
        inventoryShipment { id status }
        userErrors { field message }
      }
    }
  `);

  // 4. Receive (bulk accept)
  const receiveData = await gql(`
    mutation {
      inventoryShipmentReceive(
        id: "${shipmentId}",
        bulkReceiveAction: ACCEPTED
      ) {
        inventoryShipment { id status }
        userErrors { field message }
      }
    }
  `);
  const receiveErrors = receiveData?.data?.inventoryShipmentReceive?.userErrors || [];
  if (receiveErrors.length > 0) throw new Error(receiveErrors[0].message);

  return { shipmentId, status: 'TRANSFERRED' };
}

// ============================================================================
// Routes
// ============================================================================

// GET /api/shopify-transfer/settings
router.get('/settings', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT key, value FROM shopify_transfer_settings').all();
    const settings = {};
    rows.forEach(row => {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = row.value; }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/settings
router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    await db.prepare(
      'INSERT INTO shopify_transfer_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
    ).run(key, valueStr);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify-transfer/not-transferred  — waiting items not yet in a transfer
router.get('/not-transferred', async (req, res) => {
  try {
    const items = await db.prepare(`
      SELECT * FROM transfer_items
      WHERE status = 'waiting' AND shopify_transferred = 0
      ORDER BY transfer_from ASC, created_at ASC
    `).all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify-transfer/draft-transfers  — current draft transfers in Shopify
router.get('/draft-transfers', async (req, res) => {
  try {
    const transfers = await getDraftTransfers();
    res.json(transfers);
  } catch (err) {
    console.error('Error fetching draft transfers:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/create
// Body: { itemIds }
router.post('/create', async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    // Get settings
    const settingsRows = await db.prepare('SELECT key, value FROM shopify_transfer_settings').all();
    const settings = {};
    settingsRows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });

    // Fetch items
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    // Group by transfer_from (location)
    const grouped = {};
    for (const item of items) {
      const loc = item.transfer_from;
      if (!loc) continue;
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(item);
    }

    // Create transfers in ascending location order
    const sortedLocations = Object.keys(grouped).sort();
    const results = [];
    const errors = [];

    for (const loc of sortedLocations) {
      const locItems = grouped[loc];

      // Build line items: merge duplicate SKUs by summing quantities
      const lineItemsMap = {};
      for (const item of locItems) {
        if (!item.sku) continue;
        const inventoryItemId = await getInventoryItemBySku(item.sku);
        if (!inventoryItemId) {
          errors.push(`SKU ${item.sku} not found in Shopify`);
          continue;
        }
        lineItemsMap[inventoryItemId] = (lineItemsMap[inventoryItemId] || 0) + item.quantity;
      }
      const lineItems = Object.entries(lineItemsMap).map(([inventoryItemId, quantity]) => ({
        inventoryItemId,
        quantity,
      }));

      if (lineItems.length === 0) {
        errors.push(`No valid products for location ${loc}`);
        continue;
      }

      try {
        const transfer = await createShopifyTransfer(loc, lineItems, settings);

        // Save to DB
        const transferId = transfer.id;
        const transferNumber = transfer.name?.replace('#', '') || '';

        await db.prepare(`
          INSERT INTO shopify_transfers
            (transfer_id, transfer_number, from_location, destination, reference_name, tags, status, item_count)
          VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
          ON CONFLICT (transfer_id) DO UPDATE SET
            transfer_number = EXCLUDED.transfer_number,
            status = EXCLUDED.status,
            item_count = EXCLUDED.item_count,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          transferId,
          transferNumber,
          loc,
          settings.default_destination || 'MTL10',
          settings.default_reference_name || 'Online Transfer',
          JSON.stringify(settings.default_tags || ['Online Transfer', 'WEB']),
          locItems.length
        );

        // Update transfer_items
        for (const item of locItems) {
          await db.prepare(`
            UPDATE transfer_items
            SET shopify_transferred = 1, shopify_transfer_id = ?, shopify_transfer_number = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(transferId, transferNumber, item.id);
        }

        results.push({
          location: loc,
          transferId,
          transferNumber,
          itemCount: locItems.length,
        });

      } catch (err) {
        errors.push(`Failed to create transfer for location ${loc}: ${err.message}`);
      }
    }

    res.json({ success: true, results, errors });

  } catch (err) {
    console.error('Error creating Shopify transfers:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/add-to-transfer
// Body: { itemIds }
router.post('/add-to-transfer', async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    // Fetch items
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    // Get current draft transfers from Shopify
    const draftTransfers = await getDraftTransfers();

    // Map origin name → transfer
    const transferByOrigin = {};
    for (const t of draftTransfers) {
      const originName = t.origin?.name; // e.g. "MTL02"
      if (originName) transferByOrigin[originName] = t;
    }

    // Group items by location
    const grouped = {};
    for (const item of items) {
      const loc = item.transfer_from;
      if (!loc) continue;
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(item);
    }

    const results = [];
    const errors = [];

    for (const loc of Object.keys(grouped).sort()) {
      const locItems = grouped[loc];
      const originKey = `MTL${loc}`;
      const existingTransfer = transferByOrigin[originKey];

      if (!existingTransfer) {
        errors.push(`No draft transfer found for origin MTL${loc}. Please create a new transfer first.`);
        continue;
      }

      // Build new line items
      const newLineItems = [];
      for (const item of locItems) {
        if (!item.sku) continue;
        const inventoryItemId = await getInventoryItemBySku(item.sku);
        if (!inventoryItemId) {
          errors.push(`SKU ${item.sku} not found in Shopify`);
          continue;
        }
        newLineItems.push({ inventoryItemId, quantity: item.quantity });
      }

      if (newLineItems.length === 0) continue;

      // Use inventoryTransferSetItems to add/update line items
      // First get existing line items, merge, then set
      const existingLineItems = existingTransfer.lineItems?.edges?.map(e => ({
        inventoryItemId: e.node.inventoryItem?.id,
        quantity: e.node.totalQuantity,
      })) || [];

      // Merge: if same inventoryItemId, add quantities
      const mergedMap = {};
      for (const li of existingLineItems) {
        mergedMap[li.inventoryItemId] = (mergedMap[li.inventoryItemId] || 0) + li.quantity;
      }
      for (const li of newLineItems) {
        mergedMap[li.inventoryItemId] = (mergedMap[li.inventoryItemId] || 0) + li.quantity;
      }
      const mergedLineItems = Object.entries(mergedMap).map(([inventoryItemId, quantity]) => ({
        inventoryItemId, quantity
      }));

      try {
        await gql(`
          mutation {
            inventoryTransferSetItems(input: {
              id: "${existingTransfer.id}",
              lineItems: ${JSON.stringify(mergedLineItems).replace(/"([^"]+)":/g, '$1:')}
            }) {
              inventoryTransfer { id status }
              userErrors { field message }
            }
          }
        `);

        const transferNumber = existingTransfer.name?.replace('#', '') || '';

        // Update DB
        await db.prepare(`
          UPDATE shopify_transfers
          SET item_count = item_count + ?, updated_at = CURRENT_TIMESTAMP
          WHERE transfer_id = ?
        `).run(locItems.length, existingTransfer.id);

        for (const item of locItems) {
          await db.prepare(`
            UPDATE transfer_items
            SET shopify_transferred = 1, shopify_transfer_id = ?, shopify_transfer_number = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(existingTransfer.id, transferNumber, item.id);
        }

        results.push({
          location: loc,
          transferId: existingTransfer.id,
          transferNumber,
          itemsAdded: locItems.length,
        });

      } catch (err) {
        errors.push(`Failed to add items to transfer for location ${loc}: ${err.message}`);
      }
    }

    res.json({ success: true, results, errors });

  } catch (err) {
    console.error('Error adding to Shopify transfer:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify-transfer/validate/:transferNumber
// Compare items in our DB with Shopify transfer
router.get('/validate/:transferNumber', async (req, res) => {
  try {
    const { transferNumber } = req.params;

    // Get items from our DB
    const dbItems = await db.prepare(`
      SELECT * FROM transfer_items WHERE shopify_transfer_number = ?
    `).all(transferNumber);

    if (dbItems.length === 0) {
      return res.status(404).json({ error: 'No items found for this transfer number' });
    }

    // Get transfer ID from our DB
    const transferRecord = await db.prepare(
      'SELECT * FROM shopify_transfers WHERE transfer_number = ?'
    ).get(transferNumber);

    if (!transferRecord) {
      return res.status(404).json({ error: 'Transfer record not found' });
    }

    // Get transfer from Shopify
    const shopifyTransfer = await getTransferById(transferRecord.transfer_id);
    if (!shopifyTransfer) {
      return res.status(404).json({ error: 'Transfer not found in Shopify' });
    }

    // Compare
    const shopifyItems = shopifyTransfer.lineItems?.edges?.map(e => ({
      sku: e.node.inventoryItem?.sku,
      quantity: e.node.totalQuantity,
    })) || [];

    const mismatches = [];

    // Check items in our DB vs Shopify
    for (const dbItem of dbItems) {
      const shopifyItem = shopifyItems.find(si => si.sku === dbItem.sku);
      if (!shopifyItem) {
        mismatches.push(`SKU ${dbItem.sku} is in Fulfiller but not in Shopify transfer`);
      } else if (shopifyItem.quantity !== dbItem.quantity) {
        mismatches.push(`SKU ${dbItem.sku}: Fulfiller qty ${dbItem.quantity} ≠ Shopify qty ${shopifyItem.quantity}`);
      }
    }

    // Check items in Shopify vs our DB
    for (const shopifyItem of shopifyItems) {
      const dbItem = dbItems.find(di => di.sku === shopifyItem.sku);
      if (!dbItem) {
        mismatches.push(`SKU ${shopifyItem.sku} is in Shopify transfer but not in Fulfiller`);
      }
    }

    const allReceived = dbItems.every(item => item.status === 'received');

    res.json({
      transferNumber,
      transferId: transferRecord.transfer_id,
      shopifyStatus: shopifyTransfer.status,
      dbItems: dbItems.length,
      shopifyItems: shopifyItems.length,
      mismatches,
      isValid: mismatches.length === 0,
      allReceived,
      canMarkAsTransferred: mismatches.length === 0 && allReceived,
    });

  } catch (err) {
    console.error('Error validating transfer:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/mark-transferred
// Body: { transferNumber }
router.post('/mark-transferred', async (req, res) => {
  try {
    const { transferNumber } = req.body;
    if (!transferNumber) return res.status(400).json({ error: 'transferNumber required' });

    const transferRecord = await db.prepare(
      'SELECT * FROM shopify_transfers WHERE transfer_number = ?'
    ).get(transferNumber);

    if (!transferRecord) {
      return res.status(404).json({ error: 'Transfer record not found' });
    }

    // Get current transfer from Shopify to get line items
    const shopifyTransfer = await getTransferById(transferRecord.transfer_id);
    if (!shopifyTransfer) {
      return res.status(404).json({ error: 'Transfer not found in Shopify' });
    }

    const lineItems = shopifyTransfer.lineItems?.edges?.map(e => e.node) || [];

    // Run the full transfer flow
    await markTransferAsTransferred(transferRecord.transfer_id, lineItems);

    // Update our DB
    await db.prepare(`
      UPDATE shopify_transfers SET status = 'transferred', updated_at = CURRENT_TIMESTAMP
      WHERE transfer_number = ?
    `).run(transferNumber);

    res.json({ success: true, transferNumber, status: 'transferred' });

  } catch (err) {
    console.error('Error marking transfer as transferred:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```


## server/routes/settings.js

```javascript
const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const db = require('../database/init');

// 使用内存存储而不是磁盘
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settingsRows = await db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key] = row.value;
    });

    const boxTypes = await db.prepare('SELECT * FROM box_types ORDER BY code').all();

    res.json({ settings, boxTypes });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings: ' + error.message });
  }
});

// Test endpoint to check CSV data
router.get('/test-csv/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const csvData = await db.prepare('SELECT * FROM csv_data WHERE sku = ?').get(sku);
    
    if (csvData) {
      res.json({
        found: true,
        sku: csvData.sku,
        data: JSON.parse(csvData.data)
      });
    } else {
      const totalCount = await db.prepare('SELECT COUNT(*) as count FROM csv_data').get();
      res.json({ 
        found: false, 
        sku,
        totalRecordsInDb: totalCount.count
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings — supports both legacy column fields and generic key/value
router.post('/update', async (req, res) => {
  try {
    const { transferCsvColumn, pickerWigColumn, skuColumn, key, value } = req.body;

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Legacy: specific column fields
    if (transferCsvColumn) upsert.run('transfer_csv_column', transferCsvColumn.toUpperCase());
    if (pickerWigColumn) upsert.run('picker_wig_column', pickerWigColumn.toUpperCase());
    if (skuColumn) upsert.run('sku_column', skuColumn.toUpperCase());

    // Generic: key/value pair
    if (key) upsert.run(key, value ?? '');

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings: ' + error.message });
  }
});

// Upload CSV file
router.post('/upload-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('CSV upload started');
    const results = [];

    // 从内存缓冲区创建可读流
    const bufferStream = Readable.from(req.file.buffer);

    bufferStream
      .pipe(csv({ headers: false }))
      .on('data', (data) => {
        const rowArray = Object.values(data);
        results.push(rowArray);
      })
      .on('end', async () => {
        try {
          console.log(`Total rows in CSV: ${results.length}`);
          
          if (results.length === 0) {
            throw new Error('CSV file is empty');
          }

          const startTime = Date.now();
          
          // Skip first row (headers)
          const dataRows = results.slice(1);
          console.log(`Processing ${dataRows.length} data rows...`);

          // Clear existing CSV data
          await db.prepare('DELETE FROM csv_data').run();

          let importedCount = 0;
          let skippedCount = 0;

          for (const rowArray of dataRows) {
            // Convert array to object with letter keys
            const row = {};
            rowArray.forEach((value, idx) => {
              const letter = String.fromCharCode(65 + idx);
              row[letter] = value || '';
            });
            
            const skuA = row['A']?.trim();
            const skuB = row['B']?.trim();
            
            // Insert with SKU from column A
            if (skuA && skuA !== '') {
              await db.prepare(`
                INSERT INTO csv_data (sku, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (sku) DO NOTHING
              `).run(skuA, JSON.stringify(row));
              importedCount++;
            }
            
            // Insert with SKU from column B (if different)
            if (skuB && skuB !== '' && skuB !== skuA) {
              await db.prepare(`
                INSERT INTO csv_data (sku, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (sku) DO NOTHING
              `).run(skuB, JSON.stringify(row));
              importedCount++;
            }
            
            if ((!skuA || skuA === '') && (!skuB || skuB === '')) {
              skippedCount++;
            }
          }

          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`CSV import complete in ${duration}s: ${importedCount} records imported, ${skippedCount} rows skipped`);

          // Update upload timestamp
          await db.prepare(`
            INSERT INTO settings (key, value, updated_at)
            VALUES ('csv_uploaded_at', ?, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = CURRENT_TIMESTAMP
          `).run(new Date().toISOString());

          res.json({
            success: true,
            rowsImported: importedCount,
            rowsSkipped: skippedCount,
            totalRows: dataRows.length,
            uploadedAt: new Date().toISOString(),
            duration: duration + 's'
          });
        } catch (error) {
          console.error('Error processing CSV data:', error);
          res.status(500).json({ error: 'Error processing CSV data: ' + error.message });
        }
      })
      .on('error', (error) => {
        console.error('Error parsing CSV:', error);
        res.status(500).json({ error: 'Error parsing CSV file: ' + error.message });
      });

  } catch (error) {
    console.error('Error uploading CSV:', error);
    res.status(500).json({ error: 'Failed to upload CSV: ' + error.message });
  }
});

// Get box types
router.get('/box-types', async (req, res) => {
  try {
    const boxTypes = await db.prepare('SELECT * FROM box_types ORDER BY code').all();
    res.json(boxTypes);
  } catch (error) {
    console.error('Error fetching box types:', error);
    res.status(500).json({ error: 'Failed to fetch box types: ' + error.message });
  }
});

// Add box type
router.post('/box-types', async (req, res) => {
  try {
    const { code, dimensions, weightGrams } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    await db.prepare(`
      INSERT INTO box_types (code, dimensions, usage_count, quantity, weight_grams)
      VALUES (?, ?, 0, 0, ?)
    `).run(code.toUpperCase().trim(), dimensions || '', weightGrams || 0);

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error adding box type:', error);
    res.status(500).json({ error: 'Failed to add box type: ' + error.message });
  }
});

// Update box type
router.patch('/box-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, dimensions, quantity, weightGrams } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    // 🆕 quantity 可以为 undefined（不更新），但如果提供了必须是有效数字
    if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
      return res.status(400).json({ error: 'Quantity must be a valid non-negative number' });
    }

    // 🆕 如果提供了 quantity，也更新它
    if (quantity !== undefined) {
      await db.prepare(`
        UPDATE box_types
        SET code = ?, dimensions = ?, quantity = ?, weight_grams = ?
        WHERE id = ?
      `).run(code.toUpperCase().trim(), dimensions || '', quantity, weightGrams ?? 0, id);
    } else {
      await db.prepare(`
        UPDATE box_types
        SET code = ?, dimensions = ?, weight_grams = ?
        WHERE id = ?
      `).run(code.toUpperCase().trim(), dimensions || '', weightGrams ?? 0, id);
    }

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error updating box type:', error);
    res.status(500).json({ error: 'Failed to update box type: ' + error.message });
  }
});

// Delete box type
router.delete('/box-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM box_types WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Box type not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting box type:', error);
    res.status(500).json({ error: 'Failed to delete box type: ' + error.message });
  }
});

const { cleanupOldData } = require('../utils/cleanup');

// 手动触发清理
router.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupOldData();
    res.json({
      success: true,
      message: `Cleaned up ${result.deleted} orders`,
      deletedOrders: result.orders
    });
  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看即将被清理的数据
router.get('/cleanup-preview', async (req, res) => {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const oldOrders = await db.prepare(`
      SELECT shopify_order_id, name, created_at, fulfillment_status 
      FROM orders 
      WHERE created_at < ?
      ORDER BY created_at DESC
    `).all(sixtyDaysAgo.toISOString());

    res.json({
      count: oldOrders.length,
      cutoffDate: sixtyDaysAgo.toISOString(),
      orders: oldOrders
    });
  } catch (error) {
    console.error('Cleanup preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看数据库统计
router.get('/database-stats', async (req, res) => {
  try {
    const stats = {
      orders: await db.prepare('SELECT COUNT(*) as count FROM orders').get(),
      lineItems: await db.prepare('SELECT COUNT(*) as count FROM line_items').get(),
      transferItems: await db.prepare('SELECT COUNT(*) as count FROM transfer_items').get(),
      oldestOrder: await db.prepare('SELECT created_at FROM orders ORDER BY created_at ASC LIMIT 1').get(),
      newestOrder: await db.prepare('SELECT created_at FROM orders ORDER BY created_at DESC LIMIT 1').get()
    };
    res.json(stats);
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear all orders and items (for testing purposes)
router.post('/clear-all-data', async (req, res) => {
  try {
    console.log('⚠️  CLEARING ALL DATA - This action cannot be undone!');
    
    // 删除所有数据（按依赖顺序）
    await db.prepare('DELETE FROM transfer_items').run();
    console.log('✓ Cleared transfer_items');
    
    await db.prepare('DELETE FROM line_items').run();
    console.log('✓ Cleared line_items');
    
    await db.prepare('DELETE FROM orders').run();
    console.log('✓ Cleared orders');

    // 🆕 重置 box type 统计
    await db.prepare('UPDATE box_types SET usage_count = 0').run();
    console.log('✓ Reset box type usage counts');
    
    console.log('✓ All order data cleared successfully');
    
    res.json({ 
      success: true, 
      message: 'All orders, line items, and transfer items have been deleted. Box type statistics have been reset. CSV data and settings were preserved.'
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear data: ' + error.message 
    });
  }
});

// 🆕 Reset box usage statistics
router.post('/reset-box-usage', async (req, res) => {
  try {
    console.log('⚠️  RESETTING BOX USAGE STATISTICS');
    
    // 重置所有 box types 的使用统计和剩余数量
    await db.prepare('UPDATE box_types SET usage_count = 0, quantity = 0').run();
    console.log('✓ Reset all box usage counts and quantities');
    
    // 🆕 更新 box_stats_start_date 设置
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('box_stats_start_date', ?, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(now);
    console.log('✓ Updated box stats start date');
    
    res.json({ 
      success: true, 
      message: 'Box usage statistics have been reset.',
      startDate: now
    });
  } catch (error) {
    console.error('Error resetting box usage:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset box usage: ' + error.message 
    });
  }
});

// 🆕 Update multiple settings at once
router.post('/update-multiple', async (req, res) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Request body must be an object of key/value pairs' });
    }

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, value ?? '');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating multiple settings:', error);
    res.status(500).json({ error: 'Failed to update settings: ' + error.message });
  }
});

// 🆕 Update scanner settings
router.post('/scanner', async (req, res) => {
  try {
    const { scannerEnabled, scannerPicker, scannerPackingOrders, scannerPacker } = req.body;

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    upsert.run('scanner_enabled', scannerEnabled ? 'true' : 'false');
    upsert.run('scanner_picker', scannerPicker ? 'true' : 'false');
    upsert.run('scanner_packing_orders', scannerPackingOrders ? 'true' : 'false');
    upsert.run('scanner_packer', scannerPacker ? 'true' : 'false');

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating scanner settings:', error);
    res.status(500).json({ error: 'Failed to update scanner settings: ' + error.message });
  }
});

module.exports = router;
```


## server/webhooks/orderHandler.js

```javascript
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

class OrderWebhookHandler {
  // Helper function to fetch product details
  static async fetchProductDetails(productId) {
    try {
      const client = await shopifyClient.getClient();
      const response = await client.get(`/products/${productId}.json`);
      return response.data.product;
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error.message);
      return null;
    }
  }

  // Handle order created
  static async handleOrderCreated(orderData) {
    try {
      const order = {
        shopify_order_id: orderData.id.toString(),
        order_number: orderData.order_number.toString(),
        name: orderData.name,
        fulfillment_status: orderData.fulfillment_status || 'unfulfilled',
        total_quantity: orderData.line_items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal_price: orderData.subtotal_price,
        created_at: orderData.created_at,
        shipping_code: orderData.shipping_lines[0]?.code || '',
        shipping_title: orderData.shipping_lines[0]?.title || '',
        shipping_name: orderData.shipping_address?.name || '',
        shipping_address1: orderData.shipping_address?.address1 || '',
        shipping_address2: orderData.shipping_address?.address2 || '',
        shipping_city: orderData.shipping_address?.city || '',
        shipping_province: orderData.shipping_address?.province || '',
        shipping_zip: orderData.shipping_address?.zip || '',
        shipping_country: orderData.shipping_address?.country || ''
      };

      // Insert order
      // 🔒 FIX: ON CONFLICT 不覆写已是 'fulfilled' 的状态，防止 stale webhook 复活已完成的订单
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          shopify_order_id, order_number, name, fulfillment_status, 
          total_quantity, subtotal_price, created_at, shipping_code, shipping_title,
          shipping_name, shipping_address1, shipping_address2, 
          shipping_city, shipping_province, shipping_zip, shipping_country
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (shopify_order_id) DO UPDATE SET
          order_number = EXCLUDED.order_number,
          name = EXCLUDED.name,
          fulfillment_status = CASE
            WHEN orders.fulfillment_status = 'fulfilled' THEN 'fulfilled'
            ELSE EXCLUDED.fulfillment_status
          END,
          total_quantity = EXCLUDED.total_quantity,
          subtotal_price = EXCLUDED.subtotal_price,
          shipping_title = EXCLUDED.shipping_title,
          updated_at = CURRENT_TIMESTAMP
      `);

      await insertOrder.run(
        order.shopify_order_id, order.order_number, order.name,
        order.fulfillment_status, order.total_quantity, order.subtotal_price,
        order.created_at, order.shipping_code, order.shipping_title,
        order.shipping_name,
        order.shipping_address1, order.shipping_address2, order.shipping_city,
        order.shipping_province, order.shipping_zip, order.shipping_country
      );

      // Insert line items with full product details
      for (const item of orderData.line_items) {
        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        let imageUrl = '';
        let urlHandle = '';
        let productType = item.product_type || '';
        let wigNumber = '';
        let customName = '';
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        // 获取 variant 信息（weight + custom_name）
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
              console.log(`Variant ${item.variant_id}: weight=${weight}${weightUnit}`);
            }
            
            // 获取 custom.name metafield（variant 层级）
            try {
              customName = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'name');
              if (customName) {
                console.log(`Variant ${item.variant_id}: custom.name=${customName}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.name for variant ${item.variant_id}:`, err.message);
            }
          } catch (err) {
            console.error(`Failed to fetch variant ${item.variant_id}:`, err.message);
          }
        }
        
        const hasWeightWarning = (weight === 0 || weightUnit !== 'g') ? 1 : 0;

        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
            
            // 如果是 WIG 类型，获取 custom.wig_number metafield（product 层级）
            if (productType.toUpperCase() === 'WIG') {
              try {
                wigNumber = await shopifyClient.getProductMetafield(item.product_id, 'custom', 'wig_number');
                if (wigNumber) {
                  console.log(`Product ${item.product_id}: wig_number=${wigNumber}`);
                }
              } catch (err) {
                console.error(`Failed to fetch wig_number for product ${item.product_id}:`, err.message);
              }
            }
          }
        }
        
        const insertLineItem = db.prepare(`
          INSERT INTO line_items (
            shopify_order_id, order_number, shopify_line_item_id, quantity,
            image_url, title, name, brand, size, weight, weight_unit, sku,
            url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
            picker_status, packer_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (shopify_line_item_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            updated_at = CURRENT_TIMESTAMP
        `);

        await insertLineItem.run(
          order.shopify_order_id,
          order.order_number,
          item.id.toString(),
          item.quantity,
          imageUrl,
          item.title,
          item.name,
          item.vendor,
          size,
          weight,
          weightUnit,
          item.sku,
          urlHandle,
          productType,
          wigNumber,
          customName,
          hasWeightWarning,
          item.variant_title || '',
          'picking',
          'packing'
        );
      }

      console.log(`Order ${order.name} created successfully`);
      return { success: true, order_number: order.name };
    } catch (error) {
      console.error('Error handling order created:', error);
      throw error;
    }
  }

  // Handle order updated
  static async handleOrderUpdated(orderData) {
    try {
      if (orderData.cancelled_at) {
        console.log(`Order ${orderData.name} is cancelled, deleting from APP`);
        return await this.handleOrderCancelled(orderData);
      }
      
      if (orderData.fulfillment_status === 'fulfilled') {
        console.log(`Order ${orderData.name} is fulfilled, deleting from APP`);
        return await this.handleOrderFulfilled(orderData);
      }
      
      const existingOrder = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?')
        .get(orderData.id.toString());

      // 🔒 FIX: 订单不在 DB 中，说明已经被 fulfilled/cancelled 删除过了
      // 去 Shopify API 查询真实状态，确认是否真的是活跃的 unfulfilled 订单
      if (!existingOrder) {
        // 先用 webhook 数据做快速检查
        if (orderData.fulfillment_status === 'fulfilled' || orderData.cancelled_at) {
          console.log(`Order ${orderData.name} not in DB and webhook shows fulfilled/cancelled — ignoring`);
          return { success: true, order_number: orderData.name };
        }

        // webhook 数据不可靠，去 Shopify API 查真实状态
        console.log(`Order ${orderData.name} not in DB — verifying with Shopify API...`);
        try {
          const shopifyOrder = await shopifyClient.getOrder(orderData.id.toString());
          if (shopifyOrder.fulfillment_status === 'fulfilled' || shopifyOrder.cancelled_at || shopifyOrder.closed_at) {
            console.log(`Order ${orderData.name} confirmed fulfilled/cancelled/closed by Shopify API — ignoring`);
            return { success: true, order_number: orderData.name };
          }
          console.log(`Order ${orderData.name} confirmed active by Shopify API — treating as new order`);
        } catch (apiErr) {
          // Shopify API 查询失败，保守处理：忽略，不重建
          // 避免因 stale webhook 误建订单，真正漏掉的订单可通过 Shopify 手动重发 webhook 补救
          console.error(`Order ${orderData.name} — Shopify API check failed: ${apiErr.message} — ignoring to be safe`);
          return { success: true, order_number: orderData.name };
        }

        return await this.handleOrderCreated(orderData);
      }

      // 获取所有退款记录，构建已退款 items 的 Map
      const refundedItems = new Map();
      
      if (orderData.refunds && Array.isArray(orderData.refunds)) {
        console.log(`\n📋 Checking refunds: ${orderData.refunds.length} refund records`);
        
        orderData.refunds.forEach(refund => {
          if (refund.refund_line_items) {
            refund.refund_line_items.forEach(refundItem => {
              const itemId = refundItem.line_item_id.toString();
              const refundedQty = refundItem.quantity;
              const currentRefunded = refundedItems.get(itemId) || 0;
              refundedItems.set(itemId, currentRefunded + refundedQty);
              console.log(`  💰 Item ${itemId} refunded: ${refundedQty} (total refunded: ${currentRefunded + refundedQty})`);
            });
          }
        });
      }

      // 过滤掉完全退款的 items，调整部分退款的数量
      const activeLineItems = [];
      orderData.line_items.forEach(item => {
        const itemId = item.id.toString();
        const refundedQty = refundedItems.get(itemId) || 0;
        const activeQty = item.quantity - refundedQty;
        
        if (activeQty > 0) {
          activeLineItems.push({
            ...item,
            quantity: activeQty,
            original_quantity: item.quantity,
            refunded_quantity: refundedQty
          });
          if (refundedQty > 0) {
            console.log(`  ✓ Item ${itemId}: original=${item.quantity}, refunded=${refundedQty}, active=${activeQty}`);
          }
        } else if (refundedQty > 0) {
          console.log(`  ✗ Item ${itemId}: fully refunded (original=${item.quantity}, refunded=${refundedQty})`);
        }
      });

      // Get existing line items
      const existingLineItems = await db.prepare(
        'SELECT * FROM line_items WHERE shopify_order_id = ?'
      ).all(orderData.id.toString());

      const itemGroups = new Map();
      existingLineItems.forEach(item => {
        const baseId = item.shopify_line_item_id.split('_')[0];
        if (!itemGroups.has(baseId)) {
          itemGroups.set(baseId, []);
        }
        itemGroups.get(baseId).push(item);
      });

      const currentItemIds = new Set();
      let itemsChanged = false; // 追踪是否真的有 item 增减

      console.log('\n=== Processing Updated Order ===');
      console.log('Incoming items from Shopify (after refunds):', activeLineItems.length);
      activeLineItems.forEach(item => {
        console.log(`  - ${item.id}: qty=${item.quantity}, title=${item.title}`);
      });

      console.log('\nExisting items in DB:', existingLineItems.length);
      existingLineItems.forEach(item => {
        console.log(`  - ${item.shopify_line_item_id}: qty=${item.quantity}, title=${item.title}`);
      });

      console.log('\nItem groups:', itemGroups.size);
      itemGroups.forEach((group, baseId) => {
        const total = group.reduce((sum, i) => sum + i.quantity, 0);
        console.log(`  - ${baseId}: ${group.length} entries, total qty=${total}`);
      });

      for (const item of activeLineItems) {
        const itemId = item.id.toString();
        currentItemIds.add(itemId);
        
        const existingGroup = itemGroups.get(itemId) || [];
        const totalExistingQty = existingGroup.reduce((sum, i) => sum + i.quantity, 0);

        console.log(`\nProcessing item ${itemId}:`);
        console.log(`  Shopify qty: ${item.quantity}`);
        console.log(`  DB qty: ${totalExistingQty}`);
        console.log(`  Condition: ${item.quantity < totalExistingQty ? 'DECREASE' : item.quantity > totalExistingQty ? 'INCREASE' : 'SAME'}`);

        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        let imageUrl = '';
        let urlHandle = '';
        let productType = item.product_type || '';
        let wigNumber = '';
        let customName = '';
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        // 获取 variant 信息（weight + custom_name）
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
            }
            
            // 获取 custom.name metafield（variant 层级）
            try {
              customName = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'name');
              if (customName) {
                console.log(`Variant ${item.variant_id}: custom.name=${customName}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.name for variant ${item.variant_id}:`, err.message);
            }
          } catch (err) {
            console.error(`Failed to fetch variant ${item.variant_id}:`, err.message);
          }
        }
        
        const hasWeightWarning = (weight === 0 || weightUnit !== 'g') ? 1 : 0;

        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
            
            // 如果是 WIG 类型，获取 custom.wig_number metafield
            if (productType.toUpperCase() === 'WIG') {
              try {
                wigNumber = await shopifyClient.getProductMetafield(item.product_id, 'custom', 'wig_number');
                if (wigNumber) {
                  console.log(`Product ${item.product_id}: wig_number=${wigNumber}`);
                }
              } catch (err) {
                console.error(`Failed to fetch wig_number for product ${item.product_id}:`, err.message);
              }
            }
          }
        }

        if (existingGroup.length === 0) {
          // 新增的 item（订单编辑后加了新产品）
          console.log(`  Action: NEW ITEM`);
          itemsChanged = true;
          // 🔒 FIX: ON CONFLICT 防止重复 webhook 重复插入同一个 shopify_line_item_id
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
              picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (shopify_line_item_id) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              updated_at = CURRENT_TIMESTAMP
          `);

          await insertLineItem.run(
            orderData.id.toString(),
            orderData.order_number.toString(),
            itemId,
            item.quantity,
            imageUrl,
            item.title,
            item.name,
            item.vendor,
            size,
            weight,
            weightUnit,
            item.sku,
            urlHandle,
            productType,
            wigNumber,
            customName,
            hasWeightWarning,
            item.variant_title || '',
            'picking',
            'packing'
          );
        } else if (item.quantity > totalExistingQty) {
          // 数量增加（订单编辑后增加了数量）
          console.log(`  Action: INCREASE`);

          // 🔒 FIX: 幂等性检查 — 重新查一次 DB 最新数量，防止重复 webhook 多次叠加
          // itemGroups 是在本次 webhook 开始时快照的，如果同一 webhook 被 Shopify 重复推送
          // 两次调用可能同时读到旧快照，都认为需要 INCREASE，导致重复插入
          const freshGroup = await db.prepare(
            `SELECT * FROM line_items WHERE shopify_order_id = ? AND (shopify_line_item_id = ? OR shopify_line_item_id LIKE ?)`
          ).all(orderData.id.toString(), itemId, `${itemId}_%`);
          const freshQty = freshGroup.reduce((sum, i) => sum + i.quantity, 0);

          if (freshQty >= item.quantity) {
            console.log(`  INCREASE skipped — DB already has qty ${freshQty}, target is ${item.quantity}`);
          } else {
            const diff = item.quantity - freshQty;
            console.log(`  INCREASE confirmed (fresh DB qty: ${freshQty}, target: ${item.quantity}, diff: ${diff})`);
            itemsChanged = true;

            const insertLineItem = db.prepare(`
              INSERT INTO line_items (
                shopify_order_id, order_number, shopify_line_item_id, quantity,
                image_url, title, name, brand, size, weight, weight_unit, sku,
                url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
                picker_status, packer_status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            await insertLineItem.run(
              orderData.id.toString(),
              orderData.order_number.toString(),
              itemId + '_' + Date.now(),
              diff,
              imageUrl,
              item.title,
              item.name,
              item.vendor,
              size,
              weight,
              weightUnit,
              item.sku,
              urlHandle,
              productType,
              wigNumber,
              customName,
              hasWeightWarning,
              item.variant_title || '',
              'picking',
              'packing'
            );
          }
        } else if (item.quantity < totalExistingQty) {
          // 数量减少（订单编辑后减少了数量）
          console.log(`  Action: DECREASE`);
          itemsChanged = true;
          
          let remaining = totalExistingQty - item.quantity;
          existingGroup.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          
          for (const existingItem of existingGroup) {
            if (remaining <= 0) break;
            
            if (existingItem.quantity <= remaining) {
              console.log(`    Deleting line_item ${existingItem.id} (qty: ${existingItem.quantity})`);
              await db.prepare('DELETE FROM line_items WHERE id = ?').run(existingItem.id);
              remaining -= existingItem.quantity;
            } else {
              const newQty = existingItem.quantity - remaining;
              console.log(`    Updating line_item ${existingItem.id}: ${existingItem.quantity} -> ${newQty}`);
              await db.prepare('UPDATE line_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(newQty, existingItem.id);
              remaining = 0;
            }
          }
        } else {
          console.log(`  Action: NO CHANGE`);
        }
      }

      console.log('\nChecking for removed items:');
      console.log('Current item IDs from Shopify:', Array.from(currentItemIds));
      console.log('Item groups base IDs:', Array.from(itemGroups.keys()));

      for (const [baseId, group] of itemGroups.entries()) {
        console.log(`Checking ${baseId}: in currentItemIds? ${currentItemIds.has(baseId)}`);
        if (!currentItemIds.has(baseId)) {
          console.log(`  Action: ITEM REMOVED - ${baseId}`);
          itemsChanged = true;
          for (const item of group) {
            console.log(`    Deleting line_item ${item.id}`);
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(item.id);
            // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
          }
        }
      }

      // 🔒 FIX: 更新订单时不允许把 fulfillment_status 从 'fulfilled' 降级回去
      const newFulfillmentStatus = orderData.fulfillment_status || 'unfulfilled';
      const protectedStatus = existingOrder.fulfillment_status === 'fulfilled'
        ? 'fulfilled'
        : newFulfillmentStatus;

      // 只有当 item 真的发生了增减，才重置 packer 状态
      // 如果 orders/updated 只是支付确认、备注修改等与 item 无关的变化，不重置
      if (itemsChanged) {
        console.log(`Items changed — resetting packer status for order ${orderData.name}`);

        // 重置所有现有 line_items 的 packer_status 为 'packing'
        await db.prepare(`
          UPDATE line_items
          SET packer_status = 'packing', updated_at = CURRENT_TIMESTAMP
          WHERE shopify_order_id = ?
        `).run(orderData.id.toString());

        // 如果订单状态是 'ready'，重置回 'packing'
        // holding 和 waiting 状态不受影响
        if (existingOrder.status === 'ready') {
          await db.prepare(`
            UPDATE orders SET status = 'packing', updated_at = CURRENT_TIMESTAMP
            WHERE shopify_order_id = ?
          `).run(orderData.id.toString());
        }
      } else {
        console.log(`No item changes detected — packer status preserved for order ${orderData.name}`);
      }

      await db.prepare(`
        UPDATE orders SET 
          total_quantity = ?,
          fulfillment_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(
        activeLineItems.reduce((sum, item) => sum + item.quantity, 0),
        protectedStatus,
        orderData.id.toString()
      );

      console.log(`\nOrder ${orderData.name} updated successfully`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order updated:', error);
      throw error;
    }
  }

  // Handle refund created
  static async handleRefundCreated(refundData) {
    try {
      console.log('\n=== Refund Created Webhook ===');
      console.log('Refund ID:', refundData.id);
      console.log('Order ID:', refundData.order_id);
      
      const orderId = refundData.order_id.toString();
      
      const refundLineItems = refundData.refund_line_items || [];
      console.log(`Refunded items: ${refundLineItems.length}`);
      
      for (const refundItem of refundLineItems) {
        const lineItemId = refundItem.line_item_id.toString();
        const quantity = refundItem.quantity;
        
        console.log(`  💰 Refunding line_item ${lineItemId}, qty: ${quantity}`);
        
        const dbItems = await db.prepare(
          `SELECT * FROM line_items 
           WHERE shopify_order_id = ? 
           AND (shopify_line_item_id = ? OR shopify_line_item_id LIKE ?)
           ORDER BY created_at ASC`
        ).all(orderId, lineItemId, `${lineItemId}_%`);
        
        console.log(`    Found ${dbItems.length} matching items in DB`);
        
        let remainingToDelete = quantity;
        
        for (const dbItem of dbItems.reverse()) {
          if (remainingToDelete <= 0) break;
          
          if (dbItem.quantity <= remainingToDelete) {
            console.log(`    ✗ Deleting item ${dbItem.id} (qty: ${dbItem.quantity})`);
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(dbItem.id);
            // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
            remainingToDelete -= dbItem.quantity;
          } else {
            const newQty = dbItem.quantity - remainingToDelete;
            console.log(`    ↓ Reducing item ${dbItem.id} qty: ${dbItem.quantity} -> ${newQty}`);
            await db.prepare(
              'UPDATE line_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(newQty, dbItem.id);
            remainingToDelete = 0;
          }
        }
      }
      
      const remainingItems = await db.prepare(
        'SELECT SUM(quantity) as total FROM line_items WHERE shopify_order_id = ?'
      ).get(orderId);
      
      await db.prepare(
        'UPDATE orders SET total_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE shopify_order_id = ?'
      ).run(remainingItems.total || 0, orderId);
      
      console.log(`✓ Refund processed successfully`);
      return { success: true };
    } catch (error) {
      console.error('Error handling refund created:', error);
      return { success: false, error: error.message };
    }
  }

  // Handle order edits complete
  static async handleOrderEditsComplete(editData) {
    try {
      console.log(`\n=== Order Edits Complete Webhook ===`);
      console.log('Full webhook data:', JSON.stringify(editData, null, 2));
      
      const orderId = editData.order_edit?.order_id || editData.order_id || editData.admin_graphql_api_order_id;
      
      if (!orderId) {
        console.error('No order_id found in Order Edits webhook data');
        console.error('Available keys:', Object.keys(editData));
        return { success: false, error: 'No order_id in webhook data' };
      }
      
      const committed = editData.order_edit?.committed_at;
      
      if (!committed) {
        console.log('⚠️  Order edit was not committed, skipping');
        return { success: true, message: 'Edit not committed' };
      }
      
      console.log(`Edit ID: ${editData.order_edit?.id || editData.id || editData.admin_graphql_api_id}`);
      console.log(`Order ID: ${orderId}`);
      console.log(`✓ Order edit committed at: ${committed}`);
      
      console.log('Fetching latest order data from Shopify API...');
      const orderData = await shopifyClient.getOrder(orderId);
      
      console.log(`✓ Got fresh data for order ${orderData.name}`);
      console.log(`Line items count: ${orderData.line_items.length}`);
      
      await db.prepare(`
        UPDATE orders SET 
          is_edited = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(orderData.id.toString());
      
      console.log(`✓ Marked order ${orderData.name} as edited`);
      
      return await this.handleOrderUpdated(orderData);
    } catch (error) {
      console.error('Error handling order edits complete:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Handle order cancelled
  static async handleOrderCancelled(orderData) {
    try {
      const shopifyOrderId = orderData.id.toString();
      
      // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
      await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
      await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);
      
      console.log(`Order ${orderData.name} cancelled - order and line_items removed, transfer_items preserved`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order cancelled:', error);
      throw error;
    }
  }

  // Handle order fulfilled
  static async handleOrderFulfilled(orderData) {
    try {
      const shopifyOrderId = orderData.id.toString();
      
      // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
      await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
      await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);

      console.log(`Order ${orderData.name} fulfilled - order and line_items removed, transfer_items preserved`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order fulfilled:', error);
      throw error;
    }
  }
}

module.exports = OrderWebhookHandler;
```


## server/canadapost/client.js

```javascript
require('dotenv').config();
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

class CanadaPostClient {
  constructor() {
    this.username = process.env.CP_API_USERNAME;
    this.password = process.env.CP_API_PASSWORD;
    this.customerNumber = process.env.CP_CUSTOMER_NUMBER || '0008398038';
    this.contractId = process.env.CP_CONTRACT_ID || '0044158012';
    this.isProduction = process.env.CP_ENVIRONMENT === 'production';

    this.baseUrl = this.isProduction
      ? 'https://soa-gw.canadapost.ca'
      : 'https://ct.soa-gw.canadapost.ca';

    if (!this.username || !this.password) {
      console.error('ERROR: CP_API_USERNAME or CP_API_PASSWORD is not set!');
    }

    console.log(`Canada Post Client initialized (${this.isProduction ? 'PRODUCTION' : 'SANDBOX'})`);
  }

  // Base64 encode credentials for Basic Auth
  getAuthHeader() {
    const credentials = `${this.username}:${this.password}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  // Parse XML response to JS object
  async parseXml(xmlString) {
    try {
      return await parseStringPromise(xmlString, {
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [(name) => name.replace(/^[^:]+:/, '')]
      });
    } catch (error) {
      console.error('Error parsing XML:', error.message);
      throw new Error('Failed to parse Canada Post XML response');
    }
  }

  // Extract error messages from Canada Post XML error response
  extractErrors(parsedXml) {
    try {
      const messages = parsedXml?.messages?.message;
      if (!messages) return 'Unknown error';
      if (Array.isArray(messages)) {
        return messages.map(m => `[${m.code}] ${m.description}`).join('; ');
      }
      return `[${messages.code}] ${messages.description}`;
    } catch {
      return 'Unknown error';
    }
  }

  // Determine Canada Post service code from Shopify shipping info
  getServiceCode(shippingCode, shippingTitle) {
    if (!shippingCode && !shippingTitle) return 'DOM.EP';
    if (shippingCode === 'DOM.XP' || shippingTitle?.includes('Xpresspost')) return 'DOM.XP';
    if (shippingCode === 'DOM.PC' || shippingTitle?.includes('Priority')) return 'DOM.PC';
    return 'DOM.EP';
  }

  // Parse box dimensions string "LxWxH" in inches → cm
  parseDimensions(dimensionString) {
    if (!dimensionString) return null;
    const parts = dimensionString.split('x').map(p => parseFloat(p.trim()));
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return {
      length: (parts[0] * 2.54).toFixed(1),
      width: (parts[1] * 2.54).toFixed(1),
      height: (parts[2] * 2.54).toFixed(1)
    };
  }

  // Build optional services XML fragment
  buildOptionsXml(labelOptions = {}) {
    const options = [];

    // Liability coverage is always included (free up to $100)
    options.push(`
      <option>
        <option-code>COV</option-code>
        <option-amount>100.00</option-amount>
      </option>`);

    if (labelOptions.signature) {
      options.push(`
      <option>
        <option-code>SO</option-code>
      </option>`);
    }

    if (labelOptions.cardForPickup) {
      options.push(`
      <option>
        <option-code>HFP</option-code>
      </option>`);
    }

    // LAD and HFP are mutually exclusive — LAD takes priority if both somehow selected
    if (labelOptions.leaveAtDoor && !labelOptions.cardForPickup) {
      options.push(`
      <option>
        <option-code>LAD</option-code>
      </option>`);
    }

    if (options.length === 0) return '';
    return `<options>${options.join('')}
    </options>`;
  }

  // Build XML for sender (always uses our warehouse address from settings)
  buildSenderXml(senderInfo) {
    return `
    <sender>
      ${senderInfo.contact ? `<name>${senderInfo.contact}</name>` : ''}
      <company>${senderInfo.company || 'HERA BEAUTÉ'}</company>
      <contact-phone>0000000000</contact-phone>
      <address-details>
        <address-line-1>${senderInfo.address1}</address-line-1>
        ${senderInfo.address2 ? `<address-line-2>${senderInfo.address2}</address-line-2>` : ''}
        <city>${senderInfo.city}</city>
        <prov-state>${senderInfo.province}</prov-state>
        <country-code>CA</country-code>
        <postal-zip-code>${senderInfo.postalCode.replace(/\s/g, '')}</postal-zip-code>
      </address-details>
    </sender>`;
  }

  // Build XML for destination from Shopify order data
  buildDestinationXml(order) {
    return `
    <destination>
      <name>${this.escapeXml(order.shipping_name || '')}</name>
      <address-details>
        <address-line-1>${this.escapeXml(order.shipping_address1 || '')}</address-line-1>
        ${order.shipping_address2 ? `<address-line-2>${this.escapeXml(order.shipping_address2)}</address-line-2>` : ''}
        <city>${this.escapeXml(order.shipping_city || '')}</city>
        <prov-state>${this.getProvinceCode(order.shipping_province || '')}</prov-state>
        <country-code>${this.getCountryCode(order.shipping_country_code || order.shipping_country)}</country-code>
        <postal-zip-code>${(order.shipping_zip || '').replace(/\s/g, '')}</postal-zip-code>
      </address-details>
    </destination>`;
  }

  // Convert province/state name to code
  getProvinceCode(province) {
    if (!province) return province;
    if (province.length <= 3) return province.toUpperCase();
    const map = {
      'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB',
      'new brunswick': 'NB', 'newfoundland and labrador': 'NL', 'newfoundland': 'NL',
      'northwest territories': 'NT', 'nova scotia': 'NS', 'nunavut': 'NU',
      'ontario': 'ON', 'prince edward island': 'PE', 'quebec': 'QC', 'québec': 'QC',
      'saskatchewan': 'SK', 'yukon': 'YT',
      // US states
      'california': 'CA', 'new york': 'NY', 'texas': 'TX', 'florida': 'FL',
      'washington': 'WA', 'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH',
    };
    return map[province.toLowerCase().trim()] || province.substring(0, 2).toUpperCase();
  }

  // Convert country name to 2-letter ISO code
  getCountryCode(country) {
    if (!country) return 'CA';
    if (country.length === 2) return country.toUpperCase();
    const map = {
      'canada': 'CA', 'united states': 'US', 'usa': 'US', 'united states of america': 'US',
      'united kingdom': 'GB', 'uk': 'GB', 'australia': 'AU', 'france': 'FR',
      'germany': 'DE', 'japan': 'JP', 'china': 'CN', 'mexico': 'MX',
      'south korea': 'KR', 'korea': 'KR', 'italy': 'IT', 'spain': 'ES',
      'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'sweden': 'SE',
      'norway': 'NO', 'denmark': 'DK', 'finland': 'FI', 'portugal': 'PT',
      'brazil': 'BR', 'argentina': 'AR', 'colombia': 'CO', 'chile': 'CL',
      'india': 'IN', 'singapore': 'SG', 'hong kong': 'HK', 'taiwan': 'TW',
      'new zealand': 'NZ', 'ireland': 'IE', 'austria': 'AT', 'poland': 'PL',
    };
    return map[country.toLowerCase().trim()] || country.substring(0, 2).toUpperCase();
  }

  // Escape special XML characters
  escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Generate a unique group-id for today's shipments
  getTodayGroupId() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `HERA-${y}${m}${d}`;
  }

  // ============================================================
  // CREATE SHIPMENT
  // Creates a shipment and returns tracking number + label URL
  // ============================================================
  async createShipment({ order, boxType, weightGrams, labelOptions, senderInfo }) {
    console.log('\n========== CANADA POST CREATE SHIPMENT ==========');
    console.log(`Order: ${order.name}`);
    console.log(`Box type: ${boxType}, Weight: ${weightGrams}g`);
    console.log(`Label options:`, labelOptions);

    const serviceCode = this.getServiceCode(order.shipping_code, order.shipping_title);
    console.log(`Service code: ${serviceCode}`);

    // Weight: grams → kg (Canada Post requires kg, 3 decimal places)
    const weightKg = (weightGrams / 1000).toFixed(3);

    // Dimensions from box_types — always stored as "LxWxH" in inches → convert to cm
    // Custom size: user also enters inches, same conversion applies
    const dimensions = this.parseDimensions(boxType?.dimensions);

    const groupId = this.getTodayGroupId();
    const customerRequestId = `${order.name}-${Date.now()}`;
    const postalCode = senderInfo.postalCode.replace(/\s/g, '');

    const optionsXml = this.buildOptionsXml(labelOptions);
    const senderXml = this.buildSenderXml(senderInfo);
    const destinationXml = this.buildDestinationXml(order);

    const dimensionsXml = dimensions ? `
        <dimensions>
          <length>${dimensions.length}</length>
          <width>${dimensions.width}</width>
          <height>${dimensions.height}</height>
        </dimensions>` : '';

    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<shipment xmlns="http://www.canadapost.ca/ws/shipment-v8">
  <customer-request-id>${customerRequestId}</customer-request-id>
  <group-id>${groupId}</group-id>
  <requested-shipping-point>${postalCode}</requested-shipping-point>
  <cpc-pickup-indicator>true</cpc-pickup-indicator>
  <delivery-spec>
    <service-code>${serviceCode}</service-code>
    ${senderXml}
    ${destinationXml}
    ${optionsXml}
    <parcel-characteristics>
      <weight>${weightKg}</weight>
      ${dimensionsXml}
    </parcel-characteristics>
    <print-preferences>
      <output-format>4x6</output-format>
      <encoding>PDF</encoding>
    </print-preferences>
    <preferences>
      <show-packing-instructions>false</show-packing-instructions>
      <show-postage-rate>false</show-postage-rate>
      <show-insured-value>false</show-insured-value>
    </preferences>
    <references>
      <customer-ref-1>${this.escapeXml(order.name)}</customer-ref-1>
    </references>
    <settlement-info>
      <contract-id>${this.contractId}</contract-id>
      <intended-method-of-payment>Account</intended-method-of-payment>
    </settlement-info>
  </delivery-spec>
</shipment>`;

    console.log('Sending Create Shipment request...');

    try {
      const response = await axios.post(
        `${this.baseUrl}/rs/${this.customerNumber}/${this.customerNumber}/shipment`,
        requestXml,
        {
          headers: {
            'Content-Type': 'application/vnd.cpc.shipment-v8+xml',
            'Accept': 'application/vnd.cpc.shipment-v8+xml',
            'Authorization': this.getAuthHeader(),
            'Accept-language': 'en-CA'
          }
        }
      );

      const parsed = await this.parseXml(response.data);
      const info = parsed?.['shipment-info'];

      if (!info) {
        throw new Error('Unexpected response structure from Canada Post');
      }

      const trackingPin = info['tracking-pin'];
      const shipmentId = info['shipment-id'];

      // Find label link (rel="label")
      const links = info?.links?.link;
      let labelHref = null;
      let labelMediaType = 'application/pdf';

      if (Array.isArray(links)) {
        const labelLink = links.find(l => l.$ && l.$.rel === 'label');
        if (labelLink) {
          labelHref = labelLink.$.href;
          labelMediaType = labelLink.$['media-type'] || 'application/pdf';
        }
      } else if (links && links.$ && links.$.rel === 'label') {
        labelHref = links.$.href;
        labelMediaType = links.$['media-type'] || 'application/pdf';
      }

      console.log(`✓ Shipment created. Tracking: ${trackingPin}`);
      console.log(`  Shipment ID: ${shipmentId}`);
      console.log(`  Label URL: ${labelHref}`);
      console.log('=================================================\n');

      return {
        trackingPin,
        shipmentId,
        labelHref,
        labelMediaType,
        groupId
      };
    } catch (error) {
      if (error.response) {
        console.error('Canada Post API error status:', error.response.status);
        console.error('Canada Post API error data:', error.response.data);
        try {
          const parsed = await this.parseXml(error.response.data);
          const errorMsg = this.extractErrors(parsed);
          throw new Error(`Canada Post API error: ${errorMsg}`);
        } catch (parseErr) {
          if (parseErr.message.startsWith('Canada Post API error:')) throw parseErr;
          throw new Error(`Canada Post API error (${error.response.status}): ${error.response.data}`);
        }
      }
      throw error;
    }
  }

  // ============================================================
  // GET ARTIFACT (Download label PDF)
  // Returns a Buffer of the PDF
  // ============================================================
  async getLabelPdf(labelHref) {
    console.log(`Downloading label PDF from: ${labelHref}`);
    try {
      const response = await axios.get(labelHref, {
        headers: {
          'Accept': 'application/pdf',
          'Authorization': this.getAuthHeader()
        },
        responseType: 'arraybuffer'
      });

      console.log(`✓ Label PDF downloaded (${response.data.byteLength} bytes)`);
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error downloading label PDF:', error.message);
      throw new Error(`Failed to download label PDF: ${error.message}`);
    }
  }

  // ============================================================
  // TRANSMIT SHIPMENTS
  // Submits all shipments in a group for billing/manifest
  // Returns array of manifest links
  // ============================================================
  async transmitShipments(groupIds, senderInfo) {
    const groupIdArray = Array.isArray(groupIds) ? groupIds : [groupIds];
    console.log(`\n========== CANADA POST TRANSMIT SHIPMENTS ==========`);
    console.log(`Group IDs: ${groupIdArray.join(', ')}`);


    const postalCode = senderInfo.postalCode.replace(/\s/g, '');

    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<transmit-set xmlns="http://www.canadapost.ca/ws/manifest-v8">
  <group-ids>
    ${groupIdArray.map(id => `<group-id>${id}</group-id>`).join('\n    ')}
  </group-ids>
  <requested-shipping-point>${postalCode}</requested-shipping-point>
  <cpc-pickup-indicator>true</cpc-pickup-indicator>
  <detailed-manifests>true</detailed-manifests>
  <method-of-payment>Account</method-of-payment>
  <manifest-address>
    <manifest-company>${this.escapeXml(senderInfo.company || 'HERA BEAUTÉ')}</manifest-company>
    ${senderInfo.contact ? `<manifest-name>${this.escapeXml(senderInfo.contact)}</manifest-name>` : ''}
    <phone-number>0000000000</phone-number>
    <address-details>
      <address-line-1>${this.escapeXml(senderInfo.address1)}</address-line-1>
      ${senderInfo.address2 ? `<address-line-2>${this.escapeXml(senderInfo.address2)}</address-line-2>` : ''}
      <city>${this.escapeXml(senderInfo.city)}</city>
      <prov-state>${this.escapeXml(senderInfo.province)}</prov-state>
      <postal-zip-code>${postalCode}</postal-zip-code>
    </address-details>
  </manifest-address>
</transmit-set>`;

    try {
      const response = await axios.post(
        `${this.baseUrl}/rs/${this.customerNumber}/${this.customerNumber}/manifest`,
        requestXml,
        {
          headers: {
            'Content-Type': 'application/vnd.cpc.manifest-v8+xml',
            'Accept': 'application/vnd.cpc.manifest-v8+xml',
            'Authorization': this.getAuthHeader(),
            'Accept-language': 'en-CA'
          }
        }
      );

      const parsed = await this.parseXml(response.data);
      const links = parsed?.manifests?.link;

      const manifestLinks = [];
      if (Array.isArray(links)) {
        links.forEach(l => {
          if (l.$ && l.$.rel === 'manifest') manifestLinks.push(l.$.href);
        });
      } else if (links && links.$ && links.$.rel === 'manifest') {
        manifestLinks.push(links.$.href);
      }

      console.log(`✓ Transmit successful. ${manifestLinks.length} manifest(s) created.`);
      console.log('====================================================\n');
      return manifestLinks;
    } catch (error) {
      if (error.response) {
        try {
          const parsed = await this.parseXml(error.response.data);
          const errorMsg = this.extractErrors(parsed);
          throw new Error(`Canada Post transmit error: ${errorMsg}`);
        } catch (parseErr) {
          if (parseErr.message.startsWith('Canada Post transmit error:')) throw parseErr;
          throw new Error(`Canada Post transmit error (${error.response.status})`);
        }
      }
      throw error;
    }
  }

  // ============================================================
  // GET MANIFEST PDF
  // Given a manifest link from transmit, returns the PDF buffer
  // ============================================================
  async getManifestPdf(manifestHref) {
    console.log(`Getting manifest from: ${manifestHref}`);
    try {
      // Step 1: Get manifest details (contains artifact link)
      const manifestResponse = await axios.get(manifestHref, {
        headers: {
          'Accept': 'application/vnd.cpc.manifest-v8+xml',
          'Authorization': this.getAuthHeader(),
          'Accept-language': 'en-CA'
        }
      });

      const parsed = await this.parseXml(manifestResponse.data);
      const links = parsed?.manifest?.links?.link;

      let artifactHref = null;
      if (Array.isArray(links)) {
        const artifactLink = links.find(l => l.$ && l.$.rel === 'artifact');
        if (artifactLink) artifactHref = artifactLink.$.href;
      } else if (links && links.$ && links.$.rel === 'artifact') {
        artifactHref = links.$.href;
      }

      if (!artifactHref) {
        throw new Error('No artifact link found in manifest response');
      }

      console.log(`Downloading manifest PDF from: ${artifactHref}`);

      // Step 2: Download the PDF
      const pdfResponse = await axios.get(artifactHref, {
        headers: {
          'Accept': 'application/pdf',
          'Authorization': this.getAuthHeader()
        },
        responseType: 'arraybuffer'
      });

      console.log(`✓ Manifest PDF downloaded (${pdfResponse.data.byteLength} bytes)`);
      return Buffer.from(pdfResponse.data);
    } catch (error) {
      console.error('Error getting manifest PDF:', error.message);
      throw new Error(`Failed to get manifest PDF: ${error.message}`);
    }
  }
}

module.exports = new CanadaPostClient();
```
