const crypto = require('crypto');

// Verify Shopify webhook HMAC
const verifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  
  if (!hmacHeader) {
    console.warn('No HMAC header found in webhook request');
    return res.status(401).send('Unauthorized');
  }

  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  if (hash !== hmacHeader) {
    console.warn('HMAC verification failed');
    return res.status(401).send('Unauthorized');
  }

  next();
};

module.exports = verifyWebhook;