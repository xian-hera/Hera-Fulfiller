const express = require('express');
const router = express.Router();
const db = require('../database/init');

// ── Location mapping（方案文档 11.1） ───────────────────────────────────────

// GET /api/return-portal/locations
router.get('/locations', async (req, res) => {
  try {
    const locations = await db.prepare(
      'SELECT * FROM return_portal_locations ORDER BY sort_order ASC, id ASC'
    ).all();
    res.json(locations);
  } catch (error) {
    console.error('Error fetching portal locations:', error);
    res.status(500).json({ error: 'Failed to fetch portal locations: ' + error.message });
  }
});

// POST /api/return-portal/locations — "+ Add store"，新增后直接是编辑态（由前端处理），后端只管落库
// body: { shopifyLocationId, storeName, storeAddress, storeCity, openingHours }
router.post('/locations', async (req, res) => {
  try {
    const { shopifyLocationId, storeName, storeAddress, storeCity, openingHours } = req.body;

    if (!shopifyLocationId) {
      return res.status(400).json({ error: 'shopifyLocationId is required' });
    }

    const maxOrderResult = await db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM return_portal_locations'
    ).get();
    const nextOrder = maxOrderResult.max_order + 1;

    const result = await db.prepare(`
      INSERT INTO return_portal_locations (shopify_location_id, store_name, store_address, store_city, opening_hours, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(shopifyLocationId, storeName || null, storeAddress || null, storeCity || null, openingHours || null, nextOrder);

    const created = await db.prepare('SELECT * FROM return_portal_locations WHERE id = ?').get(result.lastInsertRowid);
    res.json(created);
  } catch (error) {
    console.error('Error creating portal location:', error);
    res.status(500).json({ error: 'Failed to create portal location: ' + error.message });
  }
});

// PATCH /api/return-portal/locations/:id
router.patch('/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { shopifyLocationId, storeName, storeAddress, storeCity, openingHours } = req.body;

    const existing = await db.prepare('SELECT * FROM return_portal_locations WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }

    await db.prepare(`
      UPDATE return_portal_locations
      SET shopify_location_id = ?, store_name = ?, store_address = ?, store_city = ?, opening_hours = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      shopifyLocationId !== undefined ? shopifyLocationId : existing.shopify_location_id,
      storeName !== undefined ? storeName : existing.store_name,
      storeAddress !== undefined ? storeAddress : existing.store_address,
      storeCity !== undefined ? storeCity : existing.store_city,
      openingHours !== undefined ? openingHours : existing.opening_hours,
      id
    );

    const updated = await db.prepare('SELECT * FROM return_portal_locations WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating portal location:', error);
    res.status(500).json({ error: 'Failed to update portal location: ' + error.message });
  }
});

// PATCH /api/return-portal/locations/reorder — body: { orderedIds: [...] }
router.patch('/locations/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds is required' });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await db.prepare(
        'UPDATE return_portal_locations SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(i, orderedIds[i]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering portal locations:', error);
    res.status(500).json({ error: 'Failed to reorder portal locations: ' + error.message });
  }
});

// DELETE /api/return-portal/locations/:id
router.delete('/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare('SELECT * FROM return_portal_locations WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }
    await db.prepare('DELETE FROM return_portal_locations WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting portal location:', error);
    res.status(500).json({ error: 'Failed to delete portal location: ' + error.message });
  }
});

// ── Branding color / Return policy（方案文档 11.2 / 11.3，用通用 key-value） ─

async function getPortalSetting(key, fallback) {
  const row = await db.prepare('SELECT value FROM return_settings WHERE key = ?').get(key);
  if (!row || row.value === null || row.value === undefined) return fallback;
  try { return JSON.parse(row.value); } catch (e) { return row.value; }
}

