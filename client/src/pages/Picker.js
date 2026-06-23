import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Text,
  Badge,
  Button,
  ButtonGroup,
  ChoiceList,
  Modal,
  BlockStack,
  Banner,
  InlineStack,
  Box,
  Toast,
  Frame
} from '@shopify/polaris';
import { SortIcon, ImageIcon } from '@shopify/polaris-icons';
import NumericKeypad from '../components/NumericKeypad';

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

const Picker = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [isSorted, setIsSorted] = useState(() => {
    return localStorage.getItem('pickerSortEnabled') === 'true';
  });
  const [statusFilter, setStatusFilter] = useState(['picking', 'missing', 'picked']);
  const [selectedImage, setSelectedImage] = useState(null);
  const [quantityModal, setQuantityModal] = useState(null);
  const [pickedQuantity, setPickedQuantity] = useState('');
  const [mtl10Inventory, setMtl10Inventory] = useState({});
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [cleanModal, setCleanModal] = useState(null);
  const [isCheckingClean, setIsCheckingClean] = useState(false);
  // 🆕 Conflict toast
  const [conflictToast, setConflictToast] = useState(null); // { message }
  // 🆕 Transfer warning toast
  const [transferToast, setTransferToast] = useState(null); // { message }
  // 🆕 Session ID for heartbeat (stable across renders)
  const sessionIdRef = React.useRef(
    localStorage.getItem('pickerSessionId') || (() => {
      const id = 'sess_' + Math.random().toString(36).slice(2) + '_' + Date.now();
      localStorage.setItem('pickerSessionId', id);
      return id;
    })()
  );
  const pollingRef = React.useRef(null);
  const activeUsersRef = React.useRef(1);

  // 🆕 Scanner state
  const [scannerPickerEnabled, setScannerPickerEnabled] = useState(false);
  // 🆕 扫码高亮: { [itemId]: true }
  const [scanHighlight, setScanHighlight] = useState({});
  // 🆕 临时置顶的 item ids（扫码命中但当前 filter 不可见）
  const [tempVisibleItems, setTempVisibleItems] = useState([]);
  // 🆕 no match 弹窗
  const [showNoMatch, setShowNoMatch] = useState(false);
  // 🆕 scanner buffer refs
  const barcodeBufferRef = useRef('');
  const barcodeTimerRef = useRef(null);
  // 🆕 items ref（供 scanner 回调读取最新值）
  const itemsRef = useRef([]);
  // 🆕 statusFilter ref（供 scanner 回调读取最新值）
  const statusFilterRef = useRef(['picking', 'missing', 'picked']);
  // 🆕 tempVisible timers: { [itemId]: timerId }
  const tempVisibleTimersRef = useRef({});

  // 🆕 同步 items 到 ref
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // 🆕 同步 statusFilter 到 ref
  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  // 🆕 计算每个状态的实时数量（按 quantity 累加）
  const getStatusCounts = useCallback(() => {
    return {
      picking: items
        .filter(item => item.picker_status === 'picking')
        .reduce((sum, item) => sum + item.quantity, 0),
      missing: items
        .filter(item => item.picker_status === 'missing')
        .reduce((sum, item) => sum + item.quantity, 0),
      picked: items
        .filter(item => item.picker_status === 'picked')
        .reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [items]);

  // 🆕 增强的排序函数：先按 type，再按 SKU 数字
  const sortItems = useCallback((itemsToSort) => {
    return [...itemsToSort].sort((a, b) => {
      // 1. 先按 type 排序
      const typeA = (a.sort_type || '').toLowerCase();
      const typeB = (b.sort_type || '').toLowerCase();
      const typeCompare = typeA.localeCompare(typeB);
      
      if (typeCompare !== 0) return typeCompare;
      
      // 2. 相同 type 内按 SKU 数字排序
      const skuA = a.sku || '';
      const skuB = b.sku || '';
      
      // 提取 SKU 中的数字部分
      const numA = parseInt(skuA.match(/\d+/)?.[0] || '0');
      const numB = parseInt(skuB.match(/\d+/)?.[0] || '0');
      
      return numA - numB;
    });
  }, []);

  // 修复：applyFilters 现在会保持排序状态
  const applyFilters = useCallback(() => {
    let filtered = items.filter(item => statusFilter.includes(item.picker_status));
    
    // 🆕 如果当前是排序状态，应用排序（忽略状态，对所有 item 排序）
    if (isSorted) {
      filtered = sortItems(filtered);
    }
    
    setFilteredItems(filtered);
  }, [items, statusFilter, isSorted, sortItems]);

  // 🆕 Smart polling: start/stop based on active user count
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const response = await axios.get('/api/picker/items');
        // Merge: preserve local version numbers, update server data
        setItems(prev => {
          const prevMap = new Map(prev.map(i => [i.id, i]));
          return response.data.map(serverItem => {
            const local = prevMap.get(serverItem.id);
            return serverItem;
          });
        });
      } catch {}
    }, 5000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 🆕 Heartbeat: register presence and check active user count
  const sendHeartbeat = useCallback(async () => {
    try {
      const res = await axios.post('/api/picker/heartbeat', {
        sessionId: sessionIdRef.current
      });
      const count = res.data.activeUsers || 1;
      activeUsersRef.current = count;
      if (count >= 2) {
        startPolling();
      } else {
        stopPolling();
      }
    } catch {}
  }, [startPolling, stopPolling]);

  // 🆕 读取 scanner 设置
  const fetchScannerSettings = useCallback(async () => {
    try {
      const response = await axios.get('/api/settings');
      const s = response.data.settings || {};
      setScannerPickerEnabled(s.scanner_enabled === 'true' && s.scanner_picker === 'true');
    } catch (error) {
      console.error('Error fetching scanner settings:', error);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    sendHeartbeat();
    fetchScannerSettings();

    // Send heartbeat every 15 seconds
    const heartbeatInterval = setInterval(sendHeartbeat, 15000);

    // Handle page visibility (phone switching apps / lock screen)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchItems(); // Immediate refresh when coming back
        sendHeartbeat();
      } else {
        stopPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Remove session on page close
    const handleUnload = () => {
      // sendBeacon is the only reliable way to send on page close
      const blob = new Blob([JSON.stringify({ sessionId: sessionIdRef.current })], 
        { type: 'application/json' });
      navigator.sendBeacon('/api/picker/heartbeat/remove', blob);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleUnload);
      // Clean up session on component unmount
      axios.post('/api/picker/heartbeat/remove', {
        sessionId: sessionIdRef.current
      }).catch(() => {});
    };
  }, [sendHeartbeat, stopPolling, fetchScannerSettings]);

  useEffect(() => {
    applyFilters();
  }, [items, statusFilter, applyFilters]);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/picker/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  // 🆕 查询 MTL10 库存（只查询 picking 且未查询过的 items）
  const handleCheckStock = async () => {
    setIsLoadingInventory(true);
    try {
      // 查询 picking 和 missing 状态且未查询过的 items
      const pickingItems = items.filter(
        item => (item.picker_status === 'picking' || item.picker_status === 'missing') && mtl10Inventory[item.id] === undefined
      );
      
      if (pickingItems.length === 0) {
        setIsLoadingInventory(false);
        return;
      }
      
      const itemIds = pickingItems.map(item => item.id);
      
      console.log(`📦 Checking MTL10 stock for ${itemIds.length} items...`);
      
      const response = await axios.post('/api/picker/items/batch-mtl10-inventory', {
        itemIds
      });
      
      console.log(`✓ Received inventory for ${Object.keys(response.data.inventory).length} items`);
      
      // 🔍 调试：打印返回的数据
      console.log('Inventory data:', response.data.inventory);
      Object.entries(response.data.inventory).forEach(([itemId, data]) => {
        console.log(`  Item ${itemId}:`, data);
      });
      
      // 合并新查询的库存
      setMtl10Inventory(prev => {
        const merged = { ...prev, ...response.data.inventory };
        console.log('Merged inventory:', merged);
        return merged;
      });
    } catch (error) {
      console.error('Error fetching MTL10 inventory:', error);
    } finally {
      setIsLoadingInventory(false);
    }
  };

  // 🆕 Clean 功能：检查已完成的订单
  const handleCheckClean = async () => {
    setIsCheckingClean(true);
    try {
      console.log('🧹 Checking for fulfilled orders...');
      
      const response = await axios.get('/api/picker/check-fulfilled-orders');
      
      console.log('✓ Clean check result:', response.data);
      
      if (response.data.orders.length === 0) {
        // 没有需要清理的订单
        alert('No fulfilled orders found in Picker.');
        return;
      }
      
      // 显示确认弹窗
      setCleanModal({
        orders: response.data.orders,
        item_ids: response.data.item_ids,
        total_items: response.data.total_items,
        total_quantity: response.data.total_quantity
      });
    } catch (error) {
      console.error('Error checking fulfilled orders:', error);
      alert('Error checking fulfilled orders. Please try again.');
    } finally {
      setIsCheckingClean(false);
    }
  };

  // 🆕 Clean 功能：执行清理
  const handleConfirmClean = async () => {
    if (!cleanModal) return;
    
    try {
      console.log(`🗑️ Cleaning ${cleanModal.item_ids.length} items...`);
      
      const response = await axios.post('/api/picker/clean-fulfilled-items', {
        item_ids: cleanModal.item_ids
      });
      
      console.log(`✓ Cleaned ${response.data.deleted_count} items`);
      
      // 关闭弹窗
      setCleanModal(null);
      
      // 重新加载 items
      fetchItems();
      
      alert(`Successfully cleaned ${response.data.deleted_count} items from ${cleanModal.orders.length} fulfilled orders.`);
    } catch (error) {
      console.error('Error cleaning fulfilled items:', error);
      alert('Error cleaning items. Please try again.');
    }
  };

  // 🆕 改进的排序切换函数
  const handleSort = () => {
    const newSortState = !isSorted;
    setIsSorted(newSortState);
    
    // 🆕 持久化到 localStorage
    localStorage.setItem('pickerSortEnabled', newSortState.toString());
    
    if (newSortState) {
      // 启用排序
      const sorted = sortItems(filteredItems);
      setFilteredItems(sorted);
    } else {
      // 取消排序 - 重新应用过滤，不排序
      applyFilters();
    }
  };

  const updateItemStatus = async (itemId, newStatus) => {
    // Find current item to get its version
    const currentItem = items.find(i => i.id === itemId);
    const currentVersion = currentItem?.version ?? 0;

    try {
      const res = await axios.patch(`/api/picker/items/${itemId}/status`, {
        status: newStatus,
        version: currentVersion
      });

      // Update local state with new version
      setItems(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, picker_status: newStatus, version: res.data.newVersion ?? (currentVersion + 1) }
          : item
      ));

      // Transfer warning: item is waiting for transfer
      if (res.data.transferWarning?.type === 'waiting') {
        const loc = res.data.transferWarning.location;
        setTransferToast({
          message: `⚠️ Item is waiting for transfer from MTL${loc}`
        });
        setTimeout(() => setTransferToast(null), 5000);
      }

    } catch (error) {
      if (error.response?.status === 409) {
        // Conflict — another user changed this item
        const currentStatus = error.response.data.currentStatus;
        const newVersion = error.response.data.currentVersion;

        // Update local state to reflect actual current status
        setItems(prev => prev.map(item =>
          item.id === itemId
            ? { ...item, picker_status: currentStatus, version: newVersion }
            : item
        ));

        // Show appropriate conflict message
        let msg = '';
        if (currentStatus === 'picked') {
          msg = 'Item has already been picked';
        } else if (currentStatus === 'missing') {
          msg = 'Item has already been marked as missing';
        } else {
          msg = `Item status changed to: ${currentStatus}`;
        }

        // Special case: was missing, B picked it → also clean up transfer
        if (currentStatus === 'picked' && newStatus === 'picked') {
          msg = 'Status changed from missing to picked by another user';
        }

        setConflictToast({ message: msg });
        setTimeout(() => setConflictToast(null), 5000);
      } else {
        console.error('Error updating status:', error);
      }
    }
  };

  const handleGreenClick = (item) => {
    if (item.picker_status === 'picked') {
      updateItemStatus(item.id, 'picking');
    } else {
      updateItemStatus(item.id, 'picked');
    }
  };

  const handleRedClick = (item) => {
    if (item.quantity === 1) {
      updateItemStatus(item.id, 'missing');
    } else {
      setQuantityModal(item);
      setPickedQuantity('');
    }
  };

  const handleUndoMissing = (item) => {
    updateItemStatus(item.id, 'picking');
  };

  const handleNumberClick = (number) => {
    setPickedQuantity(prev => prev + number);
  };

  const handleBackspace = () => {
    setPickedQuantity(prev => prev.slice(0, -1));
  };

  const handleQuantitySubmit = async () => {
    const qty = parseInt(pickedQuantity);
    
    // 验证：必须是 0 到 quantity-1 之间的数字
    if (isNaN(qty) || qty < 0 || qty >= quantityModal.quantity) {
      alert(`Please enter a valid quantity (0-${quantityModal.quantity - 1})`);
      return;
    }

    try {
      if (qty === 0) {
        // 如果输入 0，直接将整个 item 标记为 missing
        await axios.patch(`/api/picker/items/${quantityModal.id}/status`, { 
          status: 'missing' 
        });
        await fetchItems();
      } else {
        // 如果输入 1 到 quantity-1，调用 split API
        await axios.post(`/api/picker/items/${quantityModal.id}/split`, {
          pickedQuantity: qty
        });
        await fetchItems();
      }
      
      setQuantityModal(null);
      setPickedQuantity('');
      // isSorted 状态会保持，applyFilters 会自动重新排序
    } catch (error) {
      console.error('Error handling quantity:', error);
      alert('Error processing item. Please try again.');
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url && item.url_handle) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand} ${item.title}`
      });
    }
  };

  const getItemBadge = (status) => {
    switch (status) {
      case 'picked':
        return <Badge tone="success">Picked</Badge>;
      case 'missing':
        return <Badge tone="critical">Missing</Badge>;
      default:
        return <Badge>Picking</Badge>;
    }
  };

  // 格式化 SKU：每4位加一个空格
  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  // 🆕 滚动到指定 item
  const scrollToItem = (itemId) => {
    const el = document.getElementById(`picker-item-${itemId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // 🆕 清除某个 item 的临时可见状态
  const clearTempVisible = useCallback((itemId) => {
    setTempVisibleItems(prev => prev.filter(id => id !== itemId));
    setScanHighlight(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    if (tempVisibleTimersRef.current[itemId]) {
      clearTimeout(tempVisibleTimersRef.current[itemId]);
      delete tempVisibleTimersRef.current[itemId];
    }
  }, []);

  // 🆕 处理 Picker 扫码逻辑
  const handleScan = useCallback(async (barcode) => {
    const allItems = itemsRef.current;
    const currentFilter = statusFilterRef.current;

    // 只匹配 picking 和 missing 状态的 item
    const matchedItems = allItems.filter(
      item => item.sku === barcode && (item.picker_status === 'picking' || item.picker_status === 'missing')
    );

    if (matchedItems.length === 0) {
      setShowNoMatch(true);
      return;
    }

    // 高亮所有匹配的 item（5秒后恢复）
    matchedItems.forEach(item => {
      setScanHighlight(prev => ({ ...prev, [item.id]: true }));
      setTimeout(() => {
        setScanHighlight(prev => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }, 5000);
    });

    // 找出当前不可见的匹配 item（因为 filter 原因）
    const hiddenMatches = matchedItems.filter(item => !currentFilter.includes(item.picker_status));

    // 将隐藏的 item 加入临时可见列表，10秒后自动移除
    hiddenMatches.forEach(item => {
      // 如果已经有定时器，先清除
      if (tempVisibleTimersRef.current[item.id]) {
        clearTimeout(tempVisibleTimersRef.current[item.id]);
      }
      setTempVisibleItems(prev => {
        if (prev.includes(item.id)) return prev;
        return [item.id, ...prev];
      });
      tempVisibleTimersRef.current[item.id] = setTimeout(() => {
        clearTempVisible(item.id);
      }, 10000);
    });

    // 找 quantity 为 1 且 picking 的 item，自动 check（status → picked）
    const autoCheckCandidates = matchedItems.filter(
      item => item.picker_status === 'picking' && item.quantity === 1
    );

    if (autoCheckCandidates.length > 0) {
      // 自动 check 第一个
      const target = autoCheckCandidates[0];
      await updateItemStatus(target.id, 'picked');
      // 如果 picked 状态当前不可见，10秒后移除临时可见
      if (!currentFilter.includes('picked')) {
        if (tempVisibleTimersRef.current[target.id]) {
          clearTimeout(tempVisibleTimersRef.current[target.id]);
        }
        setTempVisibleItems(prev => {
          if (prev.includes(target.id)) return prev;
          return [target.id, ...prev];
        });
        tempVisibleTimersRef.current[target.id] = setTimeout(() => {
          clearTempVisible(target.id);
        }, 10000);
      }
      scrollToItem(target.id);
    } else {
      // 没有自动 check，滚动到第一个匹配 item
      scrollToItem(matchedItems[0].id);
    }
  }, [clearTempVisible]);

  // 🆕 scanner 键盘监听
  useEffect(() => {
    if (!scannerPickerEnabled) return;

    const handleKeyDown = (e) => {
      // 如果焦点在 input/textarea 内，忽略
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
  }, [scannerPickerEnabled, handleScan]);

  // 🆕 当 items 状态改变时，检查 tempVisibleItems 中的 item 是否已符合当前 filter
  useEffect(() => {
    if (tempVisibleItems.length === 0) return;
    tempVisibleItems.forEach(itemId => {
      const item = items.find(i => i.id === itemId);
      if (item && statusFilter.includes(item.picker_status)) {
        // 已经符合当前 filter，移除临时可见
        clearTempVisible(itemId);
      }
    });
  }, [items, statusFilter, tempVisibleItems, clearTempVisible]);

  // 🆕 构建最终显示列表：tempVisibleItems 置顶 + 普通 filteredItems
  const displayItems = React.useMemo(() => {
    if (tempVisibleItems.length === 0) return filteredItems;
    const allCurrentItems = itemsRef.current;
    const tempItems = tempVisibleItems
      .map(id => allCurrentItems.find(i => i.id === id))
      .filter(Boolean);
    const regularItems = filteredItems.filter(item => !tempVisibleItems.includes(item.id));
    return [...tempItems, ...regularItems];
  }, [filteredItems, tempVisibleItems]);

  const renderItem = (item) => {
    const { id, quantity, image_url, order_name, display_type, sku, brand, title, size, picker_status, variant_title } = item;

    const displayName = display_type === 'HAIR & SKIN CARE'
      ? `${title} ${size}`.trim()
      : `${brand} ${title} ${size}`.trim();

    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail
          source={image_url}
          alt={title}
          size="large"
        />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    // 🆕 扫码高亮背景
    const isHighlighted = !!scanHighlight[item.id];
    const itemBgColor = isHighlighted ? '#e4fef3' : 'transparent';

    return (
      <div
        id={`picker-item-${item.id}`}
        className="picker-item-container"
        style={{ backgroundColor: itemBgColor, transition: 'background-color 0.3s' }}
      >
        {/* 桌面端：状态标签在右上角 */}
        <div className="picker-item-badge-desktop">
          {getItemBadge(picker_status)}
        </div>

        <div className="picker-item-main">
          {/* 桌面布局 */}
          <div className="picker-item-desktop">
            <div className="picker-item-thumbnail">
              {media}
            </div>

            <div className="picker-item-quantity">
              {quantity}
            </div>

            <div className="picker-item-info">
              <BlockStack gap="1">
                <div style={{ 
                  wordWrap: 'break-word', 
                  overflowWrap: 'break-word'
                }}>
                  <Text variant="bodyLg" fontWeight="bold">
                    {displayName}
                  </Text>
                </div>
                
                {variant_title && (
                  <Text variant="bodyMd">
                    {variant_title}
                  </Text>
                )}
                
                <Text variant="bodySm">
                  {display_type}
                </Text>
                
                <Text variant="bodySm">
                  {formatSKU(sku)}
                </Text>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Text variant="bodySm" tone="subdued">
                    {order_name}
                  </Text>
                  {/* 🆕 Desktop: QOH 显示在订单号右边 */}
                  {mtl10Inventory[id] !== undefined && mtl10Inventory[id] !== null && (
                    <span style={{ fontSize: '12px' }}>
                      <span style={{ color: '#8c9196', fontSize: '11px' }}>QOH </span>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: (typeof mtl10Inventory[id] === 'object' && mtl10Inventory[id].discontinued) ? '#d72c0d' : '#202223' 
                      }}>
                        {typeof mtl10Inventory[id] === 'object' ? mtl10Inventory[id].quantity : mtl10Inventory[id]}
                      </span>
                    </span>
                  )}
                </div>
              </BlockStack>
            </div>

            <div className="picker-item-buttons-desktop">
              {picker_status === 'picked' ? (
                <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-undo">
                  Undo
                </button>
              ) : picker_status === 'missing' ? (
                <button onClick={() => handleUndoMissing(item)} className="picker-btn picker-btn-undo">
                  Undo
                </button>
              ) : (
                <div className="picker-btn-group">
                  <button onClick={() => handleRedClick(item)} className="picker-btn picker-btn-missing">
                    Missing
                  </button>
                  <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-picked">
                    Picked
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 手机布局 */}
          <div className="picker-item-mobile">
            {/* 上半部分：文本信息 */}
            <div className="picker-item-mobile-text">
              <div style={{ marginBottom: '4px' }}>
                <Text variant="bodyMd" fontWeight="bold">
                  {displayName}
                </Text>
              </div>
              
              {/* 添加 variant_title */}
              {variant_title && (
                <div style={{ marginBottom: '4px' }}>
                  <Text variant="bodySm">
                    {variant_title}
                  </Text>
                </div>
              )}
              
              <div style={{ marginBottom: '2px' }}>
                <Text variant="bodySm">
                  {display_type}
                </Text>
              </div>
              <div style={{ marginBottom: '2px' }}>
                <Text variant="bodySm">
                  {formatSKU(sku)}
                </Text>
              </div>
              <div>
                <Text variant="bodySm" tone="subdued">
                  {order_name}
                </Text>
              </div>
            </div>

            {/* 下半部分：图片 + 数量 + 状态&按钮 */}
            <div className="picker-item-mobile-bottom">
              <div className="picker-item-thumbnail-mobile">
                {media}
              </div>

              <div className="picker-item-quantity-mobile">
                {quantity}
                {/* 🆕 Mobile: QOH 显示在 quantity 下方 */}
                {mtl10Inventory[id] !== undefined && mtl10Inventory[id] !== null && (
                  <div style={{ 
                    fontSize: '11px',
                    marginTop: '4px',
                    lineHeight: '1.2'
                  }}>
                    <span style={{ color: '#8c9196', fontSize: '10px' }}>QOH </span>
                    <span style={{ 
                      fontWeight: 'bold', 
                      color: (typeof mtl10Inventory[id] === 'object' && mtl10Inventory[id].discontinued) ? '#d72c0d' : '#202223' 
                    }}>
                      {typeof mtl10Inventory[id] === 'object' ? mtl10Inventory[id].quantity : mtl10Inventory[id]}
                    </span>
                  </div>
                )}
              </div>

              <div className="picker-item-mobile-right">
                <div className="picker-item-badge-mobile">
                  {getItemBadge(picker_status)}
                </div>

                <div className="picker-item-buttons-mobile">
                  {picker_status === 'picked' ? (
                    <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-undo">
                      Undo
                    </button>
                  ) : picker_status === 'missing' ? (
                    <button onClick={() => handleUndoMissing(item)} className="picker-btn picker-btn-undo">
                      Undo
                    </button>
                  ) : (
                    <div className="picker-btn-group-mobile">
                      <button onClick={() => handleRedClick(item)} className="picker-btn picker-btn-missing">
                        Missing
                      </button>
                      <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-picked">
                        Picked
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 🆕 获取实时数量
  const statusCounts = getStatusCounts();

  return (
    <Frame>
      <>
      <style>{`
        /* Picker 响应式样式 */
        .picker-item-container {
          padding: 22px 16px;
          position: relative;
        }

        .picker-item-badge-desktop {
          position: absolute;
          top: 22px;
          right: 16px;
        }

        .picker-item-badge-mobile {
          display: none;
        }

        .picker-item-main {
          display: flex;
          align-items: center;
        }

        .picker-item-desktop {
          display: flex;
          align-items: center;
          width: 100%;
        }

        .picker-item-mobile {
          display: none;
        }

        .picker-item-thumbnail {
          margin-right: 16px;
          flex-shrink: 0;
        }

        .picker-item-quantity {
          font-size: 38px;
          line-height: 1;
          margin-right: 20px;
          margin-top: 5px;
          min-width: 50px;
          flex-shrink: 0;
        }

        .picker-item-info {
          flex: 1;
          margin-left: -30px;
          max-width: calc(100% - 300px);
        }

        .picker-item-buttons-desktop {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          margin-top: 10px;
        }

        .picker-btn-group {
          display: flex;
          gap: 25px;
        }

        .picker-btn {
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }

        .picker-btn-undo {
          background-color: white;
          color: black;
          border: 1px solid #c4cdd5;
          padding: 6px 12px;
          font-size: 13px;
          min-width: 60px;
        }

        .picker-btn-missing {
          background-color: #ec8b84ff;
          color: white;
          border: none;
          padding: 6px 12px;
          font-size: 13px;
          min-width: 60px;
        }

        .picker-btn-picked {
          background-color: #6db477ff;
          color: white;
          border: none;
          padding: 8px 16px;
          font-size: 14px;
          min-width: 80px;
        }

        /* 手机端 ChoiceList 横向布局 */
        @media (max-width: 600px) {
          .Polaris-ChoiceList__Choices {
            display: flex !important;
            flex-direction: row !important;
            gap: 16px !important;
          }

          .Polaris-ChoiceList__Choice {
            margin-bottom: 0 !important;
          }
        }

        /* Modal 和 Keypad 布局修复 */
        .picker-modal-content {
          position: relative;
          min-height: 400px;
        }

        .picker-modal-input-section {
          margin-bottom: 30px;
        }

        .picker-modal-keypad {
          margin-top: 30px;
        }

        /* 手机响应式 (600px 以下) */
        @media (max-width: 600px) {
          .picker-item-container {
            padding: 16px 12px;
          }

          /* 隐藏桌面布局 */
          .picker-item-desktop {
            display: none;
          }

          .picker-item-badge-desktop {
            display: none;
          }

          /* 显示手机布局 */
          .picker-item-mobile {
            display: block;
            width: 100%;
          }

          .picker-item-mobile-text {
            margin-bottom: 12px;
          }

          .picker-item-mobile-bottom {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .picker-item-thumbnail-mobile {
            flex-shrink: 0;
          }

          .picker-item-quantity-mobile {
            font-size: 30px;
            line-height: 1;
            margin-top: 5px;
            min-width: 45px;
            flex-shrink: 0;
          }

          .picker-item-mobile-right {
            margin-left: auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
          }

          .picker-item-badge-mobile {
            display: block;
          }

          .picker-item-buttons-mobile {
            display: flex;
            justify-content: flex-end;
          }

          .picker-btn-group-mobile {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .picker-btn-missing,
          .picker-btn-picked {
            min-width: 70px;
            padding: 6px 12px;
            font-size: 13px;
          }
        }
      `}</style>

      <Page
        title="Picker"
        backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
        primaryAction={{
          content: isSorted ? 'Unsort' : 'Sort by Type',
          icon: SortIcon,
          onAction: handleSort
        }}
        secondaryActions={[
          {
            content: isLoadingInventory ? 'Checking...' : 'Check Stock',
            onAction: handleCheckStock,
            loading: isLoadingInventory,
            disabled: isLoadingInventory
          },
          {
            content: isCheckingClean ? 'Checking...' : 'Clean',
            onAction: handleCheckClean,
            loading: isCheckingClean,
            disabled: isCheckingClean,
            destructive: true
          }
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <ChoiceList
                  title="Show items"
                  choices={[
                    { label: `Picking (${statusCounts.picking})`, value: 'picking' },
                    { label: `Missing (${statusCounts.missing})`, value: 'missing' },
                    { label: `Picked (${statusCounts.picked})`, value: 'picked' }
                  ]}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  allowMultiple
                />
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <div>
                {displayItems.length === 0 ? (
                  <Banner>No items to pick</Banner>
                ) : (
                  displayItems.map(item => (
                    <div key={item.id} style={{ borderBottom: '1px solid #e1e3e5' }}>
                      {renderItem(item)}
                    </div>
                  ))
                )}
                {/* Android 底部导航栏占位，防止最后一个 item 被遮挡 */}
                <div style={{ height: 'var(--shopify-safe-area-inset-bottom, 80px)' }} />
              </div>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Image Modal */}
        <Modal
          open={selectedImage !== null}
          onClose={() => setSelectedImage(null)}
          title={selectedImage?.title || 'Product Image'}
        >
          <Modal.Section>
            {selectedImage && (
              <BlockStack gap="4">
                <Button 
                  url={selectedImage.link} 
                  external
                  variant="primary"
                  fullWidth
                >
                  View Product on Website
                </Button>
                <img 
                  src={selectedImage.url} 
                  alt="Product" 
                  style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }} 
                />
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>

        {/* Quantity Modal */}
        <Modal
          open={quantityModal !== null}
          onClose={() => setQuantityModal(null)}
          title="Enter Picked Quantity"
        >
          <Modal.Section>
            {quantityModal && (
              <div className="picker-modal-content">
                <div className="picker-modal-input-section">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{
                      flex: 1,
                      border: '2px solid #c4cdd5',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      minHeight: '50px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: pickedQuantity ? '#000000' : '#8c9196',
                      fontSize: pickedQuantity ? '24px' : '11px',
                      fontWeight: pickedQuantity ? 'bold' : 'normal',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}>
                      {pickedQuantity || 'Enter the quantity you have, 0 means you have none'}
                    </div>
                    <Button variant="primary" onClick={handleQuantitySubmit}>
                      Submit
                    </Button>
                  </div>
                </div>

                <div className="picker-modal-keypad" style={{ marginTop: '4px' }}>
                  <NumericKeypad
                    onNumberClick={handleNumberClick}
                    onBackspace={handleBackspace}
                  />
                </div>
              </div>
            )}
          </Modal.Section>
        </Modal>
      </Page>

      {/* 🆕 Clean Confirmation Modal */}
      {cleanModal && (
        <Modal
          open={true}
          onClose={() => setCleanModal(null)}
          title="Clean Fulfilled Orders"
          primaryAction={{
            content: 'Proceed',
            onAction: handleConfirmClean,
            destructive: true
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setCleanModal(null)
            }
          ]}
        >
          <Modal.Section>
            <BlockStack gap="4">
              <Text variant="headingMd">
                The following orders have been fulfilled and will be removed from Picker:
              </Text>
              
              <Box>
                {cleanModal.orders.map((order, index) => (
                  <div key={index} style={{ 
                    padding: '12px', 
                    borderBottom: index < cleanModal.orders.length - 1 ? '1px solid #e1e3e5' : 'none' 
                  }}>
                    <Text variant="bodyMd" fontWeight="bold">
                      {order.order_name}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Status: {order.fulfillment_status} | Items: {order.item_count} | Quantity: {order.total_quantity}
                    </Text>
                  </div>
                ))}
              </Box>
              
              <div style={{ 
                padding: '12px', 
                backgroundColor: '#f6f6f7', 
                borderRadius: '8px' 
              }}>
                <Text variant="headingSm">
                  Total: {cleanModal.orders.length} orders, {cleanModal.total_items} items, {cleanModal.total_quantity} units
                </Text>
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

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
    </>
      {/* Conflict toast */}
      {conflictToast && (
        <Toast
          content={conflictToast.message}
          error
          onDismiss={() => setConflictToast(null)}
        />
      )}
      {/* Transfer warning toast */}
      {transferToast && (
        <Toast
          content={transferToast.message}
          onDismiss={() => setTransferToast(null)}
        />
      )}
    </Frame>
  );
};

export default Picker;