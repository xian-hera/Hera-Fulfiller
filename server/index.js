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

// 🔧 TEMP OAuth callback - remove after capturing new access token
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, shop } = req.query;
    console.log('========== OAUTH CALLBACK RECEIVED ==========');
    console.log('Shop:', shop);
    console.log('Code:', code);

    if (!code || !shop) {
      return res.status(400).send('Missing code or shop parameter');
    }

    // Exchange code for access token
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = response.data.access_token;
    const scope = response.data.scope;

    console.log('✓ New Access Token:', accessToken);
    console.log('✓ Granted Scopes:', scope);
    console.log('=============================================');

    res.send(`
      <h2>✓ OAuth Success</h2>
      <p><strong>New Access Token:</strong></p>
      <pre style="background:#f0f0f0;padding:16px;word-break:break-all">${accessToken}</pre>
      <p><strong>Granted Scopes:</strong></p>
      <pre style="background:#f0f0f0;padding:16px">${scope}</pre>
      <p>Copy the access token above and update your Render environment variable <code>SHOPIFY_ACCESS_TOKEN</code>.</p>
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