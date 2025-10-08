require('dotenv').config();
const shopifyClient = require('../shopify/client');

async function setupWebhooks() {
  const appUrl = process.env.APP_URL;
  
  if (!appUrl) {
    console.error('Error: APP_URL not set in environment variables');
    process.exit(1);
  }

  const webhooks = [
    {
      topic: 'orders/create',
      address: `${appUrl}/api/webhooks/orders/create`
    },
    {
      topic: 'orders/updated',
      address: `${appUrl}/api/webhooks/orders/updated`
    },
    {
      topic: 'orders/edited',
      address: `${appUrl}/api/webhooks/orders/edited`
    },
    {
      topic: 'orders/cancelled',
      address: `${appUrl}/api/webhooks/orders/cancelled`
    },
    {
      topic: 'orders/fulfilled',
      address: `${appUrl}/api/webhooks/orders/fulfilled`
    }
  ];

  try {
    // Get existing webhooks
    const existingWebhooks = await shopifyClient.listWebhooks();
    console.log(`Found ${existingWebhooks.length} existing webhooks`);

    // Delete old webhooks for these topics
    for (const webhook of existingWebhooks) {
      const shouldDelete = webhooks.some(w => w.topic === webhook.topic);
      if (shouldDelete) {
        console.log(`Deleting old webhook: ${webhook.topic} -> ${webhook.address}`);
        await shopifyClient.deleteWebhook(webhook.id);
      }
    }

    // Create new webhooks
    for (const webhook of webhooks) {
      console.log(`Creating webhook: ${webhook.topic} -> ${webhook.address}`);
      await shopifyClient.createWebhook(webhook.topic, webhook.address);
      console.log(`✓ Created webhook: ${webhook.topic}`);
    }

    console.log('\n✓ All webhooks configured successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up webhooks:', error.message);
    process.exit(1);
  }
}

setupWebhooks();