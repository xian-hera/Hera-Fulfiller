// POS UI Extension 鉴权（方案文档 7.6）
// POS 端用内置 Session API 拿一个 HS256 签名的 JWT（shopify.session.getSessionToken()），
// 后端这里用跟 embedded admin app 同一套凭证（App Secret）验证签名 —— 这是文档里"两种可选认证方式"
// 中确认采用的那一种（Session API 手动验证，不是走 Shopify 自动注入 ID token 的 App authentication）。
//
// 校验内容：签名（HS256 + SHOPIFY_API_SECRET）+ aud（必须等于我们 app 的 client id / API key）
// + exp/nbf（jsonwebtoken 的 jwt.verify 会自动校验，不需要手动再判断一次）。
// dest（shop domain）目前项目是单店铺（.env 里只配了一个 SHOPIFY_SHOP_NAME），不需要额外拿它去匹配
// 多租户数据，但仍然挂在 req.shopDomain 上，方便以后需要时用。

const jwt = require('jsonwebtoken');

function posSessionAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing session token' });
  }
  if (!process.env.SHOPIFY_API_SECRET) {
    console.error('SHOPIFY_API_SECRET is not configured — cannot verify POS session token');
    return res.status(500).json({ error: 'Server auth is not configured' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid session token: ' + error.message });
  }

  if (process.env.SHOPIFY_API_KEY && payload.aud !== process.env.SHOPIFY_API_KEY) {
    return res.status(401).json({ error: 'Session token audience mismatch' });
  }

  req.shopDomain = (payload.dest || '').replace(/^https?:\/\//, '');
  req.sessionPayload = payload;
  next();
}

module.exports = posSessionAuth;
