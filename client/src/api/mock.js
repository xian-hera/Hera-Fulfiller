// 🆕 纯前端本地预览用的 mock 层——不起后端、不连任何数据库。
//
// 背景：本地开发原来是连本地 SQLite，SQLite 清理之后本地直接连生产 Postgres，但这样一来
// "只是想看看 UI 长什么样"这种最基础的需求，反而要先解决 Render 白名单/网络连通性问题，
// 而且哪怕连上了，本地点点点也是在动生产数据，心理负担很大。这个文件就是为了解决"只看 UI，
// 完全不碰任何真实数据库/网络"这个场景：所有 /api/return* 请求都在浏览器内存里被这里拦截、
// 用一份写死的假数据应答，刷新页面就重置，改错了、删了都无所谓。
//
// 怎么开：在 client/ 目录下新建一个 .env.development.local 文件（CRA 会自动读取这个文件，
// 且默认被 .gitignore 忽略，不会影响任何人也不会被提交），写一行：
//   REACT_APP_MOCK_API=true
// 然后正常 npm start。不想用 mock 的时候，把这个文件删掉或者把这一行删掉即可，
// 行为会恢复成走 axios.js 里原来的 baseURL/proxy 逻辑，什么都不受影响。
//
// 这个文件只覆盖 Return Management 相关的接口（/api/returns、/api/return-settings、
// /api/return-rules、/api/return-portal）——其他老页面（Picker/Transfer/...）不在这次
// mock 的范围内，用这个模式打开那些页面依然会请求真实后端（拿不到会报错，属于预期）。

let idCounter = 10000;
const nextId = () => idCounter++;
const nowIso = () => new Date().toISOString();

// ── 种子数据 ──────────────────────────────────────────────────────────────

