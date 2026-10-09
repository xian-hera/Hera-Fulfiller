// 🆕 Variant metafield custom.picked 同步（2026-10）
//
// 含义：某个 variant 的 Picked = Fulfiller 里所有"已在 Picker 标为 picked、订单还没发货/取消"的数量之和。
//   - 只有在 Fulfiller 里拣货（picked）会让它增加；调货（missing → transfer）不计入
//   - 取消 picked、改回缺货、退款/改单减少、订单 fulfilled / cancelled、订单被删除或清理 → 减少
//
// 做法：不做 +N / −N 的加减记账，而是每次有变化时，按数据库当前状态把总数重新算一遍再写入 Shopify。
//   这样两个人同时拣同一个 SKU、webhook 重发、某次写入失败等情况都不会让数字越积越偏，
//   下一次计算会自动纠正。
//
// 流程：
//   1. 任何会改动数据的请求结束后调用 requestReconcile()（server/index.js 里的中间件统一触发），
//      短暂合并（debounce）后执行 reconcile()
//   2. reconcile()：从 line_items 算出每个 variant 的当前 picked 数量，跟 picked_sync_state 表里
//      "上次写入 Shopify 的值"对比，只把有变化的写过去（metafieldsSet，每批 25 个）
//   3. picked_sync_state 记住写过的值，所以订单记录被删掉后，那些 variant 仍会被算成 0 并写回 Shopify
//   4. 每 5 分钟兜底跑一次；启动时先补齐旧数据的 variant_id，再全量同步一次
//
// 只有 Fulfiller 会写 custom.picked（已与 Hera 确认），所以直接覆盖。

const db = require('../database/init');
const shopifyClient = require('../shopify/client');

const NAMESPACE = 'custom';
const KEY = 'picked';
const METAFIELD_TYPE = 'number_integer';
const BATCH_SIZE = 25;            // metafieldsSet 单次最多 25 个
const DEBOUNCE_MS = 1000;
const PERIODIC_MS = 5 * 60 * 1000;

let debounceTimer = null;
let running = false;
let rerunRequested = false;
let started = false;

const status = {
  lastRunAt: null,
  lastRunWrites: 0,
  lastRunFailures: 0,
  lastError: null,
  backfill: null
};

// 从数据库算出每个 variant 当前的 picked 总数（只算还在 Fulfiller 里、未 fulfilled 的订单）
async function computeCurrentPicked() {
  const rows = await db.prepare(`
    SELECT li.variant_id,
           SUM(CASE WHEN li.picker_status = 'picked' THEN li.quantity ELSE 0 END) AS picked
    FROM line_items li
    JOIN orders o ON o.shopify_order_id = li.shopify_order_id
    WHERE li.variant_id IS NOT NULL AND li.variant_id <> ''
      AND COALESCE(o.fulfillment_status, '') <> 'fulfilled'
    GROUP BY li.variant_id
  `).all();
  const map = new Map();
  rows.forEach(r => map.set(String(r.variant_id), Math.max(0, parseInt(r.picked, 10) || 0)));
  return map;
}

async function loadState() {
  const rows = await db.prepare('SELECT variant_id, last_value FROM picked_sync_state').all();
  const map = new Map();
  rows.forEach(r => map.set(String(r.variant_id), parseInt(r.last_value, 10) || 0));
  return map;
}

async function saveState(variantId, value) {
  await db.prepare(`
    INSERT INTO picked_sync_state (variant_id, last_value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (variant_id) DO UPDATE SET last_value = EXCLUDED.last_value, updated_at = CURRENT_TIMESTAMP
  `).run(variantId, value);
}

// 写一批到 Shopify。返回 { ok: [variantId...], permanentFail: [variantId...], retry: [variantId...] }
async function writeBatch(entries) {
  const result = { ok: [], permanentFail: [], retry: [] };
  const metafields = entries.map(([variantId, value]) => ({
    ownerId: `gid://shopify/ProductVariant/${variantId}`,
    namespace: NAMESPACE,
    key: KEY,
    type: METAFIELD_TYPE,
    value: String(value)
  }));

  try {
    const client = await shopifyClient.getClient();
    const response = await client.post('/graphql.json', {
      query: `
        mutation setPicked($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id }
            userErrors { field message code }
          }
        }
      `,
      variables: { metafields }
    }, { timeout: 30000 });

    if (response.data.errors) {
      // 顶层错误（权限、限流等）→ 整批下次重试
      throw new Error('GraphQL errors: ' + JSON.stringify(response.data.errors));
    }

    const userErrors = response.data?.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length === 0) {
      result.ok = entries.map(([id]) => id);
      return result;
    }

    // userErrors 的 field 形如 ["metafields", "3", "ownerId"]，能定位到第几个
    const badIndexes = new Set();
    let unattributed = false;
    userErrors.forEach(e => {
      const idx = Array.isArray(e.field) ? parseInt(e.field[1], 10) : NaN;
      if (Number.isInteger(idx)) badIndexes.add(idx);
      else unattributed = true;
      console.error(`[PickedSync] Shopify userError: ${e.message} (field: ${JSON.stringify(e.field)}, code: ${e.code})`);
    });

    if (unattributed) {
      // 定位不到是哪一个（比如 metafield 定义类型不对）→ 整批下次重试
      result.retry = entries.map(([id]) => id);
      return result;
    }
    // metafieldsSet 是原子的：有任何一个出错，整批都不会写入。
    // 出错的那几个记为永久失败（比如 variant 已被删除），其余的下次重试。
    entries.forEach(([id], i) => {
      if (badIndexes.has(i)) result.permanentFail.push(id);
      else result.retry.push(id);
    });
    return result;
  } catch (error) {
    console.error('[PickedSync] Write failed, will retry later:', error.response?.data || error.message);
    status.lastError = error.message;
    result.retry = entries.map(([id]) => id);
    return result;
  }
}

