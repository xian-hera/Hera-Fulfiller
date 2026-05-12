const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database/init');

// ============================================================================
// Shopify API 配置
// ============================================================================

const SHOP = process.env.SHOPIFY_SHOP_NAME || 'beaute-hera.myshopify.com';
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-07';
const GQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

// Shopify Location IDs (confirmed via API testing)
const LOCATION_IDS = {
  'MTL01': 'gid://shopify/Location/107681349942',
  'MTL02': 'gid://shopify/Location/107681382710',
  'MTL03': 'gid://shopify/Location/107681448246',
  'MTL04': 'gid://shopify/Location/20829700169',
  'MTL05': 'gid://shopify/Location/107681481014',
  'MTL06': 'gid://shopify/Location/107681841462',
  'MTL07': 'gid://shopify/Location/35316531273',
  'MTL08': 'gid://shopify/Location/107681874230',
  'MTL09': 'gid://shopify/Location/107681939766',
  'MTL10': 'gid://shopify/Location/60899721289',
  'MTL11': 'gid://shopify/Location/107681972534',
};

async function gql(query, variables = {}) {
  const res = await axios.post(
    GQL_URL,
    { query, variables },
    {
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );
  if (res.data.errors) {
    throw new Error(res.data.errors[0]?.message || 'GraphQL error');
  }
  return res.data;
}

// ── Helper: get inventoryItemId by SKU ───────────────────────────────────────
async function getInventoryItemBySku(sku) {
  const data = await gql(`
    query {
      inventoryItems(first: 1, query: "sku:${sku}") {
        edges {
          node {
            id
            sku
          }
        }
      }
    }
  `);
  const edges = data?.data?.inventoryItems?.edges || [];
  return edges[0]?.node?.id || null;
}

// ── Helper: create one Shopify transfer ──────────────────────────────────────
async function createShopifyTransfer(fromLocation, lineItems, settings) {
  const originId = LOCATION_IDS[`MTL${fromLocation}`];
  const destinationId = LOCATION_IDS[settings.default_destination || 'MTL10'];
  const referenceName = settings.default_reference_name || 'Online Transfer';
  const tags = settings.default_tags || ['Online Transfer', 'WEB'];

  if (!originId) throw new Error(`Unknown location: MTL${fromLocation}`);

  const data = await gql(`
    mutation CreateTransfer($input: InventoryTransferCreateInput!) {
      inventoryTransferCreate(input: $input) {
        inventoryTransfer {
          id
          name
          status
          referenceName
          tags
          origin { name }
          destination { name }
        }
        userErrors { field message }
      }
    }
  `, {
    input: {
      originLocationId: originId,
      destinationLocationId: destinationId,
      referenceName,
      tags,
      lineItems,
    },
  });

  const result = data?.data?.inventoryTransferCreate;
  if (result?.userErrors?.length > 0) {
    throw new Error(result.userErrors[0].message);
  }

  return result?.inventoryTransfer;
}

// ── Helper: get draft transfers with Online Transfer or WEB tag ──────────────
async function getDraftTransfers() {
  const data = await gql(`
    query {
      inventoryTransfers(first: 50, query: "tag:WEB status:DRAFT") {
        edges {
          node {
            id
            name
            status
            referenceName
            tags
            origin { name }
            destination { name }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  totalQuantity
                  inventoryItem { id sku }
                }
              }
            }
          }
        }
      }
    }
  `);
  return data?.data?.inventoryTransfers?.edges?.map(e => e.node) || [];
}

// ── Helper: get transfer details by ID ───────────────────────────────────────
async function getTransferById(transferId) {
  const data = await gql(`
    query {
      node(id: "${transferId}") {
        ... on InventoryTransfer {
          id
          name
          status
          referenceName
          tags
          origin { name }
          destination { name }
          lineItems(first: 100) {
            edges {
              node {
                id
                totalQuantity
                inventoryItem { id sku }
              }
            }
          }
        }
      }
    }
  `);
  return data?.data?.node || null;
}

// ── Helper: mark transfer as transferred (full flow) ─────────────────────────
async function markTransferAsTransferred(transferId, lineItems) {
  // 1. Mark as ready to ship
  const readyData = await gql(`
    mutation {
      inventoryTransferMarkAsReadyToShip(id: "${transferId}") {
        inventoryTransfer { id status }
        userErrors { field message }
      }
    }
  `);
  const readyErrors = readyData?.data?.inventoryTransferMarkAsReadyToShip?.userErrors || [];
  if (readyErrors.length > 0) throw new Error(readyErrors[0].message);

  // 2. Create shipment
  const shipLineItems = lineItems.map(li => ({
    inventoryItemId: li.inventoryItem.id,
    quantity: li.totalQuantity,
  }));

  const shipData = await gql(`
    mutation CreateShipment($input: InventoryShipmentCreateInput!) {
      inventoryShipmentCreate(input: $input) {
        inventoryShipment { id status }
        userErrors { field message }
      }
    }
  `, {
    input: {
      movementId: transferId,
      lineItems: shipLineItems,
    },
  });

  const shipErrors = shipData?.data?.inventoryShipmentCreate?.userErrors || [];
  if (shipErrors.length > 0) throw new Error(shipErrors[0].message);
  const shipmentId = shipData?.data?.inventoryShipmentCreate?.inventoryShipment?.id;

  // 3. Mark in transit
  await gql(`
    mutation {
      inventoryShipmentMarkInTransit(id: "${shipmentId}") {
        inventoryShipment { id status }
        userErrors { field message }
      }
    }
  `);

  // 4. Receive (bulk accept)
  const receiveData = await gql(`
    mutation {
      inventoryShipmentReceive(
        id: "${shipmentId}",
        bulkReceiveAction: ACCEPTED
      ) {
        inventoryShipment { id status }
        userErrors { field message }
      }
    }
  `);
  const receiveErrors = receiveData?.data?.inventoryShipmentReceive?.userErrors || [];
  if (receiveErrors.length > 0) throw new Error(receiveErrors[0].message);

  return { shipmentId, status: 'TRANSFERRED' };
}

// ============================================================================
// Routes
// ============================================================================

// GET /api/shopify-transfer/settings
router.get('/settings', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT key, value FROM shopify_transfer_settings').all();
    const settings = {};
    rows.forEach(row => {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = row.value; }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/settings
router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    await db.prepare(
      'INSERT INTO shopify_transfer_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
    ).run(key, valueStr);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify-transfer/not-transferred  — waiting items not yet in a transfer
router.get('/not-transferred', async (req, res) => {
  try {
    const items = await db.prepare(`
      SELECT * FROM transfer_items
      WHERE status = 'waiting' AND shopify_transferred = 0
      ORDER BY transfer_from ASC, created_at ASC
    `).all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify-transfer/draft-transfers  — current draft transfers in Shopify
router.get('/draft-transfers', async (req, res) => {
  try {
    const transfers = await getDraftTransfers();
    res.json(transfers);
  } catch (err) {
    console.error('Error fetching draft transfers:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/create
// Body: { itemIds }
router.post('/create', async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    // Get settings
    const settingsRows = await db.prepare('SELECT key, value FROM shopify_transfer_settings').all();
    const settings = {};
    settingsRows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });

    // Fetch items
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    // Group by transfer_from (location)
    const grouped = {};
    for (const item of items) {
      const loc = item.transfer_from;
      if (!loc) continue;
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(item);
    }

    // Create transfers in ascending location order
    const sortedLocations = Object.keys(grouped).sort();
    const results = [];
    const errors = [];

    for (const loc of sortedLocations) {
      const locItems = grouped[loc];

      // Build line items: merge duplicate SKUs by summing quantities
      const lineItemsMap = {};
      for (const item of locItems) {
        if (!item.sku) continue;
        const inventoryItemId = await getInventoryItemBySku(item.sku);
        if (!inventoryItemId) {
          errors.push(`SKU ${item.sku} not found in Shopify`);
          continue;
        }
        lineItemsMap[inventoryItemId] = (lineItemsMap[inventoryItemId] || 0) + item.quantity;
      }
      const lineItems = Object.entries(lineItemsMap).map(([inventoryItemId, quantity]) => ({
        inventoryItemId,
        quantity,
      }));

      if (lineItems.length === 0) {
        errors.push(`No valid products for location ${loc}`);
        continue;
      }

      try {
        const transfer = await createShopifyTransfer(loc, lineItems, settings);

        // Save to DB
        const transferId = transfer.id;
        const transferNumber = transfer.name?.replace('#', '') || '';

        await db.prepare(`
          INSERT INTO shopify_transfers
            (transfer_id, transfer_number, from_location, destination, reference_name, tags, status, item_count)
          VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
          ON CONFLICT (transfer_id) DO UPDATE SET
            transfer_number = EXCLUDED.transfer_number,
            status = EXCLUDED.status,
            item_count = EXCLUDED.item_count,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          transferId,
          transferNumber,
          loc,
          settings.default_destination || 'MTL10',
          settings.default_reference_name || 'Online Transfer',
          JSON.stringify(settings.default_tags || ['Online Transfer', 'WEB']),
          locItems.length
        );

        // Update transfer_items
        for (const item of locItems) {
          await db.prepare(`
            UPDATE transfer_items
            SET shopify_transferred = 1, shopify_transfer_id = ?, shopify_transfer_number = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(transferId, transferNumber, item.id);
        }

        results.push({
          location: loc,
          transferId,
          transferNumber,
          itemCount: locItems.length,
        });

      } catch (err) {
        errors.push(`Failed to create transfer for location ${loc}: ${err.message}`);
      }
    }

    res.json({ success: true, results, errors });

  } catch (err) {
    console.error('Error creating Shopify transfers:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/add-to-transfer
// Body: { itemIds }
router.post('/add-to-transfer', async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    // Fetch items
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    // Get current draft transfers from Shopify
    const draftTransfers = await getDraftTransfers();

    // Map origin name → transfer
    const transferByOrigin = {};
    for (const t of draftTransfers) {
      const originName = t.origin?.name; // e.g. "MTL02"
      if (originName) transferByOrigin[originName] = t;
    }

    // Group items by location
    const grouped = {};
    for (const item of items) {
      const loc = item.transfer_from;
      if (!loc) continue;
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(item);
    }

    const results = [];
    const errors = [];

    for (const loc of Object.keys(grouped).sort()) {
      const locItems = grouped[loc];
      const originKey = `MTL${loc}`;
      const existingTransfer = transferByOrigin[originKey];

      if (!existingTransfer) {
        errors.push(`No draft transfer found for origin MTL${loc}. Please create a new transfer first.`);
        continue;
      }

      // Build new line items
      const newLineItems = [];
      for (const item of locItems) {
        if (!item.sku) continue;
        const inventoryItemId = await getInventoryItemBySku(item.sku);
        if (!inventoryItemId) {
          errors.push(`SKU ${item.sku} not found in Shopify`);
          continue;
        }
        newLineItems.push({ inventoryItemId, quantity: item.quantity });
      }

      if (newLineItems.length === 0) continue;

      // Use inventoryTransferSetItems to add/update line items
      // First get existing line items, merge, then set
      const existingLineItems = existingTransfer.lineItems?.edges?.map(e => ({
        inventoryItemId: e.node.inventoryItem?.id,
        quantity: e.node.totalQuantity,
      })) || [];

      // Merge: if same inventoryItemId, add quantities
      const mergedMap = {};
      for (const li of existingLineItems) {
        mergedMap[li.inventoryItemId] = (mergedMap[li.inventoryItemId] || 0) + li.quantity;
      }
      for (const li of newLineItems) {
        mergedMap[li.inventoryItemId] = (mergedMap[li.inventoryItemId] || 0) + li.quantity;
      }
      const mergedLineItems = Object.entries(mergedMap).map(([inventoryItemId, quantity]) => ({
        inventoryItemId, quantity
      }));

      try {
        await gql(`
          mutation {
            inventoryTransferSetItems(input: {
              id: "${existingTransfer.id}",
              lineItems: ${JSON.stringify(mergedLineItems).replace(/"([^"]+)":/g, '$1:')}
            }) {
              inventoryTransfer { id status }
              userErrors { field message }
            }
          }
        `);

        const transferNumber = existingTransfer.name?.replace('#', '') || '';

        // Update DB
        await db.prepare(`
          UPDATE shopify_transfers
          SET item_count = item_count + ?, updated_at = CURRENT_TIMESTAMP
          WHERE transfer_id = ?
        `).run(locItems.length, existingTransfer.id);

        for (const item of locItems) {
          await db.prepare(`
            UPDATE transfer_items
            SET shopify_transferred = 1, shopify_transfer_id = ?, shopify_transfer_number = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(existingTransfer.id, transferNumber, item.id);
        }

        results.push({
          location: loc,
          transferId: existingTransfer.id,
          transferNumber,
          itemsAdded: locItems.length,
        });

      } catch (err) {
        errors.push(`Failed to add items to transfer for location ${loc}: ${err.message}`);
      }
    }

    res.json({ success: true, results, errors });

  } catch (err) {
    console.error('Error adding to Shopify transfer:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify-transfer/validate/:transferNumber
// Compare items in our DB with Shopify transfer
router.get('/validate/:transferNumber', async (req, res) => {
  try {
    const { transferNumber } = req.params;

    // Get items from our DB
    const dbItems = await db.prepare(`
      SELECT * FROM transfer_items WHERE shopify_transfer_number = ?
    `).all(transferNumber);

    if (dbItems.length === 0) {
      return res.status(404).json({ error: 'No items found for this transfer number' });
    }

    // Get transfer ID from our DB
    const transferRecord = await db.prepare(
      'SELECT * FROM shopify_transfers WHERE transfer_number = ?'
    ).get(transferNumber);

    if (!transferRecord) {
      return res.status(404).json({ error: 'Transfer record not found' });
    }

    // Get transfer from Shopify
    const shopifyTransfer = await getTransferById(transferRecord.transfer_id);
    if (!shopifyTransfer) {
      return res.status(404).json({ error: 'Transfer not found in Shopify' });
    }

    // Compare
    const shopifyItems = shopifyTransfer.lineItems?.edges?.map(e => ({
      sku: e.node.inventoryItem?.sku,
      quantity: e.node.totalQuantity,
    })) || [];

    const mismatches = [];

    // Check items in our DB vs Shopify
    for (const dbItem of dbItems) {
      const shopifyItem = shopifyItems.find(si => si.sku === dbItem.sku);
      if (!shopifyItem) {
        mismatches.push(`SKU ${dbItem.sku} is in Fulfiller but not in Shopify transfer`);
      } else if (shopifyItem.quantity !== dbItem.quantity) {
        mismatches.push(`SKU ${dbItem.sku}: Fulfiller qty ${dbItem.quantity} ≠ Shopify qty ${shopifyItem.quantity}`);
      }
    }

    // Check items in Shopify vs our DB
    for (const shopifyItem of shopifyItems) {
      const dbItem = dbItems.find(di => di.sku === shopifyItem.sku);
      if (!dbItem) {
        mismatches.push(`SKU ${shopifyItem.sku} is in Shopify transfer but not in Fulfiller`);
      }
    }

    const allReceived = dbItems.every(item => item.status === 'received');

    res.json({
      transferNumber,
      transferId: transferRecord.transfer_id,
      shopifyStatus: shopifyTransfer.status,
      dbItems: dbItems.length,
      shopifyItems: shopifyItems.length,
      mismatches,
      isValid: mismatches.length === 0,
      allReceived,
      canMarkAsTransferred: mismatches.length === 0 && allReceived,
    });

  } catch (err) {
    console.error('Error validating transfer:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify-transfer/mark-transferred
// Body: { transferNumber }
router.post('/mark-transferred', async (req, res) => {
  try {
    const { transferNumber } = req.body;
    if (!transferNumber) return res.status(400).json({ error: 'transferNumber required' });

    const transferRecord = await db.prepare(
      'SELECT * FROM shopify_transfers WHERE transfer_number = ?'
    ).get(transferNumber);

    if (!transferRecord) {
      return res.status(404).json({ error: 'Transfer record not found' });
    }

    // Get current transfer from Shopify to get line items
    const shopifyTransfer = await getTransferById(transferRecord.transfer_id);
    if (!shopifyTransfer) {
      return res.status(404).json({ error: 'Transfer not found in Shopify' });
    }

    const lineItems = shopifyTransfer.lineItems?.edges?.map(e => e.node) || [];

    // Run the full transfer flow
    await markTransferAsTransferred(transferRecord.transfer_id, lineItems);

    // Update our DB
    await db.prepare(`
      UPDATE shopify_transfers SET status = 'transferred', updated_at = CURRENT_TIMESTAMP
      WHERE transfer_number = ?
    `).run(transferNumber);

    res.json({ success: true, transferNumber, status: 'transferred' });

  } catch (err) {
    console.error('Error marking transfer as transferred:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;