const store = {
  reasons: [
    { id: 1, name: 'Changed my mind', name_fr: "J'ai changé d'avis", note_requirement: 'disabled', photo_requirement: 'disabled', is_archived: false, sort_order: 0 },
    { id: 2, name: 'Wrong size', name_fr: 'Mauvaise taille', note_requirement: 'optional', photo_requirement: 'disabled', is_archived: false, sort_order: 1 },
    { id: 3, name: 'Item arrived damaged', name_fr: 'Article endommagé', note_requirement: 'required', photo_requirement: 'required', is_archived: false, sort_order: 2 },
    { id: 4, name: 'Not as described', name_fr: 'Non conforme à la description', note_requirement: 'required', photo_requirement: 'optional', is_archived: false, sort_order: 3 }
  ],
  policy: { windowDays: 30, windowBasis: 'placed' },
  photoUpload: { minPhotos: 1, maxPhotos: 3 },
  questions: [
    { id: 1, parent_question_id: null, body: 'Was the packaging damaged?', body_fr: "L'emballage était-il endommagé?", trigger_mode: 'always', condition_logic: 'AND', conditions: [], answer_type: 'boolean', options: [], sort_order: 0, is_active: true, depth: 0 },
    { id: 2, parent_question_id: 1, body: 'Please describe the damage', body_fr: 'Décrivez les dommages', trigger_mode: 'only_when', condition_logic: 'AND', conditions: [{ questionId: 1, equals: true }], answer_type: 'text', options: [], sort_order: 0, is_active: true, depth: 1 }
  ],
  klaviyoEvents: { request_submitted: true, approved: true, rejected: true, received: true, refund_issued: true },
  klaviyoConnected: true,
  canadaPost: {
    returnAddress: { name: 'Hera Beauté Warehouse', company: 'Hera Beauté', address1: '123 Rue Exemple', address2: '', city: 'Montréal', province: 'QC', postalCode: 'H2X 1Y1' },
    labelType: 'label_free',
    boxFree: false,
    serviceCode: 'DOM.EP',
    notifyEmails: ['ops@herabeauty.ca']
  },
  rules: [
    {
      id: 1, name: 'No returns on final sale', is_active: true, priority: 1, group_logic: 'AND',
      condition_groups: [{ conditionsMatch: 'OR', conditions: [{ field: 'tag', operator: 'equals', value: 'final-sale' }] }],
      actions: [{ type: 'reject_return' }]
    },
    {
      id: 2, name: 'Auto-approve loyal customers', is_active: true, priority: 5, group_logic: 'AND',
      condition_groups: [{ conditionsMatch: 'AND', conditions: [{ field: 'customer_tag', operator: 'equals', value: 'VIP' }] }],
      actions: [{ type: 'skip_approval' }]
    },
    {
      id: 3, name: 'No shipping returns for makeup', is_active: false, priority: 10, group_logic: 'AND',
      condition_groups: [{ conditionsMatch: 'OR', conditions: [{ field: 'product_type', operator: 'equals', value: 'Makeup' }] }],
      actions: [{ type: 'disallow_return_method', value: 'shipping' }]
    }
  ],
  portalLocations: [
    { id: 1, shopify_location_id: 'gid://shopify/Location/1001', store_name: 'Downtown Boutique', store_address: '456 Rue Sainte-Catherine', store_city: 'Montréal', opening_hours: 'Mon–Sat 10am–6pm', sort_order: 0 },
    { id: 2, shopify_location_id: 'gid://shopify/Location/1002', store_name: 'West Island Store', store_address: '789 Boulevard des Sources', store_city: 'Pointe-Claire', opening_hours: 'Mon–Sun 9am–9pm', sort_order: 1 }
  ],
  branding: { color: '#E32A69' },
  returnPolicyLink: { showLink: true, url: 'https://herabeauty.ca/policies/refund-policy' },
  messages: [
    { id: 1, title: 'Free shipping label included', title_fr: 'Étiquette gratuite incluse', body: "We'll email you a prepaid shipping label once your return is approved.", body_fr: 'Nous vous enverrons une étiquette prépayée une fois votre retour approuvé.', condition_type: 'free_shipping', sort_order: 0 },
    { id: 2, title: 'Auto-approved return', title_fr: 'Retour approuvé automatiquement', body: 'Your return has been automatically approved based on our store policy.', body_fr: null, condition_type: 'auto_approved', sort_order: 1 }
  ],
  wording: [
    { wording_key: 'portal.title', default_text: 'Start a return', modified_text: null, french_text: 'Commencer un retour' },
    { wording_key: 'portal.order_lookup.label', default_text: 'Order number', modified_text: 'Order # or email', french_text: null },
    { wording_key: 'portal.submit_button', default_text: 'Submit return', modified_text: null, french_text: 'Soumettre le retour' }
  ],
  shopifyLocations: [
    { id: 'gid://shopify/Location/1001', name: 'Downtown Boutique' },
    { id: 'gid://shopify/Location/1002', name: 'West Island Store' },
    { id: 'gid://shopify/Location/1003', name: 'Main Warehouse' }
  ],
  returns: []
};

function makeItem(overrides) {
  return {
    id: nextId(),
    product_title: 'Silk Radiance Foundation',
    variant_title: 'Shade 3 — Warm',
    image_url: '',
    product_id: 9001,
    variant_id: 90011,
    reason_id: 2,
    reason_name_snapshot: null,
    reason_display_name: 'Wrong size',
    customer_note: '',
    photos: [],
    questionAnswers: [],
    pos_rejection_reason: null,
    requested_quantity: 1,
    approved_quantity: 1,
    received_quantity: 0,
    refunded_quantity: 0,
    restocked_quantity: 0,
    replacement_provided_quantity: 0,
    refund_option: 'original_payment',
    price: 42,
    approve_status: 'pending',
    ...overrides
  };
}

