const express = require('express');
const router = express.Router();
const db = require('../database/init');

// ── Reasons ───────────────────────────────────────────────────────────────

// GET /api/return-settings/reasons — 列表（不含已 archive 的，默认按 sort_order 排序）
router.get('/reasons', async (req, res) => {
  try {
    const { includeArchived } = req.query;

    const whereClause = includeArchived === 'true' ? '' : 'WHERE is_archived = FALSE';

    const reasons = await db.prepare(`
      SELECT * FROM return_reasons
      ${whereClause}
      ORDER BY sort_order ASC, id ASC
    `).all();

    res.json(reasons);
  } catch (error) {
    console.error('Error fetching reasons:', error);
    res.status(500).json({ error: 'Failed to fetch reasons: ' + error.message });
  }
});

// POST /api/return-settings/reasons — 新增一条 reason
router.post('/reasons', async (req, res) => {
  try {
    const { name, nameFr, noteRequirement, photoRequirement } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Reason name is required' });
    }

    const validRequirements = ['disabled', 'optional', 'required'];
    if (noteRequirement && !validRequirements.includes(noteRequirement)) {
      return res.status(400).json({ error: 'Invalid noteRequirement value' });
    }
    if (photoRequirement && !validRequirements.includes(photoRequirement)) {
      return res.status(400).json({ error: 'Invalid photoRequirement value' });
    }

    // 新 reason 排在现有列表最后
    const maxOrderResult = await db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM return_reasons'
    ).get();
    const nextOrder = maxOrderResult.max_order + 1;

    const result = await db.prepare(`
      INSERT INTO return_reasons (name, name_fr, note_requirement, photo_requirement, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      nameFr || null,
      noteRequirement || 'disabled',
      photoRequirement || 'disabled',
      nextOrder
    );

    const created = await db.prepare('SELECT * FROM return_reasons WHERE id = ?').get(result.lastInsertRowid);

    res.json(created);
  } catch (error) {
    console.error('Error creating reason:', error);
    res.status(500).json({ error: 'Failed to create reason: ' + error.message });
  }
});

// PATCH /api/return-settings/reasons/:id — 修改一条 reason
router.patch('/reasons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nameFr, noteRequirement, photoRequirement } = req.body;

    const existing = await db.prepare('SELECT * FROM return_reasons WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Reason not found' });
    }

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Reason name cannot be empty' });
    }

    const validRequirements = ['disabled', 'optional', 'required'];
    if (noteRequirement !== undefined && !validRequirements.includes(noteRequirement)) {
      return res.status(400).json({ error: 'Invalid noteRequirement value' });
    }
    if (photoRequirement !== undefined && !validRequirements.includes(photoRequirement)) {
      return res.status(400).json({ error: 'Invalid photoRequirement value' });
    }

    await db.prepare(`
      UPDATE return_reasons
      SET name = ?, name_fr = ?, note_requirement = ?, photo_requirement = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      nameFr !== undefined ? nameFr : existing.name_fr,
      noteRequirement !== undefined ? noteRequirement : existing.note_requirement,
      photoRequirement !== undefined ? photoRequirement : existing.photo_requirement,
      id
    );

    const updated = await db.prepare('SELECT * FROM return_reasons WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating reason:', error);
    res.status(500).json({ error: 'Failed to update reason: ' + error.message });
  }
});

// PATCH /api/return-settings/reasons/reorder — 拖拽排序后批量更新
// body: { orderedIds: [3, 1, 2, ...] }  — 数组顺序即新的显示顺序
router.patch('/reasons/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds is required' });
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await db.prepare(`
        UPDATE return_reasons SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(i, orderedIds[i]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering reasons:', error);
    res.status(500).json({ error: 'Failed to reorder reasons: ' + error.message });
  }
});

// 把某个 reason 的当前名字快照进所有引用它、且还没有快照的 return_items 行
async function snapshotReasonName(reasonId, reasonName) {
  await db.prepare(`
    UPDATE return_items
    SET reason_name_snapshot = ?
    WHERE reason_id = ? AND reason_name_snapshot IS NULL
  `).run(reasonName, reasonId);
}

// PATCH /api/return-settings/reasons/:id/archive — 归档（不删除，历史 return 里仍能看到快照名字）
router.patch('/reasons/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.prepare('SELECT * FROM return_reasons WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Reason not found' });
    }

    await snapshotReasonName(id, existing.name);

    await db.prepare(`
      UPDATE return_reasons SET is_archived = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error archiving reason:', error);
    res.status(500).json({ error: 'Failed to archive reason: ' + error.message });
  }
});

// DELETE /api/return-settings/reasons/:id — 真正删除（之前没写，这次补上）
router.delete('/reasons/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.prepare('SELECT * FROM return_reasons WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Reason not found' });
    }

    await snapshotReasonName(id, existing.name);

    await db.prepare('DELETE FROM return_reasons WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reason:', error);
    res.status(500).json({ error: 'Failed to delete reason: ' + error.message });
  }
});

module.exports = router;