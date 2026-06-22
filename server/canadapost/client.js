require('dotenv').config();
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

class CanadaPostClient {
  constructor() {
    this.username = process.env.CP_API_USERNAME;
    this.password = process.env.CP_API_PASSWORD;
    this.customerNumber = process.env.CP_CUSTOMER_NUMBER || '0008398038';
    this.contractId = process.env.CP_CONTRACT_ID || '0044158012';
    this.isProduction = process.env.CP_ENVIRONMENT === 'production';

    this.baseUrl = this.isProduction
      ? 'https://soa-gw.canadapost.ca'
      : 'https://ct.soa-gw.canadapost.ca';

    if (!this.username || !this.password) {
      console.error('ERROR: CP_API_USERNAME or CP_API_PASSWORD is not set!');
    }

    console.log(`Canada Post Client initialized (${this.isProduction ? 'PRODUCTION' : 'SANDBOX'})`);
  }

  // Base64 encode credentials for Basic Auth
  getAuthHeader() {
    const credentials = `${this.username}:${this.password}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  // Parse XML response to JS object
  async parseXml(xmlString) {
    try {
      return await parseStringPromise(xmlString, {
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [(name) => name.replace(/^[^:]+:/, '')]
      });
    } catch (error) {
      console.error('Error parsing XML:', error.message);
      throw new Error('Failed to parse Canada Post XML response');
    }
  }

  // Extract error messages from Canada Post XML error response
  extractErrors(parsedXml) {
    try {
      const messages = parsedXml?.messages?.message;
      if (!messages) return 'Unknown error';
      if (Array.isArray(messages)) {
        return messages.map(m => `[${m.code}] ${m.description}`).join('; ');
      }
      return `[${messages.code}] ${messages.description}`;
    } catch {
      return 'Unknown error';
    }
  }

  // Determine Canada Post service code from Shopify shipping info
  getServiceCode(shippingCode, shippingTitle) {
    if (!shippingCode && !shippingTitle) return 'DOM.EP';
    if (shippingCode === 'DOM.XP' || shippingTitle?.includes('Xpresspost')) return 'DOM.XP';
    if (shippingCode === 'DOM.PC' || shippingTitle?.includes('Priority')) return 'DOM.PC';
    return 'DOM.EP';
  }

  // Parse box dimensions string "LxWxH" → cm (Canada Post 要 cm)
  // lengthUnit='inch' 时 ×2.54 转 cm；='cm' 时直接用（不换算）
  parseDimensions(dimensionString, lengthUnit = 'inch') {
    if (!dimensionString) return null;
    const parts = dimensionString.split('x').map(p => parseFloat(p.trim()));
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const factor = lengthUnit === 'cm' ? 1 : 2.54;
    return {
      length: (parts[0] * factor).toFixed(1),
      width: (parts[1] * factor).toFixed(1),
      height: (parts[2] * factor).toFixed(1)
    };
  }

  // Canada Post service-code → 友好名称（写进 metafield 用）
  getServiceName(code) {
    const map = {
      'DOM.RP': 'Regular Parcel',
      'DOM.EP': 'Expedited Parcel',
      'DOM.XP': 'Xpresspost',
      'DOM.PC': 'Priority',
      'DOM.LIB': 'Library Books'
    };
    return map[code] || code || 'Unknown';
  }

  // Build optional services XML fragment
  buildOptionsXml(labelOptions = {}) {
    const options = [];

    // Liability coverage is always included (free up to $100)
    options.push(`
      <option>
        <option-code>COV</option-code>
        <option-amount>100.00</option-amount>
      </option>`);

    if (labelOptions.signature) {
      options.push(`
      <option>
        <option-code>SO</option-code>
      </option>`);
    }

    if (labelOptions.cardForPickup) {
      options.push(`
      <option>
        <option-code>HFP</option-code>
      </option>`);
    }

    // LAD and HFP are mutually exclusive — LAD takes priority if both somehow selected
    if (labelOptions.leaveAtDoor && !labelOptions.cardForPickup) {
      options.push(`
      <option>
        <option-code>LAD</option-code>
      </option>`);
    }

    if (options.length === 0) return '';
    return `<options>${options.join('')}
    </options>`;
  }

  // Build XML for sender (always uses our warehouse address from settings)
  buildSenderXml(senderInfo) {
    return `
    <sender>
      ${senderInfo.contact ? `<name>${senderInfo.contact}</name>` : ''}
      <company>${senderInfo.company || 'HERA BEAUTÉ'}</company>
      <contact-phone>0000000000</contact-phone>
      <address-details>
        <address-line-1>${senderInfo.address1}</address-line-1>
        ${senderInfo.address2 ? `<address-line-2>${senderInfo.address2}</address-line-2>` : ''}
        <city>${senderInfo.city}</city>
        <prov-state>${senderInfo.province}</prov-state>
        <country-code>CA</country-code>
        <postal-zip-code>${senderInfo.postalCode.replace(/\s/g, '')}</postal-zip-code>
      </address-details>
    </sender>`;
  }

  // Build XML for destination from Shopify order data
  buildDestinationXml(order) {
    return `
    <destination>
      <name>${this.escapeXml(order.shipping_name || '')}</name>
      <address-details>
        <address-line-1>${this.escapeXml(order.shipping_address1 || '')}</address-line-1>
        ${order.shipping_address2 ? `<address-line-2>${this.escapeXml(order.shipping_address2)}</address-line-2>` : ''}
        <city>${this.escapeXml(order.shipping_city || '')}</city>
        <prov-state>${this.getProvinceCode(order.shipping_province || '')}</prov-state>
        <country-code>${this.getCountryCode(order.shipping_country_code || order.shipping_country)}</country-code>
        <postal-zip-code>${(order.shipping_zip || '').replace(/\s/g, '')}</postal-zip-code>
      </address-details>
    </destination>`;
  }

  // Convert province/state name to code
  getProvinceCode(province) {
    if (!province) return province;
    if (province.length <= 3) return province.toUpperCase();
    const map = {
      'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB',
      'new brunswick': 'NB', 'newfoundland and labrador': 'NL', 'newfoundland': 'NL',
      'northwest territories': 'NT', 'nova scotia': 'NS', 'nunavut': 'NU',
      'ontario': 'ON', 'prince edward island': 'PE', 'quebec': 'QC', 'québec': 'QC',
      'saskatchewan': 'SK', 'yukon': 'YT',
      // US states
      'california': 'CA', 'new york': 'NY', 'texas': 'TX', 'florida': 'FL',
      'washington': 'WA', 'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH',
    };
    return map[province.toLowerCase().trim()] || province.substring(0, 2).toUpperCase();
  }

  // Convert country name to 2-letter ISO code
  getCountryCode(country) {
    if (!country) return 'CA';
    if (country.length === 2) return country.toUpperCase();
    const map = {
      'canada': 'CA', 'united states': 'US', 'usa': 'US', 'united states of america': 'US',
      'united kingdom': 'GB', 'uk': 'GB', 'australia': 'AU', 'france': 'FR',
      'germany': 'DE', 'japan': 'JP', 'china': 'CN', 'mexico': 'MX',
      'south korea': 'KR', 'korea': 'KR', 'italy': 'IT', 'spain': 'ES',
      'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'sweden': 'SE',
      'norway': 'NO', 'denmark': 'DK', 'finland': 'FI', 'portugal': 'PT',
      'brazil': 'BR', 'argentina': 'AR', 'colombia': 'CO', 'chile': 'CL',
      'india': 'IN', 'singapore': 'SG', 'hong kong': 'HK', 'taiwan': 'TW',
      'new zealand': 'NZ', 'ireland': 'IE', 'austria': 'AT', 'poland': 'PL',
    };
    return map[country.toLowerCase().trim()] || country.substring(0, 2).toUpperCase();
  }

  // Escape special XML characters
  escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Generate a unique group-id for today's shipments
  getTodayGroupId() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `HERA-${y}${m}${d}`;
  }

  // ============================================================
  // CREATE SHIPMENT
  // Creates a shipment and returns tracking number + label URL
  // ============================================================
  async createShipment({ order, boxType, weightValue, weightUnit = 'gram', lengthUnit = 'inch', labelOptions, senderInfo, serviceCodeOverride }) {
    console.log('\n========== CANADA POST CREATE SHIPMENT ==========');
    console.log(`Order: ${order.name}`);
    console.log(`Box type: ${boxType?.code || '(custom)'}, Weight: ${weightValue} ${weightUnit === 'kg' ? 'kg' : 'g'}`);
    console.log(`Label options:`, labelOptions);

    const serviceCode = serviceCodeOverride || this.getServiceCode(order.shipping_code, order.shipping_title);
    console.log(`Service code: ${serviceCode}`);

    // Weight → kg (Canada Post 要 kg, 3 位小数)
    // weightUnit='gram' 时 ÷1000；='kg' 时直接用（不换算）
    const weightKg = (weightUnit === 'kg' ? Number(weightValue) : Number(weightValue) / 1000).toFixed(3);

    // Dimensions：box_types.dimensions 或 custom 输入的 "LxWxH"
    // lengthUnit='inch' 时换算成 cm；='cm' 时直接用
    const dimensions = this.parseDimensions(boxType?.dimensions, lengthUnit);

    const groupId = this.getTodayGroupId();
    const customerRequestId = `${order.name}-${Date.now()}`;
    const postalCode = senderInfo.postalCode.replace(/\s/g, '');

    const optionsXml = this.buildOptionsXml(labelOptions);
    const senderXml = this.buildSenderXml(senderInfo);
    const destinationXml = this.buildDestinationXml(order);

    const dimensionsXml = dimensions ? `
        <dimensions>
          <length>${dimensions.length}</length>
          <width>${dimensions.width}</width>
          <height>${dimensions.height}</height>
        </dimensions>` : '';

    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<shipment xmlns="http://www.canadapost.ca/ws/shipment-v8">
  <transmit-shipment>true</transmit-shipment>
  <customer-request-id>${customerRequestId}</customer-request-id>
  <requested-shipping-point>${postalCode}</requested-shipping-point>
  <cpc-pickup-indicator>true</cpc-pickup-indicator>
  <delivery-spec>
    <service-code>${serviceCode}</service-code>
    ${senderXml}
    ${destinationXml}
    ${optionsXml}
    <parcel-characteristics>
      <weight>${weightKg}</weight>
      ${dimensionsXml}
    </parcel-characteristics>
    <print-preferences>
      <output-format>4x6</output-format>
      <encoding>PDF</encoding>
    </print-preferences>
    <preferences>
      <show-packing-instructions>false</show-packing-instructions>
      <show-postage-rate>false</show-postage-rate>
      <show-insured-value>false</show-insured-value>
    </preferences>
    <references>
      <customer-ref-1>${this.escapeXml(order.name)}</customer-ref-1>
    </references>
    <settlement-info>
      <contract-id>${this.contractId}</contract-id>
      <intended-method-of-payment>Account</intended-method-of-payment>
    </settlement-info>
  </delivery-spec>
</shipment>`;

    // ============================================================
    // CP_DEBUG — 发送前：核对发给 Canada Post 的数据
    // 在 Render 日志搜 "CP_DEBUG" 可定位全部；搜 "REQUEST START" 跳到起点
    // ============================================================
    console.log('\n===== CP_DEBUG REQUEST START =====');
    console.log(`[CP_DEBUG] Environment        : ${this.isProduction ? 'PRODUCTION' : 'SANDBOX'}`);
    console.log(`[CP_DEBUG] Order             : ${order.name}`);
    console.log(`[CP_DEBUG] Service code      : ${serviceCode}`);
    console.log('[CP_DEBUG] --- 1) 尺寸 / 重量 / 类型 ---');
    console.log(`[CP_DEBUG] Box type (raw)    : ${boxType ? (boxType.code || '(custom)') : '(none)'}`);
    console.log(`[CP_DEBUG] Dimensions (raw)  : ${boxType?.dimensions || '(none)'} (${lengthUnit}, "LxWxH")`);
    if (dimensions) {
      console.log(`[CP_DEBUG] Dimensions (sent) : L=${dimensions.length} x W=${dimensions.width} x H=${dimensions.height} cm`);
      console.log('[CP_DEBUG] Parcel type       : BOX/PARCEL (带 <dimensions>)');
    } else {
      console.log('[CP_DEBUG] Dimensions (sent) : (无) ');
      console.log('[CP_DEBUG] Parcel type       : ENVELOPE/无尺寸 (未带 <dimensions> — Canada Post 按无尺寸处理)');
    }
    console.log(`[CP_DEBUG] Weight (raw)      : ${weightValue} ${weightUnit === 'kg' ? 'kg' : 'g'}`);
    console.log(`[CP_DEBUG] Weight (sent)     : ${weightKg} kg`);
    console.log('[CP_DEBUG] --- 2) 收件人信息 (destination) ---');
    console.log(`[CP_DEBUG] Name              : ${order.shipping_name || ''}`);
    console.log(`[CP_DEBUG] Address line 1    : ${order.shipping_address1 || ''}`);
    console.log(`[CP_DEBUG] Address line 2    : ${order.shipping_address2 || ''}`);
    console.log(`[CP_DEBUG] City              : ${order.shipping_city || ''}`);
    console.log(`[CP_DEBUG] Province (raw)    : ${order.shipping_province || ''}  ->  (sent) ${this.getProvinceCode(order.shipping_province || '')}`);
    console.log(`[CP_DEBUG] Country (raw)     : ${order.shipping_country_code || order.shipping_country || ''}  ->  (sent) ${this.getCountryCode(order.shipping_country_code || order.shipping_country)}`);
    console.log(`[CP_DEBUG] Postal/ZIP        : ${(order.shipping_zip || '').replace(/\s/g, '')}`);
    console.log('[CP_DEBUG] --- 3) Reference ---');
    console.log(`[CP_DEBUG] customer-ref-1    : ${order.name}`);
    console.log(`[CP_DEBUG] customer-request-id: ${customerRequestId}`);
    console.log(`[CP_DEBUG] transmit-shipment : true (立即传输，不使用 group-id)`);
    console.log('[CP_DEBUG] --- 4) Label options ---');
    console.log(`[CP_DEBUG] Options           :`, labelOptions);
    console.log('[CP_DEBUG] --- 完整请求 XML（原文）---');
    console.log(requestXml);
    console.log('===== CP_DEBUG REQUEST END =====\n');

    console.log('Sending Create Shipment request...');

    try {
      const response = await axios.post(
        `${this.baseUrl}/rs/${this.customerNumber}/${this.customerNumber}/shipment`,
        requestXml,
        {
          headers: {
            'Content-Type': 'application/vnd.cpc.shipment-v8+xml',
            'Accept': 'application/vnd.cpc.shipment-v8+xml',
            'Authorization': this.getAuthHeader(),
            'Accept-language': 'en-CA'
          }
        }
      );

      // ============================================================
      // CP_DEBUG — 收到后：核对 Canada Post 返回的数据
      // 在 Render 日志搜 "RESPONSE START" 跳到起点
      // ============================================================
      console.log('\n===== CP_DEBUG RESPONSE START =====');
      console.log(`[CP_DEBUG] HTTP status       : ${response.status}`);
      console.log('[CP_DEBUG] --- 完整响应 XML（原文，价格/警告都在这里面找）---');
      console.log(typeof response.data === 'string' ? response.data : JSON.stringify(response.data));
      // 探测价格字段（不同账户/配置返回的字段名可能不同，全部尝试打印）
      try {
        const infoForPrice = (await this.parseXml(response.data))?.['shipment-info'] || {};
        const priceCandidates = ['shipment-price', 'price', 'due-amount', 'total-amount', 'cc-charge-amount'];
        let foundAnyPrice = false;
        priceCandidates.forEach(k => {
          if (infoForPrice[k] !== undefined) {
            console.log(`[CP_DEBUG] price field "${k}" : ${JSON.stringify(infoForPrice[k])}`);
            foundAnyPrice = true;
          }
        });
        if (!foundAnyPrice) {
          console.log('[CP_DEBUG] price            : 响应里未发现常见价格字段（create-shipment 默认可能不返回价格，详见上面 XML 原文）');
        }
      } catch (e) {
        console.log(`[CP_DEBUG] price probe error : ${e.message}`);
      }
      console.log('===== CP_DEBUG RESPONSE END =====\n');

      const parsed = await this.parseXml(response.data);
      const info = parsed?.['shipment-info'];

      if (!info) {
        throw new Error('Unexpected response structure from Canada Post');
      }

      const trackingPin = info['tracking-pin'];
      const shipmentId = info['shipment-id'];

      // Find label link (rel="label") + price link (rel="price")
      const links = info?.links?.link;
      let labelHref = null;
      let labelMediaType = 'application/pdf';
      let priceHref = null;
      let refundHref = null;

      if (Array.isArray(links)) {
        const labelLink = links.find(l => l.$ && l.$.rel === 'label');
        if (labelLink) {
          labelHref = labelLink.$.href;
          labelMediaType = labelLink.$['media-type'] || 'application/pdf';
        }
        const priceLink = links.find(l => l.$ && l.$.rel === 'price');
        if (priceLink) priceHref = priceLink.$.href;
        const refundLink = links.find(l => l.$ && l.$.rel === 'refund');
        if (refundLink) refundHref = refundLink.$.href;
      } else if (links && links.$ && links.$.rel === 'label') {
        labelHref = links.$.href;
        labelMediaType = links.$['media-type'] || 'application/pdf';
      }

      console.log(`✓ Shipment created. Tracking: ${trackingPin}`);
      console.log(`  Shipment ID: ${shipmentId}`);
      console.log(`  Label URL: ${labelHref}`);
      console.log(`  Price URL: ${priceHref}`);
      console.log(`  Refund URL: ${refundHref}`);
      console.log('=================================================\n');

      return {
        trackingPin,
        shipmentId,
        labelHref,
        labelMediaType,
        priceHref,
        refundHref,
        serviceCode,
        groupId
      };
    } catch (error) {
      if (error.response) {
        console.error('Canada Post API error status:', error.response.status);
        console.error('Canada Post API error data:', error.response.data);
        try {
          const parsed = await this.parseXml(error.response.data);
          const errorMsg = this.extractErrors(parsed);
          throw new Error(`Canada Post API error: ${errorMsg}`);
        } catch (parseErr) {
          if (parseErr.message.startsWith('Canada Post API error:')) throw parseErr;
          throw new Error(`Canada Post API error (${error.response.status}): ${error.response.data}`);
        }
      }
      throw error;
    }
  }

