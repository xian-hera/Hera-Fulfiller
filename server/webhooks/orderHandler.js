const db = require('../database/init');
const shopifyClient = require('../shopify/client');

class OrderWebhookHandler {
  // Helper function to fetch product details
  static async fetchProductDetails(productId) {
    try {
      const client = await shopifyClient.getClient();
      const response = await client.get(`/products/${productId}.json`);
      return response.data.product;
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error.message);
      return null;
    }
  }

  // Handle order created
  static async handleOrderCreated(orderData) {
    try {
      const order = {
        shopify_order_id: orderData.id.toString(),
        order_number: orderData.order_number.toString(),
        name: orderData.name,
        fulfillment_status: orderData.fulfillment_status || 'unfulfilled',
        total_quantity: orderData.line_items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal_price: orderData.subtotal_price,
        created_at: orderData.created_at,
        shipping_code: orderData.shipping_lines[0]?.code || '',
        shipping_title: orderData.shipping_lines[0]?.title || '',
        shipping_name: orderData.shipping_address?.name || '',
        shipping_address1: orderData.shipping_address?.address1 || '',
        shipping_address2: orderData.shipping_address?.address2 || '',
        shipping_city: orderData.shipping_address?.city || '',
        shipping_province: orderData.shipping_address?.province || '',
        shipping_zip: orderData.shipping_address?.zip || '',
        shipping_country: orderData.shipping_address?.country || ''
      };

      // Insert order
      // 🔒 FIX: ON CONFLICT 不覆写已是 'fulfilled' 的状态，防止 stale webhook 复活已完成的订单
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          shopify_order_id, order_number, name, fulfillment_status, 
          total_quantity, subtotal_price, created_at, shipping_code, shipping_title,
          shipping_name, shipping_address1, shipping_address2, 
          shipping_city, shipping_province, shipping_zip, shipping_country
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (shopify_order_id) DO UPDATE SET
          order_number = EXCLUDED.order_number,
          name = EXCLUDED.name,
          fulfillment_status = CASE
            WHEN orders.fulfillment_status = 'fulfilled' THEN 'fulfilled'
            ELSE EXCLUDED.fulfillment_status
          END,
          total_quantity = EXCLUDED.total_quantity,
          subtotal_price = EXCLUDED.subtotal_price,
          shipping_title = EXCLUDED.shipping_title,
          updated_at = CURRENT_TIMESTAMP
      `);

      await insertOrder.run(
        order.shopify_order_id, order.order_number, order.name,
        order.fulfillment_status, order.total_quantity, order.subtotal_price,
        order.created_at, order.shipping_code, order.shipping_title,
        order.shipping_name,
        order.shipping_address1, order.shipping_address2, order.shipping_city,
        order.shipping_province, order.shipping_zip, order.shipping_country
      );

      // Insert line items with full product details
      for (const item of orderData.line_items) {
        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        let imageUrl = '';
        let urlHandle = '';
        let productType = item.product_type || '';
        let wigNumber = '';
        let customName = '';
        let lookups = '';
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        // 获取 variant 信息（weight + custom_name + lookups）
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
              console.log(`Variant ${item.variant_id}: weight=${weight}${weightUnit}`);
            }
            
            // 获取 custom.name metafield（variant 层级）
            try {
              customName = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'name');
              if (customName) {
                console.log(`Variant ${item.variant_id}: custom.name=${customName}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.name for variant ${item.variant_id}:`, err.message);
            }

            // 🆕 获取 custom.lookups metafield（variant 层级）— 该产品的其他 barcode（逗号分隔）
            try {
              lookups = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'lookups');
              if (lookups) {
                console.log(`Variant ${item.variant_id}: custom.lookups=${lookups}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.lookups for variant ${item.variant_id}:`, err.message);
            }
          } catch (err) {
            console.error(`Failed to fetch variant ${item.variant_id}:`, err.message);
          }
        }
        
        const hasWeightWarning = (weight === 0 || weightUnit !== 'g') ? 1 : 0;

        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
            
            // 如果是 WIG 类型，获取 custom.wig_number metafield（product 层级）
            if (productType.toUpperCase() === 'WIG') {
              try {
                wigNumber = await shopifyClient.getProductMetafield(item.product_id, 'custom', 'wig_number');
                if (wigNumber) {
                  console.log(`Product ${item.product_id}: wig_number=${wigNumber}`);
                }
              } catch (err) {
                console.error(`Failed to fetch wig_number for product ${item.product_id}:`, err.message);
              }
            }
          }
        }
        
        const insertLineItem = db.prepare(`
          INSERT INTO line_items (
            shopify_order_id, order_number, shopify_line_item_id, quantity,
            image_url, title, name, brand, size, weight, weight_unit, sku,
            url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
            lookups, picker_status, packer_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (shopify_line_item_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            updated_at = CURRENT_TIMESTAMP
        `);

        await insertLineItem.run(
          order.shopify_order_id,
          order.order_number,
          item.id.toString(),
          item.quantity,
          imageUrl,
          item.title,
          item.name,
          item.vendor,
          size,
          weight,
          weightUnit,
          item.sku,
          urlHandle,
          productType,
          wigNumber,
          customName,
          hasWeightWarning,
          item.variant_title || '',
          lookups,
          'picking',
          'packing'
        );
      }

      console.log(`Order ${order.name} created successfully`);
      // Gift order handling — runs after order is saved, never blocks main flow
      const GiftHandler = require('./giftHandler');
      await GiftHandler.handleGiftOrder(orderData);
      return { success: true, order_number: order.name };
    } catch (error) {
      console.error('Error handling order created:', error);
      throw error;
    }
  }

  // Handle order updated
  static async handleOrderUpdated(orderData) {
    try {
      if (orderData.cancelled_at) {
        console.log(`Order ${orderData.name} is cancelled, deleting from APP`);
        return await this.handleOrderCancelled(orderData);
      }
      
      if (orderData.fulfillment_status === 'fulfilled') {
        console.log(`Order ${orderData.name} is fulfilled, deleting from APP`);
        return await this.handleOrderFulfilled(orderData);
      }
      
      const existingOrder = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?')
        .get(orderData.id.toString());

      // 🔒 FIX: 订单不在 DB 中，说明已经被 fulfilled/cancelled 删除过了
      // 去 Shopify API 查询真实状态，确认是否真的是活跃的 unfulfilled 订单
      if (!existingOrder) {
        // 先用 webhook 数据做快速检查
        if (orderData.fulfillment_status === 'fulfilled' || orderData.cancelled_at) {
          console.log(`Order ${orderData.name} not in DB and webhook shows fulfilled/cancelled — ignoring`);
          return { success: true, order_number: orderData.name };
        }

        // webhook 数据不可靠，去 Shopify API 查真实状态
        console.log(`Order ${orderData.name} not in DB — verifying with Shopify API...`);
        try {
          const shopifyOrder = await shopifyClient.getOrder(orderData.id.toString());
          if (shopifyOrder.fulfillment_status === 'fulfilled' || shopifyOrder.cancelled_at || shopifyOrder.closed_at) {
            console.log(`Order ${orderData.name} confirmed fulfilled/cancelled/closed by Shopify API — ignoring`);
            return { success: true, order_number: orderData.name };
          }
          console.log(`Order ${orderData.name} confirmed active by Shopify API — treating as new order`);
        } catch (apiErr) {
          // Shopify API 查询失败，保守处理：忽略，不重建
          // 避免因 stale webhook 误建订单，真正漏掉的订单可通过 Shopify 手动重发 webhook 补救
          console.error(`Order ${orderData.name} — Shopify API check failed: ${apiErr.message} — ignoring to be safe`);
          return { success: true, order_number: orderData.name };
        }

        return await this.handleOrderCreated(orderData);
      }

      // 获取所有退款记录，构建已退款 items 的 Map
      const refundedItems = new Map();
      
      if (orderData.refunds && Array.isArray(orderData.refunds)) {
        console.log(`\n📋 Checking refunds: ${orderData.refunds.length} refund records`);
        
        orderData.refunds.forEach(refund => {
          if (refund.refund_line_items) {
            refund.refund_line_items.forEach(refundItem => {
              const itemId = refundItem.line_item_id.toString();
              const refundedQty = refundItem.quantity;
              const currentRefunded = refundedItems.get(itemId) || 0;
              refundedItems.set(itemId, currentRefunded + refundedQty);
              console.log(`  💰 Item ${itemId} refunded: ${refundedQty} (total refunded: ${currentRefunded + refundedQty})`);
            });
          }
        });
      }

      // 过滤掉完全退款的 items，调整部分退款的数量
      const activeLineItems = [];
      orderData.line_items.forEach(item => {
        const itemId = item.id.toString();
        const refundedQty = refundedItems.get(itemId) || 0;
        const activeQty = item.quantity - refundedQty;
        
        if (activeQty > 0) {
          activeLineItems.push({
            ...item,
            quantity: activeQty,
            original_quantity: item.quantity,
            refunded_quantity: refundedQty
          });
          if (refundedQty > 0) {
            console.log(`  ✓ Item ${itemId}: original=${item.quantity}, refunded=${refundedQty}, active=${activeQty}`);
          }
        } else if (refundedQty > 0) {
          console.log(`  ✗ Item ${itemId}: fully refunded (original=${item.quantity}, refunded=${refundedQty})`);
        }
      });

      // Get existing line items
      const existingLineItems = await db.prepare(
        'SELECT * FROM line_items WHERE shopify_order_id = ?'
      ).all(orderData.id.toString());

      const itemGroups = new Map();
      existingLineItems.forEach(item => {
        const baseId = item.shopify_line_item_id.split('_')[0];
        if (!itemGroups.has(baseId)) {
          itemGroups.set(baseId, []);
        }
        itemGroups.get(baseId).push(item);
      });

      const currentItemIds = new Set();
      let itemsChanged = false; // 追踪是否真的有 item 增减

      console.log('\n=== Processing Updated Order ===');
      console.log('Incoming items from Shopify (after refunds):', activeLineItems.length);
      activeLineItems.forEach(item => {
        console.log(`  - ${item.id}: qty=${item.quantity}, title=${item.title}`);
      });

      console.log('\nExisting items in DB:', existingLineItems.length);
      existingLineItems.forEach(item => {
        console.log(`  - ${item.shopify_line_item_id}: qty=${item.quantity}, title=${item.title}`);
      });

      console.log('\nItem groups:', itemGroups.size);
      itemGroups.forEach((group, baseId) => {
        const total = group.reduce((sum, i) => sum + i.quantity, 0);
        console.log(`  - ${baseId}: ${group.length} entries, total qty=${total}`);
      });

      for (const item of activeLineItems) {
        const itemId = item.id.toString();
        currentItemIds.add(itemId);
        
        const existingGroup = itemGroups.get(itemId) || [];
        const totalExistingQty = existingGroup.reduce((sum, i) => sum + i.quantity, 0);

        console.log(`\nProcessing item ${itemId}:`);
        console.log(`  Shopify qty: ${item.quantity}`);
        console.log(`  DB qty: ${totalExistingQty}`);
        console.log(`  Condition: ${item.quantity < totalExistingQty ? 'DECREASE' : item.quantity > totalExistingQty ? 'INCREASE' : 'SAME'}`);

        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        let imageUrl = '';
        let urlHandle = '';
        let productType = item.product_type || '';
        let wigNumber = '';
        let customName = '';
        let lookups = '';
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        // 获取 variant 信息（weight + custom_name + lookups）
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
            }
            
            // 获取 custom.name metafield（variant 层级）
            try {
              customName = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'name');
              if (customName) {
                console.log(`Variant ${item.variant_id}: custom.name=${customName}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.name for variant ${item.variant_id}:`, err.message);
            }

            // 🆕 获取 custom.lookups metafield（variant 层级）— 该产品的其他 barcode（逗号分隔）
            try {
              lookups = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'lookups');
              if (lookups) {
                console.log(`Variant ${item.variant_id}: custom.lookups=${lookups}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.lookups for variant ${item.variant_id}:`, err.message);
            }
          } catch (err) {
            console.error(`Failed to fetch variant ${item.variant_id}:`, err.message);
          }
        }
        
        const hasWeightWarning = (weight === 0 || weightUnit !== 'g') ? 1 : 0;

        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
            
            // 如果是 WIG 类型，获取 custom.wig_number metafield
            if (productType.toUpperCase() === 'WIG') {
              try {
                wigNumber = await shopifyClient.getProductMetafield(item.product_id, 'custom', 'wig_number');
                if (wigNumber) {
                  console.log(`Product ${item.product_id}: wig_number=${wigNumber}`);
                }
              } catch (err) {
                console.error(`Failed to fetch wig_number for product ${item.product_id}:`, err.message);
              }
            }
          }
        }

        if (existingGroup.length === 0) {
          // 新增的 item（订单编辑后加了新产品）
          console.log(`  Action: NEW ITEM`);
          itemsChanged = true;
          // 🔒 FIX: ON CONFLICT 防止重复 webhook 重复插入同一个 shopify_line_item_id
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
              lookups, picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (shopify_line_item_id) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              updated_at = CURRENT_TIMESTAMP
          `);

          await insertLineItem.run(
            orderData.id.toString(),
            orderData.order_number.toString(),
            itemId,
            item.quantity,
            imageUrl,
            item.title,
            item.name,
            item.vendor,
            size,
            weight,
            weightUnit,
            item.sku,
            urlHandle,
            productType,
            wigNumber,
            customName,
            hasWeightWarning,
            item.variant_title || '',
            lookups,
            'picking',
            'packing'
          );
        } else if (item.quantity > totalExistingQty) {
          // 数量增加（订单编辑后增加了数量）
          console.log(`  Action: INCREASE`);

          // 🔒 FIX: 幂等性检查 — 重新查一次 DB 最新数量，防止重复 webhook 多次叠加
          // itemGroups 是在本次 webhook 开始时快照的，如果同一 webhook 被 Shopify 重复推送
          // 两次调用可能同时读到旧快照，都认为需要 INCREASE，导致重复插入
          const freshGroup = await db.prepare(
            `SELECT * FROM line_items WHERE shopify_order_id = ? AND (shopify_line_item_id = ? OR shopify_line_item_id LIKE ?)`
          ).all(orderData.id.toString(), itemId, `${itemId}_%`);
          const freshQty = freshGroup.reduce((sum, i) => sum + i.quantity, 0);

          if (freshQty >= item.quantity) {
            console.log(`  INCREASE skipped — DB already has qty ${freshQty}, target is ${item.quantity}`);
          } else {
            const diff = item.quantity - freshQty;
            console.log(`  INCREASE confirmed (fresh DB qty: ${freshQty}, target: ${item.quantity}, diff: ${diff})`);
            itemsChanged = true;

            const insertLineItem = db.prepare(`
              INSERT INTO line_items (
                shopify_order_id, order_number, shopify_line_item_id, quantity,
                image_url, title, name, brand, size, weight, weight_unit, sku,
                url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
                lookups, picker_status, packer_status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            await insertLineItem.run(
              orderData.id.toString(),
              orderData.order_number.toString(),
              itemId + '_' + Date.now(),
              diff,
              imageUrl,
              item.title,
              item.name,
              item.vendor,
              size,
              weight,
              weightUnit,
              item.sku,
              urlHandle,
              productType,
              wigNumber,
              customName,
              hasWeightWarning,
              item.variant_title || '',
              lookups,
              'picking',
              'packing'
            );
          }
        } else if (item.quantity < totalExistingQty) {
          // 数量减少（订单编辑后减少了数量）
          console.log(`  Action: DECREASE`);
          itemsChanged = true;
          
          let remaining = totalExistingQty - item.quantity;
          existingGroup.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          
          for (const existingItem of existingGroup) {
            if (remaining <= 0) break;
            
            if (existingItem.quantity <= remaining) {
              console.log(`    Deleting line_item ${existingItem.id} (qty: ${existingItem.quantity})`);
              await db.prepare('DELETE FROM line_items WHERE id = ?').run(existingItem.id);
              remaining -= existingItem.quantity;
            } else {
              const newQty = existingItem.quantity - remaining;
              console.log(`    Updating line_item ${existingItem.id}: ${existingItem.quantity} -> ${newQty}`);
              await db.prepare('UPDATE line_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(newQty, existingItem.id);
              remaining = 0;
            }
          }
        } else {
          console.log(`  Action: NO CHANGE`);
        }
      }

      console.log('\nChecking for removed items:');
      console.log('Current item IDs from Shopify:', Array.from(currentItemIds));
      console.log('Item groups base IDs:', Array.from(itemGroups.keys()));

      for (const [baseId, group] of itemGroups.entries()) {
        console.log(`Checking ${baseId}: in currentItemIds? ${currentItemIds.has(baseId)}`);
        if (!currentItemIds.has(baseId)) {
          console.log(`  Action: ITEM REMOVED - ${baseId}`);
          itemsChanged = true;
          for (const item of group) {
            console.log(`    Deleting line_item ${item.id}`);
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(item.id);
            // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
          }
        }
      }

      // 🔒 FIX: 更新订单时不允许把 fulfillment_status 从 'fulfilled' 降级回去
      const newFulfillmentStatus = orderData.fulfillment_status || 'unfulfilled';
      const protectedStatus = existingOrder.fulfillment_status === 'fulfilled'
        ? 'fulfilled'
        : newFulfillmentStatus;

      // 只有当 item 真的发生了增减，才重置 packer 状态
      // 如果 orders/updated 只是支付确认、备注修改等与 item 无关的变化，不重置
      if (itemsChanged) {
        console.log(`Items changed — resetting packer status for order ${orderData.name}`);

        // 重置所有现有 line_items 的 packer_status 为 'packing'
        await db.prepare(`
          UPDATE line_items
          SET packer_status = 'packing', updated_at = CURRENT_TIMESTAMP
          WHERE shopify_order_id = ?
        `).run(orderData.id.toString());

        // 如果订单状态是 'ready'，重置回 'packing'
        // holding 和 waiting 状态不受影响
        if (existingOrder.status === 'ready') {
          await db.prepare(`
            UPDATE orders SET status = 'packing', updated_at = CURRENT_TIMESTAMP
            WHERE shopify_order_id = ?
          `).run(orderData.id.toString());
        }
      } else {
        console.log(`No item changes detected — packer status preserved for order ${orderData.name}`);
      }

      await db.prepare(`
        UPDATE orders SET 
          total_quantity = ?,
          fulfillment_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(
        activeLineItems.reduce((sum, item) => sum + item.quantity, 0),
        protectedStatus,
        orderData.id.toString()
      );

      console.log(`\nOrder ${orderData.name} updated successfully`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order updated:', error);
      throw error;
    }
  }

  // Handle refund created
  static async handleRefundCreated(refundData) {
    try {
      console.log('\n=== Refund Created Webhook ===');
      console.log('Refund ID:', refundData.id);
      console.log('Order ID:', refundData.order_id);
      
      const orderId = refundData.order_id.toString();
      
      const refundLineItems = refundData.refund_line_items || [];
      console.log(`Refunded items: ${refundLineItems.length}`);
      
      for (const refundItem of refundLineItems) {
        const lineItemId = refundItem.line_item_id.toString();
        const quantity = refundItem.quantity;
        
        console.log(`  💰 Refunding line_item ${lineItemId}, qty: ${quantity}`);
        
        const dbItems = await db.prepare(
          `SELECT * FROM line_items 
           WHERE shopify_order_id = ? 
           AND (shopify_line_item_id = ? OR shopify_line_item_id LIKE ?)
           ORDER BY created_at ASC`
        ).all(orderId, lineItemId, `${lineItemId}_%`);
        
        console.log(`    Found ${dbItems.length} matching items in DB`);
        
        let remainingToDelete = quantity;
        
        for (const dbItem of dbItems.reverse()) {
          if (remainingToDelete <= 0) break;
          
          if (dbItem.quantity <= remainingToDelete) {
            console.log(`    ✗ Deleting item ${dbItem.id} (qty: ${dbItem.quantity})`);
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(dbItem.id);
            // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
            remainingToDelete -= dbItem.quantity;
          } else {
            const newQty = dbItem.quantity - remainingToDelete;
            console.log(`    ↓ Reducing item ${dbItem.id} qty: ${dbItem.quantity} -> ${newQty}`);
            await db.prepare(
              'UPDATE line_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(newQty, dbItem.id);
            remainingToDelete = 0;
          }
        }
      }
      
      const remainingItems = await db.prepare(
        'SELECT SUM(quantity) as total FROM line_items WHERE shopify_order_id = ?'
      ).get(orderId);
      
      await db.prepare(
        'UPDATE orders SET total_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE shopify_order_id = ?'
      ).run(remainingItems.total || 0, orderId);
      
      console.log(`✓ Refund processed successfully`);
      return { success: true };
    } catch (error) {
      console.error('Error handling refund created:', error);
      return { success: false, error: error.message };
    }
  }

  // Handle order edits complete
  static async handleOrderEditsComplete(editData) {
    try {
      console.log(`\n=== Order Edits Complete Webhook ===`);
      console.log('Full webhook data:', JSON.stringify(editData, null, 2));
      
      const orderId = editData.order_edit?.order_id || editData.order_id || editData.admin_graphql_api_order_id;
      
      if (!orderId) {
        console.error('No order_id found in Order Edits webhook data');
        console.error('Available keys:', Object.keys(editData));
        return { success: false, error: 'No order_id in webhook data' };
      }
      
      const committed = editData.order_edit?.committed_at;
      
      if (!committed) {
        console.log('⚠️  Order edit was not committed, skipping');
        return { success: true, message: 'Edit not committed' };
      }
      
      console.log(`Edit ID: ${editData.order_edit?.id || editData.id || editData.admin_graphql_api_id}`);
      console.log(`Order ID: ${orderId}`);
      console.log(`✓ Order edit committed at: ${committed}`);
      
      console.log('Fetching latest order data from Shopify API...');
      const orderData = await shopifyClient.getOrder(orderId);
      
      console.log(`✓ Got fresh data for order ${orderData.name}`);
      console.log(`Line items count: ${orderData.line_items.length}`);
      
      await db.prepare(`
        UPDATE orders SET 
          is_edited = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(orderData.id.toString());
      
      console.log(`✓ Marked order ${orderData.name} as edited`);
      
      return await this.handleOrderUpdated(orderData);
    } catch (error) {
      console.error('Error handling order edits complete:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Handle order cancelled
  static async handleOrderCancelled(orderData) {
    try {
      const shopifyOrderId = orderData.id.toString();
      
      // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
      await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
      await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);
      
      console.log(`Order ${orderData.name} cancelled - order and line_items removed, transfer_items preserved`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order cancelled:', error);
      throw error;
    }
  }

  // Handle order fulfilled
  static async handleOrderFulfilled(orderData) {
    try {
      const shopifyOrderId = orderData.id.toString();
      
      // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
      await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
      await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);

      console.log(`Order ${orderData.name} fulfilled - order and line_items removed, transfer_items preserved`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order fulfilled:', error);
      throw error;
    }
  }

  // 🆕 Handle fulfillment order placed on hold (Shopify webhook)
  static async handleFulfillmentOrderPlacedOnHold(payload) {
    try {
      const fulfillmentOrderGid = payload.fulfillment_order?.id;
      if (!fulfillmentOrderGid) {
        console.error('fulfillment_orders/placed_on_hold webhook missing fulfillment_order.id');
        return { success: false, error: 'Missing fulfillment_order.id' };
      }

      const fulfillmentOrder = await shopifyClient.getFulfillmentOrderById(fulfillmentOrderGid);
      const shopifyOrderId = fulfillmentOrder.orderId;

      if (!shopifyOrderId) {
        console.error(`Could not resolve order_id for fulfillment order ${fulfillmentOrderGid}`);
        return { success: false, error: 'Could not resolve order_id' };
      }

      const order = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);

      if (!order) {
        console.log(`Order ${shopifyOrderId} not found in APP (POS / already fulfilled|cancelled) — ignoring hold webhook`);
        return { success: true, message: 'Order not tracked' };
      }

      if (order.status === 'holding') {
        console.log(`Order ${order.name} already holding — skipping (duplicate fulfillment order hold event)`);
        return { success: true, message: 'Already holding' };
      }

      await db.prepare(`
        UPDATE orders SET status = 'holding', updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(shopifyOrderId);

      console.log(`✓ Order ${order.name} set to holding (Shopify fulfillment hold)`);
      return { success: true, order_number: order.name };
    } catch (error) {
      console.error('Error handling fulfillment order placed on hold:', error);
      return { success: false, error: error.message };
    }
  }

  // 🆕 Handle fulfillment order hold released (Shopify webhook)
  static async handleFulfillmentOrderHoldReleased(payload) {
    try {
      const fulfillmentOrderGid = payload.fulfillment_order?.id;
      if (!fulfillmentOrderGid) {
        console.error('fulfillment_orders/hold_released webhook missing fulfillment_order.id');
        return { success: false, error: 'Missing fulfillment_order.id' };
      }

      const fulfillmentOrder = await shopifyClient.getFulfillmentOrderById(fulfillmentOrderGid);
      const shopifyOrderId = fulfillmentOrder.orderId;

      if (!shopifyOrderId) {
        console.error(`Could not resolve order_id for fulfillment order ${fulfillmentOrderGid}`);
        return { success: false, error: 'Could not resolve order_id' };
      }

      const order = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);

      if (!order) {
        console.log(`Order ${shopifyOrderId} not found in APP — ignoring release webhook`);
        return { success: true, message: 'Order not tracked' };
      }

      if (order.status !== 'holding') {
        console.log(`Order ${order.name} not holding — skipping (duplicate fulfillment order release event)`);
        return { success: true, message: 'Not holding' };
      }

      await db.prepare(`
        UPDATE orders SET status = 'packing', updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(shopifyOrderId);

      console.log(`✓ Order ${order.name} released from holding (Shopify fulfillment hold released)`);
      return { success: true, order_number: order.name };
    } catch (error) {
      console.error('Error handling fulfillment order hold released:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = OrderWebhookHandler;