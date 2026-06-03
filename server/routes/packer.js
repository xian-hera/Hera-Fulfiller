const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Unified function to calculate order status
function calculateOrderStatus(order, lineItems, transferItems) {
  if (order.status === 'holding') {
    return 'holding';
  }

  // 如果有 transferring 或 waiting 状态的 transfer item，订单状态为 waiting
  const waitingOrTransferringItems = transferItems.filter(ti => 
    ti.status === 'waiting' || ti.status === 'transferring'
  );
  if (waitingOrTransferringItems.length > 0) {
    return 'waiting';
  }

  const allReady = lineItems.length > 0 && lineItems.every(item => item.packer_status === 'ready');
  if (allReady) {
    return 'ready';
  }

  return 'packing';
}

// Get all orders for packer
router.get('/orders', async (req, res) => {
  try {
    const orders = await db.prepare(`
      SELECT * FROM orders 
      WHERE fulfillment_status != 'fulfilled'
      ORDER BY created_at DESC
    `).all();

    const ordersWithDetails = await Promise.all(orders.map(async (order) => {
      const lineItems = await db.prepare(`
        SELECT * FROM line_items 
        WHERE shopify_order_id = ?
        ORDER BY id
      `).all(order.shopify_order_id);

      const transferItems = await db.prepare(`
        SELECT ti.*, li.id as line_item_id
        FROM transfer_items ti
        JOIN line_items li ON ti.line_item_id = li.id
        WHERE ti.shopify_order_id = ?
      `).all(order.shopify_order_id);

      // 使用永久标记检查 weight warning
      const hasWeightWarning = lineItems.some(item => item.has_weight_warning === 1);

      // 🆕 检查是否有 out_of_stock items
      const hasOutOfStock = transferItems.some(ti => ti.out_of_stock === 1);

      const orderStatus = calculateOrderStatus(order, lineItems, transferItems);

      let transferInfo = null;
      // 获取所有 waiting 状态的 item
      const waitingItems = transferItems.filter(ti => ti.status === 'waiting');
      
      if (waitingItems.length > 0) {
        const totalQuantity = waitingItems.reduce((sum, item) => sum + item.quantity, 0);
        
        // 获取所有不同的 transfer_from，去重并过滤空值
        const transferFroms = [...new Set(waitingItems.map(item => item.transfer_from))].filter(Boolean);
        
        // 找到最晚的日期
        const latestDate = waitingItems.reduce((latest, item) => {
          if (!item.estimate_month || !item.estimate_day) return latest;
          const itemDate = item.estimate_month * 100 + item.estimate_day;
          return itemDate > latest ? itemDate : latest;
        }, 0);

        transferInfo = {
          quantity: totalQuantity,
          transferFroms: transferFroms, // 所有的 transfer_from
          estimateMonth: Math.floor(latestDate / 100),
          estimateDay: latestDate % 100
        };
      }

      const transferringItems = transferItems.filter(ti => ti.status === 'transferring');

      return {
        ...order,
        lineItems,
        hasWeightWarning,
        hasOutOfStock, // 🆕 添加 out of stock 标记
        orderStatus,
        hasTransferring: transferringItems.length > 0,
        hasWaiting: waitingItems.length > 0,
        transferInfo
      };
    }));

    res.json(ordersWithDetails);
  } catch (error) {
    console.error('Error fetching packer orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders: ' + error.message });
  }
});

