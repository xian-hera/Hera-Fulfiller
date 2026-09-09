require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const db = require('./database/init');
const giftRoutes = require('./routes/gift');

// Import routes
const pickerRoutes = require('./routes/picker');
const transferRoutes = require('./routes/transfer');
const packerRoutes = require('./routes/packer');
const settingsRoutes = require('./routes/settings');
const webhookRoutes = require('./routes/webhooks');
const connecteamRoutes = require('./routes/connecteam');
const shopifyTransferRoutes = require('./routes/shopify-transfer');
const verifyWebhook = require('./middleware/webhookVerification');
const returnsRoutes = require('./routes/returns');
const returnSettingsRoutes = require('./routes/return-settings');
const returnRulesRoutes = require('./routes/return-rules');
const returnPortalRoutes = require('./routes/return-portal');
const posReturnRoutes = require('./routes/pos-return');
const posSessionAuth = require('./middleware/posSessionAuth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
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
app.use('/api/webhooks', verifyWebhook, webhookRoutes);
app.use('/api/connecteam', connecteamRoutes);
app.use('/api/shopify-transfer', shopifyTransferRoutes);
app.use('/api/gift', giftRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/return-settings', returnSettingsRoutes);
app.use('/api/return-rules', returnRulesRoutes);
app.use('/api/return-portal', returnPortalRoutes);
// POS Extension 专属：整条路由都要求 Session token 鉴权（方案文档 7.6），跟 embedded admin app 用同一套 HS256 验证
app.use('/api/pos-return', posSessionAuth, posReturnRoutes);

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

// 🆕 等数据库真正连上、迁移跑完（db.ready，见 database/init.js）之后再开始监听端口 ——
// 之前是 server.listen() 立刻执行，数据库连接/建表迁移在后台异步跑，如果这时候正好有请求
// 打进来就会 500。本地现在直连远程 Render Postgres，这个窗口比以前连本地 SQLite 明显很多。
db.ready
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((error) => {
    console.error('Server did not start — database was not ready:', error);
    process.exit(1);
  });