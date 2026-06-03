require('dotenv').config();
const axios = require('axios');

class ShopifyClient {
  constructor() {
    this.shopUrl = process.env.SHOPIFY_SHOP_NAME || process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2025-01';
    
    if (!this.shopUrl) {
      console.error('ERROR: SHOPIFY_SHOP_NAME is not set!');
      throw new Error('SHOPIFY_SHOP_NAME environment variable is required');
    }
    
    if (!this.accessToken) {
      console.error('ERROR: SHOPIFY_ACCESS_TOKEN is not set!');
      throw new Error('SHOPIFY_ACCESS_TOKEN environment variable is required');
    }
    
    console.log(`Shopify Client initialized for: ${this.shopUrl}`);
    
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
      console.error('Error fetching product variant:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get product metafield (product level)
  async getProductMetafield(productId, namespace, key) {
    try {
      const response = await this.client.get(`/products/${productId}/metafields.json`);
      const metafields = response.data.metafields || [];
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      if (metafield) return metafield.value;
      return '';
    } catch (error) {
      console.error(`Error fetching product metafield:`, error.message);
      return '';
    }
  }

  // Get variant metafield (variant level)
  async getVariantMetafield(variantId, namespace, key) {
    try {
      const response = await this.client.get(`/variants/${variantId}/metafields.json`);
      const metafields = response.data.metafields || [];
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      if (metafield) return metafield.value;
      return '';
    } catch (error) {
      console.error(`Error fetching variant metafield:`, error.message);
      return '';
    }
  }

  // Update product variant weight
  async updateVariantWeight(variantId, weightInGrams) {
    try {
      const response = await this.client.put(`/variants/${variantId}.json`, {
        variant: {
          id: variantId,
          weight: weightInGrams,
          weight_unit: 'g'
        }
      });
      return response.data.variant;
    } catch (error) {
      console.error('Error updating variant weight:', error.response?.data || error.message);
      throw error;
    }
  }

  // Update variant weight by SKU using GraphQL
  async updateVariantWeightBySku(sku, weightInGrams) {
    try {
      const query = `
        query getVariantBySku($query: String!) {
          productVariants(first: 1, query: $query) {
            edges {
              node {
                id
                legacyResourceId
                sku
              }
            }
          }
        }
      `;
      
      const response = await this.client.post('/graphql.json', {
        query,
        variables: { query: `sku:${sku}` }
      });

      const edges = response.data.data?.productVariants?.edges || [];
      
      if (edges.length === 0) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      const variantId = edges[0].node.legacyResourceId;
      return await this.updateVariantWeight(variantId, weightInGrams);
    } catch (error) {
      console.error('Error updating variant weight by SKU (GraphQL):', error.message);
      return await this.updateVariantWeightBySkuREST(sku, weightInGrams);
    }
  }

  // Fallback: Update variant weight by SKU using REST API
  async updateVariantWeightBySkuREST(sku, weightInGrams) {
    try {
      let allProducts = [];
      let hasNextPage = true;
      let pageInfo = null;

      while (hasNextPage && allProducts.length < 20000) {
        const params = { limit: 250, fields: 'id,variants' };
        if (pageInfo) params.page_info = pageInfo;

        const response = await this.client.get('/products.json', { params });
        allProducts = allProducts.concat(response.data.products);

        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
          pageInfo = match ? match[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      }

      let variantId = null;
      for (const product of allProducts) {
        const variant = product.variants.find(v => v.sku === sku);
        if (variant) {
          variantId = variant.id;
          break;
        }
      }

      if (!variantId) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      return await this.updateVariantWeight(variantId, weightInGrams);
    } catch (error) {
      console.error('Error updating variant weight by SKU (REST):', error.message);
      throw error;
    }
  }

  // Get order
  async getOrder(orderId) {
    try {
      const response = await this.client.get(`/orders/${orderId}.json`);
      return response.data.order;
    } catch (error) {
      console.error('Error fetching order:', error.response?.data || error.message);
      throw error;
    }
  }

  // Update order fulfillment (legacy)
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
      console.error('Error fulfilling order:', error.response?.data || error.message);
      throw error;
    }
  }

  // Create webhook
  async createWebhook(topic, address) {
    try {
      const response = await this.client.post('/webhooks.json', {
        webhook: { topic, address, format: 'json' }
      });
      return response.data.webhook;
    } catch (error) {
      console.error('Error creating webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  // List all webhooks
  async listWebhooks() {
    try {
      const response = await this.client.get('/webhooks.json');
      return response.data.webhooks;
    } catch (error) {
      console.error('Error listing webhooks:', error.response?.data || error.message);
      throw error;
    }
  }

  // Delete webhook
  async deleteWebhook(webhookId) {
    try {
      await this.client.delete(`/webhooks/${webhookId}.json`);
      return true;
    } catch (error) {
      console.error('Error deleting webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  // 🆕 Get fulfillment orders for an order (REST API)
  async getFulfillmentOrders(shopifyOrderId) {
    try {
      let numericId = shopifyOrderId;
      if (shopifyOrderId.startsWith('gid://')) {
        numericId = shopifyOrderId.split('/').pop();
      }

      console.log(`\nFetching fulfillment orders for: ${numericId}`);

      const response = await this.client.get(`/orders/${numericId}/fulfillment_orders.json`);
      const fulfillmentOrders = response.data?.fulfillment_orders || [];

      console.log(`✓ Found ${fulfillmentOrders.length} fulfillment order(s)`);
      fulfillmentOrders.forEach((fo, i) => {
        console.log(`  FO[${i}] id=${fo.id} status=${fo.status} assigned_location=${fo.assigned_location?.name}`);
      });

      // Normalize to GID format for consistency
      return fulfillmentOrders.map(fo => ({
        id: `gid://shopify/FulfillmentOrder/${fo.id}`,
        status: fo.status?.toUpperCase(),
        assignedLocation: fo.assigned_location
      }));
    } catch (error) {
      console.error('Error fetching fulfillment orders:', error.response?.data || error.message);
      throw error;
    }
  }

  // 🆕 Create fulfillment with tracking (GraphQL)
  async createFulfillment({ fulfillmentOrderId, trackingNumber, trackingCompany = 'Canada Post' }) {
    try {
      console.log(`\nCreating fulfillment for: ${fulfillmentOrderId}`);
      console.log(`Tracking: ${trackingCompany} ${trackingNumber}`);

      const trackingUrl = `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${trackingNumber}`;

      const mutation = `
        mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment {
              id
              status
              trackingInfo {
                company
                number
                url
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        fulfillment: {
          notifyCustomer: false,
          trackingInfo: {
            company: trackingCompany,
            number: trackingNumber,
            url: trackingUrl
          },
          lineItemsByFulfillmentOrder: [
            { fulfillmentOrderId }
          ]
        }
      };

      const response = await this.client.post('/graphql.json', {
        query: mutation,
        variables
      });

      const result = response.data?.data?.fulfillmentCreate;
      const userErrors = result?.userErrors || [];

      if (userErrors.length > 0) {
        const errorMsg = userErrors.map(e => `${e.field}: ${e.message}`).join('; ');
        throw new Error(`Shopify fulfillment error: ${errorMsg}`);
      }

      const fulfillment = result?.fulfillment;
      console.log(`✓ Fulfillment created: ${fulfillment?.id}`);
      console.log(`  Status: ${fulfillment?.status}`);
      return fulfillment;
    } catch (error) {
      console.error('Error creating fulfillment:', error.response?.data || error.message);
      throw error;
    }
  }

  // 🆕 Update order metafield
  async updateOrderMetafield(orderId, namespace, key, value, type = 'boolean') {
    try {
      console.log(`\n========== UPDATING ORDER METAFIELD ==========`);
      console.log(`Order ID: ${orderId}, Key: ${namespace}.${key}, Value: ${value}`);

      const existingMetafieldsResponse = await this.client.get(`/orders/${orderId}/metafields.json`);
      const existingMetafields = existingMetafieldsResponse.data.metafields || [];
      
      const existingMetafield = existingMetafields.find(
        m => m.namespace === namespace && m.key === key
      );

      let response;
      
      if (existingMetafield) {
        response = await this.client.put(`/orders/${orderId}/metafields/${existingMetafield.id}.json`, {
          metafield: {
            id: existingMetafield.id,
            value: String(value),
            type: type
          }
        });
      } else {
        response = await this.client.post(`/orders/${orderId}/metafields.json`, {
          metafield: {
            namespace: namespace,
            key: key,
            value: String(value),
            type: type
          }
        });
      }

      console.log(`✓ Order metafield updated successfully`);
      console.log(`=============================================\n`);
      
      return response.data.metafield;
    } catch (error) {
      console.error('✗ Error updating order metafield:', error.response?.data || error.message);
      console.log(`=============================================\n`);
      throw error;
    }
  }
}

module.exports = new ShopifyClient();