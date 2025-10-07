const db = require('../database/init');

class OrderWebhookHandler {
  // Handle order created
  static handleOrderCreated(orderData) {
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

      // Insert line items
      const insertLineItem = db.prepare(`
        INSERT OR REPLACE INTO line_items (
          shopify_order_id, order_number, shopify_line_item_id, quantity,
          image_url, title, name, brand, size, weight, weight_unit, sku,
          url_handle, product_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      orderData.line_items.forEach(item => {
        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        const productType = item.product_type || '';
        
        insertLineItem.run(
          order.shopify_order_id,
          order.order_number,
          item.id.toString(),
          item.quantity,
          item.product?.images?.[0]?.src || '',
          item.title,
          item.name,
          item.vendor,
          size,
          item.grams / 1000 || 0,
          'g',
          item.sku,
          item.product?.handle || '',
          productType
        );
      });

      console.log(`Order ${order.name} created successfully`);
      return { success: true, order_number: order.name };
    } catch (error) {
      console.error('Error handling order created:', error);
      throw error;
    }
  }

  // Handle order updated
  static handleOrderUpdated(orderData) {
    try {
      const existingOrder = db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?')
        .get(orderData.id.toString());

      if (!existingOrder) {
        return this.handleOrderCreated(orderData);
      }

      // Get existing line items
      const existingLineItems = db.prepare(
        'SELECT * FROM line_items WHERE shopify_order_id = ?'
      ).all(orderData.id.toString());

      const existingItemMap = new Map(
        existingLineItems.map(item => [item.shopify_line_item_id, item])
      );

      const currentItemIds = new Set();

      // Process each line item in updated order
      orderData.line_items.forEach(item => {
        const itemId = item.id.toString();
        currentItemIds.add(itemId);
        const existingItem = existingItemMap.get(itemId);

        if (!existingItem) {
          // New item - add to top
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);

          const size = item.properties?.find(p => p.name === 'Size')?.value || '';
          insertLineItem.run(
            orderData.id.toString(),
            orderData.order_number.toString(),
            itemId,
            item.quantity,
            item.product?.images?.[0]?.src || '',
            item.title,
            item.name,
            item.vendor,
            size,
            item.grams / 1000 || 0,
            'g',
            item.sku,
            item.product?.handle || '',
            item.product_type || ''
          );
        } else if (item.quantity > existingItem.quantity) {
          // Quantity increased - create new entry for difference
          const diff = item.quantity - existingItem.quantity;
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);

          const size = item.properties?.find(p => p.name === 'Size')?.value || '';
          insertLineItem.run(
            orderData.id.toString(),
            orderData.order_number.toString(),
            itemId + '_' + Date.now(),
            diff,
            item.product?.images?.[0]?.src || '',
            item.title,
            item.name,
            item.vendor,
            size,
            item.grams / 1000 || 0,
            'g',
            item.sku,
            item.product?.handle || '',
            item.product_type || ''
          );
        } else if (item.quantity < existingItem.quantity && item.quantity > 0) {
          // Quantity decreased but not removed
          db.prepare('UPDATE line_items SET quantity = ? WHERE id = ?')
            .run(item.quantity, existingItem.id);
        }
      });

      // Remove deleted items
      existingLineItems.forEach(item => {
        if (!currentItemIds.has(item.shopify_line_item_id)) {
          db.prepare('DELETE FROM line_items WHERE id = ?').run(item.id);
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

      console.log(`Order ${orderData.name} updated successfully`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order updated:', error);
      throw error;
    }
  }

  // Handle order cancelled
  static handleOrderCancelled(orderData) {
    try {
      db.prepare('DELETE FROM orders WHERE shopify_order_id = ?')
        .run(orderData.id.toString());
      
      console.log(`Order ${orderData.name} cancelled and removed`);
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