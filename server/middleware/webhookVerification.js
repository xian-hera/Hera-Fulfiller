const crypto = require('crypto');

// Verify Shopify webhook HMAC
//
// 用 req.rawBody（原始字节）计算签名 —— 用 JSON.stringify(req.body) 的话签名永远对不上。
//
// 签名用哪个密钥，取决于 webhook 是怎么注册的：
//   - 在 Shopify 后台 Settings → Notifications → Webhooks 手动建的 → 用那个页面显示的 signing key
//     （环境变量 SHOPIFY_WEBHOOK_SECRET）
//   - 由 App 自己注册的（shopify.app.toml 或 API 注册）→ 用 App 的 Client secret
//     （环境变量 SHOPIFY_API_SECRET）
// 所以两个都试，任意一个对上就算通过，并在日志里写明是哪一个，方便确认。
//
// 软启动：WEBHOOK_HMAC_ENFORCE !== 'true' 时，验证失败只记日志、不拦截请求。
// 上线后先观察 Render 日志：所有真实 webhook 都出现 "[HMAC] ✓ verified" 再把
// WEBHOOK_HMAC_ENFORCE 设为 true（改环境变量即可，不用改代码）。

function getSigningKeys() {
  return [
    ['webhook signing key', process.env.SHOPIFY_WEBHOOK_SECRET],
    ['app client secret', process.env.SHOPIFY_API_SECRET],
  ].filter(([, key]) => !!key);
}

// 返回匹配上的密钥名称；都不匹配返回 null
function findMatchingKey(rawBody, hmacHeader) {
  const received = Buffer.from(String(hmacHeader), 'base64');
  for (const [label, key] of getSigningKeys()) {
    const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
    if (expected.length === received.length && crypto.timingSafeEqual(expected, received)) {
      return label;
    }
  }
  return null;
}

const verifyWebhook = (req, res, next) => {
  const enforce = process.env.WEBHOOK_HMAC_ENFORCE === 'true';
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const topic = req.get('X-Shopify-Topic') || req.originalUrl;

  const reject = (reason) => {
    console.warn(`[HMAC] ✗ ${reason} on ${topic}${enforce ? ' — rejected' : ' — WEBHOOK_HMAC_ENFORCE not set, allowing through'}`);
    if (enforce) return res.status(401).send('Unauthorized');
    return next();
  };

  if (getSigningKeys().length === 0) {
    return reject('No signing key configured (SHOPIFY_WEBHOOK_SECRET / SHOPIFY_API_SECRET both missing)');
  }
  if (!hmacHeader) return reject('No HMAC header');
  if (!req.rawBody) return reject('req.rawBody missing — check express.json() verify config');

  const matchedKey = findMatchingKey(req.rawBody, hmacHeader);
  if (!matchedKey) return reject('Signature does not match any configured key');

  console.log(`[HMAC] ✓ verified ${topic} (${matchedKey})`);
  next();
};

module.exports = verifyWebhook;
module.exports.findMatchingKey = findMatchingKey;