async function setPortalSetting(key, value) {
  await db.prepare(`
    INSERT INTO return_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(value));
}

// GET /api/return-portal/branding
router.get('/branding', async (req, res) => {
  try {
    const branding = await getPortalSetting('portal_branding', { color: '#E32A69' });
    res.json(branding);
  } catch (error) {
    console.error('Error fetching branding:', error);
    res.status(500).json({ error: 'Failed to fetch branding: ' + error.message });
  }
});

// PATCH /api/return-portal/branding — body: { color: '#RRGGBB' }
router.patch('/branding', async (req, res) => {
  try {
    const { color } = req.body;
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ error: 'color must be a valid hex code, e.g. #E32A69' });
    }
    const branding = { color };
    await setPortalSetting('portal_branding', branding);
    res.json(branding);
  } catch (error) {
    console.error('Error updating branding:', error);
    res.status(500).json({ error: 'Failed to update branding: ' + error.message });
  }
});

// GET /api/return-portal/return-policy
router.get('/return-policy', async (req, res) => {
  try {
    const policy = await getPortalSetting('portal_return_policy_link', { showLink: false, url: '' });
    res.json(policy);
  } catch (error) {
    console.error('Error fetching return policy link setting:', error);
    res.status(500).json({ error: 'Failed to fetch return policy link setting: ' + error.message });
  }
});

// PATCH /api/return-portal/return-policy — body: { showLink: boolean, url: string }
router.patch('/return-policy', async (req, res) => {
  try {
    const { showLink, url } = req.body;
    if (showLink && !url) {
      return res.status(400).json({ error: 'url is required when showLink is enabled' });
    }
    const policy = { showLink: !!showLink, url: url || '' };
    await setPortalSetting('portal_return_policy_link', policy);
    res.json(policy);
  } catch (error) {
    console.error('Error updating return policy link setting:', error);
    res.status(500).json({ error: 'Failed to update return policy link setting: ' + error.message });
  }
});

// ── Messages before submitting（方案文档 11.4/11.4.1） ──────────────────────

const VALID_MESSAGE_CONDITIONS = [
  'always', 'free_shipping', 'return_to_store', 'return_by_shipping',
  'auto_approved', 'not_auto_approved'
];

// GET /api/return-portal/messages
router.get('/messages', async (req, res) => {
  try {
    const messages = await db.prepare(
      'SELECT * FROM return_portal_messages ORDER BY sort_order ASC, id ASC'
    ).all();
    res.json(messages);
  } catch (error) {
    console.error('Error fetching portal messages:', error);
    res.status(500).json({ error: 'Failed to fetch portal messages: ' + error.message });
  }
});

// POST /api/return-portal/messages — "+ Add message"，新增一条内容为空的 message
router.post('/messages', async (req, res) => {
  try {
    const maxOrderResult = await db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM return_portal_messages'
    ).get();
    const nextOrder = maxOrderResult.max_order + 1;

    const result = await db.prepare(`
      INSERT INTO return_portal_messages (title, title_fr, body, body_fr, condition_type, sort_order)
      VALUES (NULL, NULL, NULL, NULL, 'always', ?)
    `).run(nextOrder);

    const created = await db.prepare('SELECT * FROM return_portal_messages WHERE id = ?').get(result.lastInsertRowid);
    res.json(created);
  } catch (error) {
    console.error('Error creating portal message:', error);
    res.status(500).json({ error: 'Failed to create portal message: ' + error.message });
  }
});

// PATCH /api/return-portal/messages/:id — Edit 弹窗 Save
// body: { title, titleFr, body, bodyFr, conditionType }
router.patch('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, titleFr, body, bodyFr, conditionType } = req.body;

    const existing = await db.prepare('SELECT * FROM return_portal_messages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Message title is required' });
    }
    if (conditionType !== undefined && !VALID_MESSAGE_CONDITIONS.includes(conditionType)) {
      return res.status(400).json({ error: 'Invalid conditionType' });
    }

    await db.prepare(`
      UPDATE return_portal_messages
      SET title = ?, title_fr = ?, body = ?, body_fr = ?, condition_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title.trim(),
      titleFr !== undefined ? titleFr : existing.title_fr,
      body !== undefined ? body : existing.body,
      bodyFr !== undefined ? bodyFr : existing.body_fr,
      conditionType !== undefined ? conditionType : existing.condition_type,
      id
    );

    const updated = await db.prepare('SELECT * FROM return_portal_messages WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating portal message:', error);
    res.status(500).json({ error: 'Failed to update portal message: ' + error.message });
  }
});

