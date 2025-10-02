require('dotenv').config();
const axios = require('axios');

class ShopifyClient {
  constructor() {
    this.shopUrl = process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2024-01';
    
    this.client = axios.create({
      baseURL: `https://${this.shopUrl}/admin/api/${this.apiVersion}`,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get product variant
  async getProductVariant(variantId) {
    try {
      const response = await this.client.get(`/variants/${variantId}.json`);
      return response.data.variant;
    } catch (error) {
      console.error('Error fetching product variant:', error);
      throw error;
    }
  }

  // Update product variant weight
  async updateVariantWeight(variantId, weightInGrams) {
    try {
      const response = await this.client.put(`/variants/${variantId}.json`, {
        variant: {
          id: variantId,
          weight: weightInGrams / 1000, // Convert to kg
          weight_unit: 'kg'
        }
      });
      return response.data.variant;
    } catch (error) {
      console.error('Error updating variant weight:', error);
      throw error;
    }
  }

  // Get order
  async getOrder(orderId) {
    try {
      const response = await this.client.get(`/orders/${orderId}.json`);
      return response.data.order;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw error;
    }
  }

  // Update order fulfillment
  async fulfillOrder(orderId, lineItems) {
    try {
      const response = await this.client.post(`/orders/${orderId}/fulfillments.json`, {
        fulfillment: {
          line_items: lineItems.map(item => ({
            id: item.id,
            quantity: item.quantity
          })),
          notify_customer: true
        }
      });
      return response.data.fulfillment;
    } catch (error) {
      console.error('Error fulfilling order:', error);
      throw error;
    }
  }

  // Create webhook
  async createWebhook(topic, address) {
    try {
      const response = await this.client.post('/webhooks.json', {
        webhook: {
          topic,
          address,
          format: 'json'
        }
      });
      return response.data.webhook;
    } catch (error) {
      console.error('Error creating webhook:', error);
      throw error;
    }
  }

  // List all webhooks
  async listWebhooks() {
    try {
      const response = await this.client.get('/webhooks.json');
      return response.data.webhooks;
    } catch (error) {
      console.error('Error listing webhooks:', error);
      throw error;
    }
  }

  // Delete webhook
  async deleteWebhook(webhookId) {
    try {
      await this.client.delete(`/webhooks/${webhookId}.json`);
      return true;
    } catch (error) {
      console.error('Error deleting webhook:', error);
      throw error;
    }
  }
}

module.exports = new ShopifyClient();