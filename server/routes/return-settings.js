const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

// GET /api/return-settings/shopify-locations — 供 Portal Location mapping / 退货详情页 Restock 的 location 下拉共用
router.get('/shopify-locations', async (req, res) => {
  try {
    const locations = await shopifyClient.getLocations();
    res.json(locations.map(l => ({ id: l.id, name: l.name })));
  } catch (error) {
    console.error('Error fetching Shopify locations:', error);
    res.status(500).json({ error: 'Failed to fetch Shopify locations: ' + error.message });
  }
});

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

// ── 通用 key-value helper（供下面几个板块共用 return_settings 表） ──────────

async function getSettingValue(key, fallback = null) {
  const row = await db.prepare('SELECT value FROM return_settings WHERE key = ?').get(key);
  if (!row || row.value === null || row.value === undefined) return fallback;
  try {
    return JSON.parse(row.value);
  } catch (e) {
    return row.value;
  }
}

async function setSettingValue(key, value) {
  await db.prepare(`
    INSERT INTO return_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(value));
}

// ── Policy ────────────────────────────────────────────────────────────────

// GET /api/return-settings/policy
router.get('/policy', async (req, res) => {
  try {
    const policy = await getSettingValue('policy', { windowDays: 30, windowBasis: 'placed' });
    res.json(policy);
  } catch (error) {
    console.error('Error fetching policy:', error);
    res.status(500).json({ error: 'Failed to fetch policy: ' + error.message });
  }
});

// PATCH /api/return-settings/policy
// body: { windowDays: number, windowBasis: 'placed' | 'fulfilled' }
router.patch('/policy', async (req, res) => {
  try {
    const { windowDays, windowBasis } = req.body;

    if (windowDays === undefined || isNaN(parseInt(windowDays)) || parseInt(windowDays) <= 0) {
      return res.status(400).json({ error: 'windowDays must be a positive number' });
    }
    if (!['placed', 'fulfilled'].includes(windowBasis)) {
      return res.status(400).json({ error: 'windowBasis must be placed or fulfilled' });
    }

    const policy = { windowDays: parseInt(windowDays), windowBasis };
    await setSettingValue('policy', policy);
    res.json(policy);
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({ error: 'Failed to update policy: ' + error.message });
  }
});

// ── Photo upload ──────────────────────────────────────────────────────────

// GET /api/return-settings/photo-upload
router.get('/photo-upload', async (req, res) => {
  try {
    const settings = await getSettingValue('photo_upload', { minPhotos: 1, maxPhotos: 3 });
    res.json(settings);
  } catch (error) {
    console.error('Error fetching photo upload settings:', error);
    res.status(500).json({ error: 'Failed to fetch photo upload settings: ' + error.message });
  }
});

// PATCH /api/return-settings/photo-upload
// body: { minPhotos: number, maxPhotos: number }（maxPhotos 同时也是 optional 时的上限，见方案文档 9.3）
router.patch('/photo-upload', async (req, res) => {
  try {
    const { minPhotos, maxPhotos } = req.body;
    const min = parseInt(minPhotos);
    const max = parseInt(maxPhotos);

    if (isNaN(min) || min < 1) {
      return res.status(400).json({ error: 'minPhotos must be at least 1' });
    }
    if (isNaN(max) || max < min) {
      return res.status(400).json({ error: 'maxPhotos must be greater than or equal to minPhotos' });
    }

    const settings = { minPhotos: min, maxPhotos: max };
    await setSettingValue('photo_upload', settings);
    res.json(settings);
  } catch (error) {
    console.error('Error updating photo upload settings:', error);
    res.status(500).json({ error: 'Failed to update photo upload settings: ' + error.message });
  }
});

// ── Questions ─────────────────────────────────────────────────────────────

const VALID_ANSWER_TYPES = ['boolean', 'options', 'text'];
const VALID_TRIGGER_MODES = ['always', 'only_when'];

// 计算某个 question 在 follow-up 链路里的深度：main question = 0，direct follow-up = 1，最深到 2
async function getQuestionDepth(questionId) {
  let depth = 0;
  let currentId = questionId;
  while (currentId) {
    const row = await db.prepare('SELECT parent_question_id FROM return_questions WHERE id = ?').get(currentId);
    if (!row || !row.parent_question_id) break;
    depth++;
    currentId = row.parent_question_id;
  }
  return depth;
}

// GET /api/return-settings/questions — 返回全部 question（含 follow-up），按"main question + 其整条 follow-up 链"顺序排好，
// 并附带 depth（0 = main，1/2 = follow-up 层级）供前端渲染缩进 + ↳ 箭头
router.get('/questions', async (req, res) => {
  try {
    const questions = await db.prepare('SELECT * FROM return_questions ORDER BY sort_order ASC, id ASC').all();

    const byId = {};
    questions.forEach(q => { byId[q.id] = q; });

    const withDepth = questions.map(q => {
      let depth = 0;
      let currentParentId = q.parent_question_id;
      while (currentParentId) {
        depth++;
        currentParentId = byId[currentParentId] ? byId[currentParentId].parent_question_id : null;
      }
      return {
        ...q,
        conditions: q.conditions ? JSON.parse(q.conditions) : [],
        options: q.options ? JSON.parse(q.options) : [],
        depth
      };
    });

    const mainQuestions = withDepth
      .filter(q => !q.parent_question_id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

    const ordered = [];
    function appendChain(question) {
      ordered.push(question);
      const child = withDepth.find(q => q.parent_question_id === question.id);
      if (child) appendChain(child);
    }
    mainQuestions.forEach(appendChain);

    res.json(ordered);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions: ' + error.message });
  }
});

// POST /api/return-settings/questions — 新增 main question（parentQuestionId 为空）或 follow-up question
// body: { parentQuestionId, body, bodyFr, triggerMode, conditionLogic, conditions, answerType, options }
router.post('/questions', async (req, res) => {
  try {
    const { parentQuestionId, body, bodyFr, triggerMode, conditionLogic, conditions, answerType, options } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Question body is required' });
    }
    if (triggerMode && !VALID_TRIGGER_MODES.includes(triggerMode)) {
      return res.status(400).json({ error: 'Invalid triggerMode' });
    }
    if (answerType && !VALID_ANSWER_TYPES.includes(answerType)) {
      return res.status(400).json({ error: 'Invalid answerType' });
    }

    let parentId = null;
    if (parentQuestionId) {
      const parent = await db.prepare('SELECT * FROM return_questions WHERE id = ?').get(parentQuestionId);
      if (!parent) {
        return res.status(404).json({ error: 'Parent question not found' });
      }

      // 规则 1：一个 question 最多只能有 1 个 direct follow-up
      const existingChild = await db.prepare('SELECT id FROM return_questions WHERE parent_question_id = ?').get(parentQuestionId);
      if (existingChild) {
        return res.status(400).json({ error: "Can't add follow-up question: this question already has a direct follow-up" });
      }

      // 规则 2：一条 main question 为根的链路最多累计 2 个 follow-up
      const parentDepth = await getQuestionDepth(parentQuestionId);
      if (parentDepth >= 2) {
        return res.status(400).json({ error: "Can't add follow-up question: this chain already has 2 follow-up questions" });
      }

      parentId = parentQuestionId;
    }

    const maxOrderResult = await db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM return_questions WHERE parent_question_id IS NULL'
    ).get();
    const nextOrder = parentId ? 0 : maxOrderResult.max_order + 1;

    const result = await db.prepare(`
      INSERT INTO return_questions
        (parent_question_id, body, body_fr, trigger_mode, condition_logic, conditions, answer_type, options, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parentId,
      body.trim(),
      bodyFr || null,
      triggerMode || 'always',
      conditionLogic || 'AND',
      conditions ? JSON.stringify(conditions) : null,
      answerType || 'text',
      options ? JSON.stringify(options) : null,
      nextOrder
    );

    const created = await db.prepare('SELECT * FROM return_questions WHERE id = ?').get(result.lastInsertRowid);
    res.json({
      ...created,
      conditions: created.conditions ? JSON.parse(created.conditions) : [],
      options: created.options ? JSON.parse(created.options) : []
    });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question: ' + error.message });
  }
});