  // ============================================================
  // GET SHIPMENT PRICE
  // 调用 create-shipment 响应里的 rel="price" 链接，拿运费
  // 返回 { dueAmount, baseAmount, serviceCode }（金额为字符串，如 "11.61"）
  // sandbox 里返回的是 stub 值
  // ============================================================
  async getShipmentPrice(priceHref) {
    console.log('\n===== CP_DEBUG PRICE START =====');
    if (!priceHref) {
      console.log('[CP_DEBUG] price href 为空，跳过取价');
      console.log('===== CP_DEBUG PRICE END =====\n');
      return { dueAmount: null, baseAmount: null, serviceCode: null };
    }
    console.log(`[CP_DEBUG] Fetching price from: ${priceHref}`);
    try {
      const response = await axios.get(priceHref, {
        headers: {
          'Accept': 'application/vnd.cpc.shipment-v8+xml',
          'Authorization': this.getAuthHeader(),
          'Accept-language': 'en-CA'
        }
      });
      console.log(`[CP_DEBUG] HTTP status       : ${response.status}`);
      console.log('[CP_DEBUG] --- 完整价格响应 XML（原文）---');
      console.log(typeof response.data === 'string' ? response.data : JSON.stringify(response.data));

      const parsed = await this.parseXml(response.data);
      const sp = parsed?.['shipment-price'] || {};
      const dueAmount = sp['due-amount'] != null ? String(sp['due-amount']) : null;
      const baseAmount = sp['base-amount'] != null ? String(sp['base-amount']) : null;
      const serviceCode = sp['service-code'] || null;

      console.log(`[CP_DEBUG] service-code      : ${serviceCode}`);
      console.log(`[CP_DEBUG] base-amount       : ${baseAmount}`);
      console.log(`[CP_DEBUG] due-amount (总额)  : ${dueAmount}`);
      console.log('===== CP_DEBUG PRICE END =====\n');

      return { dueAmount, baseAmount, serviceCode };
    } catch (error) {
      console.error('[CP_DEBUG] price fetch error :', error.response?.data || error.message);
      console.log('===== CP_DEBUG PRICE END (error) =====\n');
      // 取价失败不应阻断整个流程
      return { dueAmount: null, baseAmount: null, serviceCode: null };
    }
  }

