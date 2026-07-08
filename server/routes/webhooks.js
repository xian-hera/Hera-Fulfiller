const express = require('express');
const router = express.Router();
const OrderWebhookHandler = require('../webhooks/orderHandler');

// 🔒 POS 订单过滤函数
function isPosOrder(orderData) {
  const sourceName = orderData.source_name?.toLowerCase() || '';
  return sourceName === 'pos' || 
         sourceName === 'shopify_pos' || 
         sourceName.includes('pos');
}

// 控制是否记录 POS skip 日志，默认关闭
const LOG_POS_SKIP = process.env.LOG_POS_SKIP === 'true';

// Order Created - 过滤 POS 订单
router.post('/orders/create', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      if (LOG_POS_SKIP) console.log(`✗ Skipping POS order: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('✓ Webhook received: Order Created', orderData.id);
    console.log(`  Order: ${orderData.name}, Source: ${orderData.source_name}`);
    const result = await OrderWebhookHandler.handleOrderCreated(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order created webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Updated - 过滤 POS 订单
router.post('/orders/updated', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      if (LOG_POS_SKIP) console.log(`✗ Skipping POS order update: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Updated', orderData.id);
    const result = await OrderWebhookHandler.handleOrderUpdated(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order updated webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Edits Complete - 过滤 POS 订单
router.post('/order-edits/complete', async (req, res) => {
  try {
    const editData = req.body;
    
    // 对于 order edits，需要检查 order_edit.order 中的 source_name
    const orderData = editData.order_edit?.order || editData.order || {};
    
    if (isPosOrder(orderData)) {
      if (LOG_POS_SKIP) console.log(`✗ Skipping POS order edit`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Edits Complete');
    const result = await OrderWebhookHandler.handleOrderEditsComplete(editData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order edits complete webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Cancelled - 过滤 POS 订单
router.post('/orders/cancelled', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      if (LOG_POS_SKIP) console.log(`✗ Skipping POS order cancellation: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Cancelled', orderData.id);
    const result = await OrderWebhookHandler.handleOrderCancelled(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order cancelled webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Fulfilled - 过滤 POS 订单
router.post('/orders/fulfilled', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      if (LOG_POS_SKIP) console.log(`✗ Skipping POS order fulfillment: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Fulfilled', orderData.id);
    const result = await OrderWebhookHandler.handleOrderFulfilled(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order fulfilled webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Refund Created - 过滤 POS 订单
router.post('/refunds/create', async (req, res) => {
  try {
    const refundData = req.body;
    
    // Refund webhook 中没有直接的 order 信息，需要通过 order_id 查询
    // 或者检查是否订单已经在数据库中（如果不在，说明是 POS）
    // 为了简单起见，先正常处理，如果订单不存在会自然失败
    
    console.log('Webhook received: Refund Created', refundData.order_id);
    const result = await OrderWebhookHandler.handleRefundCreated(refundData);
    res.json(result);
  } catch (error) {
    console.error('Error processing refund created webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// 🆕 Fulfillment Order Placed On Hold
router.post('/fulfillment_orders/placed_on_hold', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Webhook received: Fulfillment Order Placed On Hold', payload.fulfillment_order?.id);
    const result = await OrderWebhookHandler.handleFulfillmentOrderPlacedOnHold(payload);
    res.json(result);
  } catch (error) {
    console.error('Error processing fulfillment order placed_on_hold webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// 🆕 Fulfillment Order Hold Released
router.post('/fulfillment_orders/hold_released', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Webhook received: Fulfillment Order Hold Released', payload.fulfillment_order?.id);
    const result = await OrderWebhookHandler.handleFulfillmentOrderHoldReleased(payload);
    res.json(result);
  } catch (error) {
    console.error('Error processing fulfillment order hold_released webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;