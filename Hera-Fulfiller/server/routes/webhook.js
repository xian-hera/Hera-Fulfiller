const express = require('express');
const router = express.Router();
const OrderWebhookHandler = require('../webhooks/orderHandler');
const verifyWebhook = require('../middleware/webhookVerification');

// Apply webhook verification middleware (optional in development)
const useVerification = process.env.NODE_ENV === 'production';

// Webhook endpoints
router.post('/orders/create', useVerification ? verifyWebhook : (req, res, next) => next(), async (req, res) => {
  try {
    console.log('Webhook received: Order Created', req.body.id);
    const result = OrderWebhookHandler.handleOrderCreated(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook error (order/create):', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders/updated', useVerification ? verifyWebhook : (req, res, next) => next(), async (req, res) => {
  try {
    console.log('Webhook received: Order Updated', req.body.id);
    const result = OrderWebhookHandler.handleOrderUpdated(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook error (order/updated):', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders/cancelled', useVerification ? verifyWebhook : (req, res, next) => next(), async (req, res) => {
  try {
    console.log('Webhook received: Order Cancelled', req.body.id);
    const result = OrderWebhookHandler.handleOrderCancelled(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook error (order/cancelled):', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders/fulfilled', useVerification ? verifyWebhook : (req, res, next) => next(), async (req, res) => {
  try {
    console.log('Webhook received: Order Fulfilled', req.body.id);
    const result = OrderWebhookHandler.handleOrderFulfilled(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook error (order/fulfilled):', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;