require('dotenv').config();
const axios = require('axios');

class KlaviyoClient {
  constructor() {
    this.apiKey = process.env.KLAVIYO_API_KEY;
    this.baseUrl = 'https://a.klaviyo.com/api';
    this.revision = '2026-07-15'; // 已确认为当前推荐版本，Klaviyo 会不定期更新推荐版本，届时查 API 版本文档调整

    if (!this.apiKey) {
      console.error('ERROR: KLAVIYO_API_KEY is not set!');
    }
  }

  getHeaders() {
    return {
      'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
      'revision': this.revision,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // 通用的事件上报方法
  // eventName: 比如 'Return request submitted'
  // customerEmail: 关联到哪个 Klaviyo profile（如果这个 email 还没有对应 profile，Klaviyo 会自动新建一个，不需要我们提前建）
  // properties: 事件的 payload（对应方案文档 8.1 里定义的各个 event 的字段）
  // 注意：只有顶层（不嵌套）的 property 才能被 Klaviyo Flow 用来做筛选/分支条件；
  //   嵌套的对象/数组（比如 approved_items 这种列表）会被完整存下来、在 Klaviyo 后台看得到，
  //   但不能直接拿来做 segmentation 或 flow 的筛选条件——如果以后要基于某个 item 字段筛选，
  //   需要把那个字段单独拍平成一个顶层字段
  async trackEvent(eventName, customerEmail, properties = {}) {
    if (!this.apiKey) {
      console.error(`Klaviyo API key not configured; skipping event "${eventName}"`);
      return null;
    }
    if (!customerEmail) {
      console.error(`No customer email provided; skipping Klaviyo event "${eventName}"`);
      return null;
    }

    const body = {
      data: {
        type: 'event',
        attributes: {
          properties,
          metric: {
            data: {
              type: 'metric',
              attributes: { name: eventName }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: { email: customerEmail }
            }
          },
          time: new Date().toISOString()
        }
      }
    };

    try {
      console.log(`\nTracking Klaviyo event: "${eventName}" for ${customerEmail}`);
      const response = await axios.post(`${this.baseUrl}/events/`, body, {
        headers: this.getHeaders()
      });
      console.log(`✓ Klaviyo event "${eventName}" tracked successfully`);
      return response.data;
    } catch (error) {
      console.error(`✗ Error tracking Klaviyo event "${eventName}":`, error.response?.data || error.message);
      // Klaviyo 通知失败不应阻断退货流程本身，只记录错误
      return null;
    }
  }

  // ── 5 个 Return 相关 event 的封装（对应方案文档 8.1） ────────────────────

  async trackReturnRequestSubmitted(customerEmail, { orderName, orderId, items }) {
    return this.trackEvent('Return request submitted', customerEmail, {
      order_name: orderName,
      order_id: orderId,
      items: items.map(i => ({
        product_title: i.productTitle,
        variant_name: i.variantTitle,
        quantity: i.requestedQuantity
      }))
    });
  }

  async trackReturnRequestApproved(customerEmail, {
    orderName, orderId, customerFirstName, returnMethod, locationName,
    trackingNumber, qrCodeImage, labelPublicUrl, approvedItems, rejectedItems
  }) {
    return this.trackEvent('Return request approved', customerEmail, {
      order_name: orderName,
      order_id: orderId,
      customer_first_name: customerFirstName,
      return_method: returnMethod,
      location_name: locationName || null,
      tracking_number: trackingNumber || null,
      qr_code_image: qrCodeImage || null,
      label_public_url: labelPublicUrl || null,
      approved_items: approvedItems,
      rejected_items: rejectedItems || []
    });
  }

  async trackReturnRequestRejected(customerEmail, { orderName, orderId, rejectedItems, rejectionMessage }) {
    return this.trackEvent('Return request rejected', customerEmail, {
      order_name: orderName,
      order_id: orderId,
      rejected_items: rejectedItems,
      rejection_message: rejectionMessage || null
    });
  }

  async trackReturnReceived(customerEmail, { orderName, orderId, receivedItems }) {
    return this.trackEvent('Return received', customerEmail, {
      order_name: orderName,
      order_id: orderId,
      received_items: receivedItems
    });
  }

  async trackRefundIssued(customerEmail, { orderName, orderId, refundAmount, refundMethod }) {
    return this.trackEvent('Refund issued', customerEmail, {
      order_name: orderName,
      order_id: orderId,
      refund_amount: refundAmount,
      refund_method: refundMethod
    });
  }
}

module.exports = new KlaviyoClient();