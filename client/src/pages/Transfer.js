import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Badge,
  Button,
  Modal,
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame,
} from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';

// 🆕 Scanner helper functions（跟 Picker.js / OrderDetail.js 保持一致）
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

const Transfer = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [clearMode, setClearMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [transferModal, setTransferModal] = useState(null);
  const [transferData, setTransferData] = useState({
    transferQuantity: '',
    transferFrom: '',
    estimateDay: ''
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState(['transferring', 'waiting', 'received']);

  // ── Tag filter state ────────────────────────────────────────────────────────
  // null = no filter, otherwise filter by this value
  const [taskDateFilter, setTaskDateFilter] = useState(null);
  const [shopifyTransferFilter, setShopifyTransferFilter] = useState(null);
  const [transferValidation, setTransferValidation] = useState(null); // result from validate API
  const [isValidating, setIsValidating] = useState(false);
  const [isMarkingTransferred, setIsMarkingTransferred] = useState(false);

  // 🆕 需求2：扫码相关 state
  const [scanHighlight, setScanHighlight] = useState({}); // { [itemId]: 'scanned' | 'confirm_needed' }
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [scannerTransferEnabled, setScannerTransferEnabled] = useState(false);
  const itemsRef = useRef([]);
  const barcodeBufferRef = useRef('');
  const barcodeTimeoutRef = useRef(null);

  // 🆕 需求5/6：Log modal 相关 state
  const [showLogModal, setShowLogModal] = useState(false);
  const [logs, setLogs] = useState([]);

  const showToast = (message) => {
    setToastMessage(message);
    setToastActive(true);
  };

  // 🆕 判断扫到的 barcode 是否匹配该 item：main SKU 或 lookups 里的任一 barcode
  const matchesBarcode = (item, barcode) => {
    if (item.sku === barcode) return true;
    if (item.lookups) {
      return item.lookups.split(',').map(s => s.trim()).includes(barcode);
    }
    return false;
  };

  const fetchItems = useCallback(async () => {
    try {
      const response = await axios.get('/api/transfer/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching transfer items:', error);
      showToast('Error loading transfer items');
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // 🆕 读取 scanner 设置（跟 Picker.js / OrderDetail.js 同一套约定：scanner_enabled 总开关 + scanner_transfer 本页开关）
  const fetchScannerSettings = useCallback(async () => {
    try {
      const response = await axios.get('/api/settings');
      const s = response.data.settings || {};
      setScannerTransferEnabled(s.scanner_enabled === 'true' && s.scanner_transfer === 'true');
    } catch (error) {
      console.error('Error fetching scanner settings:', error);
    }
  }, []);

  useEffect(() => {
    fetchScannerSettings();
  }, [fetchScannerSettings]);

  // 🆕 items 同步到 ref，供扫码键盘监听回调读取最新值（避免闭包拿到旧数据）
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // 🆕 需求5/6：拉取 log 列表
  const fetchLogs = useCallback(async () => {
    try {
      const response = await axios.get('/api/transfer/logs');
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching transfer logs:', error);
      showToast('Error loading logs');
    }
  }, []);

  // ── Grouping logic ──────────────────────────────────────────────────────────

  const getGroupedItems = useCallback(() => {
    let filtered = items;

    // Status filter
    filtered = filtered.filter(item => {
      if (item.out_of_stock === 1) return true; // always show OOS
      if (item.status === 'transferring') return statusFilter.includes('transferring');
      if (item.status === 'waiting') return statusFilter.includes('waiting');
      if (item.status === 'received' || item.status === 'found') return statusFilter.includes('received');
      return true;
    });

    // If tag filter is active, filter all items by that tag
    if (taskDateFilter) {
      filtered = filtered.filter(i => i.connecteam_task_title_date === taskDateFilter);
    }
    if (shopifyTransferFilter) {
      filtered = filtered.filter(i => i.shopify_transfer_number === shopifyTransferFilter);
    }

    // Group 1: transferring + out_of_stock
    const group1 = filtered.filter(
      i => i.out_of_stock === 1 || i.status === 'transferring'
    );
    // Sort: out_of_stock first, then transferring
    group1.sort((a, b) => {
      if (a.out_of_stock === 1 && b.out_of_stock !== 1) return -1;
      if (a.out_of_stock !== 1 && b.out_of_stock === 1) return 1;
      return 0;
    });

    // Group 2+: waiting + received, grouped by transfer_from (ascending)
    const waitingReceived = filtered.filter(
      i => i.out_of_stock !== 1 && (i.status === 'waiting' || i.status === 'received' || i.status === 'found')
    );

    const locationGroups = {};
    for (const item of waitingReceived) {
      const loc = item.transfer_from || 'Unknown';
      if (!locationGroups[loc]) locationGroups[loc] = [];
      locationGroups[loc].push(item);
    }

    // Sort each location group: waiting first, then received
    for (const loc of Object.keys(locationGroups)) {
      locationGroups[loc].sort((a, b) => {
        const aIsWaiting = a.status === 'waiting' ? 0 : 1;
        const bIsWaiting = b.status === 'waiting' ? 0 : 1;
        return aIsWaiting - bIsWaiting;
      });
    }

    const sortedLocations = Object.keys(locationGroups).sort();

    return { group1, locationGroups, sortedLocations };
  }, [items, taskDateFilter, shopifyTransferFilter, statusFilter]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCopy = async (itemId) => {
    try {
      const response = await axios.get(`/api/transfer/items/${itemId}/copy-text`);
      navigator.clipboard.writeText(response.data.copyText);
      showToast('Copied to clipboard!');
    } catch (error) {
      showToast('Error copying text');
    }
  };

  const handleSkuCopy = (sku) => {
    if (!sku) return;
    navigator.clipboard.writeText(sku);
    showToast('SKU copied!');
  };

  const handleClearToggle = () => {
    setClearMode(!clearMode);
    setSelectedItems([]);
  };

  const handleItemSelect = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const handleClearSelected = async () => {
    if (selectedItems.length === 0) return;
    try {
      const response = await axios.post('/api/transfer/items/bulk-delete', { ids: selectedItems });
      await fetchItems();
      setSelectedItems([]);
      setClearMode(false);
      const { deleted, notFound } = response.data;
      showToast(notFound > 0
        ? `Deleted ${deleted} items (${notFound} already deleted)`
        : `Deleted ${deleted} items`
      );
    } catch (error) {
      showToast('Failed to delete items. Please try again.');
    }
  };

  const handleGreenClick = async (item) => {
    const newStatus = item.status === 'transferring' ? 'found' : 'received';
    try {
      const response = await axios.patch(`/api/transfer/items/${item.id}`, { status: newStatus });
      await fetchItems();
      // 🆕 需求3/10：自动 commit 失败（校验不通过或 API 报错）时弹 toast
      const autoCommit = response.data?.autoCommit;
      if (autoCommit && autoCommit.success === false) {
        showToast(`${autoCommit.transferNumber} failed`);
      }
    } catch {
      showToast('Error updating status');
    }
  };

  const handleBlueClick = (item) => {
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity ? item.quantity.toString() : '1',
      transferFrom: '',
      estimateDay: new Date().getDate().toString()
    });
  };

  const handleWaitingBadgeClick = (item) => {
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity ? item.quantity.toString() : '1',
      transferFrom: item.transfer_from || '',
      estimateDay: item.estimate_day ? item.estimate_day.toString() : new Date().getDate().toString()
    });
  };

  const handleReceivedUndo = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: 'waiting' });
      await fetchItems();
      showToast('Status changed to Waiting');
    } catch {
      showToast('Error updating status');
    }
  };

  const handleOutClick = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { out_of_stock: 1 });
      await fetchItems();
      showToast('Marked as Out of Stock');
    } catch {
      showToast('Error updating status');
    }
  };

  const handleOutUndo = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { out_of_stock: 0, status: 'transferring' });
      await fetchItems();
      showToast('Out of Stock status removed');
    } catch {
      showToast('Error updating status');
    }
  };

  const handleTransferSubmit = async () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const day = parseInt(transferData.estimateDay);
    let month = currentMonth;
    if (day < currentDate.getDate()) {
      month = currentMonth === 12 ? 1 : currentMonth + 1;
    }

    if (!transferData.transferFrom) {
      alert('Please enter Transfer From location');
      return;
    }

    try {
      const qty = parseInt(transferData.transferQuantity);
      const originalFrom = transferModal.transfer_from;
      const originalMonth = transferModal.estimate_month;
      const originalDay = transferModal.estimate_day;

      if (qty < transferModal.quantity) {
        await axios.post(`/api/transfer/items/${transferModal.id}/split`, {
          transferQuantity: qty,
          transfer_from: transferData.transferFrom,
          estimate_month: month,
          estimate_day: day
        });
      } else {
        await axios.patch(`/api/transfer/items/${transferModal.id}`, {
          status: 'waiting',
          transfer_from: transferData.transferFrom,
          estimate_month: month,
          estimate_day: day
        });
      }

      // If from location changed and item was already tasked/transferred, mark stale
      const fromChanged = originalFrom && originalFrom !== transferData.transferFrom;
      if (fromChanged && (transferModal.connecteam_tasked || transferModal.shopify_transferred)) {
        await axios.patch(`/api/transfer/items/${transferModal.id}`, { from_location_changed: 1 });
      }

      // 🆕 需求5：Transfer From 或 Estimated Arrival 任一变化，且已经打上 connecteam/shopify tag → 弹提示
      // （log 写入由后端 PATCH /items/:id 自动处理，这里只负责弹这个原生 alert）
      const estimateChanged = originalMonth !== month || originalDay !== day;
      if ((fromChanged || estimateChanged) && (transferModal.connecteam_tasked || transferModal.shopify_transferred)) {
        alert('DO NOT FORGET TO UPDATE CONNECTEAM TASK / SHOPIFY TRANSFER');
      }

      await fetchItems();
      setTransferModal(null);
    } catch {
      showToast('Error updating transfer');
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url && item.url_handle) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand || ''} ${item.title || ''}`
      });
    }
  };

  // 🆕 需求2：滚动到指定 item
  const scrollToItem = (itemId) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`transfer-item-${itemId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  // 🆕 需求2：扫码核心逻辑
  const handleScan = useCallback(async (barcode) => {
    const allItems = itemsRef.current;
    const matched = allItems.filter(item => matchesBarcode(item, barcode));

    if (matched.length === 0) {
      setShowNoMatch(true);
      setTimeout(() => setShowNoMatch(false), 2000);
      return;
    }

    // 优先级：有扫描进度的 waiting item（created_at 最早）> 没进度的 waiting item（created_at 最早）> transferring/received（任选一个）
    const byCreatedAt = (a, b) => new Date(a.created_at) - new Date(b.created_at);
    const inProgress = matched.filter(i => i.status === 'waiting' && (i.received_scanned_count || 0) > 0).sort(byCreatedAt);
    const freshWaiting = matched.filter(i => i.status === 'waiting' && !((i.received_scanned_count || 0) > 0)).sort(byCreatedAt);
    const others = matched.filter(i => i.status !== 'waiting');

    const target = inProgress[0] || freshWaiting[0] || others[0];
    if (!target) {
      setShowNoMatch(true);
      setTimeout(() => setShowNoMatch(false), 2000);
      return;
    }

    // 🆕 命中的 item 如果被当前 filter 挡住，自动打开对应的 filter
    if (target.status === 'transferring' && !statusFilter.includes('transferring')) {
      setStatusFilter(prev => [...prev, 'transferring']);
    }
    if (target.status === 'waiting' && !statusFilter.includes('waiting')) {
      setStatusFilter(prev => [...prev, 'waiting']);
    }
    if ((target.status === 'received' || target.status === 'found') && !statusFilter.includes('received')) {
      setStatusFilter(prev => [...prev, 'received']);
    }
    if (taskDateFilter && target.connecteam_task_title_date !== taskDateFilter) {
      setTaskDateFilter(null);
    }
    if (shopifyTransferFilter && target.shopify_transfer_number !== shopifyTransferFilter) {
      setShopifyTransferFilter(null);
    }

    const flashGreen = (itemId) => {
      setScanHighlight(prev => ({ ...prev, [itemId]: 'scanned' }));
      setTimeout(() => {
        setScanHighlight(prev => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }, 5000);
    };

    // Case A: transferring 或 received/found — 只跳转 + 变绿，不做状态变更
    if (target.status === 'transferring' || target.status === 'received' || target.status === 'found') {
      flashGreen(target.id);
      scrollToItem(target.id);
      return;
    }

    // Case B: waiting + quantity === 1 — 直接变成 received
    if (target.quantity === 1) {
      try {
        const response = await axios.patch(`/api/transfer/items/${target.id}`, { status: 'received' });
        await fetchItems();
        flashGreen(target.id);
        scrollToItem(target.id);
        const autoCommit = response.data?.autoCommit;
        if (autoCommit && autoCommit.success === false) {
          showToast(`${autoCommit.transferNumber} failed`);
        }
      } catch {
        showToast('Error updating status');
      }
      return;
    }

    // Case C: waiting + quantity > 1 — 累加扫描进度
    try {
      const response = await axios.patch(`/api/transfer/items/${target.id}/scan-progress`);
      await fetchItems();
      flashGreen(target.id);
      scrollToItem(target.id);
      if (response.data.completed) {
        const autoCommit = response.data?.autoCommit;
        if (autoCommit && autoCommit.success === false) {
          showToast(`${autoCommit.transferNumber} failed`);
        }
      }
    } catch {
      showToast('Error updating scan progress');
    }
  }, [statusFilter, taskDateFilter, shopifyTransferFilter, fetchItems]);

  // 🆕 扫码枪键盘输入监听（连续快速按键 + Enter 结束）
  useEffect(() => {
    if (!scannerTransferEnabled) return;

    const handleKeyDown = (e) => {
      // 如果焦点在 input/textarea 内，忽略
      const activeTag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(activeTag)) return;

      if (e.key === 'Enter') {
        clearTimeout(barcodeTimeoutRef.current);
        const barcode = cleanBarcode(barcodeBufferRef.current.trim());
        barcodeBufferRef.current = '';
        if (barcode.length > 0) handleScan(barcode);
        return;
      }

      const ch = resolveKey(e);
      if (ch) {
        barcodeBufferRef.current += ch;
        clearTimeout(barcodeTimeoutRef.current);
        barcodeTimeoutRef.current = setTimeout(() => {
          barcodeBufferRef.current = '';
        }, 500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(barcodeTimeoutRef.current);
    };
  }, [scannerTransferEnabled, handleScan]);

  // ── Tag label click ─────────────────────────────────────────────────────────
  const handleTaskLabelClick = (titleDate) => {
    setShopifyTransferFilter(null);
    setTaskDateFilter(prev => prev === titleDate ? null : titleDate);
  };

  const handleShopifyLabelClick = async (transferNumber) => {
    setTaskDateFilter(null);
    const isDeselecting = shopifyTransferFilter === transferNumber;
    setShopifyTransferFilter(isDeselecting ? null : transferNumber);
    setTransferValidation(null);

    if (!isDeselecting) {
      setIsValidating(true);
      try {
        const res = await axios.get(`/api/shopify-transfer/validate/${transferNumber}`);
        setTransferValidation(res.data);
      } catch (err) {
        setTransferValidation({ error: err.response?.data?.error || 'Failed to validate transfer' });
      } finally {
        setIsValidating(false);
      }
    }
  };

  const handleMarkAsTransferred = async () => {
    if (!shopifyTransferFilter) return;
    setIsMarkingTransferred(true);
    try {
      await axios.post('/api/shopify-transfer/mark-transferred', {
        transferNumber: shopifyTransferFilter
      });
      showToast(`Transfer #${shopifyTransferFilter} marked as transferred`);
      setShopifyTransferFilter(null);
      setTransferValidation(null);
      await fetchItems();
    } catch (err) {
      showToast(`Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsMarkingTransferred(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  const formatDate = (month, day) => {
    if (month == null || day == null || month === '' || day === '') return 'N/A';
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  };

  // ── Render item ─────────────────────────────────────────────────────────────

  const renderItem = (item) => {
    if (!item) return null;

    const {
      id,
      quantity = 0,
      image_url,
      order_number = '',
      sku = '',
      brand = '',
      title = '',
      size = '',
      status,
      transfer_from,
      estimate_month,
      estimate_day,
      variant_title,
      out_of_stock,
      connecteam_tasked,
      connecteam_task_title_date,
      from_location_changed,
      shopify_transferred,
      shopify_transfer_number,
      received_scanned_count,
    } = item;

    const isWaitingOrReceived = status === 'waiting' || status === 'received' || status === 'found';

    // 🆕 扫码高亮背景色
    const highlight = scanHighlight[id];
    const itemBgColor = highlight === 'scanned' ? '#e4fef3' : 'transparent';

    // 🆕 quantity > 1 且正在扫描中的进度
    const scanProgress = status === 'waiting' && received_scanned_count > 0 ? received_scanned_count : null;

    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={image_url} alt={title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    // Status badge
    const statusBadge = () => {
      if (out_of_stock === 1) return <Badge tone="critical">Out of Stock</Badge>;
      switch (status) {
        case 'waiting':
          return (
            <span onClick={(e) => { e.stopPropagation(); handleWaitingBadgeClick(item); }} style={{ cursor: 'pointer' }}>
              <Badge tone="info">Waiting</Badge>
            </span>
          );
        case 'received':
        case 'found':
          return (
            <span onClick={(e) => { e.stopPropagation(); handleReceivedUndo(item); }} style={{ cursor: 'pointer' }}>
              <Badge tone="success">Received</Badge>
            </span>
          );
        default:
          return <Badge>Transferring</Badge>;
      }
    };

    // Connecteam tasked tag
    const taskedTag = connecteam_tasked && connecteam_task_title_date ? (
      <span
        onClick={() => handleTaskLabelClick(connecteam_task_title_date)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: '#2998ff',
          color: 'white',
          borderRadius: '12px',
          padding: '2px 8px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {connecteam_task_title_date}
        {from_location_changed === 1 && (
          <span style={{ color: '#ff4444', fontWeight: 'bold', marginLeft: '2px' }}>!</span>
        )}
      </span>
    ) : null;

    // Shopify transfer tag
    const shopifyTag = shopify_transferred && shopify_transfer_number ? (
      <span
        onClick={() => handleShopifyLabelClick(shopify_transfer_number)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: '#96c046',
          color: 'white',
          borderRadius: '12px',
          padding: '2px 8px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {shopify_transfer_number}
        {from_location_changed === 1 && (
          <span style={{ color: '#ff4444', fontWeight: 'bold', marginLeft: '2px' }}>!</span>
        )}
      </span>
    ) : null;

    return (
      <div className="transfer-item-container" id={`transfer-item-${id}`} key={id} style={{ backgroundColor: itemBgColor, transition: 'background-color 0.3s' }}>
        {/* Desktop layout */}
        <div className="transfer-item-desktop">
          <div style={{ marginRight: '16px', flexShrink: 0 }}>
            {media}
          </div>

          <div style={{ fontSize: '38px', lineHeight: 1, marginRight: '20px', marginTop: '5px', minWidth: '50px', flexShrink: 0 }}>
            {scanProgress && (
              <span style={{ color: '#d72c0d' }}>{scanProgress}/</span>
            )}
            {quantity}
          </div>

          <div style={{ flex: 1, maxWidth: 'calc(100% - 350px)' }}>
            <BlockStack gap="1">
              <div style={{ wordWrap: 'break-word', overflowWrap: 'break-word', maxWidth: '60ch' }}>
                <Text variant="bodyLg" fontWeight="bold">{title} {size}</Text>
              </div>
              {variant_title && <Text variant="bodyMd">{variant_title}</Text>}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="bodySm">{formatSKU(sku)}</Text>
                <button onClick={() => handleSkuCopy(sku)} style={btnLinkStyle}>Copy</button>
              </div>
              <Text variant="bodySm" tone="subdued">#{order_number}</Text>

              {/* Tasked + Shopify tags */}
              {isWaitingOrReceived && (taskedTag || shopifyTag) && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {taskedTag}
                  {shopifyTag}
                </div>
              )}
            </BlockStack>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '17px', marginLeft: 'auto' }}>
            {clearMode ? (
              <input type="checkbox" checked={selectedItems.includes(id)} onChange={() => handleItemSelect(id)} style={{ width: '20px', height: '20px' }} />
            ) : (
              <>
                {/* Status badge row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isWaitingOrReceived && transfer_from && out_of_stock !== 1 && estimate_month != null && estimate_day != null && (
                    <Text variant="bodySm" fontWeight="bold" as="span" tone="info">
                      {transfer_from}, {formatDate(estimate_month, estimate_day)}
                    </Text>
                  )}
                  {statusBadge()}
                </div>

                {/* Action buttons */}
                {out_of_stock !== 1 ? (
                  <>
                    {status === 'transferring' && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => handleBlueClick(item)} style={btnTransferStyle}>Transfer</button>
                        <button onClick={() => handleGreenClick(item)} style={btnFoundStyle}>Found</button>
                      </div>
                    )}
                    {status === 'waiting' && (
                      <button onClick={() => handleGreenClick(item)} style={btnReceivedStyle}>Received</button>
                    )}
                  </>
                ) : (
                  <button onClick={() => handleOutUndo(item)} style={btnReceivedStyle}>Undo</button>
                )}

                {/* Bottom row: Undo, OUT, Copy */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {out_of_stock !== 1 && status === 'waiting' && (
                    <button onClick={() => handleReceivedUndo(item)} style={btnSmallStyle}>Undo</button>
                  )}
                  {out_of_stock !== 1 && (status === 'transferring' || status === 'waiting') && (
                    <button onClick={() => handleOutClick(item)} style={btnOutStyle}>OUT</button>
                  )}
                  <button onClick={() => handleCopy(id)} style={btnCopyStyle}>Copy</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="transfer-item-mobile">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', wordBreak: 'break-word', lineHeight: '1.4' }}>{title} {size}</div>
            {variant_title && <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>{variant_title}</div>}
            <div onClick={() => handleSkuCopy(sku)} style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', cursor: 'pointer', color: '#0080FF' }}>
              SKU: {formatSKU(sku)}
            </div>
            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '8px' }}>Order: #{order_number}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              {statusBadge()}
            </div>
            {isWaitingOrReceived && transfer_from && out_of_stock !== 1 && estimate_month != null && estimate_day != null && (
              <div style={{ fontSize: '12px', color: '#0080FF', fontWeight: '600', marginBottom: '8px' }}>
                From: {transfer_from}, Est: {formatDate(estimate_month, estimate_day)}
              </div>
            )}
            {isWaitingOrReceived && (taskedTag || shopifyTag) && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {taskedTag}
                {shopifyTag}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flexShrink: 0 }}>{media}</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', flexShrink: 0, minWidth: '30px', alignSelf: 'center' }}>
              {scanProgress && (
                <span style={{ color: '#d72c0d' }}>{scanProgress}/</span>
              )}
              {quantity}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              {clearMode ? (
                <input type="checkbox" checked={selectedItems.includes(id)} onChange={() => handleItemSelect(id)} style={{ width: '20px', height: '20px' }} />
              ) : (
                <>
                  {out_of_stock !== 1 ? (
                    <>
                      {status === 'transferring' && (
                        <>
                          <button onClick={() => handleBlueClick(item)} style={btnTransferSmStyle}>Transfer</button>
                          <button onClick={() => handleGreenClick(item)} style={btnFoundSmStyle}>Found</button>
                        </>
                      )}
                      {status === 'waiting' && (
                        <button onClick={() => handleGreenClick(item)} style={btnReceivedSmStyle}>Received</button>
                      )}
                      {(status === 'transferring' || status === 'waiting') && (
                        <>
                          {status === 'waiting' && <button onClick={() => handleReceivedUndo(item)} style={btnSmallSmStyle}>Undo</button>}
                          <button onClick={() => handleOutClick(item)} style={btnOutSmStyle}>OUT</button>
                        </>
                      )}
                    </>
                  ) : (
                    <button onClick={() => handleOutUndo(item)} style={btnReceivedSmStyle}>Undo</button>
                  )}
                  <button onClick={() => handleCopy(id)} style={btnCopySmStyle}>Copy</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────

  const { group1, locationGroups, sortedLocations } = getGroupedItems();
  const toastMarkup = toastActive ? <Toast content={toastMessage} onDismiss={() => setToastActive(false)} /> : null;

  // Status counts (from all items, ignoring current filter)
  const statusCounts = {
    transferring: items.filter(i => i.status === 'transferring' && i.out_of_stock !== 1).length,
    waiting: items.filter(i => i.status === 'waiting').length,
    received: items.filter(i => i.status === 'received' || i.status === 'found').length,
  };

  // ── Shopify transfer validation banner ──────────────────────────────────────
  const shopifyValidationBanner = shopifyTransferFilter ? (() => {
    if (isValidating) {
      return (
        <Banner tone="info">
          Checking transfer #{shopifyTransferFilter} in Shopify...
        </Banner>
      );
    }
    if (!transferValidation) return null;
    if (transferValidation.error) {
      return <Banner tone="critical">{transferValidation.error}</Banner>;
    }

    const { isValid, allReceived, canMarkAsTransferred, mismatches, shopifyStatus } = transferValidation;

    // All received + match → show Mark as Transferred button (only if draft)
    if (canMarkAsTransferred && shopifyStatus === 'DRAFT') {
      return (
        <Banner tone="success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span>All items received and match Shopify transfer #{shopifyTransferFilter}.</span>
            <button
              onClick={handleMarkAsTransferred}
              disabled={isMarkingTransferred}
              style={{
                backgroundColor: '#008060',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: isMarkingTransferred ? 'not-allowed' : 'pointer',
                opacity: isMarkingTransferred ? 0.7 : 1,
              }}
            >
              {isMarkingTransferred ? 'Processing...' : 'Mark as Transferred'}
            </button>
          </div>
        </Banner>
      );
    }

    // All received but content doesn't match
    if (allReceived && !isValid) {
      return (
        <Banner tone="critical">
          Content does not match Shopify transfer #{shopifyTransferFilter}.
          {mismatches && mismatches.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {mismatches.map((m, i) => <div key={i} style={{ fontSize: '12px' }}>{m}</div>)}
            </div>
          )}
        </Banner>
      );
    }

    // Not all received yet — show nothing (per requirement)
    return null;
  })() : null;

  const filterBanner = (taskDateFilter || shopifyTransferFilter) ? (
    <Banner
      tone="info"
      onDismiss={() => { setTaskDateFilter(null); setShopifyTransferFilter(null); setTransferValidation(null); }}
    >
      {taskDateFilter
        ? `Showing items in Connecteam task: ${taskDateFilter}`
        : `Showing items in Shopify transfer: #${shopifyTransferFilter}`
      }
      {' '}<button
        onClick={() => { setTaskDateFilter(null); setShopifyTransferFilter(null); setTransferValidation(null); }}
        style={{ background: 'none', border: 'none', color: '#005bd3', cursor: 'pointer', padding: 0, fontSize: '14px' }}
      >
        Clear filter
      </button>
    </Banner>
  ) : null;

  const currentMonth = new Date().getMonth() + 1;

  return (
    <>
      <style>{`
        .transfer-item-container { padding: 22px 16px; border-bottom: 1px solid #e1e3e5; position: relative; }
        .transfer-item-desktop { display: flex; align-items: center; width: 100%; }
        .transfer-item-mobile { display: none; }
        @media (max-width: 600px) {
          .transfer-item-container { padding: 16px; }
          .transfer-item-desktop { display: none; }
          .transfer-item-mobile { display: block; width: 100%; }
        }
      `}</style>

      <Frame>
        <Page
          title="Transfer"
          backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
          primaryAction={
            clearMode
              ? { content: 'Delete Selected', destructive: true, onAction: handleClearSelected }
              : undefined
          }
          secondaryActions={
            clearMode
              ? [{ content: 'Cancel', onAction: () => { setClearMode(false); setSelectedItems([]); } }]
              : [
                  { content: 'Transfer Planner', onAction: () => navigate('/transfer-planner') },
                  { content: 'Clear Mode', onAction: handleClearToggle },
                  { content: 'Connecteam Task', onAction: () => navigate('/connecteam-task') },
                  { content: 'Shopify Transfer', onAction: () => navigate('/shopify-transfer') },
                  { content: 'Log', onAction: () => { fetchLogs(); setShowLogModal(true); } },
                ]
          }
        >
          <Layout>
            {/* Status filter card */}
            <Layout.Section>
              <Card>
                <div style={{ padding: '16px' }}>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">Show items</Text>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {[
                      { label: `Transferring (${statusCounts.transferring})`, value: 'transferring' },
                      { label: `Waiting (${statusCounts.waiting})`, value: 'waiting' },
                      { label: `Received (${statusCounts.received})`, value: 'received' },
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
              </Card>
            </Layout.Section>

            {/* Filter banner */}
            {filterBanner && (
              <Layout.Section>
                {filterBanner}
              </Layout.Section>
            )}

            {/* Shopify transfer validation banner */}
            {shopifyValidationBanner && (
              <Layout.Section>
                {shopifyValidationBanner}
              </Layout.Section>
            )}

            {/* Card 1: Transferring + Out of Stock */}
            {group1.length > 0 && (
              <Layout.Section>
                <Card>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e1e3e5' }}>
                    <Text variant="headingSm" as="h3">Transferring & Out of Stock</Text>
                  </div>
                  <div>
                    {group1.map(item => renderItem(item))}
                  </div>
                </Card>
              </Layout.Section>
            )}

            {/* Cards by location */}
            {sortedLocations.map(loc => (
              <Layout.Section key={loc}>
                <Card>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e1e3e5' }}>
                    <Text variant="headingSm" as="h3">MTL{loc}</Text>
                  </div>
                  <div>
                    {locationGroups[loc].map(item => renderItem(item))}
                  </div>
                </Card>
              </Layout.Section>
            ))}

            {/* Empty state */}
            {group1.length === 0 && sortedLocations.length === 0 && (
              <Layout.Section>
                <Card>
                  <Banner>No items to transfer</Banner>
                </Card>
              </Layout.Section>
            )}
          </Layout>

          {/* Image modal */}
          <Modal open={selectedImage !== null} onClose={() => setSelectedImage(null)} title={selectedImage?.title || 'Product Image'}>
            <Modal.Section>
              {selectedImage && (
                <BlockStack gap="4">
                  <img src={selectedImage.url} alt="Product" style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }} />
                  <Button url={selectedImage.link} external variant="primary" fullWidth>View Product on Website</Button>
                </BlockStack>
              )}
            </Modal.Section>
          </Modal>

          {/* Transfer info modal */}
          <Modal
            open={transferModal !== null}
            onClose={() => setTransferModal(null)}
            title="Transfer Information"
            primaryAction={{ content: 'Submit', onAction: handleTransferSubmit }}
            secondaryActions={[{ content: 'Cancel', onAction: () => setTransferModal(null) }]}
          >
            <Modal.Section>
              {transferModal && (
                <BlockStack gap="4">
                  {transferModal.quantity > 1 && (
                    <TextField
                      label="Transfer Quantity"
                      type="number"
                      value={transferData.transferQuantity}
                      onChange={(value) => setTransferData({ ...transferData, transferQuantity: value })}
                      max={transferModal.quantity}
                      autoComplete="off"
                    />
                  )}
                  <TextField
                    label="Transfer From (warehouse number)"
                    value={transferData.transferFrom}
                    onChange={(value) => setTransferData({ ...transferData, transferFrom: value })}
                    placeholder="e.g., 01, 02, 03"
                    autoComplete="off"
                  />
                  <div>
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Estimated Arrival (Month/Day)</Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <TextField type="number" value={currentMonth.toString()} onChange={() => {}} disabled prefix="Month:" autoComplete="off" />
                      </div>
                      <Text variant="bodyLg">/</Text>
                      <div style={{ flex: 1 }}>
                        <TextField type="number" value={transferData.estimateDay} onChange={(value) => setTransferData({ ...transferData, estimateDay: value })} min={1} max={31} prefix="Day:" autoComplete="off" />
                      </div>
                    </div>
                  </div>
                </BlockStack>
              )}
            </Modal.Section>
          </Modal>

          {/* 🆕 Log modal（需求5/6，混排展示，全英文） */}
          <Modal
            open={showLogModal}
            onClose={() => setShowLogModal(false)}
            title="Log"
            secondaryActions={[
              { content: 'Clear All', destructive: true, onAction: async () => {
                  try {
                    await axios.delete('/api/transfer/logs');
                    setLogs([]);
                  } catch {
                    showToast('Failed to clear logs');
                  }
                }
              },
              { content: 'Close', onAction: () => setShowLogModal(false) },
            ]}
          >
            <Modal.Section>
              {logs.length === 0 ? (
                <Text as="p">No log entries.</Text>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e1e3e5', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Type</th>
                        <th style={{ padding: '8px' }}>SKU</th>
                        <th style={{ padding: '8px' }}>Qty</th>
                        <th style={{ padding: '8px' }}>Details</th>
                        <th style={{ padding: '8px' }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #e1e3e5' }}>
                          <td style={{ padding: '8px' }}>
                            {log.log_type === 'plan_changed' && 'Plan changed'}
                            {log.log_type === 'received' && 'Item received'}
                            {log.log_type === 'commit_failed' && 'Auto-commit failed'}
                          </td>
                          <td style={{ padding: '8px' }}>{log.sku || '—'}</td>
                          <td style={{ padding: '8px' }}>{log.quantity ?? '—'}</td>
                          <td style={{ padding: '8px' }}>
                            {log.log_type === 'plan_changed' && (
                              <>
                                {log.old_transfer_from || '—'} {formatDate(log.old_estimate_month, log.old_estimate_day)}
                                {' → '}
                                {log.new_transfer_from || '—'} {formatDate(log.new_estimate_month, log.new_estimate_day)}
                              </>
                            )}
                            {log.log_type === 'received' && (
                              <>From {log.transfer_from || '—'}, Order #{log.order_number || '—'}</>
                            )}
                            {log.log_type === 'commit_failed' && (
                              <>Transfer #{log.shopify_transfer_number}: {log.error_message}</>
                            )}
                          </td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Modal.Section>
          </Modal>

          {/* 🆕 No match 提示（2秒自动消失） */}
          {showNoMatch && (
            <div
              style={{
                position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
                zIndex: 9999, pointerEvents: 'none'
              }}
            >
              <div style={{
                backgroundColor: '#d72c0d', color: 'white', borderRadius: '8px',
                padding: '12px 24px', fontSize: '15px', fontWeight: '600',
                boxShadow: '0 4px 24px rgba(0,0,0,0.18)'
              }}>
                No match found
              </div>
            </div>
          )}

          {toastMarkup}
        </Page>
      </Frame>
    </>
  );
};

// ── Button styles ─────────────────────────────────────────────────────────────

const btnLinkStyle = { background: 'none', border: 'none', color: '#005bd3', cursor: 'pointer', fontSize: '12px', padding: 0 };

const btnTransferStyle = { backgroundColor: 'white', color: '#0080FF', border: '2px solid #0080FF', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', minWidth: '80px' };
const btnFoundStyle = { backgroundColor: '#00A047', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', minWidth: '80px' };
const btnReceivedStyle = { backgroundColor: '#0080FF', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', minWidth: '100px' };
const btnSmallStyle = { backgroundColor: 'white', color: '#6d7175', border: '1px solid #6d7175', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', minWidth: '60px' };
const btnOutStyle = { backgroundColor: 'white', color: '#D72C0D', border: '1px solid #D72C0D', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', minWidth: '60px' };
const btnCopyStyle = { backgroundColor: 'white', color: '#202223', border: '1px solid #c9cccf', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', minWidth: '60px' };

// Mobile variants
const btnTransferSmStyle = { ...btnTransferStyle, padding: '6px 12px', fontSize: '13px' };
const btnFoundSmStyle = { ...btnFoundStyle, padding: '6px 12px', fontSize: '13px' };
const btnReceivedSmStyle = { ...btnReceivedStyle, padding: '6px 12px', fontSize: '13px' };
const btnSmallSmStyle = { ...btnSmallStyle };
const btnOutSmStyle = { ...btnOutStyle };
const btnCopySmStyle = { ...btnCopyStyle };

export default Transfer;