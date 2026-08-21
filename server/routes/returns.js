const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');
const canadaPostClient = require('../canadapost/client');
const klaviyoClient = require('../klaviyo/client');
const { evaluateRules, ruleAppliesToItem } = require('../services/returnRuleEngine');

// ── 工具函数 ──────────────────────────────────────────────────────────────

// 记录一条 history log
async function logHistory(returnId, eventType, note = null, staffMemberId = null, staffUserId = null) {
  await db.prepare(`
    INSERT INTO return_status_history (return_id, event_type, note, staff_member_id, staff_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(returnId, eventType, note, staffMemberId, staffUserId);
}

// 根据 return_items 的 approve_status 汇总，判断整单该进入哪个状态
async function recalculateReturnStatus(returnId) {
  const items = await db.prepare(`
    SELECT approve_status FROM return_items WHERE return_id = ?
  `).all(returnId);

  const allRejected = items.length > 0 && items.every(i => i.approve_status === 'rejected');
  const hasApproved = items.some(i => i.approve_status === 'approved');

  if (allRejected) return 'rejected';
  if (hasApproved) return 'awaiting_return';
  return 'awaiting_approval';
}

// 🆕 approve 成功后，如果 return_method 是 shipping，创建退货 label
// 失败不阻断 approve 流程本身，只记录 history，让人工介入补救
async function createReturnLabelIfNeeded(returnId, returnRecord, staffMemberId, staffUserId) {
  if (returnRecord.return_method !== 'shipping') return;

  try {
    const order = await shopifyClient.getOrder(returnRecord.shopify_order_id);
    const shippingAddress = order.shipping_address || {};

    const returnerInfo = {
      name: shippingAddress.name || `${returnRecord.customer_first_name || ''} ${returnRecord.customer_last_name || ''}`.trim(),
      address1: shippingAddress.address1,
      address2: shippingAddress.address2,
      city: shippingAddress.city,
      province: shippingAddress.province_code || shippingAddress.province,
      postalCode: shippingAddress.zip
    };

    const returnAddressSetting = await db.prepare(
      `SELECT value FROM return_settings WHERE key = 'return_address'`
    ).get();

    if (!returnAddressSetting) {
      console.error(`Return address not configured in Settings; skipping label creation for return ${returnId}`);
      await logHistory(returnId, 'label_creation_skipped', 'Return address not configured in Settings', staffMemberId, staffUserId);
      return;
    }

    const receiverInfo = JSON.parse(returnAddressSetting.value);

    const label = await canadaPostClient.createAuthorizedReturn({
      returnerInfo,
      receiverInfo,
      customerRef1: returnRecord.order_name
    });

    await db.prepare(`
      UPDATE returns
      SET tracking_number = ?, label_qr_code = ?, label_url = ?, label_public_url_expiry = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(label.trackingPin, label.qrCodeBase64, label.publicUrl, label.publicUrlExpiryDate, returnId);

    await logHistory(returnId, 'label_created', `Tracking: ${label.trackingPin}`, staffMemberId, staffUserId);

    // 注：Return Approved 的 Klaviyo event 由调用方（approve 接口 / POST / 自动通过分支）负责触发，
    // 这样才能拿到完整的 approved/rejected item 列表，这个函数本身只管创建 label
  } catch (error) {
    console.error(`Failed to create return label for return ${returnId}:`, error.message);
    await logHistory(returnId, 'label_creation_failed', error.message, staffMemberId, staffUserId);
  }
}

// ── 顾客提交退货申请 ─────────────────────────────────────────────────────

