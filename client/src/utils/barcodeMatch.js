import axios from '../api/axios';

// 🆕 扫码枪原始输入清洗：去掉扫描枪可能带的非数字前缀（比如某些枪会加控制字符）
export function cleanBarcode(raw) {
  return raw.replace(/^[^0-9]+/, '');
}

// 判断扫到的 barcode 是否匹配该 item：本地已知的 SKU，或者（迁移期间）历史 lookups 里的任一 barcode
// lookups 是订单 webhook 时从 custom.lookups metafield 解析出来的历史 barcode 对应 SKU 列表，
// 属于旧的 bundle 变通方案，等 Shopify 原生多 barcode 全面替换掉这套机制后可以一起下线。
export function matchesBarcode(item, barcode) {
  if (item.sku === barcode) return true;
  if (item.lookups) {
    return item.lookups.split(',').map(s => s.trim()).includes(barcode);
  }
  return false;
}

// 🆕 本地匹配不到时的兜底：实时向 Shopify 查这个 barcode 属于哪个 variant 的 SKU。
// 背景：Shopify 2026-09 上线了原生多 barcode（一个 variant 最多挂 20 个 barcode），
// 但目前稳定版 Admin API 只能读到 variant 的主 barcode，读不到完整 barcode 列表；
// 不过用 barcode: 搜索时，能命中该 variant 身上的任一个 barcode，不限主 barcode。
// 所以这里不去枚举 variant 的全部 barcode，而是反过来：只在本地按 SKU 直接匹配失败时，
// 才拿扫到的这个 barcode 去 Shopify 实时搜一次，换回它真正对应的 SKU，再用这个 SKU 去
// 匹配当前页面已知的 item 列表。返回 null 表示没查到或查询失败。
export async function resolveBarcodeSku(barcode) {
  try {
    const response = await axios.get('/api/barcode/resolve', { params: { barcode } });
    return response.data?.sku || null;
  } catch (error) {
    console.error('Failed to resolve barcode via Shopify:', error.message);
    return null;
  }
}
