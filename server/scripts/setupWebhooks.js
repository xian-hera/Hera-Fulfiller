require('dotenv').config();
const shopifyClient = require('../shopify/client');

async function setupWebhooks() {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    console.error('Error: APP_URL not set in environment variables');
    process.exit(1);
  }

  const webhooks = [
    { topic: 'orders/create', address: `${appUrl}/api/webhooks/orders/create` },
    { topic: 'orders/updated', address: `${appUrl}/api/webhooks/orders/updated` },
    { topic: 'orders/edited', address: `${appUrl}/api/webhooks/orders/edited` },
    { topic: 'orders/cancelled', address: `${appUrl}/api/webhooks/orders/cancelled` },
    { topic: 'orders/fulfilled', address: `${appUrl}/api/webhooks/orders/fulfilled` },
    // 🆕 Fulfillment hold 相关
    { topic: 'fulfillment_orders/placed_on_hold', address: `${appUrl}/api/webhooks/fulfillment_orders/placed_on_hold` },
    { topic: 'fulfillment_orders/hold_released', address: `${appUrl}/api/webhooks/fulfillment_orders/hold_released` }
  ];

  try {
    const existingWebhooks = await shopifyClient.listWebhooks();
    console.log(`Found ${existingWebhooks.length} existing webhooks`);

    // 🆕 增量模式：只创建缺失的 topic，不删除、不动已存在的 webhook
    for (const webhook of webhooks) {
      const existing = existingWebhooks.find(w => w.topic === webhook.topic);

      if (existing) {
        if (existing.address !== webhook.address) {
          console.log(`⚠️  Topic ${webhook.topic} already exists but points to a different address:`);
          console.log(`     existing: ${existing.address}`);
          console.log(`     expected: ${webhook.address}`);
          console.log(`     Skipping — not modifying. Delete it manually in Shopify Admin if you need to update it.`);
        } else {
          console.log(`✓ Already exists, skipping: ${webhook.topic}`);
        }
        continue;
      }

      console.log(`Creating webhook: ${webhook.topic} -> ${webhook.address}`);
      await shopifyClient.createWebhook(webhook.topic, webhook.address);
      console.log(`✓ Created webhook: ${webhook.topic}`);
    }

    console.log('\n✓ Webhook setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up webhooks:', error.message);
    process.exit(1);
  }
}

setupWebhooks();