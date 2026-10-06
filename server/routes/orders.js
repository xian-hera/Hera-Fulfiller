// 🆕 Home 页 "Add Order"：手动按订单名从 Shopify 拉取订单，导入 Fulfiller。
//
// 用途：订单的 orders/create webhook 没收到（或订单被误删）时，手动补回来。
// 导入走的是跟 webhook 完全相同的处理逻辑（OrderWebhookHandler），所以导入后的订单
// 在 Picker / Transfer / Packer 里的表现和 webhook 收到的订单一样。
//
// 两步：
//   1. GET  /api/orders/lookup?name=#1234  —— 只查询、不写库，返回订单概要和能否导入
//   2. POST /api/orders/import { orderId, sendGiftEmail } —— 重新从 Shopify 取一次最新数据并导入

const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');
const OrderWebhookHandler = require('../webhooks/orderHandler');
const GiftHandler = require('../webhooks/giftHandler');

// 跟 routes/webhooks.js 里的 POS 过滤规则保持一致
function isPosOrder(orderData) {
  const sourceName = orderData.source_name?.toLowerCase() || '';
  return sourceName === 'pos' || sourceName === 'shopify_pos' || sourceName.includes('pos');
}

// 判断这张订单能不能导入；返回 null 表示可以，否则返回原因（给用户看）
function getBlockReason(orderData) {
  if (isPosOrder(orderData)) return 'This is a POS order. POS orders are not handled by Fulfiller.';
  if (orderData.cancelled_at) return 'This order has been cancelled.';
  if (orderData.fulfillment_status === 'fulfilled') return 'This order has already been fulfilled.';
  if (orderData.closed_at) return 'This order is archived (closed) in Shopify.';
  return null;
}

// 计算扣掉退款后的商品数量（跟 handleOrderUpdated 的算法一致）
function countActiveItems(orderData) {
  const refunded = new Map();
  (orderData.refunds || []).forEach(refund => {
    (refund.refund_line_items || []).forEach(r => {
      const id = r.line_item_id.toString();
      refunded.set(id, (refunded.get(id) || 0) + r.quantity);
    });
  });
  return (orderData.line_items || []).reduce((sum, item) => {
    const active = item.quantity - (refunded.get(item.id.toString()) || 0);
    return sum + Math.max(active, 0);
  }, 0);
}

function buildSummary(orderData) {
  const gift = GiftHandler.extractGiftAttributes(orderData.note_attributes || []);
  const customerName = [orderData.customer?.first_name, orderData.customer?.last_name]
    .filter(Boolean).join(' ') || orderData.shipping_address?.name || '';
  return {
    id: orderData.id.toString(),
    name: orderData.name,
    createdAt: orderData.created_at,
    customerName,
    itemCount: countActiveItems(orderData),
    financialStatus: orderData.financial_status || '',
    fulfillmentStatus: orderData.fulfillment_status || 'unfulfilled',
    isPartiallyFulfilled: orderData.fulfillment_status === 'partial',
    isGift: gift.isGift,
    giftRecipientEmail: gift.isGift ? gift.recipientEmail : ''
  };
}

async function isInApp(shopifyOrderId) {
  const row = await db.prepare('SELECT id FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
  return !!row;
}

// Step 1: lookup
router.get('/lookup', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Please enter an order name.' });

    const orderId = await shopifyClient.findOrderIdByName(name);
    if (!orderId) {
      return res.status(404).json({
        error: `Order "${name}" was not found in Shopify. Check the order name (orders older than 60 days may not be searchable).`
      });
    }

    const orderData = await shopifyClient.getOrder(orderId);
    const order = buildSummary(orderData);
    const alreadyInApp = await isInApp(order.id);
    const blockReason = alreadyInApp
      ? 'This order is already in Fulfiller.'
      : getBlockReason(orderData);

    res.json({ order, alreadyInApp, canImport: !blockReason, blockReason });
  } catch (error) {
    console.error('[AddOrder] lookup failed:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to look up order: ' + error.message });
  }
});

// Step 2: import
router.post('/import', async (req, res) => {
  const orderId = String(req.body?.orderId || '').trim();
  const sendGiftEmail = req.body?.sendGiftEmail === true;
  if (!/^\d+$/.test(orderId)) return res.status(400).json({ error: 'Invalid order id.' });

  try {
    // 重新拉一次最新数据（lookup 和点击 Add 之间订单可能有变化）
    const orderData = await shopifyClient.getOrder(orderId);

    if (await isInApp(orderId)) {
      return res.status(409).json({ error: `${orderData.name} is already in Fulfiller.` });
    }
    const blockReason = getBlockReason(orderData);
    if (blockReason) return res.status(422).json({ error: blockReason });

    console.log(`[AddOrder] Importing ${orderData.name} (${orderId}) manually, sendGiftEmail=${sendGiftEmail}`);

    // 跟 webhook 一样：先按 orders/create 建订单和商品……
    await OrderWebhookHandler.handleOrderCreated(orderData, { skipGift: !sendGiftEmail });
    // ……再按 orders/updated 同步一次，把已退款 / 已改单的商品数量扣掉
    // （新订单走 webhook 时这些变化是后续 updated webhook 带来的，手动导入时一次补齐）
    await OrderWebhookHandler.handleOrderUpdated(orderData);

    const order = buildSummary(orderData);
    console.log(`[AddOrder] ✓ ${orderData.name} imported (${order.itemCount} items)`);
    res.json({ success: true, order });
  } catch (error) {
    console.error('[AddOrder] import failed:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to import order: ' + error.message });
  }
});

module.exports = router;
