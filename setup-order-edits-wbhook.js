const shopifyClient = require('./server/shopify/client');

async function setupOrderEditsWebhook() {
  const webhookUrl = process.env.WEBHOOK_BASE_URL || 'https://your-domain.com';
  
  try {
    // 创建 order_edits/complete webhook
    const webhook = await shopifyClient.createWebhook(
      'order_edits/complete',
      `${webhookUrl}/api/webhooks/order-edits/complete`
    );
    
    console.log('✓ Created order_edits/complete webhook:');
    console.log(`  ID: ${webhook.id}`);
    console.log(`  Address: ${webhook.address}`);
  } catch (error) {
    console.error('Error creating webhook:', error.message);
  }
}

setupOrderEditsWebhook();