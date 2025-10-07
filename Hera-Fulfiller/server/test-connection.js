require('dotenv').config();
const shopifyClient = require('./shopify/client');

async function testConnection() {
  try {
    console.log('Testing Shopify connection...');
    console.log('Store URL:', process.env.SHOPIFY_STORE_URL);
    
    const webhooks = await shopifyClient.listWebhooks();
    console.log('✅ Connection successful!');
    console.log('Existing webhooks:', webhooks.length);
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Please check your .env configuration');
  }
}

testConnection();