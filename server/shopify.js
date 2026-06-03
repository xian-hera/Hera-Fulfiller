const { shopifyApi, ApiVersion, Session } = require('@shopify/shopify-api');
const { nodeAdapterPackage } = require('@shopify/shopify-api/adapters/node');
const { pool } = require('./database/init');

let shopify;

const setupShopify = (app) => {
  shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SHOPIFY_SCOPES.split(','),
    hostName: process.env.HOST.replace(/https?:\/\//, ''),
    apiVersion: '2025-01',
    isEmbeddedApp: false,
    ...nodeAdapterPackage,
  });

  // Begin OAuth
  app.get('/auth', async (req, res) => {
    const shop = req.query.shop || process.env.SHOPIFY_SHOP_NAME;
    if (!shop) return res.status(400).send('Missing shop parameter');

    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true),
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  });

  // OAuth callback
  app.get('/auth/callback', async (req, res) => {
    try {
      const callbackResponse = await shopify.auth.callback({
        rawRequest: req,
        rawResponse: res,
      });

      const session = callbackResponse.session;
      console.log(`✓ Auth complete for shop: ${session.shop}`);
      console.log(`✓ Access Token: ${session.accessToken}`);
      console.log(`✓ Scopes: ${session.scope}`);

      await saveSession(session);

      res.send(`
        <h2>✓ Auth Success</h2>
        <p><strong>Shop:</strong> ${session.shop}</p>
        <p><strong>Scopes:</strong> ${session.scope}</p>
        <p>Token has been saved to database. The app is ready to use.</p>
      `);
    } catch (e) {
      console.error('Auth callback error:', e);
      res.status(500).send(e.message);
    }
  });
};

// Save session to DB
const saveSession = async (session) => {
  await pool.query(
    `INSERT INTO sessions (id, shop, state, is_online, scope, expires, access_token, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET
       access_token = $7,
       scope = $5,
       expires = $6,
       updated_at = NOW()`,
    [
      session.id,
      session.shop,
      session.state || null,
      session.isOnline || false,
      session.scope || null,
      session.expires || null,
      session.accessToken,
    ]
  );
};

// Load session from DB by shop
const loadSession = async (shop) => {
  const result = await pool.query(
    'SELECT * FROM sessions WHERE shop = $1 ORDER BY updated_at DESC LIMIT 1',
    [shop]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return new Session({
    id: row.id,
    shop: row.shop,
    state: row.state || '',
    isOnline: row.is_online,
    scope: row.scope || '',
    accessToken: row.access_token,
    expires: row.expires ? new Date(row.expires) : undefined,
  });
};

const getSession = async () => {
  return await loadSession(process.env.SHOPIFY_SHOP_NAME);
};

const getShopify = () => shopify;

module.exports = { setupShopify, getSession, getShopify };