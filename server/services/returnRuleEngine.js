// ============================================================
// Return Rule Engine
// ============================================================
// 输入一次退货申请的上下文（订单/顾客/逐个 line item 的属性），
// 判定命中哪些 active rule，处理冲突，输出最终生效的 action 列表，
// 以及每条命中规则的最终状态（供 admin 端 Rules subjected 卡片展示）

const db = require('../database/init');

// 单个 condition 的判定：property 对应到 context 里怎么取值，operator 怎么比较
function evaluateCondition(condition, target) {
  const { property, operator, value } = condition;

  let actualValue;
  switch (property) {
    case 'customer.tags':
      actualValue = target.customerTags || [];
      break;
    case 'order.date':
      actualValue = target.orderDate;
      break;
    case 'order.days_since_ordered':
      actualValue = target.daysSinceOrdered;
      break;
    case 'order.fulfillment_location_id':
      actualValue = target.fulfillmentLocationId;
      break;
    case 'order.tags':
      actualValue = target.orderTags || [];
      break;
    case 'order.total':
      actualValue = target.orderTotal;
      break;
    case 'order.remaining_value_after_returns':
      actualValue = target.remainingValueAfterReturns;
      break;
    case 'order.sales_channel_name':
      actualValue = target.salesChannelName;
      break;
    case 'product.tags':
      actualValue = target.item?.productTags || [];
      break;
    case 'product.collections':
      actualValue = target.item?.productCollections || [];
      break;
    case 'product.type':
      actualValue = target.item?.productType;
      break;
    case 'product.variant_sku':
      actualValue = target.item?.variantSku;
      break;
    case 'product.vendor':
      actualValue = target.item?.vendor;
      break;
    case 'return.reason':
      actualValue = target.item?.reason;
      break;
    case 'return.total_value':
      actualValue = target.returnTotalValue;
      break;
    case 'return.total_weight':
      actualValue = target.returnTotalWeight;
      break;
    case 'return.total_quantity':
      actualValue = target.returnTotalQuantity;
      break;
    default:
      return false;
  }

  switch (operator) {
    case 'is':
      return actualValue === value;
    case 'is_not':
      return actualValue !== value;
    case 'contains':
      return Array.isArray(actualValue) ? actualValue.includes(value) : String(actualValue || '').includes(value);
    case 'does_not_contain':
      return Array.isArray(actualValue) ? !actualValue.includes(value) : !String(actualValue || '').includes(value);
    case 'less_than':
      return actualValue < value;
    case 'more_than':
    case 'larger_than':
      return actualValue > value;
    case 'before':
      return new Date(actualValue) < new Date(value);
    case 'after':
      return new Date(actualValue) > new Date(value);
    default:
      return false;
  }
}

// 一个 condition group：group 内多条 condition 按 conditionsMatch(AND/OR) 组合
function evaluateConditionGroup(group, target) {
  const results = group.conditions.map(c => evaluateCondition(c, target));
  if (group.conditionsMatch === 'OR') {
    return results.some(Boolean);
  }
  return results.every(Boolean); // 默认 AND
}

// 一条 rule 对"整个 return"是否命中：
// 每个 condition group 独立判断自己的 matchAllItems——
// 勾选了的 group，要求所有 item 都命中这个 group 的条件；没勾选的 group，只要至少一个 item 命中即可，
// 各个 group 的结果再按 rule.group_logic（AND/OR）合并
function ruleMatchesReturn(rule, items, orderContext) {
  const groupResults = rule.condition_groups.map(group => {
    const hasItemScopeCondition = group.conditions.some(c =>
      c.property.startsWith('product.') || c.property === 'return.reason'
    );

    if (!hasItemScopeCondition) {
      // 纯 order/customer scope 的 group，跟 item 无关，判断一次即可
      return evaluateConditionGroup(group, { ...orderContext, item: null });
    }

    const itemMatches = items.map(item => evaluateConditionGroup(group, { ...orderContext, item }));
    return group.matchAllItems === true ? itemMatches.every(Boolean) : itemMatches.some(Boolean);
  });

  return rule.group_logic === 'OR' ? groupResults.some(Boolean) : groupResults.every(Boolean);
}

