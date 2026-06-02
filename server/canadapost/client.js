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

  // Parse box dimensions string "LxWxH" in inches → cm
  parseDimensions(dimensionString) {
    if (!dimensionString) return null;
    const parts = dimensionString.split('x').map(p => parseFloat(p.trim()));
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return {
      length: (parts[0] * 2.54).toFixed(1),
      width: (parts[1] * 2.54).toFixed(1),
      height: (parts[2] * 2.54).toFixed(1)
    };
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
        <prov-state>${this.escapeXml(order.shipping_province || '')}</prov-state>
        <country-code>${this.getCountryCode(order.shipping_country_code || order.shipping_country)}</country-code>
        <postal-zip-code>${(order.shipping_zip || '').replace(/\s/g, '')}</postal-zip-code>
      </address-details>
    </destination>`;
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
  async createShipment({ order, boxType, weightGrams, labelOptions, senderInfo }) {
    console.log('\n========== CANADA POST CREATE SHIPMENT ==========');
    console.log(`Order: ${order.name}`);
    console.log(`Box type: ${boxType}, Weight: ${weightGrams}g`);
    console.log(`Label options:`, labelOptions);

    const serviceCode = this.getServiceCode(order.shipping_code, order.shipping_title);
    console.log(`Service code: ${serviceCode}`);

    // Weight: grams → kg (Canada Post requires kg, 3 decimal places)
    const weightKg = (weightGrams / 1000).toFixed(3);

    // Dimensions from box_types (stored as "LxWxH" in inches)
    const dimensions = this.parseDimensions(boxType?.dimensions);

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
  <customer-request-id>${customerRequestId}</customer-request-id>
  <group-id>${groupId}</group-id>
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

      const parsed = await this.parseXml(response.data);
      const info = parsed?.['shipment-info'];

      if (!info) {
        throw new Error('Unexpected response structure from Canada Post');
      }

      const trackingPin = info['tracking-pin'];
      const shipmentId = info['shipment-id'];

      // Find label link (rel="label")
      const links = info?.links?.link;
      let labelHref = null;
      let labelMediaType = 'application/pdf';

      if (Array.isArray(links)) {
        const labelLink = links.find(l => l.$ && l.$.rel === 'label');
        if (labelLink) {
          labelHref = labelLink.$.href;
          labelMediaType = labelLink.$['media-type'] || 'application/pdf';
        }
      } else if (links && links.$ && links.$.rel === 'label') {
        labelHref = links.$.href;
        labelMediaType = links.$['media-type'] || 'application/pdf';
      }

      console.log(`✓ Shipment created. Tracking: ${trackingPin}`);
      console.log(`  Shipment ID: ${shipmentId}`);
      console.log(`  Label URL: ${labelHref}`);
      console.log('=================================================\n');

      return {
        trackingPin,
        shipmentId,
        labelHref,
        labelMediaType,
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