store.returns = [
  {
    id: 1, order_name: '#1001', shopify_order_id: 500001, customer_id: 700001,
    customer_first_name: 'Alice', customer_last_name: 'Tremblay', customer_email: 'alice@example.com',
    status: 'awaiting_approval', auto_approved: false, approved_at: null,
    return_method: 'shipping', return_location_name: null, tracking_number: null,
    last_tracking_event: null, last_tracking_date: null,
    customer_paid_shipping: 0, actual_shipping_charge: 12.5, order_subtotal: 84,
    order_fulfilled_date: '2026-08-01', submitted_at: '2026-08-20T10:00:00Z',
    pre_archive_status: null, internal_return_note: null, matched_rules: [],
    items: [makeItem({ approve_status: 'pending' }), makeItem({ id: nextId(), product_title: 'Velvet Matte Lipstick', variant_title: 'Rosewood', price: 24, approve_status: 'pending' })]
  },
  {
    id: 2, order_name: '#1002', shopify_order_id: 500002, customer_id: 700002,
    customer_first_name: 'Marc', customer_last_name: 'Bouchard', customer_email: 'marc@example.com',
    status: 'awaiting_return', auto_approved: true, approved_at: '2026-08-19T09:00:00Z',
    return_method: 'shipping', return_location_name: null, tracking_number: '1Z999AA10123456784',
    last_tracking_event: 'In transit', last_tracking_date: '2026-08-21T14:00:00Z',
    customer_paid_shipping: 8, actual_shipping_charge: 10, order_subtotal: 42,
    order_fulfilled_date: '2026-07-28', submitted_at: '2026-08-18T15:30:00Z',
    pre_archive_status: null, internal_return_note: null, matched_rules: [],
    items: [makeItem({ approve_status: 'approved', approved_quantity: 1 })]
  },
  {
    id: 3, order_name: '#1003', shopify_order_id: 500003, customer_id: 700003,
    customer_first_name: 'Sophie', customer_last_name: 'Gagnon', customer_email: 'sophie@example.com',
    status: 'received', auto_approved: false, approved_at: '2026-08-15T09:00:00Z',
    return_method: 'in_store', return_location_name: 'Downtown Boutique', tracking_number: null,
    last_tracking_event: null, last_tracking_date: null,
    customer_paid_shipping: 0, actual_shipping_charge: 0, order_subtotal: 66,
    order_fulfilled_date: '2026-07-20', submitted_at: '2026-08-14T11:00:00Z',
    pre_archive_status: null, internal_return_note: 'Customer prefers store credit.', matched_rules: [],
    items: [makeItem({ approve_status: 'approved', approved_quantity: 1, received_quantity: 1, refund_option: 'store_credit' })]
  },
  {
    id: 4, order_name: '#1004', shopify_order_id: 500004, customer_id: 700004,
    customer_first_name: 'Julien', customer_last_name: 'Roy', customer_email: 'julien@example.com',
    status: 'refunded', auto_approved: true, approved_at: '2026-08-10T09:00:00Z',
    return_method: 'shipping', return_location_name: null, tracking_number: '1Z999AA10123456790',
    last_tracking_event: 'Delivered', last_tracking_date: '2026-08-12T10:00:00Z',
    customer_paid_shipping: 0, actual_shipping_charge: 9, order_subtotal: 42,
    order_fulfilled_date: '2026-07-15', submitted_at: '2026-08-09T09:00:00Z',
    pre_archive_status: null, internal_return_note: null, matched_rules: [],
    items: [makeItem({ approve_status: 'approved', approved_quantity: 2, received_quantity: 2, refunded_quantity: 2, restocked_quantity: 1, requested_quantity: 2 })]
  }
];

// ── 极简路由匹配（Express 风格 :id 参数） ────────────────────────────────

