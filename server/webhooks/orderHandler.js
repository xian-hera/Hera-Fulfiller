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
        shipping_name: orderData.shipping_address?.name || '',
        shipping_address1: orderData.shipping_address?.address1 || '',
        shipping_address2: orderData.shipping_address?.address2 || '',
        shipping_city: orderData.shipping_address?.city || '',
        shipping_province: orderData.shipping_address?.province || '',
        shipping_zip: orderData.shipping_address?.zip || '',
        shipping_country: orderData.shipping_address?.country || ''
      };

      // Insert order
      const insertOrder = db.prepare(`
        INSERT OR REPLACE INTO orders (
          shopify_order_id, order_number, name, fulfillment_status, 
          total_quantity, subtotal_price, created_at, shipping_code,
          shipping_name, shipping_address1, shipping_address2, 
          shipping_city, shipping_province, shipping_zip, shipping_country
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertOrder.run(
        order.shopify_order_id, order.order_number, order.name,
        order.fulfillment_status, order.total_quantity, order.subtotal_price,
        order.created_at, order.shipping_code, order.shipping_name,
        order.shipping_address1, order.shipping_address2, order.shipping_city,
        order.shipping_province, order.shipping_zip, order.shipping_country
      );

      // Insert line items with full product details
      const insertLineItem = db.prepare(`
        INSERT OR REPLACE INTO line_items (
          shopify_order_id, order_number, shopify_line_item_id, quantity,
          image_url, title, name, brand, size, weight, weight_unit, sku,
          url_handle, product_type, has_weight_warning, variant_title,
          picker_status, packer_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Fetch product details for each line item
      for (const item of orderData.line_items) {
        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        let imageUrl = '';
        let urlHandle = '';
        let productType = item.product_type || '';
        
        // 从 Shopify Variant API 获取真实的 weight 和 weight_unit
        let weight = item.grams || 0;
        let weightUnit = 'g';  // 默认值
        
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
        
        // 计算 has_weight_warning
        const hasWeightWarning = (weight === 0 || weightUnit !== 'g') ? 1 : 0;

        // If product_id exists, fetch full product details
        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
          }
        }
        
        insertLineItem.run(
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
          'picking',  // 明确设置 picker_status
          'packing'   // 明确设置 packer_status
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
      const existingOrder = db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?')
        .get(orderData.id.toString());

      if (!existingOrder) {
        return await this.handleOrderCreated(orderData);
      }

      // Get existing line items
      const existingLineItems = db.prepare(
        'SELECT * FROM line_items WHERE shopify_order_id = ?'
      ).all(orderData.id.toString());

      // 按照 shopify_line_item_id 的前缀分组（处理拆分的条目）
      const itemGroups = new Map();
      existingLineItems.forEach(item => {
        // 提取原始的 shopify_line_item_id（去掉 _timestamp 后缀）
        const baseId = item.shopify_line_item_id.split('_')[0];
        if (!itemGroups.has(baseId)) {
          itemGroups.set(baseId, []);
        }
        itemGroups.get(baseId).push(item);
      });

      const currentItemIds = new Set();

      // 添加详细日志
      console.log('\n=== Processing Updated Order ===');
      console.log('Incoming items from Shopify:', orderData.line_items.length);
      orderData.line_items.forEach(item => {
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

      // Process each line item in updated order
      for (const item of orderData.line_items) {
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
        
        // 从 Shopify Variant API 获取真实的 weight 和 weight_unit
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

        // Fetch product details
        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
          }
        }

        if (existingGroup.length === 0) {
          // 新增 item
          console.log(`  Action: NEW ITEM`);
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, has_weight_warning, variant_title,
              picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);

          insertLineItem.run(
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
          // Quantity 增加 - 创建新条目
          const diff = item.quantity - totalExistingQty;
          console.log(`  Action: INCREASE (diff: ${diff})`);
          
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, has_weight_warning, variant_title,
              picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);

          insertLineItem.run(
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
          // Quantity 减少 - 从最新的条目开始减少
          console.log(`  Action: DECREASE`);
          
          let remaining = totalExistingQty - item.quantity;
          // 按创建时间倒序排列（最新的先处理）
          existingGroup.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          
          for (const existingItem of existingGroup) {
            if (remaining <= 0) break;
            
            if (existingItem.quantity <= remaining) {
              // 删除整个条目
              console.log(`    Deleting line_item ${existingItem.id} (qty: ${existingItem.quantity})`);
              db.prepare('DELETE FROM line_items WHERE id = ?').run(existingItem.id);
              
              // 删除对应的 transferring transfer_items
              db.prepare(`
                DELETE FROM transfer_items 
                WHERE line_item_id = ? AND status = 'transferring'
              `).run(existingItem.id);
              
              remaining -= existingItem.quantity;
            } else {
              // 减少这个条目的数量
              const newQty = existingItem.quantity - remaining;
              console.log(`    Updating line_item ${existingItem.id}: ${existingItem.quantity} -> ${newQty}`);
              db.prepare('UPDATE line_items SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?')
                .run(newQty, existingItem.id);
              remaining = 0;
            }
          }
        } else {
          console.log(`  Action: NO CHANGE`);
        }
      }

      // 删除被移除的 items（所有相关条目）
      console.log('\nChecking for removed items:');
      console.log('Current item IDs from Shopify:', Array.from(currentItemIds));
      console.log('Item groups base IDs:', Array.from(itemGroups.keys()));

      itemGroups.forEach((group, baseId) => {
        console.log(`Checking ${baseId}: in currentItemIds? ${currentItemIds.has(baseId)}`);
        if (!currentItemIds.has(baseId)) {
          console.log(`  Action: ITEM REMOVED - ${baseId}`);
          group.forEach(item => {
            console.log(`    Deleting line_item ${item.id}`);
            
            // 删除 line_item
            db.prepare('DELETE FROM line_items WHERE id = ?').run(item.id);
            
            // 只删除 transferring 状态的 transfer_items
            db.prepare(`
              DELETE FROM transfer_items 
              WHERE line_item_id = ? AND status = 'transferring'
            `).run(item.id);
          });
        }
      });

      // Update order info
      db.prepare(`
        UPDATE orders SET 
          total_quantity = ?,
          fulfillment_status = ?,
          updated_at = datetime('now')
        WHERE shopify_order_id = ?
      `).run(
        orderData.line_items.reduce((sum, item) => sum + item.quantity, 0),
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

  // Handle order edits complete (新增方法)
  static async handleOrderEditsComplete(editData) {
    try {
      console.log(`\n=== Order Edits Complete Webhook ===`);
      console.log(`Edit ID: ${editData.id}`);
      console.log(`Order ID: ${editData.order_id}`);
      
      // 从 Shopify 获取最新的订单数据
      console.log('Fetching latest order data from Shopify API...');
      const orderData = await shopifyClient.getOrder(editData.order_id);
      
      console.log(`✓ Got fresh data for order ${orderData.name}`);
      console.log(`Line items count: ${orderData.line_items.length}`);
      
      // 调用 handleOrderUpdated 处理
      return await this.handleOrderUpdated(orderData);
    } catch (error) {
      console.error('Error handling order edits complete:', error);
      throw error;
    }
  }

  // Handle order cancelled
  static handleOrderCancelled(orderData) {
    try {
      const shopifyOrderId = orderData.id.toString();
      
      // 1. 删除 orders 表记录
      db.prepare('DELETE FROM orders WHERE shopify_order_id = ?')
        .run(shopifyOrderId);
      
      // 2. 删除所有 line_items
      db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?')
        .run(shopifyOrderId);
      
      // 3. 只删除 transferring 状态的 transfer_items（保留 waiting、found、received 状态）
      db.prepare(`
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
  static handleOrderFulfilled(orderData) {
    try {
      db.prepare(`
        UPDATE orders SET 
          fulfillment_status = ?,
          updated_at = datetime('now')
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
