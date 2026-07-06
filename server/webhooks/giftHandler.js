const axios = require('axios');

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_API_URL = 'https://a.klaviyo.com/api/events';
const APP_BASE_URL = process.env.APP_BASE_URL; // e.g. https://hera-fulfiller.onrender.com

class GiftHandler {
  /**
   * Extract gift attributes from order note_attributes
   */
  static extractGiftAttributes(noteAttributes = []) {
    const get = (key) => noteAttributes.find((a) => a.name === key)?.value ?? '';
    return {
      isGift: get('is_gift') === 'true',
      recipientName: get('gift_recipient_name'),
      recipientEmail: get('gift_recipient_email'),
      giftMessage: get('gift_message'),
      senderName: get('gift_sender_name'),
      language: get('gift_language') || 'en',
    };
  }

  /**
   * Build the tracking image URL for this order.
   * This URL will be re-rendered on every email open.
   */
  static buildTrackingImageUrl(orderId, language) {
    return `${APP_BASE_URL}/api/gift/tracking-image?order_id=${orderId}&lang=${language}`;
  }

  /**
   * Send a Gift Order Created event to Klaviyo.
   * The recipient email is used as the profile identifier.
   * This does NOT subscribe them to any marketing list.
   */
  static async sendGiftCreatedEvent(orderData, giftAttributes) {
    const { recipientName, recipientEmail, giftMessage, senderName, language } = giftAttributes;

    if (!recipientEmail) {
      console.warn(`[GiftHandler] Order ${orderData.name}: recipient email is missing, skipping Klaviyo event`);
      return;
    }

    const trackingImageUrl = this.buildTrackingImageUrl(orderData.id, language);

    const payload = {
      data: {
        type: 'event',
        attributes: {
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: 'Gift Order Created',
              },
            },
          },
          profile: {
            data: {
              type: 'profile',
              attributes: {
                email: recipientEmail,
                // Do NOT set email_marketing_consent here
                // to avoid subscribing the recipient to marketing
              },
            },
          },
          properties: {
            recipient_name: recipientName,
            recipient_email: recipientEmail,
            gift_message: giftMessage,
            sender_name: senderName,
            recipient_language: language,
            order_name: orderData.name,
            order_id: orderData.id.toString(),
            tracking_image_url: trackingImageUrl,
            shop_name: 'Hera Beauté',
          },
          time: new Date().toISOString(),
        },
      },
    };

    try {
      await axios.post(KLAVIYO_API_URL, payload, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15',
        },
      });
      console.log(`[GiftHandler] ✓ Klaviyo event sent for order ${orderData.name} → ${recipientEmail}`);
    } catch (error) {
      // Log the error but do NOT throw — gift failure should never block the main order flow
      console.error(`[GiftHandler] ✗ Failed to send Klaviyo event for order ${orderData.name}:`, error.response?.data || error.message);
    }
  }

  /**
   * Main entry point — called from orderHandler after order is saved to DB.
   */
  static async handleGiftOrder(orderData) {
    const noteAttributes = orderData.note_attributes || [];
    const giftAttributes = this.extractGiftAttributes(noteAttributes);

    if (!giftAttributes.isGift) {
      return; // Not a gift order, nothing to do
    }

    console.log(`[GiftHandler] Gift order detected: ${orderData.name}`);
    await this.sendGiftCreatedEvent(orderData, giftAttributes);
  }
}

module.exports = GiftHandler;