const express = require('express');
const router = express.Router();
const OrderWebhookHandler = require('../webhooks/orderHandler');

// Order Created
router.post('/orders/create', async (req, res) => {
  try {
    console.log('Webhook received: Order Created', req.body.id);
    const result = await OrderWebhookHandler.handleOrderCreated(req.body);
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

// Order Edits Complete (新增路由)
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

module.exports = router;