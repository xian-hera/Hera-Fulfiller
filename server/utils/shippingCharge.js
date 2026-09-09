// 🆕 Return 功能用：从 orders 的 custom.fulfillment metafield 里解析出实际支付给 Canada Post 的运费
//
// 这个 metafield 不是一个干净的数字字段，而是 Packer 正向发货成功后由
// server/routes/packer.js 拼出的一个格式化字符串，例如：
//   "Expedited Parcel - 12x9x3 in - 500 g - $11.61"
// 需要用正则从字符串末尾抠出 "$XX.XX" 这一段（见工程进度文档 4.2 / 方案文档 8.2.6/8.2.7）
//
// 用途：
//   1. 退货详情页 Order 卡片的 "Actual shipping charge"（方案文档 6.5 第 3 点）
//   2. Issue refund 弹窗 Deduction 里的 "Actual original shipping paid"（跟上面是同一个数据，见 6.8.4）
//   3. "Returning shipping"（我们为这次退货垫付的运费）—— 已确认没有实时查询 API，
//      兜底方案是直接复用这个原发货运费的值（见方案文档 8.2.7）

/**
 * @param {string|null|undefined} metafieldValue - custom.fulfillment metafield 的原始值
 * @returns {number|null} 解析出的运费金额（例如 11.61），解析不到时返回 null
 */
function parseShippingChargeFromMetafield(metafieldValue) {
  if (!metafieldValue || typeof metafieldValue !== 'string') return null;

  // 取字符串里最后一个 "$金额" 片段（这个格式里金额固定在末尾，取最后一个也是最稳妥的写法）
  const matches = metafieldValue.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/g);
  if (!matches || matches.length === 0) return null;

  const lastMatch = matches[matches.length - 1];
  const numeric = lastMatch.replace(/\$|\s|,/g, '');
  const amount = parseFloat(numeric);

  return isNaN(amount) ? null : amount;
}

module.exports = { parseShippingChargeFromMetafield };