// PATCH /api/return-portal/messages/reorder — body: { orderedIds: [...] }
router.patch('/messages/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds is required' });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await db.prepare(
        'UPDATE return_portal_messages SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(i, orderedIds[i]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering portal messages:', error);
    res.status(500).json({ error: 'Failed to reorder portal messages: ' + error.message });
  }
});

// DELETE /api/return-portal/messages/:id
router.delete('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare('SELECT * FROM return_portal_messages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }
    await db.prepare('DELETE FROM return_portal_messages WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting portal message:', error);
    res.status(500).json({ error: 'Failed to delete portal message: ' + error.message });
  }
});

// ── Wording and translation（方案文档 11.5/11.5.1） ─────────────────────────
//
// Default 列是页面上写死的原文，不通过 admin API 创建/删除——由 Liquid portal 各页面上线时
// 用 upsertWordingDefault() 一次性 seed 进来（见 Liquid Portal 开发阶段）。
// Admin 这边只负责改 Modified / French 两列，清空 Modified 即恢复显示 Default（见 11.5.1）。

// 供其他模块（未来的 Liquid portal seed 脚本）调用：确保某个 wording key 存在，且 default_text 保持最新
async function upsertWordingDefault(wordingKey, defaultText) {
  await db.prepare(`
    INSERT INTO return_wording (wording_key, default_text)
    VALUES (?, ?)
    ON CONFLICT (wording_key) DO UPDATE SET
      default_text = EXCLUDED.default_text,
      updated_at = CURRENT_TIMESTAMP
  `).run(wordingKey, defaultText);
}

// GET /api/return-portal/wording?search=xxx — search 匹配 default/modified/french 任意一列（不区分大小写）
router.get('/wording', async (req, res) => {
  try {
    const { search } = req.query;

    let rows;
    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      rows = await db.prepare(`
        SELECT * FROM return_wording
        WHERE LOWER(default_text) LIKE ? OR LOWER(COALESCE(modified_text, '')) LIKE ? OR LOWER(COALESCE(french_text, '')) LIKE ?
        ORDER BY id ASC
      `).all(term, term, term);
    } else {
      rows = await db.prepare('SELECT * FROM return_wording ORDER BY id ASC').all();
    }

    res.json(rows);
  } catch (error) {
    console.error('Error fetching wording:', error);
    res.status(500).json({ error: 'Failed to fetch wording: ' + error.message });
  }
});

// PATCH /api/return-portal/wording/:key
// body: { modifiedText, frenchText }（传空字符串 = 清空该列；传 undefined = 不改该列）
router.patch('/wording/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { modifiedText, frenchText } = req.body;

    const existing = await db.prepare('SELECT * FROM return_wording WHERE wording_key = ?').get(key);
    if (!existing) {
      return res.status(404).json({ error: 'Wording entry not found' });
    }

    await db.prepare(`
      UPDATE return_wording
      SET modified_text = ?, french_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE wording_key = ?
    `).run(
      modifiedText !== undefined ? (modifiedText === '' ? null : modifiedText) : existing.modified_text,
      frenchText !== undefined ? (frenchText === '' ? null : frenchText) : existing.french_text,
      key
    );

    const updated = await db.prepare('SELECT * FROM return_wording WHERE wording_key = ?').get(key);
    res.json(updated);
  } catch (error) {
    console.error('Error updating wording:', error);
    res.status(500).json({ error: 'Failed to update wording: ' + error.message });
  }
});

module.exports = router;
module.exports.upsertWordingDefault = upsertWordingDefault;