// PATCH /api/return-settings/questions/:id — 修改（follow-up 的 parent 关系只能在创建时确定，这里不允许改）
router.patch('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { body, bodyFr, triggerMode, conditionLogic, conditions, answerType, options, isActive } = req.body;

    const existing = await db.prepare('SELECT * FROM return_questions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (body !== undefined && !body.trim()) {
      return res.status(400).json({ error: 'Question body cannot be empty' });
    }
    if (triggerMode !== undefined && !VALID_TRIGGER_MODES.includes(triggerMode)) {
      return res.status(400).json({ error: 'Invalid triggerMode' });
    }
    if (answerType !== undefined && !VALID_ANSWER_TYPES.includes(answerType)) {
      return res.status(400).json({ error: 'Invalid answerType' });
    }

    await db.prepare(`
      UPDATE return_questions
      SET body = ?, body_fr = ?, trigger_mode = ?, condition_logic = ?, conditions = ?, answer_type = ?, options = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body !== undefined ? body.trim() : existing.body,
      bodyFr !== undefined ? bodyFr : existing.body_fr,
      triggerMode !== undefined ? triggerMode : existing.trigger_mode,
      conditionLogic !== undefined ? conditionLogic : existing.condition_logic,
      conditions !== undefined ? JSON.stringify(conditions) : existing.conditions,
      answerType !== undefined ? answerType : existing.answer_type,
      options !== undefined ? JSON.stringify(options) : existing.options,
      isActive !== undefined ? !!isActive : existing.is_active,
      id
    );

    const updated = await db.prepare('SELECT * FROM return_questions WHERE id = ?').get(id);
    res.json({
      ...updated,
      conditions: updated.conditions ? JSON.parse(updated.conditions) : [],
      options: updated.options ? JSON.parse(updated.options) : []
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question: ' + error.message });
  }
});

// DELETE /api/return-settings/questions/:id — 删除（FK ON DELETE CASCADE 会连带删掉它的 follow-up 链）
router.delete('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.prepare('SELECT * FROM return_questions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Question not found' });
    }

    await db.prepare('DELETE FROM return_questions WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question: ' + error.message });
  }
});

// ── Klaviyo Integration ───────────────────────────────────────────────────
// 注：API Key 本身走 Render 环境变量 KLAVIYO_API_KEY，不在这里存/编辑（已跟用户确认，见工程进度文档）。
// 这里只管理每个 event 的 on/off 开关。

const KLAVIYO_EVENT_KEYS = ['request_submitted', 'approved', 'rejected', 'received', 'refund_issued'];
const DEFAULT_KLAVIYO_TOGGLES = {
  request_submitted: true, approved: true, rejected: true, received: true, refund_issued: true
};

// GET /api/return-settings/klaviyo
router.get('/klaviyo', async (req, res) => {
  try {
    const toggles = await getSettingValue('klaviyo_event_toggles', DEFAULT_KLAVIYO_TOGGLES);
    res.json({
      connected: !!process.env.KLAVIYO_API_KEY,
      events: { ...DEFAULT_KLAVIYO_TOGGLES, ...toggles }
    });
  } catch (error) {
    console.error('Error fetching Klaviyo settings:', error);
    res.status(500).json({ error: 'Failed to fetch Klaviyo settings: ' + error.message });
  }
});

// PATCH /api/return-settings/klaviyo/events
// body: { request_submitted, approved, rejected, received, refund_issued }（均为 boolean，可只传部分）
router.patch('/klaviyo/events', async (req, res) => {
  try {
    const existing = await getSettingValue('klaviyo_event_toggles', DEFAULT_KLAVIYO_TOGGLES);
    const updated = { ...DEFAULT_KLAVIYO_TOGGLES, ...existing };

    for (const key of KLAVIYO_EVENT_KEYS) {
      if (req.body[key] !== undefined) {
        updated[key] = !!req.body[key];
      }
    }

    await setSettingValue('klaviyo_event_toggles', updated);
    res.json({ events: updated });
  } catch (error) {
    console.error('Error updating Klaviyo event toggles:', error);
    res.status(500).json({ error: 'Failed to update Klaviyo event toggles: ' + error.message });
  }
});

// ── Canada Post Integration ───────────────────────────────────────────────
// 注：Canada Post API Key 沿用现有正向发货的凭证（环境变量），这里只管 Return 场景专属配置。

const VALID_SERVICE_CODES = ['DOM.RP', 'DOM.EP', 'DOM.XP', 'DOM.PC'];
const VALID_LABEL_TYPES = ['printing_at_home', 'label_free'];
const DEFAULT_CP_CONFIG = { labelType: 'label_free', boxFree: false, serviceCode: 'DOM.EP', notifyEmails: [] };

// GET /api/return-settings/canada-post
router.get('/canada-post', async (req, res) => {
  try {
    const returnAddress = await getSettingValue('return_address', null);
    const config = await getSettingValue('canada_post_settings', DEFAULT_CP_CONFIG);
    res.json({ returnAddress, ...DEFAULT_CP_CONFIG, ...config });
  } catch (error) {
    console.error('Error fetching Canada Post settings:', error);
    res.status(500).json({ error: 'Failed to fetch Canada Post settings: ' + error.message });
  }
});

// PATCH /api/return-settings/canada-post
// body: {
//   returnAddress: { name, company, address1, address2, city, province, postalCode },  -- 对应 createAuthorizedReturn 的 receiverInfo
//   labelType: 'printing_at_home' | 'label_free',
//   boxFree: boolean,
//   serviceCode: 'DOM.RP' | 'DOM.EP' | 'DOM.XP' | 'DOM.PC',
//   notifyEmails: string[]  -- 最多 4 个，Canada Post 物流状态更新通知邮箱（不含顾客邮箱，那个由 API 自动带上）
// }
router.patch('/canada-post', async (req, res) => {
  try {
    const { returnAddress, labelType, boxFree, serviceCode, notifyEmails } = req.body;

    if (returnAddress !== undefined) {
      const required = ['name', 'address1', 'city', 'province', 'postalCode'];
      const missing = required.filter(f => !returnAddress || !returnAddress[f]);
      if (missing.length > 0) {
        return res.status(400).json({ error: `Return address is missing required field(s): ${missing.join(', ')}` });
      }
      await setSettingValue('return_address', {
        name: returnAddress.name,
        company: returnAddress.company || null,
        address1: returnAddress.address1,
        address2: returnAddress.address2 || null,
        city: returnAddress.city,
        province: returnAddress.province,
        postalCode: returnAddress.postalCode
      });
    }

    if (labelType !== undefined && !VALID_LABEL_TYPES.includes(labelType)) {
      return res.status(400).json({ error: 'Invalid labelType' });
    }
    if (serviceCode !== undefined && !VALID_SERVICE_CODES.includes(serviceCode)) {
      return res.status(400).json({ error: 'Invalid serviceCode' });
    }
    if (notifyEmails !== undefined && (!Array.isArray(notifyEmails) || notifyEmails.length > 4)) {
      return res.status(400).json({ error: 'notifyEmails must be an array of at most 4 email addresses' });
    }

    const existingConfig = await getSettingValue('canada_post_settings', DEFAULT_CP_CONFIG);
    const updatedConfig = {
      labelType: labelType !== undefined ? labelType : existingConfig.labelType,
      boxFree: boxFree !== undefined ? !!boxFree : existingConfig.boxFree,
      serviceCode: serviceCode !== undefined ? serviceCode : existingConfig.serviceCode,
      notifyEmails: notifyEmails !== undefined ? notifyEmails : existingConfig.notifyEmails
    };
    await setSettingValue('canada_post_settings', updatedConfig);

    const savedReturnAddress = await getSettingValue('return_address', null);
    res.json({ returnAddress: savedReturnAddress, ...updatedConfig });
  } catch (error) {
    console.error('Error updating Canada Post settings:', error);
    res.status(500).json({ error: 'Failed to update Canada Post settings: ' + error.message });
  }
});

module.exports = router;