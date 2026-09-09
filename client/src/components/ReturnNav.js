import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Tabs } from '@shopify/polaris';

// Return 板块的 4 个顶部导航 tab（方案文档 6.0）：Returns / Settings / Rules / Portal
// 每个子页面标题旁的返回箭头固定回 APP 主页（Dashboard），不是浏览器"返回上一页"语义
const TABS = [
  { id: 'returns', content: 'Returns', path: '/return' },
  { id: 'settings', content: 'Settings', path: '/return/settings' },
  { id: 'rules', content: 'Rules', path: '/return/rules' },
  { id: 'portal', content: 'Portal', path: '/return/portal' }
];

// activeTabId: 'returns' | 'settings' | 'rules' | 'portal'
// title: 页面标题（Page 组件的 title）
// children: 页面内容
// primaryAction / secondaryActions: 沿用 Polaris Page 的对应 prop（比如 Rules 列表页右上角的 Create rule 按钮）
function ReturnNav({ activeTabId, title, primaryAction, secondaryActions, children }) {
  const navigate = useNavigate();
  const selectedIndex = TABS.findIndex(t => t.id === activeTabId);
  const [selected, setSelected] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  const handleSelect = useCallback((index) => {
    setSelected(index);
    navigate(TABS[index].path);
  }, [navigate]);

  return (
    <Page
      title={title}
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
    >
      <Tabs tabs={TABS} selected={selected} onSelect={handleSelect} />
      <div style={{ marginTop: '1rem' }}>
        {children}
      </div>
    </Page>
  );
}

export default ReturnNav;
