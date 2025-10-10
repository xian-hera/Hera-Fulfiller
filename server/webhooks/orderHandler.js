const db = require('../database/init');
const shopifyClient = require('../shopify/client');

class OrderWebhookHandler {
  // Helper function to fetch product details
  static async fetchProductDetails(productId) {
    try {
      const response = await shopifyClient.client.get(`/products/${productId}.json`);
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

      // Insert order - PostgreSQL compatible
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
          fulfillment_status = EXCLUDED.fulfillment_status,
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
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
              console.log(`Variant ${item.variant_id}: weight=${weight}${weightUnit}`);
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
          }
        }
        
        const insertLineItem = db.prepare(`
          INSERT INTO line_items (
            shopify_order_id, order_number, shopify_line_item_id, quantity,
            image_url, title, name, brand, size, weight, weight_unit, sku,
            url_handle, product_type, has_weight_warning, variant_title,
            picker_status, packer_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          hasWeightWarning,
          item.variant_title || '',
          'picking',
          'packing'
        );
      }

      console.log(`Order ${order.name} created successfully`);
      return { success: true, order_number: order.name };
    } catch (error) {
      console.error('Error handling order created:', error);
      throw error;
    }
  }

  // Handle order updated
  static async handleOrderUpdated(orderData) {
    try {
      const existingOrder = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?')
        .get(orderData.id.toString());

      if (!existingOrder) {
        return await this.handleOrderCreated(orderData);
      }

      // 🆕 获取所有退款记录，构建已退款 items 的 Map
      const refundedItems = new Map(); // line_item_id -> 已退款数量
      
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

      // 🆕 过滤掉完全退款的 items，调整部分退款的数量
      const activeLineItems = [];
      orderData.line_items.forEach(item => {
        const itemId = item.id.toString();
        const refundedQty = refundedItems.get(itemId) || 0;
        const activeQty = item.quantity - refundedQty;
        
        if (activeQty > 0) {
          // 只保留有效数量的 items
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

      // 🆕 使用 activeLineItems 而不是 orderData.line_items
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
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
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
          }
        }

        if (existingGroup.length === 0) {
          console.log(`  Action: NEW ITEM`);
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, has_weight_warning, variant_title,
              picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
            hasWeightWarning,
            item.variant_title || '',
            'picking',
            'packing'
          );
        } else if (item.quantity > totalExistingQty) {
          const diff = item.quantity - totalExistingQty;
          console.log(`  Action: INCREASE (diff: ${diff})`);
          
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, has_weight_warning, variant_title,
              picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
            hasWeightWarning,
            item.variant_title || '',
            'picking',
            'packing'
          );
        } else if (item.quantity < totalExistingQty) {
          console.log(`  Action: DECREASE`);
          
          let remaining = totalExistingQty - item.quantity;
          existingGroup.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          
          for (const existingItem of existingGroup) {
            if (remaining <= 0) break;
            
            if (existingItem.quantity <= remaining) {
              console.log(`    Deleting line_item ${existingItem.id} (qty: ${existingItem.quantity})`);
              await db.prepare('DELETE FROM line_items WHERE id = ?').run(existingItem.id);
              
              await db.prepare(`
                DELETE FROM transfer_items 
                WHERE line_item_id = ? AND status = 'transferring'
              `).run(existingItem.id);
              
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
          for (const item of group) {
            console.log(`    Deleting line_item ${item.id}`);
            
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(item.id);
            
            await db.prepare(`
              DELETE FROM transfer_items 
              WHERE line_item_id = ? AND status = 'transferring'
            `).run(item.id);
          }
        }
      }

      // 更新订单信息（不设置 is_edited）
      // 🆕 使用 activeLineItems 计算总数量
      await db.prepare(`
        UPDATE orders SET 
          total_quantity = ?,
          fulfillment_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(
        activeLineItems.reduce((sum, item) => sum + item.quantity, 0),
        orderData.fulfillment_status || 'unfulfilled',
        orderData.id.toString()
      );

      console.log(`\nOrder ${orderData.name} updated successfully`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order updated:', error);
      throw error;
    }
  }

