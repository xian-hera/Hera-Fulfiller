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
const barcodeRoutes = require('./routes/barcode');
const ordersRoutes = require('./routes/orders');
const verifyWebhook = require('./middleware/webhookVerification');

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
// 🔒 2026-10 加固：
//   - shop 参数必须是 xxx.myshopify.com 格式，并且（配置了 SHOPIFY_SHOP_NAME 时）必须就是我们自己的店
//     —— 之前不校验，别人构造 /auth/callback?shop=恶意域名，服务器就会把 SHOPIFY_API_SECRET 发过去
//   - 校验 Shopify 回调带的 hmac 签名（证明请求确实来自 Shopify）
//   - 校验 state（发起授权时存在 cookie 里，回调时必须一致，防 CSRF）
//   - 页面输出的 shop / scope 做 HTML 转义
const crypto = require('crypto');

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const OAUTH_STATE_COOKIE = 'shopify_oauth_state';

function isAllowedShop(shop) {
  if (!shop || !SHOP_DOMAIN_RE.test(shop)) return false;
  const configured = (process.env.SHOPIFY_SHOP_NAME || process.env.SHOPIFY_STORE_URL || '').toLowerCase();
  return !configured || shop.toLowerCase() === configured;
}

// Shopify OAuth 回调 hmac：去掉 hmac 参数，其余按 key 排序拼成 a=1&b=2，用 App secret 做 HMAC-SHA256（hex）
function isValidOAuthHmac(query) {
  const { hmac, signature, ...rest } = query;
  if (!hmac || !process.env.SHOPIFY_API_SECRET) return false;
  const message = Object.keys(rest).sort()
    .map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('&');
  const expected = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(message).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(hmac), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// 第一步：在浏览器里打开 /auth 来发起授权
app.get('/auth', (req, res) => {
  const shop = req.query.shop || process.env.SHOPIFY_SHOP_NAME;
  if (!isAllowedShop(shop)) return res.status(400).send('Invalid shop');

  const redirectUri = `${process.env.HOST}/auth/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000
  });

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
    const { code, shop, state } = req.query;
    if (!code || !shop) return res.status(400).send('Missing code or shop parameter');
    if (!isAllowedShop(shop)) {
      console.warn(`[OAuth] Rejected callback for unexpected shop: ${shop}`);
      return res.status(400).send('Invalid shop');
    }
    if (!isValidOAuthHmac(req.query)) {
      console.warn('[OAuth] Rejected callback: invalid hmac');
      return res.status(400).send('Invalid request signature');
    }
    const expectedState = readCookie(req, OAUTH_STATE_COOKIE);
    if (!state || !expectedState || state !== expectedState) {
      console.warn('[OAuth] Rejected callback: state mismatch');
      return res.status(400).send('Invalid or expired authorization request. Please open /auth again.');
    }
    res.clearCookie(OAUTH_STATE_COOKIE);

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
      <p><strong>Shop:</strong> ${escapeHtml(shop)}</p>
      <p><strong>Granted Scopes:</strong></p>
      <pre style="background:#f0f0f0;padding:16px">${escapeHtml(scope)}</pre>
      <p>Token 已存入数据库，app 可以正常工作了。无需手动填写任何环境变量。</p>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).send('OAuth error. Check the server logs for details.');
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
app.use('/api/barcode', barcodeRoutes);
app.use('/api/orders', ordersRoutes); // 🆕 Home 页 Add Order（手动从 Shopify 导入订单）

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

// 等数据库连上、建表迁移跑完（db.ready，见 database/init.js）再开始监听端口。
// 原来是立刻 listen，迁移还在后台跑时进来的请求会报 500。
db.ready.then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
});
