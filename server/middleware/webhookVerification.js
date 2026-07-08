const crypto = require('crypto');

// Verify Shopify webhook HMAC
// 🆕 用 req.rawBody（原始字节）而不是 JSON.stringify(req.body) —— 否则签名永远对不上
// 🆕 软启动：WEBHOOK_HMAC_ENFORCE !== 'true' 时，验证失败只记日志、不拦截请求
const verifyWebhook = (req, res, next) => {
  const enforce = process.env.WEBHOOK_HMAC_ENFORCE === 'true';
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');

  if (!hmacHeader) {
    console.warn(`[HMAC] No HMAC header found on ${req.originalUrl}`);
    if (enforce) return res.status(401).send('Unauthorized');
    return next();
  }

  if (!req.rawBody) {
    console.warn(`[HMAC] req.rawBody missing on ${req.originalUrl} — check express.json() verify config`);
    if (enforce) return res.status(401).send('Unauthorized');
    return next();
  }

  const generatedHash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(req.rawBody)
    .digest('base64');

  let valid = false;
  try {
    const a = Buffer.from(generatedHash, 'base64');
    const b = Buffer.from(hmacHeader, 'base64');
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    valid = false;
  }

  if (!valid) {
    console.warn(`[HMAC] Verification failed on ${req.originalUrl}${enforce ? ' — rejecting' : ' — WEBHOOK_HMAC_ENFORCE not set, allowing through'}`);
    if (enforce) return res.status(401).send('Unauthorized');
    return next();
  }

  next();
};

module.exports = verifyWebhook;