  // 🆕 Handle refund created
  static async handleRefundCreated(refundData) {
    try {
      console.log('\n=== Refund Created Webhook ===');
      console.log('Refund ID:', refundData.id);
      console.log('Order ID:', refundData.order_id);
      
      const orderId = refundData.order_id.toString();
      
      // 获取退款的 line items
      const refundLineItems = refundData.refund_line_items || [];
      console.log(`Refunded items: ${refundLineItems.length}`);
      
      for (const refundItem of refundLineItems) {
        const lineItemId = refundItem.line_item_id.toString();
        const quantity = refundItem.quantity;
        
        console.log(`  💰 Refunding line_item ${lineItemId}, qty: ${quantity}`);
        
        // 查找数据库中的 line_items（可能有多个，因为可能被 split 过）
        const dbItems = await db.prepare(
          `SELECT * FROM line_items 
           WHERE shopify_order_id = ? 
           AND (shopify_line_item_id = ? OR shopify_line_item_id LIKE ?)
           ORDER BY created_at ASC`
        ).all(orderId, lineItemId, `${lineItemId}_%`);
        
        console.log(`    Found ${dbItems.length} matching items in DB`);
        
        let remainingToDelete = quantity;
        
        // 从最新的开始删除
        for (const dbItem of dbItems.reverse()) {
          if (remainingToDelete <= 0) break;
          
          if (dbItem.quantity <= remainingToDelete) {
            // 完全删除这个 item
            console.log(`    ✗ Deleting item ${dbItem.id} (qty: ${dbItem.quantity})`);
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(dbItem.id);
            await db.prepare(`
              DELETE FROM transfer_items 
              WHERE line_item_id = ?
            `).run(dbItem.id);
            remainingToDelete -= dbItem.quantity;
          } else {
            // 减少数量
            const newQty = dbItem.quantity - remainingToDelete;
            console.log(`    ↓ Reducing item ${dbItem.id} qty: ${dbItem.quantity} -> ${newQty}`);
            await db.prepare(
              'UPDATE line_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(newQty, dbItem.id);
            remainingToDelete = 0;
          }
        }
      }
      
      // 更新订单的总数量
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
      
      // 🆕 修复：从正确的位置获取 order_id
      const orderId = editData.order_edit?.order_id || editData.order_id || editData.admin_graphql_api_order_id;
      
      if (!orderId) {
        console.error('No order_id found in Order Edits webhook data');
        console.error('Available keys:', Object.keys(editData));
        return { success: false, error: 'No order_id in webhook data' };
      }
      
      // 🆕 检查 edit 是否被 committed
      const committed = editData.order_edit?.committed_at;
      
      if (!committed) {
        console.log('⚠️  Order edit was not committed, skipping');
        return { success: true, message: 'Edit not committed' };
      }
      
      console.log(`Edit ID: ${editData.order_edit?.id || editData.id || editData.admin_graphql_api_id}`);
      console.log(`Order ID: ${orderId}`);
      console.log(`✓ Order edit committed at: ${committed}`);
      
      // 从 Shopify 获取最新的订单数据
      console.log('Fetching latest order data from Shopify API...');
      const orderData = await shopifyClient.getOrder(orderId);
      
      console.log(`✓ Got fresh data for order ${orderData.name}`);
      console.log(`Line items count: ${orderData.line_items.length}`);
      
      // 标记为 edited
      await db.prepare(`
        UPDATE orders SET 
          is_edited = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(orderData.id.toString());
      
      console.log(`✓ Marked order ${orderData.name} as edited`);
      
      // 然后调用 handleOrderUpdated 处理内容变化
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
      
      await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?')
        .run(shopifyOrderId);
      
      await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?')
        .run(shopifyOrderId);
      
      await db.prepare(`
        DELETE FROM transfer_items 
        WHERE shopify_order_id = ? AND status = 'transferring'
      `).run(shopifyOrderId);
      
      console.log(`Order ${orderData.name} cancelled - removed order, line_items, and transferring transfer_items (kept waiting)`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order cancelled:', error);
      throw error;
    }
  }

  // Handle order fulfilled
  static async handleOrderFulfilled(orderData) {
    try {
      await db.prepare(`
        UPDATE orders SET 
          fulfillment_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run('fulfilled', orderData.id.toString());

      console.log(`Order ${orderData.name} fulfilled`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order fulfilled:', error);
      throw error;
    }
  }
}

module.exports = OrderWebhookHandler;