function toRegex(pattern) {
  const keys = [];
  const src = pattern.replace(/:[^/]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${src}$`), keys };
}

const routes = [];
function on(method, pattern, handler) {
  routes.push({ method, ...toRegex(pattern), handler });
}

function findReturn(id) {
  return store.returns.find(r => String(r.id) === String(id));
}
function findItem(ret, itemId) {
  return ret.items.find(i => String(i.id) === String(itemId));
}
function ok(data) { return { status: 200, data }; }
function notFound(msg) { return { status: 404, data: { error: msg || 'Not found' } }; }
function badRequest(msg) { return { status: 400, data: { error: msg || 'Bad request' } }; }

// ── /api/returns ─────────────────────────────────────────────────────────

on('GET', '/api/returns', (_p, _b, query) => {
  let list = store.returns;
  const filter = query.filter;
  if (filter === 'pending') list = list.filter(r => ['awaiting_approval', 'received'].includes(r.status));
  else if (filter === 'auto_approved') list = list.filter(r => r.auto_approved);
  else if (filter === 'to_be_received') list = list.filter(r => r.status === 'awaiting_return');
  else if (filter === 'archived') list = list.filter(r => r.status === 'archived');
  return ok(list.map(r => ({
    id: r.id, order_name: r.order_name, customer_email: r.customer_email, status: r.status,
    auto_approved: r.auto_approved, order_fulfilled_date: r.order_fulfilled_date, submitted_at: r.submitted_at
  })));
});

on('PATCH', '/api/returns/archive', (_p, body) => {
  (body.returnIds || []).forEach(id => {
    const r = findReturn(id);
    if (r && r.status !== 'archived') { r.pre_archive_status = r.status; r.status = 'archived'; }
  });
  return ok({ success: true });
});

on('GET', '/api/returns/:id', (p) => {
  const r = findReturn(p.id);
  if (!r) return notFound('Return not found');
  return ok({
    ...r,
    history: [
      { id: 1, event_type: 'submitted', note: null, created_at: r.submitted_at },
      { id: 2, event_type: 'internal_note', note: 'Mock data — for local UI preview only.', created_at: r.submitted_at }
    ],
    customerStats: { totalOrders: 6, totalReturnsSubmitted: 2, totalReturnsApproved: 2, customerTags: ['VIP'] },
    matched_rules: r.matched_rules || [],
    shopDomain: 'heratest0-1.myshopify.com'
  });
});

on('PATCH', '/api/returns/:id/approve', (p, body) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  const ids = body.itemIds && body.itemIds.length ? body.itemIds : r.items.map(i => i.id);
  r.items.forEach(i => { if (ids.includes(i.id)) i.approve_status = 'approved'; else if (!body.itemIds || !body.itemIds.length) i.approve_status = 'approved'; });
  if (body.itemIds && body.itemIds.length) {
    r.items.forEach(i => { if (!ids.includes(i.id)) i.approve_status = 'rejected'; });
  }
  r.status = 'awaiting_return';
  r.approved_at = nowIso();
  if (body.internalReturnNote) r.internal_return_note = body.internalReturnNote;
  return ok({ success: true });
});

on('PATCH', '/api/returns/:id/reject-all', (p) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  r.status = 'rejected';
  r.items.forEach(i => { i.approve_status = 'rejected'; });
  return ok({ success: true });
});

on('PATCH', '/api/returns/:id/mark-received', (p, body) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  if (body.itemReceipts && body.itemReceipts.length) {
    body.itemReceipts.forEach(({ itemId, receivedQuantity }) => {
      const item = findItem(r, itemId);
      if (item) item.received_quantity = receivedQuantity;
    });
  } else {
    r.items.forEach(i => { i.received_quantity = i.approved_quantity; });
  }
  r.status = 'received';
  return ok({ success: true });
});

on('PATCH', '/api/returns/:id/refresh-tracking', (p) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  r.last_tracking_event = 'In transit';
  r.last_tracking_date = nowIso();
  return ok({ success: true, last_tracking_event: r.last_tracking_event, last_tracking_date: r.last_tracking_date });
});

on('POST', '/api/returns/:id/internal-note', (p, body) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  if (!body.note || !body.note.trim()) return badRequest('Note text is required');
  return ok({ success: true });
});

on('PATCH', '/api/returns/:id/mark-resolved', (p) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  r.status = 'resolved';
  return ok({ success: true });
});

on('DELETE', '/api/returns/:id', (p) => {
  const idx = store.returns.findIndex(r => String(r.id) === String(p.id));
  if (idx === -1) return notFound();
  store.returns.splice(idx, 1);
  return ok({ success: true });
});

on('PATCH', '/api/returns/:id/issue-refund', (p) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  r.status = 'refunded';
  r.items.forEach(i => { i.refunded_quantity = i.received_quantity; });
  return ok({ success: true });
});

on('PATCH', '/api/returns/:id/restock', (p, body) => {
  const r = findReturn(p.id);
  if (!r) return notFound();
  if (body.mode === 'manual') {
    r.status = 'archived';
    r.pre_archive_status = 'refunded';
    return ok({ success: true, status: 'archived', restockFailures: [] });
  }
  const targetIds = body.mode === 'selected' ? (body.itemIds || []) : r.items.map(i => i.id);
  r.items.forEach(i => {
    if (targetIds.includes(i.id) && i.received_quantity > i.restocked_quantity) {
      i.restocked_quantity = i.received_quantity;
    }
  });
  const remaining = r.items.filter(i => i.received_quantity > 0 && i.restocked_quantity < i.received_quantity);
  if (remaining.length === 0) {
    r.status = 'archived';
    r.pre_archive_status = 'refunded';
    return ok({ success: true, status: 'archived', restockedAny: true, restockFailures: [] });
  }
  return ok({
    success: true, status: 'refunded', restockedAny: true, restockFailures: [],
    remainingItems: remaining.map(i => ({ id: i.id, productTitle: i.product_title, variantTitle: i.variant_title, remaining: i.received_quantity - i.restocked_quantity }))
  });
});

// ── /api/return-settings ─────────────────────────────────────────────────

on('GET', '/api/return-settings/shopify-locations', () => ok(store.shopifyLocations));

on('GET', '/api/return-settings/policy', () => ok(store.policy));
on('PATCH', '/api/return-settings/policy', (_p, body) => {
  store.policy = { windowDays: parseInt(body.windowDays, 10), windowBasis: body.windowBasis };
  return ok(store.policy);
});

on('GET', '/api/return-settings/reasons', (_p, _b, query) => {
  const list = query.includeArchived === 'true' ? store.reasons : store.reasons.filter(r => !r.is_archived);
  return ok([...list].sort((a, b) => a.sort_order - b.sort_order));
});
on('POST', '/api/return-settings/reasons', (_p, body) => {
  if (!body.name || !body.name.trim()) return badRequest('Reason name is required');
  const reason = {
    id: nextId(), name: body.name.trim(), name_fr: body.nameFr || null,
    note_requirement: body.noteRequirement || 'disabled', photo_requirement: body.photoRequirement || 'disabled',
    is_archived: false, sort_order: store.reasons.length
  };
  store.reasons.push(reason);
  return ok(reason);
});
on('PATCH', '/api/return-settings/reasons/reorder', (_p, body) => {
  (body.orderedIds || []).forEach((id, i) => {
    const r = store.reasons.find(x => String(x.id) === String(id));
    if (r) r.sort_order = i;
  });
  return ok({ success: true });
});
on('PATCH', '/api/return-settings/reasons/:id/archive', (p) => {
  const r = store.reasons.find(x => String(x.id) === String(p.id));
  if (!r) return notFound('Reason not found');
  r.is_archived = true;
  return ok({ success: true });
});
on('DELETE', '/api/return-settings/reasons/:id', (p) => {
  const idx = store.reasons.findIndex(x => String(x.id) === String(p.id));
  if (idx === -1) return notFound('Reason not found');
  store.reasons.splice(idx, 1);
  return ok({ success: true });
});
on('PATCH', '/api/return-settings/reasons/:id', (p, body) => {
  const r = store.reasons.find(x => String(x.id) === String(p.id));
  if (!r) return notFound('Reason not found');
  if (body.name !== undefined) r.name = body.name.trim();
  if (body.nameFr !== undefined) r.name_fr = body.nameFr;
  if (body.noteRequirement !== undefined) r.note_requirement = body.noteRequirement;
  if (body.photoRequirement !== undefined) r.photo_requirement = body.photoRequirement;
  return ok(r);
});

on('GET', '/api/return-settings/photo-upload', () => ok(store.photoUpload));
on('PATCH', '/api/return-settings/photo-upload', (_p, body) => {
  store.photoUpload = { minPhotos: parseInt(body.minPhotos, 10), maxPhotos: parseInt(body.maxPhotos, 10) };
  return ok(store.photoUpload);
});

on('GET', '/api/return-settings/questions', () => ok(store.questions));
on('POST', '/api/return-settings/questions', (_p, body) => {
  if (!body.body || !body.body.trim()) return badRequest('Question body is required');
  const q = {
    id: nextId(), parent_question_id: body.parentQuestionId || null, body: body.body.trim(),
    body_fr: body.bodyFr || null, trigger_mode: body.triggerMode || 'always',
    condition_logic: body.conditionLogic || 'AND', conditions: body.conditions || [],
    answer_type: body.answerType || 'text', options: body.options || [],
    sort_order: store.questions.length, is_active: true, depth: body.parentQuestionId ? 1 : 0
  };
  store.questions.push(q);
  return ok(q);
});
on('PATCH', '/api/return-settings/questions/:id', (p, body) => {
  const q = store.questions.find(x => String(x.id) === String(p.id));
  if (!q) return notFound('Question not found');
  Object.assign(q, {
    body: body.body !== undefined ? body.body.trim() : q.body,
    body_fr: body.bodyFr !== undefined ? body.bodyFr : q.body_fr,
    trigger_mode: body.triggerMode !== undefined ? body.triggerMode : q.trigger_mode,
    condition_logic: body.conditionLogic !== undefined ? body.conditionLogic : q.condition_logic,
    conditions: body.conditions !== undefined ? body.conditions : q.conditions,
    answer_type: body.answerType !== undefined ? body.answerType : q.answer_type,
    options: body.options !== undefined ? body.options : q.options,
    is_active: body.isActive !== undefined ? !!body.isActive : q.is_active
  });
  return ok(q);
});
on('DELETE', '/api/return-settings/questions/:id', (p) => {
  const idx = store.questions.findIndex(x => String(x.id) === String(p.id));
  if (idx === -1) return notFound('Question not found');
  store.questions.splice(idx, 1);
  return ok({ success: true });
});

on('GET', '/api/return-settings/klaviyo', () => ok({ connected: store.klaviyoConnected, events: store.klaviyoEvents }));
on('PATCH', '/api/return-settings/klaviyo/events', (_p, body) => {
  Object.keys(body).forEach(k => { if (k in store.klaviyoEvents) store.klaviyoEvents[k] = !!body[k]; });
  return ok({ events: store.klaviyoEvents });
});

on('GET', '/api/return-settings/canada-post', () => ok({ ...store.canadaPost }));
on('PATCH', '/api/return-settings/canada-post', (_p, body) => {
  if (body.returnAddress !== undefined) store.canadaPost.returnAddress = body.returnAddress;
  if (body.labelType !== undefined) store.canadaPost.labelType = body.labelType;
  if (body.boxFree !== undefined) store.canadaPost.boxFree = !!body.boxFree;
  if (body.serviceCode !== undefined) store.canadaPost.serviceCode = body.serviceCode;
  if (body.notifyEmails !== undefined) store.canadaPost.notifyEmails = body.notifyEmails;
  return ok({ ...store.canadaPost });
});

// ── /api/return-rules ────────────────────────────────────────────────────

on('GET', '/api/return-rules', () => ok([...store.rules].sort((a, b) => a.priority - b.priority)));
on('POST', '/api/return-rules', (_p, body) => {
  if (!body.name || !body.name.trim()) return badRequest('Rule name is required');
  const rule = {
    id: nextId(), name: body.name.trim(), is_active: true, priority: body.priority,
    group_logic: body.groupLogic || 'AND', condition_groups: body.conditionGroups || [], actions: body.actions || []
  };
  store.rules.push(rule);
  return ok(rule);
});
on('GET', '/api/return-rules/:id', (p) => {
  const r = store.rules.find(x => String(x.id) === String(p.id));
  if (!r) return notFound('Rule not found');
  return ok(r);
});
on('PATCH', '/api/return-rules/:id/toggle', (p, body) => {
  const r = store.rules.find(x => String(x.id) === String(p.id));
  if (!r) return notFound('Rule not found');
  r.is_active = !!body.isActive;
  return ok({ success: true, isActive: r.is_active });
});
on('PATCH', '/api/return-rules/:id', (p, body) => {
  const r = store.rules.find(x => String(x.id) === String(p.id));
  if (!r) return notFound('Rule not found');
  Object.assign(r, {
    name: body.name.trim(), group_logic: body.groupLogic || 'AND',
    condition_groups: body.conditionGroups, actions: body.actions, priority: body.priority
  });
  return ok(r);
});
on('DELETE', '/api/return-rules/:id', (p) => {
  const idx = store.rules.findIndex(x => String(x.id) === String(p.id));
  if (idx === -1) return notFound('Rule not found');
  store.rules.splice(idx, 1);
  return ok({ success: true });
});

// ── /api/return-portal ───────────────────────────────────────────────────

on('GET', '/api/return-portal/locations', () => ok([...store.portalLocations].sort((a, b) => a.sort_order - b.sort_order)));
on('POST', '/api/return-portal/locations', (_p, body) => {
  if (!body.shopifyLocationId) return badRequest('shopifyLocationId is required');
  const loc = {
    id: nextId(), shopify_location_id: body.shopifyLocationId, store_name: body.storeName || null,
    store_address: body.storeAddress || null, store_city: body.storeCity || null,
    opening_hours: body.openingHours || null, sort_order: store.portalLocations.length
  };
  store.portalLocations.push(loc);
  return ok(loc);
});
on('PATCH', '/api/return-portal/locations/reorder', (_p, body) => {
  (body.orderedIds || []).forEach((id, i) => {
    const l = store.portalLocations.find(x => String(x.id) === String(id));
    if (l) l.sort_order = i;
  });
  return ok({ success: true });
});
on('PATCH', '/api/return-portal/locations/:id', (p, body) => {
  const l = store.portalLocations.find(x => String(x.id) === String(p.id));
  if (!l) return notFound('Location not found');
  Object.assign(l, {
    shopify_location_id: body.shopifyLocationId !== undefined ? body.shopifyLocationId : l.shopify_location_id,
    store_name: body.storeName !== undefined ? body.storeName : l.store_name,
    store_address: body.storeAddress !== undefined ? body.storeAddress : l.store_address,
    store_city: body.storeCity !== undefined ? body.storeCity : l.store_city,
    opening_hours: body.openingHours !== undefined ? body.openingHours : l.opening_hours
  });
  return ok(l);
});
on('DELETE', '/api/return-portal/locations/:id', (p) => {
  const idx = store.portalLocations.findIndex(x => String(x.id) === String(p.id));
  if (idx === -1) return notFound('Location not found');
  store.portalLocations.splice(idx, 1);
  return ok({ success: true });
});

on('GET', '/api/return-portal/branding', () => ok(store.branding));
on('PATCH', '/api/return-portal/branding', (_p, body) => {
  if (!body.color || !/^#[0-9A-Fa-f]{6}$/.test(body.color)) return badRequest('color must be a valid hex code');
  store.branding = { color: body.color };
  return ok(store.branding);
});

on('GET', '/api/return-portal/return-policy', () => ok(store.returnPolicyLink));
on('PATCH', '/api/return-portal/return-policy', (_p, body) => {
  store.returnPolicyLink = { showLink: !!body.showLink, url: body.url || '' };
  return ok(store.returnPolicyLink);
});

on('GET', '/api/return-portal/messages', () => ok([...store.messages].sort((a, b) => a.sort_order - b.sort_order)));
on('POST', '/api/return-portal/messages', () => {
  const msg = { id: nextId(), title: null, title_fr: null, body: null, body_fr: null, condition_type: 'always', sort_order: store.messages.length };
  store.messages.push(msg);
  return ok(msg);
});
on('PATCH', '/api/return-portal/messages/reorder', (_p, body) => {
  (body.orderedIds || []).forEach((id, i) => {
    const m = store.messages.find(x => String(x.id) === String(id));
    if (m) m.sort_order = i;
  });
  return ok({ success: true });
});
on('PATCH', '/api/return-portal/messages/:id', (p, body) => {
  const m = store.messages.find(x => String(x.id) === String(p.id));
  if (!m) return notFound('Message not found');
  if (!body.title || !body.title.trim()) return badRequest('Message title is required');
  Object.assign(m, {
    title: body.title.trim(),
    title_fr: body.titleFr !== undefined ? body.titleFr : m.title_fr,
    body: body.body !== undefined ? body.body : m.body,
    body_fr: body.bodyFr !== undefined ? body.bodyFr : m.body_fr,
    condition_type: body.conditionType !== undefined ? body.conditionType : m.condition_type
  });
  return ok(m);
});
on('DELETE', '/api/return-portal/messages/:id', (p) => {
  const idx = store.messages.findIndex(x => String(x.id) === String(p.id));
  if (idx === -1) return notFound('Message not found');
  store.messages.splice(idx, 1);
  return ok({ success: true });
});

on('GET', '/api/return-portal/wording', (_p, _b, query) => {
  let rows = store.wording;
  if (query.search && query.search.trim()) {
    const term = query.search.trim().toLowerCase();
    rows = rows.filter(w =>
      (w.default_text || '').toLowerCase().includes(term) ||
      (w.modified_text || '').toLowerCase().includes(term) ||
      (w.french_text || '').toLowerCase().includes(term)
    );
  }
  return ok(rows);
});
on('PATCH', '/api/return-portal/wording/:key', (p, body) => {
  const w = store.wording.find(x => x.wording_key === p.key);
  if (!w) return notFound('Wording entry not found');
  if (body.modifiedText !== undefined) w.modified_text = body.modifiedText === '' ? null : body.modifiedText;
  if (body.frenchText !== undefined) w.french_text = body.frenchText === '' ? null : body.frenchText;
  return ok(w);
});

// ── 匹配 + axios adapter ─────────────────────────────────────────────────

function matchAndRun(method, pathname, query, body) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.regex.exec(pathname);
    if (!m) continue;
    const params = {};
    route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return route.handler(params, body || {}, query || {});
  }
  return { status: 404, data: { error: `Mock: no handler for ${method} ${pathname}` } };
}

export const isMockEnabled = () => process.env.REACT_APP_MOCK_API === 'true';

// axios 自定义 adapter：整个请求完全不碰网络，同步在内存里算完直接 resolve。
// 参考 axios 官方 adapter 的返回结构（{data, status, statusText, headers, config, request}）。
export function mockAdapter(config) {
  return new Promise((resolve) => {
    const method = (config.method || 'get').toUpperCase();
    const urlObj = new URL(config.url, 'http://mock.local');
    const pathname = urlObj.pathname;
    const query = { ...Object.fromEntries(urlObj.searchParams.entries()), ...(config.params || {}) };
    let body = {};
    if (config.data) {
      try { body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data; } catch (e) { body = {}; }
    }

    // 模拟一点网络延迟，避免 UI 一闪而过、看不出 loading 状态
    setTimeout(() => {
      const { status, data } = matchAndRun(method, pathname, query, body);
      const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
      if (status >= 200 && status < 300) {
        resolve(response);
      } else {
        // 保持跟真实 axios 一样：非 2xx 走 reject，形状是 { response, message, isAxiosError: true }
        const error = new Error(`Request failed with status code ${status}`);
        error.response = response;
        error.isAxiosError = true;
        // eslint-disable-next-line prefer-promise-reject-errors
        resolve(Promise.reject(error));
      }
    }, 150);
  });
}
