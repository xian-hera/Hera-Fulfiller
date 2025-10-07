// Update product weight in Shopify (called from weight warning popup)
router.patch('/items/:id/update-weight', async (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    const item = db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Update local database
    db.prepare(`
      UPDATE line_items 
      SET weight = ?, weight_unit = 'g', updated_at = datetime('now')
      WHERE id = ?
    `).run(weight, id);

    // Update Shopify product variant weight via API
    try {
      const shopifyClient = require('../shopify/client');
      // Extract variant ID from shopify_line_item_id
      const variantId = item.shopify_line_item_id.split('_')[0];
      await shopifyClient.updateVariantWeight(variantId, weight);
    } catch (shopifyError) {
      console.error('Error updating Shopify weight:', shopifyError);
      // Continue even if Shopify update fails
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating weight:', error);
    res.status(500).json({ error: error.message });
  }
});const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Get all orders for packer
router.get('/orders', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT * FROM orders 
      WHERE fulfillment_status != 'fulfilled'
      ORDER BY created_at DESC
    `).all();

    // Get line items and transfer info for each order
    const ordersWithDetails = orders.map(order => {
      const lineItems = db.prepare(`
        SELECT * FROM line_items 
        WHERE shopify_order_id = ?
        ORDER BY id
      `).all(order.shopify_order_id);

      // Get transfer items for this order
      const transferItems = db.prepare(`
        SELECT ti.*, li.id as line_item_id
        FROM transfer_items ti
        JOIN line_items li ON ti.line_item_id = li.id
        WHERE ti.shopify_order_id = ?
      `).all(order.shopify_order_id);

      // Check for weight warnings
      const hasWeightWarning = lineItems.some(item => 
        item.weight === 0 || item.weight_unit !== 'g'
      );

      // Calculate order status
      let orderStatus = order.status || 'packing';
      const waitingItems = transferItems.filter(ti => ti.status === 'waiting');
      const transferringItems = transferItems.filter(ti => ti.status === 'transferring');
      
      if (waitingItems.length > 0) {
        orderStatus = 'waiting';
      } else {
        const allPacked = lineItems.every(item => item.packer_status === 'ready');
        if (allPacked && lineItems.length > 0) {
          orderStatus = 'ready';
        }
      }

      // Calculate transfer info for waiting orders
      let transferInfo = null;
      if (orderStatus === 'waiting') {
        const totalQuantity = waitingItems.reduce((sum, item) => sum + item.quantity, 0);
        const transferFroms = [...new Set(waitingItems.map(item => item.transfer_from))].filter(Boolean);
        const latestDate = waitingItems.reduce((latest, item) => {
          if (!item.estimate_month || !item.estimate_day) return latest;
          const itemDate = item.estimate_month * 100 + item.estimate_day;
          return itemDate > latest ? itemDate : latest;
        }, 0);

        transferInfo = {
          quantity: totalQuantity,
          transferFroms,
          estimateMonth: Math.floor(latestDate / 100),
          estimateDay: latestDate % 100
        };
      }

      return {
        ...order,
        lineItems,
        hasWeightWarning,
        orderStatus,
        hasTransferring: transferringItems.length > 0,
        hasWaiting: waitingItems.length > 0,
        transferInfo
      };
    });

    res.json(ordersWithDetails);
  } catch (error) {
    console.error('Error fetching packer orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single order details
router.get('/orders/:shopifyOrderId', (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    
    const order = db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const lineItems = db.prepare(`
      SELECT * FROM line_items 
      WHERE shopify_order_id = ?
      ORDER BY id
    `).all(shopifyOrderId);

    // Get transfer status for each line item
    const lineItemsWithTransfer = lineItems.map(item => {
      const transferItem = db.prepare(`
        SELECT * FROM transfer_items 
        WHERE line_item_id = ?
      `).get(item.id);

      return {
        ...item,
        transferStatus: transferItem?.status || null,
        transferInfo: transferItem ? {
          transferFrom: transferItem.transfer_from,
          estimateMonth: transferItem.estimate_month,
          estimateDay: transferItem.estimate_day,
          quantity: transferItem.quantity
        } : null
      };
    });

    res.json({
      ...order,
      lineItems: lineItemsWithTransfer
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update order status
router.patch('/orders/:shopifyOrderId/status', (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = datetime('now')
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update line item packer status
router.patch('/items/:id/packer-status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    db.prepare(`
      UPDATE line_items 
      SET packer_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item packer status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete order (set box and weight)
router.post('/orders/:shopifyOrderId/complete', (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { boxType, weight } = req.body;

    db.prepare(`
      UPDATE orders 
      SET box_type = ?, weight = ?, status = 'ready', updated_at = datetime('now')
      WHERE shopify_order_id = ?
    `).run(boxType, weight || null, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update product weight in Shopify (called from weight warning popup)
router.patch('/items/:id/update-weight', (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    // Update local database
    db.prepare(`
      UPDATE line_items 
      SET weight = ?, weight_unit = 'g', updated_at = datetime('now')
      WHERE id = ?
    `).run(weight, id);

    // TODO: Also update Shopify product variant weight via API
    // This requires additional Shopify API integration

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating weight:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;