// Get single order details
router.get('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    
    const order = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const lineItems = await db.prepare(`
      SELECT * FROM line_items 
      WHERE shopify_order_id = ?
      ORDER BY id
    `).all(shopifyOrderId);

    const lineItemsWithTransfer = await Promise.all(lineItems.map(async (item) => {
      const transferItem = await db.prepare(`
        SELECT * FROM transfer_items 
        WHERE line_item_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(item.id);

      return {
        ...item,
        transferStatus: transferItem?.status || null,
        outOfStock: transferItem?.out_of_stock === 1, // 🆕 添加 out of stock 状态
        transferInfo: transferItem ? {
          transferFrom: transferItem.transfer_from,
          estimateMonth: transferItem.estimate_month,
          estimateDay: transferItem.estimate_day,
          quantity: transferItem.quantity
        } : null
      };
    }));

    res.json({
      ...order,
      lineItems: lineItemsWithTransfer
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details: ' + error.message });
  }
});

// Update order status (holding/packing)
router.patch('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

router.patch('/orders/:shopifyOrderId/status', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

// 🆕 Add or update note
router.patch('/orders/:shopifyOrderId/note', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { note } = req.body;

    // Note 可以为空字符串（删除 note）
    if (note === undefined) {
      return res.status(400).json({ error: 'Note is required' });
    }

    // 限制 50 字符
    if (note.length > 50) {
      return res.status(400).json({ error: 'Note must be 50 characters or less' });
    }

    await db.prepare(`
      UPDATE orders 
      SET packer_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(note, shopifyOrderId);

    res.json({ success: true, note });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note: ' + error.message });
  }
});

// 🆕 Delete order (完全从 APP 中删除订单)
router.delete('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;

    console.log(`Deleting order ${shopifyOrderId} from APP`);

    // ⚠️ 不删除 transfer_items！
    // await db.prepare('DELETE FROM transfer_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 line_items
    await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 order
    await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);

    console.log(`✓ Order ${shopifyOrderId} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order: ' + error.message });
  }
});

router.patch('/items/:id/packer-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE line_items 
      SET packer_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item packer status:', error);
    res.status(500).json({ error: 'Failed to update item status: ' + error.message });
  }
});

// 🆕 Complete order - with optional Pack & Label It flow
router.post('/orders/:shopifyOrderId/complete', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { boxType, weight } = req.body;

    console.log('\n========== ORDER COMPLETION START ==========');
    console.log(`Shopify Order ID parameter: ${shopifyOrderId}`);

    if (!boxType) {
      return res.status(400).json({ error: 'Box type is required' });
    }

    // 获取订单信息
    const order = await db.prepare(
      'SELECT * FROM orders WHERE shopify_order_id = ?'
    ).get(shopifyOrderId);

    if (!order) {
      console.log('✗ Order not found in database');
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`Order found: ${order.name}`);

    // 获取 box type 详情（含 dimensions）
    const boxTypeRecord = await db.prepare(
      'SELECT * FROM box_types WHERE code = ?'
    ).get(boxType);

    // 更新订单状态
    await db.prepare(`
      UPDATE orders 
      SET box_type = ?, weight = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(boxType, weight || null, shopifyOrderId);

    // 更新 box type 使用统计
    await db.prepare(`
      UPDATE box_types 
      SET usage_count = usage_count + 1,
          quantity = CASE WHEN quantity > 0 THEN quantity - 1 ELSE quantity END
      WHERE code = ?
    `).run(boxType);

    console.log(`✓ Box type ${boxType} usage count updated`);

    // 提取真正的 Shopify Order ID（数字格式）
    let realShopifyOrderId = shopifyOrderId;
    if (shopifyOrderId.includes('gid://shopify/Order/')) {
      realShopifyOrderId = shopifyOrderId.split('gid://shopify/Order/')[1];
    } else if (shopifyOrderId.includes('/')) {
      realShopifyOrderId = shopifyOrderId.split('/').pop();
    }

    const shopifyClient = require('../shopify/client');

    // 更新 Shopify metafields（non-critical，不阻止主流程）
    try {
      await shopifyClient.updateOrderMetafield(realShopifyOrderId, 'custom', 'ready', 'true', 'boolean');
      await shopifyClient.updateOrderMetafield(realShopifyOrderId, 'custom', 'packed_time', new Date().toISOString(), 'date_time');
      await shopifyClient.updateOrderMetafield(realShopifyOrderId, 'custom', 'package', boxType, 'single_line_text_field');
      if (weight) {
        await shopifyClient.updateOrderMetafield(
          realShopifyOrderId, 'custom', 'weight',
          JSON.stringify({ value: parseFloat(weight), unit: 'g' }), 'weight'
        );
      }
      console.log(`✓ Shopify metafields updated for ${order.name}`);
    } catch (metafieldError) {
      console.error('⚠️ Error updating Shopify metafields (non-critical):', metafieldError.message);
    }

    // ===== PACK & LABEL IT FLOW =====
    // 检查是否启用了 pack_label_enabled
    const packLabelSetting = await db.prepare(
      "SELECT value FROM settings WHERE key = 'pack_label_enabled'"
    ).get();
    const packLabelEnabled = packLabelSetting?.value === 'true';

    if (!packLabelEnabled) {
      console.log('Pack & Label It is disabled, skipping label purchase');
      console.log('========== ORDER COMPLETION END ==========\n');
      return res.json({ success: true, packLabel: false });
    }

    console.log('Pack & Label It is enabled, proceeding with label purchase...');

    // 获取 sender 地址设置
    const senderSettings = await db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('sender_company','sender_contact','sender_address1','sender_address2','sender_city','sender_province','sender_postal_code')"
    ).all();
    const senderMap = {};
    senderSettings.forEach(s => { senderMap[s.key] = s.value; });

    const senderInfo = {
      company: senderMap.sender_company || 'HERA BEAUTÉ',
      contact: senderMap.sender_contact || '',
      address1: senderMap.sender_address1 || '',
      address2: senderMap.sender_address2 || '',
      city: senderMap.sender_city || '',
      province: senderMap.sender_province || '',
      postalCode: senderMap.sender_postal_code || ''
    };

    // 获取 label options（预设的 optional services）
    let labelOptions = {};
    if (order.label_options) {
      try { labelOptions = JSON.parse(order.label_options); } catch {}
    }

    // 计算实际使用的 weight（grams）
    // 如果用户在 modal 填了 weight，用那个；否则用所有 line items 的 weight 之和
    let totalWeightGrams = weight ? parseFloat(weight) : 0;
    if (!totalWeightGrams) {
      const lineItems = await db.prepare(
        'SELECT weight, weight_unit, quantity FROM line_items WHERE shopify_order_id = ?'
      ).all(shopifyOrderId);
      totalWeightGrams = lineItems.reduce((sum, item) => {
        const w = item.weight_unit === 'g' ? item.weight : item.weight * 1000;
        return sum + (w * item.quantity);
      }, 0);
    }
    // 最小 weight 50g，避免 API 报错
    if (totalWeightGrams < 50) totalWeightGrams = 50;

    // ── Step 1: Canada Post Create Shipment ──
    let labelResult = null;
    let labelStatus = 'failed';
    let labelError = null;
    let labelTrackingNumber = null;

    try {
      const canadaPostClient = require('../canadapost/client');
      labelResult = await canadaPostClient.createShipment({
        order,
        boxType: boxTypeRecord,
        weightGrams: totalWeightGrams,
        labelOptions,
        senderInfo
      });
      labelStatus = 'success';
      labelTrackingNumber = labelResult.trackingPin;
      console.log(`✓ Canada Post label created. Tracking: ${labelTrackingNumber}`);
    } catch (cpError) {
      labelError = cpError.message;
      console.error('✗ Canada Post label creation failed:', cpError.message);
    }

    // 更新 label 状态到数据库
    await db.prepare(`
      UPDATE orders 
      SET label_status = ?, label_error = ?, label_tracking_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(labelStatus, labelError, labelTrackingNumber, shopifyOrderId);

    // 如果 label 失败，停止流程，订单留在 fulfiller
    if (labelStatus === 'failed') {
      console.log('========== ORDER COMPLETION END (label failed) ==========\n');
      return res.json({
        success: false,
        packLabel: true,
        labelStatus: 'failed',
        labelError,
        fulfillStatus: null
      });
    }

    // ── Step 2: Shopify Fulfill + Canada Post Fulfill（并行）──
    let fulfillStatus = 'failed';
    let fulfillError = null;

    // 并行执行：Shopify fulfill 和 WebSocket 推送 label（打印）
    const fulfillPromise = (async () => {
      try {
        const fulfillmentOrders = await shopifyClient.getFulfillmentOrders(shopifyOrderId);
        const openFulfillmentOrder = fulfillmentOrders.find(fo => 
          fo.status === 'OPEN' || fo.status === 'IN_PROGRESS'
        );
        if (!openFulfillmentOrder) {
          throw new Error('No open fulfillment order found');
        }
        await shopifyClient.createFulfillment({
          fulfillmentOrderId: openFulfillmentOrder.id,
          trackingNumber: labelTrackingNumber
        });
        fulfillStatus = 'success';
        console.log(`✓ Shopify order fulfilled with tracking: ${labelTrackingNumber}`);
      } catch (fulfillErr) {
        fulfillError = fulfillErr.message;
        console.error('✗ Shopify fulfillment failed:', fulfillErr.message);
      }
    })();

    // WebSocket 推送 label PDF 给打印机 agent（fire and forget）
    const printPromise = (async () => {
      try {
        const { broadcastLabelPrint } = require('../websocket');
        if (labelResult?.labelHref) {
          const canadaPostClient = require('../canadapost/client');
          const pdfBuffer = await canadaPostClient.getLabelPdf(labelResult.labelHref);
          broadcastLabelPrint({
            orderName: order.name,
            trackingNumber: labelTrackingNumber,
            pdfBase64: pdfBuffer.toString('base64')
          });
          console.log(`✓ Label PDF pushed to print agent for ${order.name}`);
        }
      } catch (printErr) {
        console.error('⚠️ Label print push failed (non-critical):', printErr.message);
      }
    })();

    // 等待 fulfill 完成（print 是 fire-and-forget）
    await fulfillPromise;
    printPromise.catch(() => {}); // suppress unhandled rejection

    // 更新 fulfill 状态到数据库
    await db.prepare(`
      UPDATE orders 
      SET fulfill_status = ?, fulfill_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(fulfillStatus, fulfillError, shopifyOrderId);

    // 如果 fulfill 成功，删除订单（webhook 会处理，但以防万一也手动删）
    // 实际上 Shopify 的 order/fulfilled webhook 会触发删除，这里不重复删
    // 只返回状态让前端决定如何跳转

    console.log('========== ORDER COMPLETION END ==========\n');

    return res.json({
      success: true,
      packLabel: true,
      labelStatus,
      labelTrackingNumber,
      fulfillStatus,
      fulfillError: fulfillStatus === 'failed' ? fulfillError : null
    });

  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).json({ error: 'Failed to complete order: ' + error.message });
  }
});

