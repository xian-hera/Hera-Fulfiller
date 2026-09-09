// 把 rule 的 condition_groups / actions 拼成一句人话，供 Rules 列表页 + 详情页 Rules subjected 卡片复用
// 注：规则本身不存 description 字段，全部是"根据 condition + action 拼接生成"（方案文档 6.5/10.1）

const PROPERTY_LABEL = {
  'customer.tags': 'Customer tags',
  'order.date': 'Order date',
  'order.days_since_ordered': 'Days since ordered',
  'order.fulfillment_location_id': 'Fulfillment location',
  'order.tags': 'Order tags',
  'order.total': 'Order total',
  'order.remaining_value_after_returns': 'Remaining value after returns',
  'order.sales_channel_name': 'Sales channel',
  'product.tags': 'Product tags',
  'product.collections': 'Product collections',
  'product.type': 'Product type',
  'product.variant_sku': 'Variant SKU',
  'product.vendor': 'Vendor',
  'return.reason': 'Return reason',
  'return.total_value': 'Return total value',
  'return.total_weight': 'Return total weight',
  'return.total_quantity': 'Return total quantity'
};

const OPERATOR_LABEL = {
  is: 'is', is_not: 'is not', contains: 'contains', does_not_contain: 'does not contain',
  less_than: 'less than', more_than: 'more than', larger_than: 'more than', before: 'before', after: 'after'
};

export const ACTION_LABEL = {
  disallow_return_method: 'Do not allow return method',
  require_approval: 'Require return approval',
  skip_approval: 'Do not require return approval',
  disallow_reason: 'Do not allow return reason',
  reject_return: 'Reject the return',
  allow_replacement: 'Allow replacement'
};

export function summarizeCondition(c) {
  return `${PROPERTY_LABEL[c.property] || c.property} ${OPERATOR_LABEL[c.operator] || c.operator} ${c.value}`;
}

export function summarizeConditions(rule) {
  const groups = rule.condition_groups || [];
  const groupTexts = groups.map(g => {
    const joiner = g.conditionsMatch === 'OR' ? ' or ' : ' and ';
    return g.conditions.map(summarizeCondition).join(joiner);
  });
  const outerJoiner = rule.group_logic === 'OR' ? ' OR ' : ' AND ';
  return groupTexts.join(outerJoiner) || 'No conditions';
}

export function summarizeActions(rule) {
  const actions = rule.actions || [];
  return actions.map(a => {
    if (a.value) return `${ACTION_LABEL[a.type] || a.type}: ${a.value}`;
    return ACTION_LABEL[a.type] || a.type;
  }).join('; ') || 'No actions';
}
