require('dotenv').config();
const axios = require('axios');

class ShopifyClient {
  constructor() {
    // 修复：使用正确的环境变量名
    this.shopUrl = process.env.SHOPIFY_SHOP_NAME || process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2024-01';
    
    // 添加验证
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

  // Update variant weight by SKU using GraphQL (fast method)
  async updateVariantWeightBySku(sku, weightInGrams) {
    try {
      console.log(`Searching for variant by SKU using GraphQL: ${sku}`);
      
      // GraphQL query to find variant by SKU
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

      console.log('GraphQL response:', JSON.stringify(response.data, null, 2));

      const edges = response.data.data?.productVariants?.edges || [];
      
      if (edges.length === 0) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      const variantId = edges[0].node.legacyResourceId;
      console.log(`Found variant ID ${variantId} for SKU: ${sku} via GraphQL`);

      // Update using REST API
      return await this.updateVariantWeight(variantId, weightInGrams);
    } catch (error) {
      console.error('Error updating variant weight by SKU (GraphQL):', error.message);
      
      // Fallback to REST API search if GraphQL fails
      console.log('Falling back to REST API search...');
      return await this.updateVariantWeightBySkuREST(sku, weightInGrams);
    }
  }

  // Fallback: Update variant weight by SKU using REST API (slow method)
  async updateVariantWeightBySkuREST(sku, weightInGrams) {
    try {
      console.log(`Searching for variant with SKU using REST: ${sku}`);
      
      // Get all products (paginated)
      let allProducts = [];
      let hasNextPage = true;
      let pageInfo = null;

      while (hasNextPage && allProducts.length < 20000) {
        const params = {
          limit: 250,
          fields: 'id,variants'
        };
        
        if (pageInfo) {
          params.page_info = pageInfo;
        }

        const response = await this.client.get('/products.json', { params });
        allProducts = allProducts.concat(response.data.products);

        // Check for pagination
        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
          pageInfo = match ? match[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      }

      console.log(`Searched ${allProducts.length} products for SKU: ${sku}`);

      // Find variant with matching SKU
      let variantId = null;
      for (const product of allProducts) {
        const variant = product.variants.find(v => v.sku === sku);
        if (variant) {
          variantId = variant.id;
          console.log(`Found variant ID ${variantId} for SKU: ${sku}`);
          break;
        }
      }

      if (!variantId) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      // Update the variant weight
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
      console.error('Error fulfilling order:', error.response?.data || error.message);
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
}

module.exports = new ShopifyClient();