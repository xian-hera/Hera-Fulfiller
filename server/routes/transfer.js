const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Emoji mapping for transfer from
const EMOJI_MAP = {
  '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
  '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
};

// Get all transfer items
router.get('/items', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT 
        ti.*,
        li.image_url,
        li.brand,
        li.title,
        li.size,
        li.name
      FROM transfer_items ti
      JOIN line_items li ON ti.line_item_id = li.id
      ORDER BY ti.created_at DESC
    `).all();

    res.json(items);
  } catch (error) {
    console.error('Error fetching transfer items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update transfer item
router.patch('/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, transfer_from, estimate_month, estimate_day } = req.body;

    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (transfer_from !== undefined) {
      updates.push('transfer_from = ?');
      values.push(transfer_from);
    }
    if (estimate_month !== undefined) {
      updates.push('estimate_month = ?');
      values.push(estimate_month);
    }
    if (estimate_day !== undefined) {
      updates.push('estimate_day = ?');
      values.push(estimate_day);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`
      UPDATE transfer_items 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transfer item:', error);
    res.status(500).json({ error: error.message });
  }