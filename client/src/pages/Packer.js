import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  Button,
  BlockStack,
  Banner
} from '@shopify/polaris';
import { SortIcon } from '@shopify/polaris-icons';
import RefundLabelModal from '../components/RefundLabelModal';

// 🆕 Scanner helper functions
function resolveKey(e) {
  if (e.key && e.key !== 'Unidentified' && e.key.length === 1) return e.key;
  if (e.code) {
    if (e.code.startsWith('Digit')) return e.code.slice(5);
    if (e.code.startsWith('Numpad') && e.code.length === 7) return e.code.slice(6);
    if (e.code.startsWith('Key') && e.code.length === 4) {
      const ch = e.code.slice(3);
      return e.shiftKey ? ch : ch.toLowerCase();
    }
    const sym = { Minus:'-', Equal:'=', BracketLeft:'[', BracketRight:']',
      Backslash:'\\', Semicolon:';', Quote:"'", Backquote:'`',
      Comma:',', Period:'.', Slash:'/' };
    if (sym[e.code]) return sym[e.code];
  }
  return null;
}

function cleanBarcode(raw) {
  return raw.replace(/^[^0-9]+/, '');
}

const Packer = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  
  // 🆕 从 localStorage 恢复筛选设置
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = localStorage.getItem('packerStatusFilter');
    return saved ? JSON.parse(saved) : ['packing', 'waiting', 'holding', 'ready'];
  });
  
  const [showEditedOnly, setShowEditedOnly] = useState(() => {
    const saved = localStorage.getItem('packerShowEditedOnly');
    return saved === 'true';
  });
  
  const [isSorted, setIsSorted] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [packLabelEnabled, setPackLabelEnabled] = useState(false);

  // 🆕 Scanner state
  const [scannerPackerEnabled, setScannerPackerEnabled] = useState(false);
  // 🆕 扫码高亮: { [shopify_order_id]: true }
  const [scanHighlight, setScanHighlight] = useState({});
  // 🆕 临时置顶的 order ids（扫码命中但当前 filter 不可见）
  const [tempVisibleOrders, setTempVisibleOrders] = useState([]);
  // 🆕 no match 弹窗
  const [showNoMatch, setShowNoMatch] = useState(false);
  // 🆕 multiple match 弹窗: { count }
  const [multipleMatchInfo, setMultipleMatchInfo] = useState(null);
  // 🆕 scanner buffer refs
  const barcodeBufferRef = useRef('');
  const barcodeTimerRef = useRef(null);
  // 🆕 orders ref（供 scanner 回调读取最新值）
  const ordersRef = useRef([]);
  // 🆕 statusFilter ref（供 scanner 回调读取最新值）
  const statusFilterRef = useRef(['packing', 'waiting', 'holding', 'ready']);
  // 🆕 tempVisible timers: { [orderId]: timerId }
  const tempVisibleTimersRef = useRef({});

  // 🆕 同步 orders 到 ref
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // 🆕 同步 statusFilter 到 ref
  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  // 🆕 保存筛选设置到 localStorage
  useEffect(() => {
    localStorage.setItem('packerStatusFilter', JSON.stringify(statusFilter));
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem('packerShowEditedOnly', showEditedOnly.toString());
  }, [showEditedOnly]);

  const applyFilters = useCallback(() => {
    let filtered = orders.filter(order => statusFilter.includes(order.orderStatus));
    
    // 如果启用了 "只显示 Edited"，进一步过滤
    if (showEditedOnly) {
      filtered = filtered.filter(order => order.is_edited);
    }
    
    // 如果启用了排序，按订单号排序
    if (isSorted) {
      filtered = filtered.sort((a, b) => {
        const orderNumA = parseInt(a.order_number) || 0;
        const orderNumB = parseInt(b.order_number) || 0;
        return orderNumA - orderNumB;
      });
    }
    
    setFilteredOrders(filtered);
  }, [orders, statusFilter, showEditedOnly, isSorted]);

  useEffect(() => {
    fetchOrders();
    fetchScannerSettings();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, statusFilter, showEditedOnly, isSorted, applyFilters]);

  // 🆕 当 orders 或 statusFilter 改变时，检查 tempVisibleOrders 中的 order 是否已符合当前 filter
  useEffect(() => {
    if (tempVisibleOrders.length === 0) return;
    tempVisibleOrders.forEach(orderId => {
      const order = orders.find(o => o.shopify_order_id === orderId);
      if (order && statusFilter.includes(order.orderStatus)) {
        clearTempVisible(orderId);
      }
    });
  }, [orders, statusFilter, tempVisibleOrders]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      console.log('Fetched orders:', response.data);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  // 🆕 读取 scanner 设置
  const fetchScannerSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      const s = response.data.settings || {};
      setScannerPackerEnabled(s.scanner_enabled === 'true' && s.scanner_packer === 'true');
      setPackLabelEnabled(s.pack_label_enabled === 'true');
    } catch (error) {
      console.error('Error fetching scanner settings:', error);
    }
  };

  // 🆕 清除某个 order 的临时可见状态
  const clearTempVisible = useCallback((orderId) => {
    setTempVisibleOrders(prev => prev.filter(id => id !== orderId));
    setScanHighlight(prev => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    if (tempVisibleTimersRef.current[orderId]) {
      clearTimeout(tempVisibleTimersRef.current[orderId]);
      delete tempVisibleTimersRef.current[orderId];
    }
  }, []);

  // 🆕 滚动到指定 order
  const scrollToOrder = (orderId) => {
    const el = document.getElementById(`packer-order-${orderId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // 🆕 处理 Packer 扫码逻辑
  const handleScan = useCallback((barcode) => {
    const allOrders = ordersRef.current;
    const currentFilter = statusFilterRef.current;

    // 匹配所有 order 中所有 item 的 SKU（不限 status）
    const matchedOrders = allOrders.filter(order =>
      order.lineItems && order.lineItems.some(item => item.sku === barcode)
    );

    if (matchedOrders.length === 0) {
      setShowNoMatch(true);
      return;
    }

    // 高亮所有匹配 order（5秒后恢复）
    matchedOrders.forEach(order => {
      const oid = order.shopify_order_id;
      setScanHighlight(prev => ({ ...prev, [oid]: true }));
      setTimeout(() => {
        setScanHighlight(prev => {
          const next = { ...prev };
          delete next[oid];
          return next;
        });
      }, 5000);
    });

    // 找出当前不可见的匹配 order（因为 filter 原因）
    const hiddenMatches = matchedOrders.filter(
      order => !currentFilter.includes(order.orderStatus)
    );

    // 将隐藏的 order 加入临时可见列表，10秒后自动移除
    hiddenMatches.forEach(order => {
      const oid = order.shopify_order_id;
      if (tempVisibleTimersRef.current[oid]) {
        clearTimeout(tempVisibleTimersRef.current[oid]);
      }
      setTempVisibleOrders(prev => {
        if (prev.includes(oid)) return prev;
        return [oid, ...prev];
      });
      tempVisibleTimersRef.current[oid] = setTimeout(() => {
        clearTempVisible(oid);
      }, 10000);
    });

    if (matchedOrders.length === 1) {
      // 单个匹配：滚动过去，背景变色
      scrollToOrder(matchedOrders[0].shopify_order_id);
    } else {
      // 多个匹配：滚动到第一个，弹窗提示数量
      scrollToOrder(matchedOrders[0].shopify_order_id);
      setMultipleMatchInfo({ count: matchedOrders.length });
    }
  }, [clearTempVisible]);

  // 🆕 scanner 键盘监听
  useEffect(() => {
    if (!scannerPackerEnabled) return;

    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(activeTag)) return;

      if (e.key === 'Enter') {
        clearTimeout(barcodeTimerRef.current);
        const barcode = cleanBarcode(barcodeBufferRef.current.trim());
        barcodeBufferRef.current = '';
        if (barcode.length > 0) handleScan(barcode);
        return;
      }

      const ch = resolveKey(e);
      if (ch) {
        barcodeBufferRef.current += ch;
        clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => {
          barcodeBufferRef.current = '';
        }, 500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(barcodeTimerRef.current);
    };
  }, [scannerPackerEnabled, handleScan]);

  const handleSort = () => {
    setIsSorted(!isSorted);
  };

  const handleStatusClick = async (e, orderId, currentStatus) => {
    e.stopPropagation();
    
    let newStatus;
    if (currentStatus === 'packing') {
      newStatus = 'holding';
    } else if (currentStatus === 'holding') {
      newStatus = 'packing';
    } else if (currentStatus === 'ready') {
      newStatus = 'packing';
    }

    console.log(`Changing order ${orderId} from ${currentStatus} to ${newStatus}`);

    try {
      await axios.patch(`/api/packer/orders/${orderId}`, { status: newStatus });
      await fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const handleOrderClick = (orderId) => {
    console.log('Navigating to order:', orderId);
    navigate(`/packer/${orderId}`);
  };

  const getStatusBadge = (orderStatus) => {
    switch (orderStatus) {
      case 'ready':
        return <Badge tone="success">Ready</Badge>;
      case 'holding':
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '6px',
            backgroundColor: '#9c6ade',
            color: 'white',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            Holding
          </span>
        );
      case 'waiting':
        return <Badge tone="info">Waiting</Badge>;
      default:
        return <Badge>Packing</Badge>;
    }
  };

  const formatDate = (month, day) => {
    if (!month || !day) return '';
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}/${d}`;
  };

  // 计算每种状态的数量
  const getStatusCounts = () => {
    const counts = {
      packing: 0,
      waiting: 0,
      holding: 0,
      ready: 0,
      edited: 0
    };
    
    orders.forEach(order => {
      if (counts.hasOwnProperty(order.orderStatus)) {
        counts[order.orderStatus]++;
      }
      if (order.is_edited) {
        counts.edited++;
      }
    });
    
    return counts;
  };

  const statusCounts = getStatusCounts();

  // 🆕 构建最终显示列表：tempVisibleOrders 置顶 + 普通 filteredOrders
  const displayOrders = React.useMemo(() => {
    if (tempVisibleOrders.length === 0) return filteredOrders;
    const allOrders = ordersRef.current;
    const tempOrders = tempVisibleOrders
      .map(id => allOrders.find(o => o.shopify_order_id === id))
      .filter(Boolean);
    const regularOrders = filteredOrders.filter(
      order => !tempVisibleOrders.includes(order.shopify_order_id)
    );
    return [...tempOrders, ...regularOrders];
  }, [filteredOrders, tempVisibleOrders]);

  const renderItem = (order) => {
    const { 
      shopify_order_id, 
      order_number, 
      name, 
      total_quantity, 
      shipping_title, 
      status,
      orderStatus, 
      box_type, 
      weight, 
      hasWeightWarning,
      hasOutOfStock, // 🆕 out of stock 标记
      transferInfo,
      is_edited,
      packer_note
    } = order;

    // 🆕 扫码高亮背景
    const isHighlighted = !!scanHighlight[shopify_order_id];
    const itemBgStyle = isHighlighted
      ? { backgroundColor: '#fee4ef', transition: 'background-color 0.3s' }
      : { transition: 'background-color 0.3s' };

    return (
      <div id={`packer-order-${shopify_order_id}`} style={itemBgStyle}>
        <ResourceItem
          id={shopify_order_id}
          onClick={() => handleOrderClick(shopify_order_id)}
          verticalAlignment="center"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ flex: 1 }}>
              <BlockStack gap="2">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <Text variant="bodyMd" as="h3" fontWeight="semibold">
                    {name}
                  </Text>
                  {packer_note && (
                    <Text variant="bodySm" tone="subdued">
                      {packer_note}
                    </Text>
                  )}
                </div>
                <Text variant="bodySm" color="subdued">
                  Items: {total_quantity}
                </Text>
              </BlockStack>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {orderStatus === 'ready' && (
                <>
                  {hasWeightWarning && shipping_title && (
                    <Badge tone="info">{shipping_title}</Badge>
                  )}
                  
                  {box_type && (
                    <Badge tone="warning">{box_type}</Badge>
                  )}
                  
                  {weight && (
                    <Badge>{weight}g</Badge>
                  )}
                  
                  {!hasWeightWarning && shipping_title && (
                    <Badge tone="info">{shipping_title}</Badge>
                  )}
                </>
              )}
              
              {orderStatus === 'waiting' && transferInfo && (
                <Text variant="bodySm" fontWeight="bold" tone="info">
                  {transferInfo.transferFroms.join(', ')}, {formatDate(transferInfo.estimateMonth, transferInfo.estimateDay)}
                </Text>
              )}
              
              {/* 🆕 Out of Stock 标记 */}
              {hasOutOfStock && (
                <Badge tone="critical">Out of Stock</Badge>
              )}
              
              {is_edited && (
                <Badge tone="critical">Edited</Badge>
              )}
              
              {hasWeightWarning && (
                <Badge tone="critical">⚠️ Weight</Badge>
              )}
              
              {getStatusBadge(orderStatus)}
              
              <Button onClick={(e) => handleStatusClick(e, shopify_order_id, status)}>
                {status === 'holding' ? 'Undo' : 'Hold'}
              </Button>
            </div>
          </div>
        </ResourceItem>
      </div>
    );
  };

  return (
    <Page
      title="Packer"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
      primaryAction={{
        content: isSorted ? 'Unsort' : 'Sort by Order #',
        icon: SortIcon,
        onAction: handleSort
      }}
      secondaryActions={packLabelEnabled ? [
        {
          content: 'Void/Refund Label',
          onAction: () => setShowRefundModal(true)
        }
      ] : []}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <BlockStack gap="4">
                <div>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">Show orders</Text>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {[
                      { label: `Packing (${statusCounts.packing})`, value: 'packing' },
                      { label: `Waiting (${statusCounts.waiting})`, value: 'waiting' },
                      { label: `Holding (${statusCounts.holding})`, value: 'holding' },
                      { label: `Ready (${statusCounts.ready})`, value: 'ready' }
                    ].map(choice => {
                      const isSelected = statusFilter.includes(choice.value);
                      return (
                        <button
                          key={choice.value}
                          onClick={() => {
                            setStatusFilter(prev =>
                              prev.includes(choice.value)
                                ? prev.filter(v => v !== choice.value)
                                : [...prev, choice.value]
                            );
                          }}
                          style={{
                            padding: '6px 14px', borderRadius: '20px', border: '1px solid #c9cccf',
                            background: isSelected ? '#008060' : 'white',
                            color: isSelected ? 'white' : '#202223',
                            cursor: 'pointer', fontSize: '13px',
                            fontWeight: isSelected ? '600' : '400',
                          }}
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Edited 单独的筛选，改成按钮胶囊（原来是 checkbox） */}
                <div style={{
                  paddingTop: '12px',
                  borderTop: '1px solid #e1e3e5'
                }}>
                  <button
                    onClick={() => setShowEditedOnly(prev => !prev)}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', border: '1px solid #c9cccf',
                      background: showEditedOnly ? '#008060' : 'white',
                      color: showEditedOnly ? 'white' : '#202223',
                      cursor: 'pointer', fontSize: '13px',
                      fontWeight: showEditedOnly ? '600' : '400',
                    }}
                  >
                    Show only Edited orders ({statusCounts.edited})
                  </button>
                </div>
              </BlockStack>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <ResourceList
              items={displayOrders}
              renderItem={renderItem}
              emptyState={<Banner>No orders to pack</Banner>}
            />
          </Card>
        </Layout.Section>
      </Layout>

      {/* 🆕 No match 弹窗 */}
      {showNoMatch && (
        <div
          onClick={() => setShowNoMatch(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer'
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px 40px',
            fontSize: '18px',
            fontWeight: '600',
            color: '#d72c0d',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)'
          }}>
            No match found
          </div>
        </div>
      )}

      {/* 🆕 Multiple match 弹窗 */}
      {multipleMatchInfo && (
        <div
          onClick={() => setMultipleMatchInfo(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer'
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px 40px',
            fontSize: '18px',
            fontWeight: '600',
            color: '#202223',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)'
          }}>
            {multipleMatchInfo.count} orders found
          </div>
        </div>
      )}

      <RefundLabelModal
        open={showRefundModal}
        onClose={() => setShowRefundModal(false)}
      />
    </Page>
  );
};

export default Packer;