// POST /api/returns — 顾客在 portal 提交退货申请
// body: {
//   shopifyOrderId, orderName, customerId, customerEmail, customerFirstName, customerLastName,
//   orderFulfilledDate, orderSubtotal, customerPaidShipping,
//   returnMethod: 'shipping' | 'in_store', returnLocationId, returnLocationName,
//   customerTags, orderDate, daysSinceOrdered, fulfillmentLocationId, orderTags,
//   orderTotal, remainingValueAfterReturns, salesChannelName, returnTotalWeight,
//   items: [{
//     shopifyLineItemId, productId, variantId, productTitle, variantTitle, imageUrl, price,
//     requestedQuantity, reasonId, customerNote, photos, refundOption,
//     productTags, productCollections, productType, variantSku, vendor,
//     questionAnswers: [{ questionId, questionBodySnapshot, answer }]
//   }]
// }
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (!body.shopifyOrderId || !body.orderName || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'shopifyOrderId, orderName, and at least one item are required' });
    }
    if (!['shipping', 'in_store'].includes(body.returnMethod)) {
      return res.status(400).json({ error: 'returnMethod must be shipping or in_store' });
    }
    if (body.returnMethod === 'in_store' && !body.returnLocationId) {
      return res.status(400).json({ error: 'returnLocationId is required for in_store returns' });
    }

    // reason 校验：只有当系统里存在至少 1 个未 archive 的 reason 时，才强制要求每个 item 选 reason
    const activeReasonCount = await db.prepare(
      'SELECT COUNT(*) as count FROM return_reasons WHERE is_archived = FALSE'
    ).get();
    const reasonRequired = parseInt(activeReasonCount.count) > 0;

    if (reasonRequired) {
      const missingReason = body.items.some(item => !item.reasonId);
      if (missingReason) {
        return res.status(400).json({ error: 'Every item must have a reason selected' });
      }
    }

    for (const item of body.items) {
      if (!item.refundOption || !['original_payment', 'store_credit', 'replacement'].includes(item.refundOption)) {
        return res.status(400).json({ error: `Invalid or missing refundOption for item: ${item.productTitle || item.shopifyLineItemId}` });
      }
    }

    // 实时查这批 item 引用的 reason 的当前名字（用于 rule 引擎判定，不落库存快照）
    const reasonIds = [...new Set(body.items.map(i => i.reasonId).filter(Boolean))];
    let reasonNameById = {};
    if (reasonIds.length > 0) {
      const placeholders = reasonIds.map(() => '?').join(',');
      const reasonRows = await db.prepare(
        `SELECT id, name FROM return_reasons WHERE id IN (${placeholders})`
      ).all(...reasonIds);
      reasonNameById = reasonRows.reduce((acc, r) => ({ ...acc, [r.id]: r.name }), {});
    }

    // 组装 Rule 引擎需要的上下文
    const returnTotalValue = body.items.reduce((sum, i) => sum + (i.price || 0) * (i.requestedQuantity || 0), 0);
    const returnTotalQuantity = body.items.reduce((sum, i) => sum + (i.requestedQuantity || 0), 0);

    const orderContext = {
      customerTags: body.customerTags || [],
      orderDate: body.orderDate,
      daysSinceOrdered: body.daysSinceOrdered,
      fulfillmentLocationId: body.fulfillmentLocationId,
      orderTags: body.orderTags || [],
      orderTotal: body.orderTotal,
      remainingValueAfterReturns: body.remainingValueAfterReturns,
      salesChannelName: body.salesChannelName,
      returnTotalValue,
      returnTotalWeight: body.returnTotalWeight || 0,
      returnTotalQuantity
    };

    const ruleItems = body.items.map(item => ({
      reason: item.reasonId ? reasonNameById[item.reasonId] : null,
      productTags: item.productTags || [],
      productCollections: item.productCollections || [],
      productType: item.productType,
      variantSku: item.variantSku,
      vendor: item.vendor
    }));

    const { matchedRuleSummaries, effectiveActions } = await evaluateRules({ orderContext, items: ruleItems });

    // 校验：disallow_return_method / disallow_reason 是硬性限制，前端应该已经把选项置灰，
    // 但后端仍然要兜底拒绝，不能只靠前端隐藏选项
    const disallowedMethod = effectiveActions.find(a => a.type === 'disallow_return_method' && a.value === body.returnMethod);
    if (disallowedMethod) {
      return res.status(400).json({ error: `Return method "${body.returnMethod}" is not allowed for this return (rule: ${disallowedMethod.ruleName})` });
    }

    for (const item of body.items) {
      const itemReasonName = item.reasonId ? reasonNameById[item.reasonId] : null;
      const disallowedReason = effectiveActions.find(a => a.type === 'disallow_reason' && a.value === itemReasonName);
      if (disallowedReason) {
        return res.status(400).json({ error: `Reason "${itemReasonName}" is not allowed for item "${item.productTitle}" (rule: ${disallowedReason.ruleName})` });
      }
    }

    // 校验：replacement 必须真的被某条 allow_replacement 规则解锁，不能是前端 bug 绕过置灰状态硬传上来的
    const allowReplacementRuleIds = matchedRuleSummaries
      .filter(s => s.appliedActions.some(a => a.type === 'allow_replacement'))
      .map(s => s.ruleId);

    let allowReplacementRules = [];
    if (allowReplacementRuleIds.length > 0) {
      const placeholders = allowReplacementRuleIds.map(() => '?').join(',');
      allowReplacementRules = await db.prepare(
        `SELECT * FROM return_rules WHERE id IN (${placeholders})`
      ).all(...allowReplacementRuleIds);
    }

    for (const item of body.items) {
      if (item.refundOption === 'replacement') {
        const itemForRuleCheck = {
          reason: item.reasonId ? reasonNameById[item.reasonId] : null,
          productTags: item.productTags || [],
          productCollections: item.productCollections || [],
          productType: item.productType,
          variantSku: item.variantSku,
          vendor: item.vendor
        };
        const unlocked = allowReplacementRules.some(r => ruleAppliesToItem(
          { ...r, condition_groups: JSON.parse(r.condition_groups), actions: JSON.parse(r.actions) },
          itemForRuleCheck,
          orderContext
        ));
        if (!unlocked) {
          return res.status(400).json({ error: `Replacement is not available for item "${item.productTitle}"` });
        }
      }
    }

    // 决定整单初始状态（reject_return / skip_approval / 默认 awaiting_approval）
    const isRejected = effectiveActions.some(a => a.type === 'reject_return');
    const isAutoApproved = !isRejected && effectiveActions.some(a => a.type === 'skip_approval');

    let initialStatus = 'awaiting_approval';
    if (isRejected) initialStatus = 'rejected';
    else if (isAutoApproved) initialStatus = 'awaiting_return';

    // 插入 returns 主记录
    const returnResult = await db.prepare(`
      INSERT INTO returns (
        shopify_order_id, order_name, customer_id, customer_email, customer_first_name, customer_last_name,
        status, auto_approved, return_method, return_location_id, return_location_name,
        order_fulfilled_date, order_subtotal, customer_paid_shipping, matched_rules,
        approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.shopifyOrderId, body.orderName, body.customerId || null, body.customerEmail || null,
      body.customerFirstName || null, body.customerLastName || null,
      initialStatus, isAutoApproved, body.returnMethod,
      body.returnMethod === 'in_store' ? body.returnLocationId : null,
      body.returnMethod === 'in_store' ? body.returnLocationName : null,
      body.orderFulfilledDate || null, body.orderSubtotal || null, body.customerPaidShipping || null,
      JSON.stringify(matchedRuleSummaries),
      (isRejected || isAutoApproved) ? new Date().toISOString() : null
    );

    const returnId = returnResult.lastInsertRowid;

    // 插入 return_items，approve_status 根据整单初始状态一并决定
    for (const item of body.items) {
      const itemApproveStatus = isRejected ? 'rejected' : (isAutoApproved ? 'approved' : 'pending');
      const itemApprovedQuantity = itemApproveStatus === 'approved' ? item.requestedQuantity : 0;

      const itemResult = await db.prepare(`
        INSERT INTO return_items (
          return_id, shopify_line_item_id, product_id, variant_id, product_title, variant_title,
          image_url, price, requested_quantity, approve_status, approved_quantity,
          reason_id, customer_note, photos, refund_option
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        returnId, item.shopifyLineItemId, item.productId || null, item.variantId || null,
        item.productTitle || null, item.variantTitle || null, item.imageUrl || null, item.price || null,
        item.requestedQuantity, itemApproveStatus, itemApprovedQuantity,
        item.reasonId || null, item.customerNote || null,
        item.photos ? JSON.stringify(item.photos) : null, item.refundOption
      );

      const returnItemId = itemResult.lastInsertRowid;

      if (Array.isArray(item.questionAnswers)) {
        for (const qa of item.questionAnswers) {
          await db.prepare(`
            INSERT INTO return_item_question_answers (return_item_id, question_id, question_body_snapshot, answer)
            VALUES (?, ?, ?, ?)
          `).run(returnItemId, qa.questionId || null, qa.questionBodySnapshot || null, qa.answer || null);
        }
      }
    }

    // History log
    await logHistory(returnId, 'submitted');
    if (isRejected) {
      await logHistory(returnId, 'auto_rejected', 'Rejected automatically by rule');
    } else if (isAutoApproved) {
      await logHistory(returnId, 'auto_approved', 'Approved automatically by rule');
    }

    // 🆕 自动通过的情况下，也要走一遍 label 创建逻辑（跟人工 approve 是同一套）
    if (isAutoApproved) {
      const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId);
      await createReturnLabelIfNeeded(returnId, returnRecord, null, null);
    }

    // 🆕 触发 Klaviyo events
    await klaviyoClient.trackReturnRequestSubmitted(body.customerEmail, {
      orderName: body.orderName,
      orderId: body.shopifyOrderId,
      items: body.items
    });

    if (isRejected) {
      await klaviyoClient.trackReturnRequestRejected(body.customerEmail, {
        orderName: body.orderName,
        orderId: body.shopifyOrderId,
        rejectedItems: body.items.map(i => ({ productTitle: i.productTitle, variantTitle: i.variantTitle, quantity: i.requestedQuantity })),
        rejectionMessage: effectiveActions.find(a => a.type === 'reject_return')?.customerMessage || null
      });
    } else if (isAutoApproved) {
      const returnRecordAfterLabel = await db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId);
      await klaviyoClient.trackReturnRequestApproved(body.customerEmail, {
        orderName: body.orderName,
        orderId: body.shopifyOrderId,
        customerFirstName: body.customerFirstName,
        returnMethod: body.returnMethod,
        locationName: body.returnLocationName,
        trackingNumber: returnRecordAfterLabel.tracking_number,
        qrCodeImage: returnRecordAfterLabel.label_qr_code,
        labelPublicUrl: returnRecordAfterLabel.label_url,
        approvedItems: body.items.map(i => ({ productTitle: i.productTitle, variantTitle: i.variantTitle, quantity: i.requestedQuantity })),
        rejectedItems: []
      });
    }

    res.json({
      success: true,
      returnId,
      status: initialStatus,
      matchedRules: matchedRuleSummaries
    });
  } catch (error) {
    console.error('Error submitting return:', error);
    res.status(500).json({ error: 'Failed to submit return: ' + error.message });
  }
});