  // ============================================================
  // REQUEST SHIPMENT REFUND
  // 对已 transmit 的 shipment 请求退款（transmit-shipment=true 的 label 不能 void，只能 refund）
  // refundHref = Create Shipment 响应里 rel="refund" 的链接
  // 返回 { serviceTicketId, serviceTicketDate }
  // ============================================================
  async requestRefund(refundHref, email) {
    console.log('\n========== CANADA POST REFUND REQUEST ==========');
    console.log(`Refund URL: ${refundHref}`);
    console.log(`Email: ${email}`);

    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<shipment-refund-request xmlns="http://www.canadapost.ca/ws/shipment-v8">
  <email>${this.escapeXml(email)}</email>
</shipment-refund-request>`;

    try {
      const response = await axios.post(refundHref, requestXml, {
        headers: {
          'Content-Type': 'application/vnd.cpc.shipment-v8+xml',
          'Accept': 'application/vnd.cpc.shipment-v8+xml',
          'Authorization': this.getAuthHeader(),
          'Accept-language': 'en-CA'
        }
      });

      const parsed = await this.parseXml(response.data);
      const info = parsed?.['shipment-refund-request-info'] || {};

      const serviceTicketId = info['service-ticket-id'] || null;
      const serviceTicketDate = info['service-ticket-date'] || null;

      console.log(`✓ Refund requested. Ticket: ${serviceTicketId}, Date: ${serviceTicketDate}`);
      console.log('=================================================\n');

      return { serviceTicketId, serviceTicketDate };
    } catch (error) {
      if (error.response) {
        console.error('Refund API error status:', error.response.status);
        console.error('Refund API error data:', error.response.data);
        try {
          const parsed = await this.parseXml(error.response.data);
          const errorMsg = this.extractErrors(parsed);
          throw new Error(`Canada Post refund error: ${errorMsg}`);
        } catch (parseErr) {
          if (parseErr.message.startsWith('Canada Post refund error:')) throw parseErr;
          throw new Error(`Canada Post refund error (${error.response.status}): ${error.response.data}`);
        }
      }
      throw error;
    }
  }

  // ============================================================
  // GET ARTIFACT (Download label PDF)
  // Returns a Buffer of the PDF
  // ============================================================
  async getLabelPdf(labelHref) {
    console.log(`Downloading label PDF from: ${labelHref}`);
    try {
      const response = await axios.get(labelHref, {
        headers: {
          'Accept': 'application/pdf',
          'Authorization': this.getAuthHeader()
        },
        responseType: 'arraybuffer'
      });

      console.log(`✓ Label PDF downloaded (${response.data.byteLength} bytes)`);
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error downloading label PDF:', error.message);
      throw new Error(`Failed to download label PDF: ${error.message}`);
    }
  }

  // ============================================================
  // TRANSMIT SHIPMENTS
  // Submits all shipments in a group for billing/manifest
  // Returns array of manifest links
  // ============================================================
  async transmitShipments(groupIds, senderInfo) {
    const groupIdArray = Array.isArray(groupIds) ? groupIds : [groupIds];
    console.log(`\n========== CANADA POST TRANSMIT SHIPMENTS ==========`);
    console.log(`Group IDs: ${groupIdArray.join(', ')}`);


    const postalCode = senderInfo.postalCode.replace(/\s/g, '');

    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<transmit-set xmlns="http://www.canadapost.ca/ws/manifest-v8">
  <group-ids>
    ${groupIdArray.map(id => `<group-id>${id}</group-id>`).join('\n    ')}
  </group-ids>
  <requested-shipping-point>${postalCode}</requested-shipping-point>
  <cpc-pickup-indicator>true</cpc-pickup-indicator>
  <detailed-manifests>true</detailed-manifests>
  <method-of-payment>Account</method-of-payment>
  <manifest-address>
    <manifest-company>${this.escapeXml(senderInfo.company || 'HERA BEAUTÉ')}</manifest-company>
    ${senderInfo.contact ? `<manifest-name>${this.escapeXml(senderInfo.contact)}</manifest-name>` : ''}
    <phone-number>0000000000</phone-number>
    <address-details>
      <address-line-1>${this.escapeXml(senderInfo.address1)}</address-line-1>
      ${senderInfo.address2 ? `<address-line-2>${this.escapeXml(senderInfo.address2)}</address-line-2>` : ''}
      <city>${this.escapeXml(senderInfo.city)}</city>
      <prov-state>${this.escapeXml(senderInfo.province)}</prov-state>
      <postal-zip-code>${postalCode}</postal-zip-code>
    </address-details>
  </manifest-address>
</transmit-set>`;

    try {
      const response = await axios.post(
        `${this.baseUrl}/rs/${this.customerNumber}/${this.customerNumber}/manifest`,
        requestXml,
        {
          headers: {
            'Content-Type': 'application/vnd.cpc.manifest-v8+xml',
            'Accept': 'application/vnd.cpc.manifest-v8+xml',
            'Authorization': this.getAuthHeader(),
            'Accept-language': 'en-CA'
          }
        }
      );

      const parsed = await this.parseXml(response.data);
      const links = parsed?.manifests?.link;

      const manifestLinks = [];
      if (Array.isArray(links)) {
        links.forEach(l => {
          if (l.$ && l.$.rel === 'manifest') manifestLinks.push(l.$.href);
        });
      } else if (links && links.$ && links.$.rel === 'manifest') {
        manifestLinks.push(links.$.href);
      }

      console.log(`✓ Transmit successful. ${manifestLinks.length} manifest(s) created.`);
      console.log('====================================================\n');
      return manifestLinks;
    } catch (error) {
      if (error.response) {
        try {
          const parsed = await this.parseXml(error.response.data);
          const errorMsg = this.extractErrors(parsed);
          throw new Error(`Canada Post transmit error: ${errorMsg}`);
        } catch (parseErr) {
          if (parseErr.message.startsWith('Canada Post transmit error:')) throw parseErr;
          throw new Error(`Canada Post transmit error (${error.response.status})`);
        }
      }
      throw error;
    }
  }