// 两个 action 是否互斥（同时命中时不能都生效）
const ORDER_DISPOSITION_TYPES = ['skip_approval', 'require_approval', 'reject_return'];

function actionsConflict(actionA, ruleA, actionB, ruleB) {
  // 互斥组 1：整单处置类，两两冲突（包括同类型，避免重复触发）
  if (ORDER_DISPOSITION_TYPES.includes(actionA.type) && ORDER_DISPOSITION_TYPES.includes(actionB.type)) {
    return true;
  }

  // 互斥组 3：disallow_reason(X) vs allow_replacement，且 allow_replacement 那条规则的 condition 命中同一个 reason X
  if (actionA.type === 'disallow_reason' && actionB.type === 'allow_replacement') {
    return ruleTargetsReason(ruleB, actionA.value);
  }
  if (actionB.type === 'disallow_reason' && actionA.type === 'allow_replacement') {
    return ruleTargetsReason(ruleA, actionB.value);
  }

  return false;
}

// 判断某条规则的 condition 里，是否有一条 "return.reason is X" 这样的条件
function ruleTargetsReason(rule, reasonValue) {
  return rule.condition_groups.some(g =>
    g.conditions.some(c => c.property === 'return.reason' && c.operator === 'is' && c.value === reasonValue)
  );
}

// ============================================================
// 主函数：evaluateRules
// ============================================================
// context: {
//   orderContext: { customerTags, orderDate, daysSinceOrdered, fulfillmentLocationId, orderTags,
//                    orderTotal, remainingValueAfterReturns, salesChannelName,
//                    returnTotalValue, returnTotalWeight, returnTotalQuantity },
//   items: [{ reason, productTags, productCollections, productType, variantSku, vendor }, ...]
// }
async function evaluateRules(context) {
  const { orderContext, items } = context;

  const allRules = await db.prepare(`
    SELECT * FROM return_rules WHERE is_active = TRUE ORDER BY priority ASC
  `).all();

  const rules = allRules.map(r => ({
    ...r,
    condition_groups: JSON.parse(r.condition_groups),
    actions: JSON.parse(r.actions)
  }));

  // 第一步：找出所有命中的规则
  const matchedRules = rules.filter(rule => ruleMatchesReturn(rule, items, orderContext));

  // 第二步：按优先级（数组已经是 priority ASC）逐条决定每个 action 是否生效
  const appliedActions = []; // [{ rule, action }]
  const skippedActions = []; // [{ rule, action, conflictWithRuleId, conflictWithRuleName }]

  for (const rule of matchedRules) {
    for (const action of rule.actions) {
      const conflictingApplied = appliedActions.find(applied =>
        actionsConflict(action, rule, applied.action, applied.rule)
      );

      if (conflictingApplied) {
        skippedActions.push({
          rule,
          action,
          conflictWithRuleId: conflictingApplied.rule.id,
          conflictWithRuleName: conflictingApplied.rule.name
        });
      } else {
        appliedActions.push({ rule, action });
      }
    }
  }

  // 第三步：整理成"每条命中规则的最终状态"，供 Rules subjected 卡片展示
  const ruleSummaries = matchedRules.map(rule => {
    const ruleAppliedActions = appliedActions.filter(a => a.rule.id === rule.id).map(a => a.action);
    const ruleSkippedActions = skippedActions.filter(s => s.rule.id === rule.id);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      appliedActions: ruleAppliedActions,
      skippedActions: ruleSkippedActions.map(s => ({
        action: s.action,
        conflictWithRuleId: s.conflictWithRuleId,
        conflictWithRuleName: s.conflictWithRuleName
      })),
      // 一条规则里如果所有 action 都被跳过了，标记整条规则为 skipped；只要有一个 action 生效，就算 applied
      status: ruleAppliedActions.length > 0 ? 'applied' : 'skipped'
    };
  });

  return {
    matchedRuleSummaries: ruleSummaries,
    effectiveActions: appliedActions.map(a => ({ ...a.action, ruleId: a.rule.id, ruleName: a.rule.name }))
  };
}

module.exports = { evaluateRules };