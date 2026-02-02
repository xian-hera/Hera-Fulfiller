const express = require('express');
const router = express.Router();
const OrderWebhookHandler = require('../webhooks/orderHandler');

// Order Created - 在 APP 端过滤 POS 订单
router.post('/orders/create', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    const sourceName = orderData.source_name?.toLowerCase() || '';
    if (sourceName === 'pos' || sourceName === 'shopify_pos' || sourceName.includes('pos')) {
      console.log(`✗ Skipping POS order: ${orderData.name} (source: ${orderData.source_name})`);
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

// Order Updated
router.post('/orders/updated', async (req, res) => {
  try {
    console.log('Webhook received: Order Updated', req.body.id);
    const result = await OrderWebhookHandler.handleOrderUpdated(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error processing order updated webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Edits Complete
router.post('/order-edits/complete', async (req, res) => {
  try {
    console.log('Webhook received: Order Edits Complete');
    const result = await OrderWebhookHandler.handleOrderEditsComplete(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error processing order edits complete webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Cancelled
router.post('/orders/cancelled', async (req, res) => {
  try {
    console.log('Webhook received: Order Cancelled', req.body.id);
    const result = await OrderWebhookHandler.handleOrderCancelled(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error processing order cancelled webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Fulfilled
router.post('/orders/fulfilled', async (req, res) => {
  try {
    console.log('Webhook received: Order Fulfilled', req.body.id);
    const result = await OrderWebhookHandler.handleOrderFulfilled(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error processing order fulfilled webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Refund Created
router.post('/refunds/create', async (req, res) => {
  try {
    console.log('Webhook received: Refund Created', req.body.order_id);
    const result = await OrderWebhookHandler.handleRefundCreated(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error processing refund created webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;