  // ============================================================
  // GET MANIFEST PDF
  // Given a manifest link from transmit, returns the PDF buffer
  // ============================================================
  async getManifestPdf(manifestHref) {
    console.log(`Getting manifest from: ${manifestHref}`);
    try {
      // Step 1: Get manifest details (contains artifact link)
      const manifestResponse = await axios.get(manifestHref, {
        headers: {
          'Accept': 'application/vnd.cpc.manifest-v8+xml',
          'Authorization': this.getAuthHeader(),
          'Accept-language': 'en-CA'
        }
      });

      const parsed = await this.parseXml(manifestResponse.data);
      const links = parsed?.manifest?.links?.link;

      let artifactHref = null;
      if (Array.isArray(links)) {
        const artifactLink = links.find(l => l.$ && l.$.rel === 'artifact');
        if (artifactLink) artifactHref = artifactLink.$.href;
      } else if (links && links.$ && links.$.rel === 'artifact') {
        artifactHref = links.$.href;
      }

      if (!artifactHref) {
        throw new Error('No artifact link found in manifest response');
      }

      console.log(`Downloading manifest PDF from: ${artifactHref}`);

      // Step 2: Download the PDF
      const pdfResponse = await axios.get(artifactHref, {
        headers: {
          'Accept': 'application/pdf',
          'Authorization': this.getAuthHeader()
        },
        responseType: 'arraybuffer'
      });

      console.log(`✓ Manifest PDF downloaded (${pdfResponse.data.byteLength} bytes)`);
      return Buffer.from(pdfResponse.data);
    } catch (error) {
      console.error('Error getting manifest PDF:', error.message);
      throw new Error(`Failed to get manifest PDF: ${error.message}`);
    }
  }
}

module.exports = new CanadaPostClient();