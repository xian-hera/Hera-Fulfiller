// POS 首页 Tile 入口（方案文档 7.1）："Online return"
// ✅ 已跟 Shopify Tech Support 确认（2026-04 POS UI Extensions）：tile 的文案是 <s-tile> 组件的
// heading prop 设置的，不是 shopify.title 之类的属性赋值；点击 tile 不会自动打开 modal target，
// 需要在 onPress 里显式调用 shopify.action.presentModal()。

import '@shopify/ui-extensions/preact';
import { render } from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  return (
    <s-tile
      heading="Online return"
      onPress={() => {
        shopify.action.presentModal();
      }}
      enabled
    />
  );
}
