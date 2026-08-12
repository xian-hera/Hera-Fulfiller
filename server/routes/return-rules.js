const express = require('express');
const router = express.Router();
const db = require('../database/init');

// ── Rules 列表 / 详情 ────────────────────────────────────────────────────

// GET /api/return-rules
router.get('/', async (req, res) => {
  try {
    const rules = await db.prepare(`
      SELECT * FROM return_rules ORDER BY priority ASC, id ASC
    `).all();

    const parsed = rules.map(r => ({
      ...r,
      condition_groups: r.condition_groups ? JSON.parse(r.condition_groups) : [],
      actions: r.actions ? JSON.parse(r.actions) : []
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({ error: 'Failed to fetch rules: ' + error.message });
  }
});

// GET /api/return-rules/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await db.prepare('SELECT * FROM return_rules WHERE id = ?').get(id);

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({
      ...rule,
      condition_groups: rule.condition_groups ? JSON.parse(rule.condition_groups) : [],
      actions: rule.actions ? JSON.parse(rule.actions) : []
    });
  } catch (error) {
    console.error('Error fetching rule:', error);
    res.status(500).json({ error: 'Failed to fetch rule: ' + error.message });
  }
});

// ── Rules 创建 / 修改 / 删除 ─────────────────────────────────────────────

const VALID_ACTION_TYPES = [
  'disallow_return_method',
  'require_approval',
  'skip_approval',
  'disallow_reason',
  'reject_return',
  'allow_replacement'
];

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 30;

function validateRulePayload(body) {
  const { name, conditionGroups, groupLogic, actions, priority } = body;

  if (!name || !name.trim()) {
    return 'Rule name is required';
  }
  if (!Array.isArray(conditionGroups) || conditionGroups.length === 0) {
    return 'At least one condition group is required';
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    return 'At least one action is required';
  }
  for (const action of actions) {
    if (!VALID_ACTION_TYPES.includes(action.type)) {
      return `Invalid action type: ${action.type}`;
    }
  }
  if (groupLogic && !['AND', 'OR'].includes(groupLogic)) {
    return 'groupLogic must be AND or OR';
  }
  for (const group of conditionGroups) {
    if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
      return 'Each condition group needs at least one condition';
    }
    if (group.conditionsMatch && !['AND', 'OR'].includes(group.conditionsMatch)) {
      return 'conditionsMatch must be AND or OR';
    }
  }
  if (
    priority === undefined ||
    priority === null ||
    !Number.isInteger(priority) ||
    priority < MIN_PRIORITY ||
    priority > MAX_PRIORITY
  ) {
    return `priority must be an integer between ${MIN_PRIORITY} and ${MAX_PRIORITY}`;
  }
  return null;
}

// POST /api/return-rules
router.post('/', async (req, res) => {
  try {
    const { name, conditionGroups, groupLogic, actions, priority } = req.body;

    const validationError = validateRulePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const countResult = await db.prepare('SELECT COUNT(*) as count FROM return_rules').get();
    if (parseInt(countResult.count) >= MAX_PRIORITY) {
      return res.status(400).json({ error: `Maximum of ${MAX_PRIORITY} rules reached. Delete an existing rule to add a new one.` });
    }

    const priorityTaken = await db.prepare(
      'SELECT id FROM return_rules WHERE priority = ?'
    ).get(priority);
    if (priorityTaken) {
      return res.status(400).json({ error: `Priority ${priority} is already used by another rule` });
    }

    const result = await db.prepare(`
      INSERT INTO return_rules (name, is_active, condition_groups, group_logic, actions, priority)
      VALUES (?, TRUE, ?, ?, ?, ?)
    `).run(
      name.trim(),
      JSON.stringify(conditionGroups),
      groupLogic || 'AND',
      JSON.stringify(actions),
      priority
    );

    const created = await db.prepare('SELECT * FROM return_rules WHERE id = ?').get(result.lastInsertRowid);

    res.json({
      ...created,
      condition_groups: JSON.parse(created.condition_groups),
      actions: JSON.parse(created.actions)
    });
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ error: 'Failed to create rule: ' + error.message });
  }
});

// PATCH /api/return-rules/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, conditionGroups, groupLogic, actions, priority } = req.body;

    const existing = await db.prepare('SELECT * FROM return_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const validationError = validateRulePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const priorityTaken = await db.prepare(
      'SELECT id FROM return_rules WHERE priority = ? AND id != ?'
    ).get(priority, id);
    if (priorityTaken) {
      return res.status(400).json({ error: `Priority ${priority} is already used by another rule` });
    }

    await db.prepare(`
      UPDATE return_rules
      SET name = ?, condition_groups = ?, group_logic = ?, actions = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(),
      JSON.stringify(conditionGroups),
      groupLogic || 'AND',
      JSON.stringify(actions),
      priority,
      id
    );

    const updated = await db.prepare('SELECT * FROM return_rules WHERE id = ?').get(id);
    res.json({
      ...updated,
      condition_groups: JSON.parse(updated.condition_groups),
      actions: JSON.parse(updated.actions)
    });
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({ error: 'Failed to update rule: ' + error.message });
  }
});

// PATCH /api/return-rules/:id/toggle — 列表页那个 Status 开关，直接切 is_active
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const existing = await db.prepare('SELECT * FROM return_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await db.prepare(`
      UPDATE return_rules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(isActive, id);

    res.json({ success: true, isActive });
  } catch (error) {
    console.error('Error toggling rule:', error);
    res.status(500).json({ error: 'Failed to toggle rule: ' + error.message });
  }
});

// DELETE /api/return-rules/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.prepare('SELECT * FROM return_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await db.prepare('DELETE FROM return_rules WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({ error: 'Failed to delete rule: ' + error.message });
  }
});

module.exports = router;