// 🆕 Get label options for an order
router.get('/orders/:shopifyOrderId/label-options', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const order = await db.prepare(
      'SELECT label_options, label_status, label_error, label_tracking_number, fulfill_status, fulfill_error FROM orders WHERE shopify_order_id = ?'
    ).get(shopifyOrderId);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    let labelOptions = {};
    if (order.label_options) {
      try { labelOptions = JSON.parse(order.label_options); } catch {}
    }

    res.json({
      labelOptions,
      labelStatus: order.label_status,
      labelError: order.label_error,
      labelTrackingNumber: order.label_tracking_number,
      fulfillStatus: order.fulfill_status,
      fulfillError: order.fulfill_error
    });
  } catch (error) {
    console.error('Error fetching label options:', error);
    res.status(500).json({ error: 'Failed to fetch label options: ' + error.message });
  }
});

// 🆕 Save label options for an order
router.patch('/orders/:shopifyOrderId/label-options', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { labelOptions } = req.body;

    await db.prepare(`
      UPDATE orders 
      SET label_options = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(JSON.stringify(labelOptions || {}), shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving label options:', error);
    res.status(500).json({ error: 'Failed to save label options: ' + error.message });
  }
});

// 🆕 Manifest management - get all untransmitted shipments grouped by date
router.get('/manifest/pending', async (req, res) => {
  try {
    const orders = await db.prepare(`
      SELECT name, label_tracking_number, label_status, created_at, box_type, weight
      FROM orders 
      WHERE label_status = 'success' 
        AND fulfill_status = 'success'
        AND manifest_transmitted = 0
      ORDER BY created_at DESC
    `).all();

    // Group by date (group-id format HERA-YYYYMMDD)
    const groups = {};
    orders.forEach(order => {
      const date = new Date(order.created_at);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const groupId = `HERA-${y}${m}${d}`;
      if (!groups[groupId]) groups[groupId] = { groupId, date: `${y}-${m}-${d}`, orders: [] };
      groups[groupId].orders.push(order);
    });

    res.json({ groups: Object.values(groups).sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (error) {
    console.error('Error fetching pending manifests:', error);
    res.status(500).json({ error: 'Failed to fetch pending manifests: ' + error.message });
  }
});

// 🆕 Generate manifest - transmit all pending shipments
router.post('/manifest/generate', async (req, res) => {
  try {
    // 获取 sender 设置
    const senderSettings = await db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('sender_company','sender_contact','sender_address1','sender_address2','sender_city','sender_province','sender_postal_code')"
    ).all();
    const senderMap = {};
    senderSettings.forEach(s => { senderMap[s.key] = s.value; });

    const senderInfo = {
      company: senderMap.sender_company || 'HERA BEAUTÉ',
      contact: senderMap.sender_contact || '',
      address1: senderMap.sender_address1 || '',
      address2: senderMap.sender_address2 || '',
      city: senderMap.sender_city || '',
      province: senderMap.sender_province || '',
      postalCode: senderMap.sender_postal_code || ''
    };

    // 获取所有未 transmit 的 shipment 的 group-ids
    const orders = await db.prepare(`
      SELECT name, label_tracking_number, created_at
      FROM orders 
      WHERE label_status = 'success' 
        AND fulfill_status = 'success'
        AND (manifest_transmitted = 0 OR manifest_transmitted IS NULL)
    `).all();

    if (orders.length === 0) {
      return res.status(400).json({ error: 'No pending shipments to transmit' });
    }

    // 收集所有唯一的 group-ids
    const groupIds = new Set();
    orders.forEach(order => {
      const date = new Date(order.created_at);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      groupIds.add(`HERA-${y}${m}${d}`);
    });

    console.log(`Transmitting ${orders.length} shipments across ${groupIds.size} group(s):`, [...groupIds]);

    const canadaPostClient = require('../canadapost/client');

    // Transmit all groups together
    const manifestLinks = await canadaPostClient.transmitShipments([...groupIds], senderInfo);

    if (manifestLinks.length === 0) {
      throw new Error('No manifest links returned from Canada Post');
    }

    // Download first manifest PDF
    const manifestPdf = await canadaPostClient.getManifestPdf(manifestLinks[0]);

    // Mark orders as transmitted
    await db.prepare(`
      UPDATE orders 
      SET manifest_transmitted = 1, updated_at = CURRENT_TIMESTAMP
      WHERE label_status = 'success' 
        AND fulfill_status = 'success'
        AND (manifest_transmitted = 0 OR manifest_transmitted IS NULL)
    `).run();

    console.log(`✓ Manifest generated. ${orders.length} shipments transmitted.`);

    // Return PDF as base64 for download
    res.json({
      success: true,
      shipmentCount: orders.length,
      groupCount: groupIds.size,
      manifestPdfBase64: manifestPdf.toString('base64')
    });

  } catch (error) {
    console.error('Error generating manifest:', error);
    res.status(500).json({ error: 'Failed to generate manifest: ' + error.message });
  }
});

router.patch('/items/:id/update-weight', async (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    console.log('\n========== WEIGHT UPDATE REQUEST ==========');
    console.log(`Item ID: ${id}`);
    console.log(`New weight: ${weight}g`);

    if (!weight || weight <= 0) {
      console.log('✗ Invalid weight value');
      return res.status(400).json({ error: 'Valid weight is required' });
    }

    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      console.log('✗ Item not found in database');
      return res.status(404).json({ error: 'Item not found' });
    }

    console.log('Item details:');
    console.log(`  SKU: ${item.sku || 'N/A'}`);
    console.log(`  Brand: ${item.brand || 'N/A'}`);
    console.log(`  Title: ${item.title || 'N/A'}`);
    console.log(`  Current weight: ${item.weight}${item.weight_unit}`);
    console.log(`  Has weight warning: ${item.has_weight_warning}`);

    // 只更新 weight 和 weight_unit，不改变 has_weight_warning
    await db.prepare(`
      UPDATE line_items 
      SET weight = ?, weight_unit = 'g', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(weight, id);

    console.log('✓ Local database updated successfully');

    let shopifyUpdateSuccess = false;
    let shopifyError = null;

    if (item.sku) {
      try {
        console.log(`\nAttempting Shopify update for SKU: ${item.sku}`);
        const shopifyClient = require('../shopify/client');
        const result = await shopifyClient.updateVariantWeightBySku(item.sku, weight);
        shopifyUpdateSuccess = true;
        console.log('✓ Shopify update SUCCESS');
        console.log('Updated variant details:');
        console.log(`  Variant ID: ${result.id}`);
        console.log(`  Weight: ${result.weight}${result.weight_unit}`);
      } catch (shopifyErr) {
        shopifyError = shopifyErr.message;
        console.error('✗ Shopify update FAILED');
        console.error('Error message:', shopifyErr.message);
        if (shopifyErr.response) {
          console.error('Response status:', shopifyErr.response.status);
          console.error('Response data:', JSON.stringify(shopifyErr.response.data, null, 2));
        }
        console.error('Full error stack:', shopifyErr.stack);
      }
    } else {
      console.log('⚠ No SKU found for this item, skipping Shopify update');
    }

    console.log('========================================\n');

    res.json({ 
      success: true,
      shopifyUpdated: shopifyUpdateSuccess,
      shopifyError: shopifyError
    });
  } catch (error) {
    console.error('Error updating weight:', error);
    res.status(500).json({ error: 'Failed to update weight: ' + error.message });
  }
});

// 🔧 TEMP DEBUG - remove after testing
router.get('/debug-order/:orderId', async (req, res) => {
  try {
    const shopifyClient = require('../shopify/client');
    const { orderId } = req.params;
    const orderGid = `gid://shopify/Order/${orderId}`;
    const query = `
      query {
        order(id: "${orderGid}") {
          id
          name
          displayFinancialStatus
          displayFulfillmentStatus
          cancelReason
          cancelledAt
          closedAt
          lineItems(first: 20) {
            edges {
              node {
                id
                name
                quantity
                fulfillableQuantity
                requiresShipping
              }
            }
          }
          fulfillments(first: 10) {
            id
            status
          }
          fulfillmentOrders(first: 10) {
            nodes {
              id
              status
              requestStatus
              assignedLocation {
                location {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;
    const response = await shopifyClient.client.post('/graphql.json', { query });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message, data: error.response?.data });
  }
});

// 🔧 TEMP DEBUG REST
router.get('/debug-order-rest/:orderId', async (req, res) => {
  try {
    const shopifyClient = require('../shopify/client');
    const { orderId } = req.params;
    const response = await shopifyClient.client.get(`/orders/${orderId}/fulfillment_orders.json`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message, data: error.response?.data });
  }
});

module.exports = router;