// ── Returns 列表 ──────────────────────────────────────────────────────────

// GET /api/returns?filter=pending|auto_approved|to_be_received|archived|all
router.get('/', async (req, res) => {
  try {
    const { filter } = req.query;

    let whereClause = '';
    const params = [];

    if (filter === 'pending') {
      whereClause = "WHERE status IN ('awaiting_approval', 'received')";
    } else if (filter === 'auto_approved') {
      whereClause = 'WHERE auto_approved = TRUE';
    } else if (filter === 'to_be_received') {
      whereClause = "WHERE status = 'awaiting_return'";
    } else if (filter === 'archived') {
      whereClause = "WHERE status = 'archived'";
    }
    // filter === 'all' 或未传 → 不加条件

    const returns = await db.prepare(`
      SELECT id, order_name, customer_email, status, auto_approved,
             order_fulfilled_date, submitted_at
      FROM returns
      ${whereClause}
      ORDER BY submitted_at DESC
    `).all(...params);

    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Failed to fetch returns: ' + error.message });
  }
});

// PATCH /api/returns/archive — 批量 archive
router.patch('/archive', async (req, res) => {
  try {
    const { returnIds } = req.body;
    if (!Array.isArray(returnIds) || returnIds.length === 0) {
      return res.status(400).json({ error: 'returnIds is required' });
    }

    for (const id of returnIds) {
      await db.prepare(`
        UPDATE returns SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
      await logHistory(id, 'archived');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error archiving returns:', error);
    res.status(500).json({ error: 'Failed to archive returns: ' + error.message });
  }
});

// ── Return 详情 ───────────────────────────────────────────────────────────

// GET /api/returns/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // JOIN return_reasons 拿实时名字；如果 reason 已被 archive/删除，fallback 用提交时留下的快照名字
    const items = await db.prepare(`
      SELECT ri.*, COALESCE(rr.name, ri.reason_name_snapshot) as reason_display_name
      FROM return_items ri
      LEFT JOIN return_reasons rr ON ri.reason_id = rr.id
      WHERE ri.return_id = ?
      ORDER BY ri.id
    `).all(id);

    const itemIds = items.map(i => i.id);
    let answersByItem = {};
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(',');
      const answers = await db.prepare(`
        SELECT * FROM return_item_question_answers WHERE return_item_id IN (${placeholders})
      `).all(...itemIds);
      answersByItem = answers.reduce((acc, a) => {
        (acc[a.return_item_id] = acc[a.return_item_id] || []).push(a);
        return acc;
      }, {});
    }

    const itemsWithAnswers = items.map(item => ({
      ...item,
      photos: item.photos ? JSON.parse(item.photos) : [],
      questionAnswers: answersByItem[item.id] || []
    }));

    const history = await db.prepare(`
      SELECT * FROM return_status_history WHERE return_id = ? ORDER BY created_at ASC
    `).all(id);

    res.json({
      ...returnRecord,
      matched_rules: returnRecord.matched_rules ? JSON.parse(returnRecord.matched_rules) : [],
      items: itemsWithAnswers,
      history
    });
  } catch (error) {
    console.error('Error fetching return details:', error);
    res.status(500).json({ error: 'Failed to fetch return details: ' + error.message });
  }
});

// POST /api/returns/:id/internal-note — 发布一条 internal note（存进 history）
router.post('/:id/internal-note', async (req, res) => {
  try {
    const { id } = req.params;
    const { note, staffMemberId, staffUserId } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    await logHistory(id, 'internal_note', note, staffMemberId, staffUserId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error posting internal note:', error);
    res.status(500).json({ error: 'Failed to post internal note: ' + error.message });
  }
});

// ── 审批操作（awaiting_approval 状态下）────────────────────────────────────

// PATCH /api/returns/:id/approve
// body: { itemIds: [...] }  — 不传 itemIds 或传全部 item id = Approve all；传部分 = Approve selected（剩余自动 reject）
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { itemIds, isAutoApproved = false, staffMemberId, staffUserId } = req.body;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (returnRecord.status !== 'awaiting_approval') {
      return res.status(400).json({ error: 'Return is not awaiting approval' });
    }

    const allItems = await db.prepare('SELECT id, requested_quantity FROM return_items WHERE return_id = ?').all(id);
    const approvedSet = new Set(
      (itemIds && itemIds.length > 0) ? itemIds.map(Number) : allItems.map(i => i.id)
    );

    for (const item of allItems) {
      if (approvedSet.has(item.id)) {
        await db.prepare(`
          UPDATE return_items
          SET approve_status = 'approved', approved_quantity = requested_quantity, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.id);
      } else {
        await db.prepare(`
          UPDATE return_items
          SET approve_status = 'rejected', approved_quantity = 0, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.id);
      }
    }

    const newStatus = await recalculateReturnStatus(id);

    await db.prepare(`
      UPDATE returns
      SET status = ?, auto_approved = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, isAutoApproved, id);

    await logHistory(
      id,
      isAutoApproved ? 'auto_approved' : 'approved',
      itemIds && itemIds.length > 0 && itemIds.length < allItems.length ? 'Partial approve' : null,
      staffMemberId,
      staffUserId
    );

    // 🆕 状态推进到 awaiting_return 且是 shipping 方式，创建退货 label
    if (newStatus === 'awaiting_return') {
      const updatedReturnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
      await createReturnLabelIfNeeded(id, updatedReturnRecord, staffMemberId, staffUserId);

      const finalReturnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
      const allItemsAfterApprove = await db.prepare('SELECT * FROM return_items WHERE return_id = ?').all(id);
      const approvedItemsList = allItemsAfterApprove.filter(i => i.approve_status === 'approved');
      const rejectedItemsList = allItemsAfterApprove.filter(i => i.approve_status === 'rejected');

      await klaviyoClient.trackReturnRequestApproved(finalReturnRecord.customer_email, {
        orderName: finalReturnRecord.order_name,
        orderId: finalReturnRecord.shopify_order_id,
        customerFirstName: finalReturnRecord.customer_first_name,
        returnMethod: finalReturnRecord.return_method,
        locationName: finalReturnRecord.return_location_name,
        trackingNumber: finalReturnRecord.tracking_number,
        qrCodeImage: finalReturnRecord.label_qr_code,
        labelPublicUrl: finalReturnRecord.label_url,
        approvedItems: approvedItemsList.map(i => ({ productTitle: i.product_title, variantTitle: i.variant_title, quantity: i.approved_quantity })),
        rejectedItems: rejectedItemsList.map(i => ({ productTitle: i.product_title, variantTitle: i.variant_title, quantity: i.requested_quantity }))
      });
    }

    res.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('Error approving return:', error);
    res.status(500).json({ error: 'Failed to approve return: ' + error.message });
  }
});

// PATCH /api/returns/:id/reject-all
router.patch('/:id/reject-all', async (req, res) => {
  try {
    const { id } = req.params;
    const { staffMemberId, staffUserId } = req.body;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (returnRecord.status !== 'awaiting_approval') {
      return res.status(400).json({ error: 'Return is not awaiting approval' });
    }

    await db.prepare(`
      UPDATE return_items
      SET approve_status = 'rejected', approved_quantity = 0, updated_at = CURRENT_TIMESTAMP
      WHERE return_id = ?
    `).run(id);

    await db.prepare(`
      UPDATE returns SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    await logHistory(id, 'rejected', null, staffMemberId, staffUserId);

    const allRejectedItems = await db.prepare('SELECT * FROM return_items WHERE return_id = ?').all(id);
    await klaviyoClient.trackReturnRequestRejected(returnRecord.customer_email, {
      orderName: returnRecord.order_name,
      orderId: returnRecord.shopify_order_id,
      rejectedItems: allRejectedItems.map(i => ({ productTitle: i.product_title, variantTitle: i.variant_title, quantity: i.requested_quantity }))
    });

    res.json({ success: true, status: 'rejected' });
  } catch (error) {
    console.error('Error rejecting return:', error);
    res.status(500).json({ error: 'Failed to reject return: ' + error.message });
  }
});

// ── 收货操作（awaiting_return 状态下）──────────────────────────────────────

// PATCH /api/returns/:id/mark-received
// body: { itemReceipts: [{ itemId, receivedQuantity }], staffMemberId, staffUserId }
// 不传 itemReceipts 或覆盖全部 approved item = Mark all received
router.patch('/:id/mark-received', async (req, res) => {
  try {
    const { id } = req.params;
    const { itemReceipts, staffMemberId, staffUserId } = req.body;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (returnRecord.status !== 'awaiting_return') {
      return res.status(400).json({ error: 'Return is not awaiting return' });
    }

    const approvedItems = await db.prepare(`
      SELECT id, approved_quantity FROM return_items
      WHERE return_id = ? AND approve_status = 'approved'
    `).all(id);

    if (itemReceipts && itemReceipts.length > 0) {
      // Mark selected received：只更新传进来的 item，未传的 item 保持 received_quantity = 0（不动）
      for (const receipt of itemReceipts) {
        const item = approvedItems.find(i => i.id === Number(receipt.itemId));
        if (!item) continue;
        const qty = Math.max(0, Math.min(receipt.receivedQuantity, item.approved_quantity));
        await db.prepare(`
          UPDATE return_items SET received_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(qty, item.id);
      }
    } else {
      // Mark all received：全部 approved item 按 approved_quantity 全部收到
      for (const item of approvedItems) {
        await db.prepare(`
          UPDATE return_items SET received_quantity = approved_quantity, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(item.id);
      }
    }

    await db.prepare(`
      UPDATE returns SET status = 'received', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    await logHistory(id, 'received', null, staffMemberId, staffUserId);

    const receivedItemsList = await db.prepare(
      'SELECT * FROM return_items WHERE return_id = ? AND received_quantity > 0'
    ).all(id);
    await klaviyoClient.trackReturnReceived(returnRecord.customer_email, {
      orderName: returnRecord.order_name,
      orderId: returnRecord.shopify_order_id,
      receivedItems: receivedItemsList.map(i => ({ productTitle: i.product_title, variantTitle: i.variant_title, quantity: i.received_quantity }))
    });

    res.json({ success: true, status: 'received' });
  } catch (error) {
    console.error('Error marking return as received:', error);
    res.status(500).json({ error: 'Failed to mark return as received: ' + error.message });
  }
});

// 🆕 PATCH /api/returns/:id/refresh-tracking — 手动刷新一次物流状态（用 Get Tracking Summary）
router.patch('/:id/refresh-tracking', async (req, res) => {
  try {
    const { id } = req.params;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (!returnRecord.tracking_number) {
      return res.status(400).json({ error: 'This return has no tracking number yet' });
    }

    const summary = await canadaPostClient.getTrackingSummary(returnRecord.tracking_number);
    if (!summary) {
      return res.status(502).json({ error: 'Failed to fetch tracking summary from Canada Post' });
    }

    await db.prepare(`
      UPDATE returns
      SET last_tracking_event = ?, last_tracking_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(summary.eventDescription, summary.eventDateTime, id);

    res.json({ success: true, tracking: summary });
  } catch (error) {
    console.error('Error refreshing tracking:', error);
    res.status(500).json({ error: 'Failed to refresh tracking: ' + error.message });
  }
});

// ── 退款操作（received 状态下）─────────────────────────────────────────────

// PATCH /api/returns/:id/issue-refund
// body: {
//   itemIds: [...],              // 本次退款覆盖哪些 item
//   refundAmount,                 // Section 3 Subtotal 的最终金额（用于 history 记录）
//   storeCreditAmount,            // 有 store_credit 类 item 被勾选时才有
//   sendShopifyNotification,      // boolean，对应 RefundInput.notify
//   staffMemberId, staffUserId
// }
//
// 幂等保护：已经退过的 item（refunded_quantity >= received_quantity）会被跳过，不会重复退款
// 部分失败处理：store credit 和原支付方式两组分别 try/catch，一组失败不影响另一组已成功落库；
//   只有这个 return 下所有 item 都退完，整单状态才会变成 'refunded'，否则保持 'received' 供重试
router.patch('/:id/issue-refund', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      itemIds, refundAmount, storeCreditAmount,
      sendShopifyNotification = true, staffMemberId, staffUserId
    } = req.body;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (returnRecord.status !== 'received') {
      return res.status(400).json({ error: 'Return is not in received status' });
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds is required' });
    }
    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ error: 'refundAmount must be greater than 0' });
    }

    const placeholders = itemIds.map(() => '?').join(',');
    const allSelectedItems = await db.prepare(`
      SELECT id, shopify_line_item_id, received_quantity, refunded_quantity, refund_option
      FROM return_items
      WHERE return_id = ? AND id IN (${placeholders})
    `).all(id, ...itemIds);

    // 防止重复退款：跳过已经退过的 item
    const pendingItems = allSelectedItems.filter(i => i.refunded_quantity < i.received_quantity);
    const alreadyDoneItems = allSelectedItems.filter(i => i.refunded_quantity >= i.received_quantity);

    if (pendingItems.length === 0) {
      return res.status(400).json({ error: 'All selected items have already been refunded' });
    }

    const storeCreditItems = pendingItems.filter(i => i.refund_option === 'store_credit');
    const originalPaymentItems = pendingItems.filter(i => i.refund_option !== 'store_credit');

    const succeededGroups = [];
    const failedGroups = [];

    // Store credit 组
    if (storeCreditItems.length > 0) {
      try {
        const refund = await shopifyClient.createRefund({
          orderId: returnRecord.shopify_order_id,
          refundLineItems: storeCreditItems.map(i => ({
            lineItemId: i.shopify_line_item_id,
            quantity: i.received_quantity
          })),
          allocation: 'store_credit',
          storeCreditAmount: storeCreditAmount,
          note: `Return #${id} — store credit portion`,
          notify: sendShopifyNotification,
        });

        for (const item of storeCreditItems) {
          await db.prepare(`
            UPDATE return_items SET refunded_quantity = received_quantity, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(item.id);
        }

        succeededGroups.push({ allocation: 'store_credit', refund, itemIds: storeCreditItems.map(i => i.id) });
        await logHistory(id, 'refund_partial_success', `Store credit portion succeeded ($${storeCreditAmount})`, staffMemberId, staffUserId);
      } catch (error) {
        failedGroups.push({ allocation: 'store_credit', error: error.message, itemIds: storeCreditItems.map(i => i.id) });
        await logHistory(id, 'refund_partial_failure', `Store credit portion failed: ${error.message}`, staffMemberId, staffUserId);
      }
    }

    // 原支付方式组（也覆盖 replacement 兜底场景）
    if (originalPaymentItems.length > 0) {
      try {
        const refund = await shopifyClient.createRefund({
          orderId: returnRecord.shopify_order_id,
          refundLineItems: originalPaymentItems.map(i => ({
            lineItemId: i.shopify_line_item_id,
            quantity: i.received_quantity
          })),
          allocation: 'original_payment',
          note: `Return #${id} — original payment method portion`,
          notify: sendShopifyNotification,
        });

        for (const item of originalPaymentItems) {
          await db.prepare(`
            UPDATE return_items SET refunded_quantity = received_quantity, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(item.id);
        }

        succeededGroups.push({ allocation: 'original_payment', refund, itemIds: originalPaymentItems.map(i => i.id) });
        await logHistory(id, 'refund_partial_success', 'Original payment method portion succeeded', staffMemberId, staffUserId);
      } catch (error) {
        failedGroups.push({ allocation: 'original_payment', error: error.message, itemIds: originalPaymentItems.map(i => i.id) });
        await logHistory(id, 'refund_partial_failure', `Original payment method portion failed: ${error.message}`, staffMemberId, staffUserId);
      }
    }

    // 判断整个 return（不只是这次涉及的 item）是否已经全部退完
    const allItemsNow = await db.prepare(`
      SELECT received_quantity, refunded_quantity FROM return_items WHERE return_id = ?
    `).all(id);
    const allRefundedAcrossReturn = allItemsNow.every(i => i.refunded_quantity >= i.received_quantity);

    if (failedGroups.length === 0) {
      if (allRefundedAcrossReturn) {
        await db.prepare(`
          UPDATE returns SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(id);
        await logHistory(
          id,
          'refunded',
          `$${refundAmount}${storeCreditItems.length > 0 ? ` ($${storeCreditAmount} to store credit)` : ''}`,
          staffMemberId,
          staffUserId
        );

        await klaviyoClient.trackRefundIssued(returnRecord.customer_email, {
          orderName: returnRecord.order_name,
          orderId: returnRecord.shopify_order_id,
          refundAmount,
          refundMethod: storeCreditItems.length > 0 ? 'split' : 'original_payment'
        });
      }
      // 如果这单还有别的 item 没在这次 itemIds 里、尚未退款，状态先保持 received，等后续继续处理

      return res.json({
        success: true,
        status: allRefundedAcrossReturn ? 'refunded' : 'received',
        refunds: succeededGroups,
        skippedAlreadyRefunded: alreadyDoneItems.map(i => i.id)
      });
    } else {
      // 至少一组失败：整单状态保持 received，不标记完成
      return res.status(207).json({
        success: false,
        status: 'received',
        message: 'Refund partially completed. Some items were refunded successfully, others failed — please retry the failed portion.',
        refunds: succeededGroups,
        failures: failedGroups,
        skippedAlreadyRefunded: alreadyDoneItems.map(i => i.id)
      });
    }
  } catch (error) {
    console.error('Error issuing refund:', error);
    res.status(500).json({ error: 'Failed to issue refund: ' + error.message });
  }
});

// PATCH /api/returns/:id/mark-resolved（received 状态下，跳过 restock）
router.patch('/:id/mark-resolved', async (req, res) => {
  try {
    const { id } = req.params;
    const { staffMemberId, staffUserId } = req.body;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (returnRecord.status !== 'received') {
      return res.status(400).json({ error: 'Return is not in received status' });
    }

    await db.prepare(`
      UPDATE returns SET status = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    await logHistory(id, 'resolved', null, staffMemberId, staffUserId);

    res.json({ success: true, status: 'resolved' });
  } catch (error) {
    console.error('Error marking return as resolved:', error);
    res.status(500).json({ error: 'Failed to mark return as resolved: ' + error.message });
  }
});

// ── Restock 操作（refunded 状态下）─────────────────────────────────────────

// PATCH /api/returns/:id/restock
// body: { mode: 'all' | 'selected' | 'manual', itemIds, locationId, staffMemberId, staffUserId }
router.patch('/:id/restock', async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, itemIds, locationId, staffMemberId, staffUserId } = req.body;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (returnRecord.status !== 'refunded') {
      return res.status(400).json({ error: 'Return is not in refunded status' });
    }

    if (mode === 'all' || mode === 'selected') {
      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required for restock' });
      }

      let items;
      if (mode === 'selected') {
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
          return res.status(400).json({ error: 'itemIds is required for mode=selected' });
        }
        const placeholders = itemIds.map(() => '?').join(',');
        items = await db.prepare(`
          SELECT id, variant_id, refunded_quantity FROM return_items
          WHERE return_id = ? AND id IN (${placeholders})
        `).all(id, ...itemIds);
      } else {
        items = await db.prepare(`
          SELECT id, variant_id, refunded_quantity FROM return_items WHERE return_id = ?
        `).all(id);
      }

      const restockFailures = [];

      for (const item of items) {
        if (!item.variant_id || !item.refunded_quantity) continue;
        try {
          const variant = await shopifyClient.getProductVariant(item.variant_id);
          if (!variant || !variant.inventory_item_id) continue;
          await shopifyClient.adjustInventoryQuantity(variant.inventory_item_id, locationId, item.refunded_quantity);
        } catch (error) {
          restockFailures.push({ itemId: item.id, error: error.message });
        }
      }

      await logHistory(
        id,
        'restocked',
        `mode=${mode}, locationId=${locationId}${itemIds ? `, items=${itemIds.join(',')}` : ''}` +
          (restockFailures.length > 0 ? ` — ${restockFailures.length} item(s) failed to restock` : ''),
        staffMemberId,
        staffUserId
      );

      if (restockFailures.length > 0) {
        console.error(`Restock partially failed for return ${id}:`, restockFailures);
      }
    }
    // mode === 'manual' → 不做任何库存调整，只记录

    await db.prepare(`
      UPDATE returns SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    await logHistory(id, 'archived', mode === 'manual' ? 'Manually restock' : null, staffMemberId, staffUserId);

    res.json({ success: true, status: 'archived' });
  } catch (error) {
    console.error('Error restocking return:', error);
    res.status(500).json({ error: 'Failed to restock return: ' + error.message });
  }
});

module.exports = router;