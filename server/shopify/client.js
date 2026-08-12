require('dotenv').config();
const axios = require('axios');
const db = require('../database/init');

class ShopifyClient {
  constructor() {
    this.shopUrl = process.env.SHOPIFY_SHOP_NAME || process.env.SHOPIFY_STORE_URL;
    this.apiVersion = '2025-01';
    this._client = null;
    this._token = null;

    if (!this.shopUrl) {
      throw new Error('SHOPIFY_SHOP_NAME environment variable is required');
    }
  }

  // 从数据库读 token，构建（并缓存）axios 实例
  async getClient() {
    const row = await db.prepare(
      'SELECT access_token FROM sessions ORDER BY updated_at DESC LIMIT 1'
    ).get();

    const token = row && row.access_token;
    if (!token) {
      throw new Error('No Shopify token in sessions table. Visit /auth to authenticate.');
    }

    if (!this._client || this._token !== token) {
      this._token = token;
      this._client = axios.create({
        baseURL: `https://${this.shopUrl}/admin/api/${this.apiVersion}`,
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      });
    }
    return this._client;
  }

  async getProductVariant(variantId) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/variants/${variantId}.json`);
      return response.data.variant;
    } catch (error) {
      console.error('Error fetching product variant:', error.response?.data || error.message);
      throw error;
    }
  }

  async getProductMetafield(productId, namespace, key) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/products/${productId}/metafields.json`);
      const metafields = response.data.metafields || [];
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      if (metafield) return metafield.value;
      return '';
    } catch (error) {
      console.error(`Error fetching product metafield:`, error.message);
      return '';
    }
  }

  async getVariantMetafield(variantId, namespace, key) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/variants/${variantId}/metafields.json`);
      const metafields = response.data.metafields || [];
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      if (metafield) return metafield.value;
      return '';
    } catch (error) {
      console.error(`Error fetching variant metafield:`, error.message);
      return '';
    }
  }

  // 🆕 lookups metafield 存的是引用其他 product 的 GID 数组，不是 barcode 本身
  // 这个方法批量查这些被引用 product 各自唯一 variant 的 SKU（业务上确认了这些 lookup 产品只有一个 variant）
  async getSkusForProductGids(gids) {
    if (!gids || gids.length === 0) return [];
    try {
      const client = await this.getClient();
      const query = `
        query getSkusByIds($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              variants(first: 1) {
                edges { node { sku } }
              }
            }
          }
        }
      `;
      const response = await client.post('/graphql.json', {
        query,
        variables: { ids: gids }
      });

      if (response.data.errors) {
        console.error('GraphQL errors in getSkusForProductGids:', JSON.stringify(response.data.errors));
        return [];
      }

      const nodes = response.data?.data?.nodes || [];
      return nodes
        .map(n => n?.variants?.edges?.[0]?.node?.sku)
        .filter(Boolean);
    } catch (error) {
      console.error('Error fetching SKUs for lookup product GIDs:', error.response?.data || error.message);
      return [];
    }
  }

  async updateVariantWeight(variantId, weightInGrams) {
    try {
      const client = await this.getClient();
      const response = await client.put(`/variants/${variantId}.json`, {
        variant: { id: variantId, weight: weightInGrams, weight_unit: 'g' }
      });
      return response.data.variant;
    } catch (error) {
      console.error('Error updating variant weight:', error.response?.data || error.message);
      throw error;
    }
  }

  async updateVariantWeightBySku(sku, weightInGrams) {
    try {
      const client = await this.getClient();
      const query = `
        query getVariantBySku($query: String!) {
          productVariants(first: 1, query: $query) {
            edges { node { id legacyResourceId sku } }
          }
        }
      `;
      const response = await client.post('/graphql.json', {
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

  async updateVariantWeightBySkuREST(sku, weightInGrams) {
    try {
      const client = await this.getClient();
      let allProducts = [];
      let hasNextPage = true;
      let pageInfo = null;

      while (hasNextPage && allProducts.length < 20000) {
        const params = { limit: 250, fields: 'id,variants' };
        if (pageInfo) params.page_info = pageInfo;

        const response = await client.get('/products.json', { params });
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
        if (variant) { variantId = variant.id; break; }
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

  async getOrder(orderId) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/orders/${orderId}.json`);
      return response.data.order;
    } catch (error) {
      console.error('Error fetching order:', error.response?.data || error.message);
      throw error;
    }
  }

  async fulfillOrder(orderId, lineItems) {
    try {
      const client = await this.getClient();
      const response = await client.post(`/orders/${orderId}/fulfillments.json`, {
        fulfillment: {
          line_items: lineItems.map(item => ({ id: item.id, quantity: item.quantity })),
          notify_customer: true
        }
      });
      return response.data.fulfillment;
    } catch (error) {
      console.error('Error fulfilling order:', error.response?.data || error.message);
      throw error;
    }
  }

  async createWebhook(topic, address) {
    try {
      const client = await this.getClient();
      const response = await client.post('/webhooks.json', {
        webhook: { topic, address, format: 'json' }
      });
      return response.data.webhook;
    } catch (error) {
      console.error('Error creating webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  async listWebhooks() {
    try {
      const client = await this.getClient();
      const response = await client.get('/webhooks.json');
      return response.data.webhooks;
    } catch (error) {
      console.error('Error listing webhooks:', error.response?.data || error.message);
      throw error;
    }
  }

  async deleteWebhook(webhookId) {
    try {
      const client = await this.getClient();
      await client.delete(`/webhooks/${webhookId}.json`);
      return true;
    } catch (error) {
      console.error('Error deleting webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  async getFulfillmentOrders(shopifyOrderId) {
    try {
      const client = await this.getClient();
      let numericId = shopifyOrderId;
      if (shopifyOrderId.startsWith('gid://')) {
        numericId = shopifyOrderId.split('/').pop();
      }

      console.log(`\nFetching fulfillment orders for: ${numericId}`);

      const response = await client.get(`/orders/${numericId}/fulfillment_orders.json`);
      const fulfillmentOrders = response.data?.fulfillment_orders || [];

      console.log(`✓ Found ${fulfillmentOrders.length} fulfillment order(s)`);
      fulfillmentOrders.forEach((fo, i) => {
        console.log(`  FO[${i}] id=${fo.id} status=${fo.status} assigned_location=${fo.assigned_location?.name}`);
      });

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

  // 🆕 根据 fulfillment_order 的 GID，反查它所属的 order_id
  // Webhook payload 里只有 fulfillment_order.id，没有 order_id，需要额外调一次 API
  async getFulfillmentOrderById(fulfillmentOrderGid) {
    try {
      const client = await this.getClient();
      let numericId = fulfillmentOrderGid;
      if (fulfillmentOrderGid.startsWith('gid://')) {
        numericId = fulfillmentOrderGid.split('/').pop();
      }

      const response = await client.get(`/fulfillment_orders/${numericId}.json`);
      const fulfillmentOrder = response.data?.fulfillment_order;

      if (!fulfillmentOrder) {
        throw new Error(`Fulfillment order ${numericId} not found`);
      }

      return {
        id: fulfillmentOrder.id,
        orderId: fulfillmentOrder.order_id?.toString(),
        status: fulfillmentOrder.status
      };
    } catch (error) {
      console.error('Error fetching fulfillment order:', error.response?.data || error.message);
      throw error;
    }
  }

  async createFulfillment({ fulfillmentOrderId, trackingNumber, trackingCompany = 'Canada Post' }) {
    try {
      const client = await this.getClient();
      console.log(`\nCreating fulfillment for: ${fulfillmentOrderId}`);
      console.log(`Tracking: ${trackingCompany} ${trackingNumber}`);

      const trackingUrl = `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${trackingNumber}`;

      const mutation = `
        mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id status trackingInfo { company number url } }
            userErrors { field message }
          }
        }
      `;

      const variables = {
        fulfillment: {
          notifyCustomer: false,
          trackingInfo: { company: trackingCompany, number: trackingNumber, url: trackingUrl },
          lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }]
        }
      };

      const response = await client.post('/graphql.json', { query: mutation, variables });

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

  async updateOrderMetafield(orderId, namespace, key, value, type = 'boolean') {
    try {
      const client = await this.getClient();
      console.log(`\n========== UPDATING ORDER METAFIELD ==========`);
      console.log(`Order ID: ${orderId}, Key: ${namespace}.${key}, Value: ${value}`);

      const existingMetafieldsResponse = await client.get(`/orders/${orderId}/metafields.json`);
      const existingMetafields = existingMetafieldsResponse.data.metafields || [];
      const existingMetafield = existingMetafields.find(
        m => m.namespace === namespace && m.key === key
      );

      let response;
      if (existingMetafield) {
        response = await client.put(`/orders/${orderId}/metafields/${existingMetafield.id}.json`, {
          metafield: { id: existingMetafield.id, value: String(value), type }
        });
      } else {
        response = await client.post(`/orders/${orderId}/metafields.json`, {
          metafield: { namespace, key, value: String(value), type }
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

  // ============================================================
  // 🆕 Return Management — 退款/库存相关方法
  // ============================================================

  // 统一的退款方法，走 GraphQL refundCreate（2026-04 起 idempotency key 是必填的）
  // allocation: 'store_credit' | 'original_payment'
  // refundLineItems: [{ lineItemId, quantity }]（lineItemId 不带 gid:// 前缀会自动拼）
  // notify: 对应 admin 端 6.8.4 那个 "Send Shopify refund notification" checkbox
  async createRefund({
    orderId,
    refundLineItems,
    allocation,
    storeCreditAmount,
    currencyCode = 'CAD',
    note = '',
    notify = true,
  }) {
    try {
      const client = await this.getClient();
      const crypto = require('crypto');

      const orderGid = orderId.toString().startsWith('gid://')
        ? orderId
        : `gid://shopify/Order/${orderId}`;

      const mappedLineItems = refundLineItems.map(item => ({
        lineItemId: item.lineItemId.toString().startsWith('gid://')
          ? item.lineItemId
          : `gid://shopify/LineItem/${item.lineItemId}`,
        quantity: item.quantity,
        restockType: 'NO_RESTOCK' // 我们自己的 POS/admin 流程另外处理 restock，不让 Shopify 自动调库存
      }));

      const input = {
        orderId: orderGid,
        note,
        notify,
        refundLineItems: mappedLineItems,
      };

      if (allocation === 'store_credit') {
        input.transactions = [];
        input.refundMethods = [{
          storeCreditRefund: {
            amount: { amount: storeCreditAmount.toFixed(2), currencyCode }
          }
        }];
      } else {
        // 原支付方式：不传 refundMethods，transactions 传空数组让 Shopify 自动判断
        input.transactions = [];
      }

      const idempotencyKey = crypto.randomUUID();

      const mutation = `
        mutation RefundCreate($input: RefundInput!) {
          refundCreate(input: $input) @idempotent(key: "${idempotencyKey}") {
            refund {
              id
              totalRefundedSet { presentmentMoney { amount currencyCode } }
            }
            userErrors { field message }
          }
        }
      `;

      const response = await client.post('/graphql.json', { query: mutation, variables: { input } });

      const result = response.data?.data?.refundCreate;
      const userErrors = result?.userErrors || [];
      if (userErrors.length > 0) {
        const errorMsg = userErrors.map(e => `${e.field}: ${e.message}`).join('; ');
        throw new Error(`Shopify refund error: ${errorMsg}`);
      }

      return result?.refund;
    } catch (error) {
      console.error('Error creating refund:', error.response?.data || error.message);
      throw error;
    }
  }

  // Restock：把退货数量补回指定 location 的库存（GraphQL inventoryAdjustQuantities）
  async adjustInventoryQuantity(inventoryItemId, locationId, quantityDelta) {
    try {
      const client = await this.getClient();
      const mutation = `
        mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
          inventoryAdjustQuantities(input: $input) {
            inventoryAdjustmentGroup { createdAt }
            userErrors { field message }
          }
        }
      `;

      const inventoryItemGid = inventoryItemId.toString().startsWith('gid://')
        ? inventoryItemId
        : `gid://shopify/InventoryItem/${inventoryItemId}`;
      const locationGid = locationId.toString().startsWith('gid://')
        ? locationId
        : `gid://shopify/Location/${locationId}`;

      const variables = {
        input: {
          reason: 'restock',
          name: 'available',
          changes: [{
            inventoryItemId: inventoryItemGid,
            locationId: locationGid,
            delta: quantityDelta
          }]
        }
      };

      const response = await client.post('/graphql.json', { query: mutation, variables });

      const result = response.data?.data?.inventoryAdjustQuantities;
      const userErrors = result?.userErrors || [];
      if (userErrors.length > 0) {
        const errorMsg = userErrors.map(e => `${e.field}: ${e.message}`).join('; ');
        throw new Error(`Shopify inventory adjustment error: ${errorMsg}`);
      }

      return result?.inventoryAdjustmentGroup;
    } catch (error) {
      console.error('Error adjusting inventory:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new ShopifyClient();