async function reconcile() {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  try {
    do {
      rerunRequested = false;
      const current = await computeCurrentPicked();
      const state = await loadState();

      const changes = [];
      const allIds = new Set([...current.keys(), ...state.keys()]);
      allIds.forEach(id => {
        const desired = current.get(id) || 0;
        const previous = state.get(id);
        // 从没写过、现在也是 0 → 不需要写（metafield 空着就等于 0）
        if (previous === undefined && desired === 0) return;
        if (previous !== desired) changes.push([id, desired]);
      });

      let writes = 0;
      let failures = 0;
      for (let i = 0; i < changes.length; i += BATCH_SIZE) {
        const batch = changes.slice(i, i + BATCH_SIZE);
        const res = await writeBatch(batch);
        const valueOf = new Map(batch);
        for (const id of res.ok) {
          await saveState(id, valueOf.get(id));
          writes++;
        }
        for (const id of res.permanentFail) {
          // 记下来，避免对一个已不存在的 variant 无限重试
          await saveState(id, valueOf.get(id));
          failures++;
        }
        failures += res.retry.length;
      }

      status.lastRunAt = new Date().toISOString();
      status.lastRunWrites = writes;
      status.lastRunFailures = failures;
      if (failures === 0) status.lastError = null;
      if (changes.length > 0) {
        console.log(`[PickedSync] ${writes} variant(s) updated${failures ? `, ${failures} failed` : ''}: ` +
          changes.slice(0, 10).map(([id, v]) => `${id}=${v}`).join(', ') + (changes.length > 10 ? ' …' : ''));
      }
    } while (rerunRequested);
  } catch (error) {
    status.lastError = error.message;
    console.error('[PickedSync] Reconcile error:', error.message);
  } finally {
    running = false;
  }
}

// 外部调用：数据有变化后调用；短时间内多次调用会合并成一次
function requestReconcile() {
  if (!started) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    reconcile().catch(() => {});
  }, DEBOUNCE_MS);
}

// 旧数据补 variant_id：按订单向 Shopify 取一次订单，用 line item id 对应出 variant_id。
// 拆分出来的行（shopify_line_item_id 形如 123_split_xxx / 123_169...）取 "_" 前的原始 id。
async function backfillVariantIds() {
  const rows = await db.prepare(`
    SELECT DISTINCT shopify_order_id FROM line_items WHERE variant_id IS NULL
  `).all();
  if (rows.length === 0) return { orders: 0, updated: 0 };

  console.log(`[PickedSync] Backfilling variant_id for ${rows.length} order(s)...`);
  let updated = 0;
  for (const { shopify_order_id: orderId } of rows) {
    try {
      const order = await shopifyClient.getOrder(orderId);
      const variantByLineItem = new Map(
        (order.line_items || []).map(li => [String(li.id), li.variant_id ? String(li.variant_id) : ''])
      );
      const items = await db.prepare(
        'SELECT id, shopify_line_item_id FROM line_items WHERE shopify_order_id = ? AND variant_id IS NULL'
      ).all(orderId);
      for (const item of items) {
        const baseId = String(item.shopify_line_item_id).split('_')[0];
        const variantId = variantByLineItem.get(baseId) ?? '';
        await db.prepare('UPDATE line_items SET variant_id = ? WHERE id = ?').run(variantId, item.id);
        updated++;
      }
    } catch (error) {
      // 订单在 Shopify 查不到（比如已删除）→ 标成空字符串，不再重复尝试
      console.error(`[PickedSync] Backfill failed for order ${orderId}:`, error.response?.status || error.message);
      if (error.response?.status === 404) {
        await db.prepare("UPDATE line_items SET variant_id = '' WHERE shopify_order_id = ? AND variant_id IS NULL").run(orderId);
      }
    }
    await new Promise(r => setTimeout(r, 300)); // 别打太快，留余量给 Shopify 限流
  }
  console.log(`[PickedSync] Backfill done: ${updated} line item(s) updated`);
  return { orders: rows.length, updated };
}

async function start() {
  if (started) return;
  started = true;
  try {
    status.backfill = await backfillVariantIds();
  } catch (error) {
    console.error('[PickedSync] Backfill error:', error.message);
    status.backfill = { error: error.message };
  }
  await reconcile();
  setInterval(() => reconcile().catch(() => {}), PERIODIC_MS).unref();
}

function getStatus() {
  return { ...status, running };
}

module.exports = { start, requestReconcile, reconcile, getStatus, computeCurrentPicked };
