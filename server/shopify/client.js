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

  // 🆕 Get product metafield (product level)
  async getProductMetafield(productId, namespace, key) {
    try {
      console.log(`Fetching product metafield: product=${productId}, namespace=${namespace}, key=${key}`);
      
      const response = await this.client.get(`/products/${productId}/metafields.json`);
      const metafields = response.data.metafields || [];
      
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      
      if (metafield) {
        console.log(`✓ Found metafield value: ${metafield.value}`);
        return metafield.value;
      }
      
      console.log(`✗ Metafield not found`);
      return '';
    } catch (error) {
      console.error(`Error fetching product metafield:`, error.message);
      return ''; // 失败时返回空字符串，不抛出错误
    }
  }

  // 🆕 Get variant metafield (variant level)
  async getVariantMetafield(variantId, namespace, key) {
    try {
      console.log(`Fetching variant metafield: variant=${variantId}, namespace=${namespace}, key=${key}`);
      
      const response = await this.client.get(`/variants/${variantId}/metafields.json`);
      const metafields = response.data.metafields || [];
      
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      
      if (metafield) {
        console.log(`✓ Found metafield value: ${metafield.value}`);
        return metafield.value;
      }
      
      console.log(`✗ Metafield not found`);
      return '';
    } catch (error) {
      console.error(`Error fetching variant metafield:`, error.message);
      return ''; // 失败时返回空字符串，不抛出错误
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

  // 🆕 Get fulfillment orders for an order (GraphQL)
  async getFulfillmentOrders(shopifyOrderId) {
    try {
      console.log(`
Fetching fulfillment orders for: ${shopifyOrderId}`);

      const orderGid = shopifyOrderId.startsWith('gid://')
        ? shopifyOrderId
        : `gid://shopify/Order/${shopifyOrderId}`;

      const query = `
        query GetFulfillmentOrders($orderId: ID!) {
          order(id: $orderId) {
            id
            name
            fulfillmentOrders(first: 10) {
              nodes {
                id
                status
                lineItems(first: 50) {
                  nodes {
                    id
                    remainingQuantity
                    totalQuantity
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.client.post('/graphql.json', {
        query,
        variables: { orderId: orderGid }
      });

      const fulfillmentOrders = response.data?.data?.order?.fulfillmentOrders?.nodes || [];
      console.log(`✓ Found ${fulfillmentOrders.length} fulfillment order(s)`);
      return fulfillmentOrders;
    } catch (error) {
      console.error('Error fetching fulfillment orders:', error.response?.data || error.message);
      throw error;
    }
  }

  // 🆕 Create fulfillment with tracking (GraphQL)
  async createFulfillment({ fulfillmentOrderId, trackingNumber, trackingCompany = 'Canada Post' }) {
    try {
      console.log(`
Creating fulfillment for: ${fulfillmentOrderId}`);
      console.log(`Tracking: ${trackingCompany} ${trackingNumber}`);

      const trackingUrl = `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${trackingNumber}`;

      const mutation = `
        mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
          fulfillmentCreateV2(fulfillment: $fulfillment) {
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
          notifyCustomer: true,
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

      const result = response.data?.data?.fulfillmentCreateV2;
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
      console.log(`Order ID: ${orderId}`);
      console.log(`Namespace: ${namespace}`);
      console.log(`Key: ${key}`);
      console.log(`Value: ${value}`);
      console.log(`Type: ${type}`);

      // 先获取现有的 metafields 来检查是否已存在
      const existingMetafieldsResponse = await this.client.get(`/orders/${orderId}/metafields.json`);
      const existingMetafields = existingMetafieldsResponse.data.metafields || [];
      
      const existingMetafield = existingMetafields.find(
        m => m.namespace === namespace && m.key === key
      );

      let response;
      
      if (existingMetafield) {
        // 更新现有 metafield
        console.log(`Updating existing metafield ID: ${existingMetafield.id}`);
        response = await this.client.put(`/orders/${orderId}/metafields/${existingMetafield.id}.json`, {
          metafield: {
            id: existingMetafield.id,
            value: String(value),
            type: type
          }
        });
      } else {
        // 创建新 metafield
        console.log(`Creating new metafield`);
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
      console.log(`Response:`, JSON.stringify(response.data.metafield, null, 2));
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