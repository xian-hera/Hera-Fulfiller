import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Button,
  Modal,
  Banner,
  BlockStack,
  TextField,
  Badge
} from '@shopify/polaris';
import { ImageIcon, ChevronLeftIcon, ChevronRightIcon } from '@shopify/polaris-icons';
import WeightInputModal from '../components/WeightInputModal';
import CompleteOrderModal from '../components/CompleteOrderModal';

// 🆕 Scanner helper functions (从 ManagerRestockPlan.js 移植)
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

const OrderDetail = () => {
  const navigate = useNavigate();
  const { shopifyOrderId } = useParams();
  const [order, setOrder] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isSorted, setIsSorted] = useState(false);
  
  // Modal 状态
  const [weightModal, setWeightModal] = useState(null);
  const [completeModal, setCompleteModal] = useState(false);
  const [boxTypes, setBoxTypes] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Note 功能状态
  const [noteModal, setNoteModal] = useState(false);
  const [noteValue, setNoteValue] = useState('');
  const [quantityConfirmStates, setQuantityConfirmStates] = useState({});

  // 🆕 Pack & Label It 状态
  const [packLabelEnabled, setPackLabelEnabled] = useState(false);
  const [labelOptions, setLabelOptions] = useState({
    signature: false,
    cardForPickup: false,
    leaveAtDoor: false
  });
  const [labelOptionsSaved, setLabelOptionsSaved] = useState({
    signature: false,
    cardForPickup: false,
    leaveAtDoor: false
  });
  const [labelOptionsLoading, setLabelOptionsLoading] = useState(false);
  const [labelOptionsOpen, setLabelOptionsOpen] = useState(false);
  // 错误状态 card
  const [labelStatus, setLabelStatus] = useState(null);
  const [labelError, setLabelError] = useState(null);
  const [labelTrackingNumber, setLabelTrackingNumber] = useState(null);
  const [fulfillStatus, setFulfillStatus] = useState(null);
  const [fulfillError, setFulfillError] = useState(null);

  // 🆕 Scanner mode 状态
  const [scannerPackingOrdersEnabled, setScannerPackingOrdersEnabled] = useState(false);
  // 🆕 扫码高亮状态: { [itemId]: 'scanned' | 'already_checked' | 'confirm_needed' }
  const [scanHighlight, setScanHighlight] = useState({});
  // 🆕 no match 弹窗
  const [showNoMatch, setShowNoMatch] = useState(false);
  // 🆕 单次点击提示（scanner 模式下 check 需点击4次）
  const [showScanHint, setShowScanHint] = useState(false);
  const scanHintTimerRef = useRef(null);
  // 🆕 检查是否在4小时内已点击 "Got it"
  const isScanHintSuppressed = () => {
    const ts = localStorage.getItem('scanHintSuppressedUntil');
    if (!ts) return false;
    return Date.now() < parseInt(ts, 10);
  };
  // 🆕 四次点击相关 refs: { [itemId]: count }
  const tapCountRef = useRef({});
  const tapTimerRef = useRef({});
  // 🆕 scanner buffer refs
  const barcodeBufferRef = useRef('');
  const barcodeTimerRef = useRef(null);
  // 🆕 lineItems ref（供 scanner 回调中读取最新值）
  const lineItemsRef = useRef([]);
  // 🆕 quantityConfirmStates ref（供 scanner 回调中读取最新值）
  const quantityConfirmStatesRef = useRef({});
  // 🆕 pending scan-confirm: 记录等待二次扫码确认的 itemId
  const pendingScanConfirmRef = useRef(null);

  // 🆕 同步 lineItems 到 ref
  useEffect(() => {
    lineItemsRef.current = lineItems;
  }, [lineItems]);

  // 🆕 同步 quantityConfirmStates 到 ref
  useEffect(() => {
    quantityConfirmStatesRef.current = quantityConfirmStates;
  }, [quantityConfirmStates]);

  useEffect(() => {
    fetchAllOrders();
    fetchScannerSettings();
    fetchPackLabelSettings();
  }, []);

  useEffect(() => {
    if (shopifyOrderId) {
      fetchOrderDetail();
      fetchLabelOptions();
    }
  }, [shopifyOrderId]);

  useEffect(() => {
    applyPackerFilters();
  }, [allOrders]);

  // 🆕 读取 scanner 设置
  const fetchScannerSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      const s = response.data.settings || {};
      setScannerPackingOrdersEnabled(s.scanner_enabled === 'true' && s.scanner_packing_orders === 'true');
    } catch (error) {
      console.error('Error fetching scanner settings:', error);
    }
  };

  // 🆕 读取 Pack & Label It 是否启用
  const fetchPackLabelSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      const s = response.data.settings || {};
      setPackLabelEnabled(s.pack_label_enabled === 'true');
    } catch (error) {
      console.error('Error fetching pack label settings:', error);
    }
  };

  // 🆕 读取该订单的 label options 和错误状态
  const fetchLabelOptions = async () => {
    if (!shopifyOrderId) return;
    try {
      const response = await axios.get(`/api/packer/orders/${shopifyOrderId}/label-options`);
      const data = response.data;

      if (data.labelOptions) {
        setLabelOptions(data.labelOptions);
        setLabelOptionsSaved(data.labelOptions);
      }
      setLabelStatus(data.labelStatus || null);
      setLabelError(data.labelError || null);
      setLabelTrackingNumber(data.labelTrackingNumber || null);
      setFulfillStatus(data.fulfillStatus || null);
      setFulfillError(data.fulfillError || null);
    } catch (error) {
      console.error('Error fetching label options:', error);
    }
  };

  // 🆕 保存 label options
  const handleLabelOptionsSave = async () => {
    setLabelOptionsLoading(true);
    try {
      await axios.patch(`/api/packer/orders/${shopifyOrderId}/label-options`, { labelOptions });
      setLabelOptionsSaved({ ...labelOptions });
      setMessage('Label options saved');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving label options:', error);
      setMessage('Error saving label options');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLabelOptionsLoading(false);
    }
  };

  const fetchAllOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      const sorted = response.data.sort((a, b) => {
        const numA = parseInt(a.order_number) || 0;
        const numB = parseInt(b.order_number) || 0;
        return numA - numB;
      });
      console.log('All orders sorted:', sorted.map(o => `${o.order_number}(${o.orderStatus})`));
      setAllOrders(sorted);
    } catch (error) {
      console.error('Error fetching all orders:', error);
    }
  };

  const applyPackerFilters = () => {
    try {
      const savedFilters = localStorage.getItem('packerStatusFilter');
      const statusFilter = savedFilters ? JSON.parse(savedFilters) : ['packing', 'waiting', 'holding', 'ready'];
      
      console.log('Applying Packer filters:', statusFilter);
      console.log('All orders:', allOrders.map(o => `${o.order_number}: ${o.orderStatus || o.status}`));
      
      const filtered = allOrders.filter(order => {
        const status = order.orderStatus || order.status;
        const match = statusFilter.includes(status);
        console.log(`Order ${order.order_number}: orderStatus=${status}, match=${match}`);
        return match;
      });
      
      console.log('Filtered orders:', filtered.map(o => `${o.order_number}(${o.orderStatus || o.status})`));
      console.log('Filtered orders count:', filtered.length);
      setFilteredOrders(filtered);
    } catch (error) {
      console.error('Error applying packer filters:', error);
      setFilteredOrders(allOrders);
    }
  };

  const fetchOrderDetail = async () => {
    try {
      const response = await axios.get(`/api/packer/orders/${shopifyOrderId}`);
      console.log('Current order:', response.data.order_number);
      setOrder(response.data);
      setLineItems(response.data.lineItems);
      setNoteValue(response.data.packer_note || '');
      await fetchBoxTypes();
    } catch (error) {
      console.error('Error fetching order details:', error);
    }
  };

  const fetchBoxTypes = async () => {
    try {
      const response = await axios.get('/api/settings/box-types');
      setBoxTypes(response.data);
    } catch (error) {
      console.error('Error fetching box types:', error);
    }
  };

  const handleNoteSave = async () => {
    if (noteValue.length > 50) {
      setMessage('Note must be 50 characters or less');
      return;
    }

    try {
      await axios.patch(`/api/packer/orders/${shopifyOrderId}/note`, {
        note: noteValue
      });
      await fetchOrderDetail();
      setNoteModal(false);
      setMessage('Note saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving note:', error);
      setMessage('Error saving note');
    }
  };

  const handleNoteDelete = async () => {
    try {
      await axios.patch(`/api/packer/orders/${shopifyOrderId}/note`, {
        note: ''
      });
      setNoteValue('');
      await fetchOrderDetail();
      setMessage('Note deleted successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting note:', error);
      setMessage('Error deleting note');
    }
  };

  const handleDeleteOrder = async () => {
    if (!window.confirm(`Are you sure you want to delete order ${order.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`/api/packer/orders/${shopifyOrderId}`);
      setMessage('Order deleted successfully');
      setTimeout(() => {
        navigate('/packer');
      }, 1000);
    } catch (error) {
      console.error('Error deleting order:', error);
      setMessage('Error deleting order');
    }
  };

  const findPreviousOrder = () => {
    if (!order || filteredOrders.length === 0) return null;
    
    const currentNum = parseInt(order.order_number);
    console.log('Finding previous order in filtered list, current:', currentNum);
    console.log('Filtered orders:', filteredOrders.map(o => o.order_number));
    
    for (let i = filteredOrders.length - 1; i >= 0; i--) {
      const orderNum = parseInt(filteredOrders[i].order_number) || 0;
      if (orderNum < currentNum) {
        console.log('Found previous order:', filteredOrders[i].order_number);
        return filteredOrders[i];
      }
    }
    console.log('No previous order found in filtered list');
    return null;
  };

  const findNextOrder = () => {
    if (!order || filteredOrders.length === 0) return null;
    
    const currentNum = parseInt(order.order_number);
    console.log('Finding next order in filtered list, current:', currentNum);
    console.log('Filtered orders:', filteredOrders.map(o => o.order_number));
    
    for (let i = 0; i < filteredOrders.length; i++) {
      const orderNum = parseInt(filteredOrders[i].order_number) || 0;
      if (orderNum > currentNum) {
        console.log('Found next order:', filteredOrders[i].order_number);
        return filteredOrders[i];
      }
    }
    console.log('No next order found in filtered list');
    return null;
  };

  const handlePreviousOrder = () => {
    const prevOrder = findPreviousOrder();
    if (prevOrder) {
      console.log('Navigating to previous order:', prevOrder.shopify_order_id);
      navigate(`/packer/${prevOrder.shopify_order_id}`);
    }
  };

  const handleNextOrder = () => {
    const nextOrder = findNextOrder();
    if (nextOrder) {
      console.log('Navigating to next order:', nextOrder.shopify_order_id);
      navigate(`/packer/${nextOrder.shopify_order_id}`);
    }
  };

  const handleSort = () => {
    if (!isSorted) {
      const sorted = [...lineItems].sort((a, b) => {
        const statusOrder = {
          packing: 1,
          waiting: 2,
          transferring: 3,
          ready: 4,
          received: 5
        };
        return statusOrder[getItemStatus(a)] - statusOrder[getItemStatus(b)];
      });
      setLineItems(sorted);
      setIsSorted(true);
    } else {
      const currentStatusMap = new Map(lineItems.map(item => [item.id, item.packer_status]));
      const restored = order.lineItems.map(item => ({
        ...item,
        packer_status: currentStatusMap.get(item.id) || item.packer_status
      }));
      setLineItems(restored);
      setIsSorted(false);
    }
  };

  const getItemStatus = (item) => {
    if (item.transferStatus === 'transferring') return 'transferring';
    if (item.transferStatus === 'waiting') return 'waiting';
    if (item.packer_status === 'ready') {
      return item.transferStatus === 'received' ? 'received' : 'ready';
    }
    return 'packing';
  };

  // 🆕 实际执行 check/uncheck 的核心逻辑（供点击和扫码共用）
  const doItemCheck = useCallback(async (item) => {
    const itemId = item.id;
    const currentState = quantityConfirmStatesRef.current[itemId] || {};

    // 拦截：数量 >= 2 的第1次操作
    if (item.quantity >= 2 && item.packer_status !== 'ready') {
      if (!currentState.needsConfirm) {
        setQuantityConfirmStates(prev => ({
          ...prev,
          [itemId]: { needsConfirm: true, confirmed: false }
        }));
        return;
      }
    }

    if (item._updating) return;

    const newStatus = item.packer_status === 'ready' ? 'packing' : 'ready';

    try {
      setLineItems(prev => prev.map(li =>
        li.id === item.id ? { ...li, _updating: true } : li
      ));

      await axios.patch(`/api/packer/items/${item.id}/packer-status`, {
        status: newStatus
      });

      const updatedItems = lineItemsRef.current.map(li =>
        li.id === item.id ? { ...li, packer_status: newStatus, _updating: false } : li
      );
      setLineItems(updatedItems);

      // 更新确认状态
      if (newStatus === 'packing') {
        // 取消 check 时重置
        setQuantityConfirmStates(prev => {
          const newState = { ...prev };
          delete newState[itemId];
          return newState;
        });
      } else if (newStatus === 'ready' && item.quantity >= 2) {
        // check 成功时标记已确认
        setQuantityConfirmStates(prev => ({
          ...prev,
          [itemId]: { needsConfirm: true, confirmed: true }
        }));
      }

      const allReady = updatedItems.every(li => li.packer_status === 'ready');

      if (allReady && newStatus === 'ready') {
        setCompleteModal(true);
      }
    } catch (error) {
      console.error('Error updating item status:', error);
      setLineItems(prev => prev.map(li =>
        li.id === item.id ? { ...li, _updating: false } : li
      ));
      setMessage('Error updating item status');
      setTimeout(() => setMessage(''), 3000);
    }
  }, []);

  // 🆕 处理圆圈点击：scanner 模式下需点击4次才能 check，uncheck 保持单次点击
  const handleItemClick = async (item) => {
    // uncheck（已 ready）：始终单次点击生效
    if (item.packer_status === 'ready') {
      await doItemCheck(item);
      return;
    }

    // 非 scanner 模式：原有逻辑
    if (!scannerPackingOrdersEnabled) {
      await doItemCheck(item);
      return;
    }

    // scanner 模式下，需要点击4次才能 check
    const itemId = item.id;
    const current = tapCountRef.current[itemId] || 0;
    const next = current + 1;
    tapCountRef.current[itemId] = next;

    // 重置计时器：2秒内没有继续点击则清零
    if (tapTimerRef.current[itemId]) {
      clearTimeout(tapTimerRef.current[itemId]);
    }
    tapTimerRef.current[itemId] = setTimeout(() => {
      tapCountRef.current[itemId] = 0;
    }, 2000);

    if (next < 4) {
      // 不足4次：显示提示（除非用户已 suppress）
      if (!isScanHintSuppressed()) {
        setShowScanHint(true);
        clearTimeout(scanHintTimerRef.current);
        scanHintTimerRef.current = setTimeout(() => setShowScanHint(false), 4000);
      }
      return;
    }

    // 达到4次：执行 check，重置计数
    tapCountRef.current[itemId] = 0;
    clearTimeout(tapTimerRef.current[itemId]);
    setShowScanHint(false);
    await doItemCheck(item);
  };

  // 🆕 滚动到指定 item
  const scrollToItem = (itemId) => {
    const el = document.getElementById(`order-item-${itemId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // 🆕 处理扫码匹配逻辑
  const handleScan = useCallback(async (barcode) => {
    const items = lineItemsRef.current;
    const confirmStates = quantityConfirmStatesRef.current;

    // 与当前 order 内所有 item 的 SKU 比对
    const matchedItems = items.filter(item => item.sku === barcode);

    if (matchedItems.length === 0) {
      setShowNoMatch(true);
      return;
    }

    // 检查是否是二次确认扫码（pending scan confirm）
    if (pendingScanConfirmRef.current !== null) {
      const pendingItemId = pendingScanConfirmRef.current;
      const pendingItem = items.find(i => i.id === pendingItemId && i.sku === barcode);
      if (pendingItem) {
        // 二次扫码确认，执行 check
        pendingScanConfirmRef.current = null;
        setScanHighlight(prev => {
          const next = { ...prev };
          delete next[pendingItemId];
          return next;
        });
        await doItemCheck(pendingItem);
        // check 后背景绿色
        setScanHighlight(prev => ({ ...prev, [pendingItemId]: 'scanned' }));
        setTimeout(() => {
          setScanHighlight(prev => {
            const next = { ...prev };
            delete next[pendingItemId];
            return next;
          });
        }, 5000);
        scrollToItem(pendingItemId);
        return;
      }
    }

    // 找未被 check 的 match
    const uncheckedMatches = matchedItems.filter(item => item.packer_status !== 'ready');
    const checkedMatches = matchedItems.filter(item => item.packer_status === 'ready');

    if (uncheckedMatches.length === 0) {
      // 所有 match 都已 checked：高亮绿色，滚动到第一个
      checkedMatches.forEach(item => {
        setScanHighlight(prev => ({ ...prev, [item.id]: 'already_checked' }));
        setTimeout(() => {
          setScanHighlight(prev => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
        }, 5000);
      });
      scrollToItem(checkedMatches[0].id);
      return;
    }

    // 有未 checked 的 match
    // 找第一个未 checked 的
    const firstUnchecked = uncheckedMatches[0];

    if (firstUnchecked.quantity >= 2) {
      const confirmState = confirmStates[firstUnchecked.id] || {};
      if (!confirmState.needsConfirm) {
        // 第一次扫码：需要二次确认
        // 高亮粉色，显示 confirm quantity
        setScanHighlight(prev => ({ ...prev, [firstUnchecked.id]: 'confirm_needed' }));
        setQuantityConfirmStates(prev => ({
          ...prev,
          [firstUnchecked.id]: { needsConfirm: true, confirmed: false }
        }));
        pendingScanConfirmRef.current = firstUnchecked.id;
        scrollToItem(firstUnchecked.id);
        // 10秒后如果没有二次扫码则清除
        setTimeout(() => {
          setScanHighlight(prev => {
            const next = { ...prev };
            if (next[firstUnchecked.id] === 'confirm_needed') {
              delete next[firstUnchecked.id];
            }
            return next;
          });
          if (pendingScanConfirmRef.current === firstUnchecked.id) {
            pendingScanConfirmRef.current = null;
          }
        }, 10000);
        return;
      }
    }

    // quantity 为 1，或者 quantity >= 2 但已经在 confirm 状态：直接 check
    await doItemCheck(firstUnchecked);
    // check 成功后高亮绿色
    setScanHighlight(prev => ({ ...prev, [firstUnchecked.id]: 'scanned' }));
    setTimeout(() => {
      setScanHighlight(prev => {
        const next = { ...prev };
        delete next[firstUnchecked.id];
        return next;
      });
    }, 5000);
    scrollToItem(firstUnchecked.id);
  }, [doItemCheck]);

  // 🆕 scanner 键盘监听
  useEffect(() => {
    if (!scannerPackingOrdersEnabled) return;

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
  }, [scannerPackingOrdersEnabled, handleScan]);

  const handleImageClick = (e, item) => {
    e.stopPropagation();
    if (item.image_url && item.url_handle) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand || ''} ${item.title || ''}`
      });
    }
  };

  const handleWeightSubmit = async (weight) => {
    if (!weightModal) return;

    try {
      await axios.patch(`/api/packer/items/${weightModal.id}/update-weight`, {
        weight
      });
      await fetchOrderDetail();
      setWeightModal(null);
      setMessage('Weight updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating weight:', error);
      setMessage('Error updating weight');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleOrderComplete = async ({ boxType, weight, customDimensions }) => {
    try {
      console.log('Completing order:', shopifyOrderId, { boxType, weight, customDimensions });
      const response = await axios.post(`/api/packer/orders/${shopifyOrderId}/complete`, {
        boxType,
        weight,
        customDimensions
      });

      console.log('Order complete response:', response.data);
      setCompleteModal(false);

      const { packLabel, labelStatus: ls, fulfillStatus: fs } = response.data;

      // Pack & Label It 未启用，或者 label + fulfill 都成功 → 正常跳转
      if (!packLabel || (ls === 'success' && fs === 'success')) {
        await fetchAllOrders();
        const nextOrder = findNextOrder();
        if (nextOrder) {
          navigate(`/packer/${nextOrder.shopify_order_id}`);
        } else {
          navigate('/packer');
        }
        return;
      }

      // 有失败 → 停在当前页面，刷新 label options 显示错误 card
      await fetchLabelOptions();
      await fetchOrderDetail();

      if (ls === 'failed') {
        setMessage('Label creation failed. See details above.');
      } else if (fs === 'failed') {
        setMessage('Label created but order fulfillment failed. See details above.');
      }
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('Error completing order:', error);
      setMessage('Error completing order');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  const formatDate = (month, day) => {
    if (!month || !day) return '';
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}/${d}`;
  };

  if (!order) {
    return (
      <Page>
        <Banner>Loading...</Banner>
      </Page>
    );
  }

  const hasWeightWarning = lineItems.some(item => 
    item.has_weight_warning === 1
  );

  const renderLineItem = (item) => {
    const status = getItemStatus(item);
    const hasWarning = item.has_weight_warning === 1;
    const isOutOfStock = item.outOfStock === true;
    const isUpdating = item._updating;
    
    // 确认状态和样式
    const confirmState = quantityConfirmStates[item.id] || {};
    const showConfirm = confirmState.needsConfirm && item.packer_status !== 'ready';
    const isConfirmed = confirmState.confirmed;
    const quantityColor = showConfirm ? (isConfirmed ? '#00a047' : '#d72c0d') : '#202223';
    const quantitySize = '36px';

    // 🆕 扫码高亮背景色
    const highlight = scanHighlight[item.id];
    let itemBgColor = 'transparent';
    if (highlight === 'scanned' || highlight === 'already_checked') {
      itemBgColor = '#e4fef3';
    } else if (highlight === 'confirm_needed') {
      itemBgColor = '#fee4ef';
    }
    
    const media = item.image_url ? (
      <div onClick={(e) => handleImageClick(e, item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={item.image_url} alt={item.title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    // 状态按钮组件
    const StatusButton = () => (
      <div
        onTouchStart={(e) => {
          e.preventDefault();
          if (!isUpdating) handleItemClick(item);
        }}
        onClick={(e) => {
          if (!isUpdating) handleItemClick(item);
        }}
        style={{ 
          cursor: isUpdating ? 'not-allowed' : 'pointer', 
          padding: '8px',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none'
        }}
      >
        {item.packer_status === 'ready' ? (
          <span style={{ fontSize: '32px', color: '#00a047' }}>✓</span>
        ) : (
          <div style={{ width: '32px', height: '32px', border: '2px solid #00A0AC', borderRadius: '50%', position: 'relative' }}>
            {status === 'transferring' && (
              <div style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '14px',
                height: '14px',
                border: '2px solid #0080FF',
                borderRadius: '50%',
                background: 'white'
              }} />
            )}
            {status === 'waiting' && (
              <div style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '10px',
                height: '10px',
                background: '#0080FF',
                borderRadius: '50%'
              }} />
            )}
          </div>
        )}
      </div>
    );

    return (
      <div
        id={`order-item-${item.id}`}
        className="orderdetail-item-container"
        style={{ backgroundColor: itemBgColor, transition: 'background-color 0.3s' }}
      >
        {/* 桌面端布局 - 完全保留原有样式 */}
        <div className="orderdetail-item-desktop">
          <div className="orderdetail-item-thumbnail">
            {media}
          </div>

          <div className="orderdetail-item-info">
            <BlockStack gap="1">
              <Text variant="bodySm">
                {item.brand}
              </Text>
              
              <Text variant="bodyMd" fontWeight="bold">
                {item.title} {item.size}
              </Text>
              
              {item.variant_title && (
                <Text variant="bodySm">
                  {item.variant_title}
                </Text>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="bodySm" tone={hasWarning ? 'critical' : 'subdued'}>
                  {item.weight}{item.weight_unit}
                </Text>
                {hasWarning && (
                  <Button
                    plain
                    onClick={(e) => {
                      e.stopPropagation();
                      setWeightModal(item);
                    }}
                  >
                    ⚠️
                  </Button>
                )}
              </div>
              
              <Text variant="bodySm" fontWeight="bold">
                {formatSKU(item.sku)}
              </Text>
            </BlockStack>
          </div>

          <div className="orderdetail-item-right-desktop" style={{ 
          display: 'flex', 
          flexDirection: 'row',
          alignItems: 'center',
          gap: '16px',
          minWidth: '200px'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '4px',
            flex: 1
          }}>
            {isOutOfStock && (
              <Badge tone="critical">Out of Stock</Badge>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {showConfirm && (
                <span style={{ fontSize: '14px', color: quantityColor, fontWeight: '500' }}>
                  confirm quantity
                </span>
              )}
              <span style={{ fontSize: quantitySize, color: quantityColor, fontWeight: 'bold', lineHeight: '1' }}>
                {item.quantity}
              </span>
            </div>
            
            {item.transferInfo && !isOutOfStock && (
              <Text variant="bodySm" fontWeight="bold" tone="info">
                Transfer: {item.transferInfo.quantity} from {item.transferInfo.transferFrom}, Est: {formatDate(item.transferInfo.estimateMonth, item.transferInfo.estimateDay)}
              </Text>
            )}
          </div>
          
          <StatusButton />
        </div>
        </div>

       
        <div className="orderdetail-item-mobile">
          {/* 第一行：产品信息文本 */}
          <div className="orderdetail-mobile-text">
            <div style={{ 
              fontSize: '12px',
              color: '#6d7175',
              marginBottom: '4px',
              wordBreak: 'break-word'
            }}>
              {item.brand}
            </div>
            
            <div style={{ 
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '4px',
              wordBreak: 'break-word',
              lineHeight: '1.4'
            }}>
              {item.title} {item.size}
            </div>
            
            {item.variant_title && (
              <div style={{ 
                fontSize: '12px',
                color: '#6d7175',
                marginBottom: '4px',
                wordBreak: 'break-word'
              }}>
                {item.variant_title}
              </div>
            )}
            
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
              flexWrap: 'wrap'
            }}>
              <span style={{ 
                fontSize: '12px',
                color: hasWarning ? '#d72c0d' : '#6d7175'
              }}>
                {item.weight}{item.weight_unit}
              </span>
              {hasWarning && (
                <Button
                  plain
                  onClick={(e) => {
                    e.stopPropagation();
                    setWeightModal(item);
                  }}
                >
                  ⚠️
                </Button>
              )}
            </div>
            
            <div style={{ 
              fontSize: '12px',
              fontWeight: '600',
              wordBreak: 'break-all',
              marginBottom: '8px'
            }}>
              {formatSKU(item.sku)}
            </div>

            {item.transferInfo && !isOutOfStock && (
              <div style={{ 
                fontSize: '12px',
                color: '#0080FF',
                fontWeight: '600',
                marginBottom: '8px',
                wordBreak: 'break-word'
              }}>
                Transfer: {item.transferInfo.quantity} from {item.transferInfo.transferFrom}, Est: {formatDate(item.transferInfo.estimateMonth, item.transferInfo.estimateDay)}
              </div>
            )}

            {isOutOfStock && (
              <div style={{ marginBottom: '8px' }}>
                <Badge tone="critical">Out of Stock</Badge>
              </div>
            )}
          </div>

          {/* 第二行：图片 + 数量 + 状态按钮 */}
          <div className="orderdetail-mobile-bottom">
            <div className="orderdetail-thumbnail-mobile">
              {media}
            </div>

            <div className="orderdetail-quantity-mobile">
              {item.quantity}
            </div>

            <div className="orderdetail-mobile-right">
              <StatusButton />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const secondaryActions = [
    {
      content: 'Previous',
      icon: ChevronLeftIcon,
      onAction: handlePreviousOrder,
      disabled: !findPreviousOrder()
    },
    {
      content: 'Next',
      icon: ChevronRightIcon,
      onAction: handleNextOrder,
      disabled: !findNextOrder()
    },
    {
      content: isSorted ? 'Unsort' : 'Sort',
      onAction: handleSort
    },
    {
      content: 'Delete',
      destructive: true,
      onAction: handleDeleteOrder
    }
  ];

  const primaryAction = {
    content: order.packer_note ? 'Edit Note' : 'Add Note',
    onAction: () => {
      setNoteValue(order.packer_note || '');
      setNoteModal(true);
    }
  };

  return (
    <>
      <style>{`
        /* OrderDetail 响应式样式 - 完全参考 Picker.js */
        .orderdetail-item-container {
          padding: 22px 16px;
          border-bottom: 1px solid #e1e3e5;
          position: relative;
        }

        /* 桌面端布局 - 默认显示 */
        .orderdetail-item-desktop {
          display: flex;
          alignItems: center;
          width: 100%;
        }

        .orderdetail-item-thumbnail {
          margin-right: 16px;
          flex-shrink: 0;
        }

        .orderdetail-item-quantity {
          font-size: 30px;
          line-height: 1;
          margin-right: 20px;
          margin-top: 5px;
          min-width: 50px;
          flex-shrink: 0;
        }

        .orderdetail-item-info {
          flex: 1;
          max-width: calc(100% - 350px);
        }

        .orderdetail-item-right-desktop {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
        }

        /* 移动端布局 - 默认隐藏 */
        .orderdetail-item-mobile {
          display: none;
        }

        /* 手机响应式 (600px 以下) */
        @media (max-width: 600px) {
          .orderdetail-item-container {
            padding: 16px;
          }

          /* 隐藏桌面布局 */
          .orderdetail-item-desktop {
            display: none;
          }

          /* 显示手机布局 */
          .orderdetail-item-mobile {
            display: block;
            width: 100%;
          }

          .orderdetail-mobile-text {
            margin-bottom: 12px;
          }

          .orderdetail-mobile-bottom {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .orderdetail-thumbnail-mobile {
            flex-shrink: 0;
          }

          .orderdetail-quantity-mobile {
            font-size: 24px;
            line-height: 1;
            min-width: 30px;
            flex-shrink: 0;
            align-self: center;
          }

          .orderdetail-mobile-right {
            margin-left: auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
          }
        }
      `}</style>

      <Page
        title={`Order ${order.name}`}
        subtitle={`${new Date(order.created_at).toLocaleDateString()} • $${order.subtotal_price} • ${order.total_quantity} items`}
        backAction={{ content: 'Back to Packer', onAction: () => navigate('/packer') }}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      >
        {message && (
          <div style={{ 
            padding: '12px', 
            marginBottom: '16px', 
            backgroundColor: message.includes('Error') || message.includes('error') ? '#fef1f2' : '#d4edda', 
            borderRadius: '4px',
            color: message.includes('Error') || message.includes('error') ? '#d72c0d' : '#1a7f37'
          }}>
            {message}
          </div>
        )}

        {/* 🆕 点击提示（scanner 模式）- 固定居中覆盖，不影响页面布局 */}
        {showScanHint && (
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9998,
              pointerEvents: 'none'
            }}
          >
            <div style={{
              backgroundColor: '#fff4e5',
              border: '1px solid #ffb020',
              borderRadius: '12px',
              padding: '24px 28px',
              fontSize: '15px',
              color: '#7d5a00',
              fontWeight: '500',
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
              textAlign: 'center',
              maxWidth: '320px',
              pointerEvents: 'auto'
            }}>
              <div style={{ marginBottom: '16px' }}>
                Scan the item to check, or tap 4 times.
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  localStorage.setItem('scanHintSuppressedUntil', String(Date.now() + 4 * 60 * 60 * 1000));
                  setShowScanHint(false);
                  clearTimeout(scanHintTimerRef.current);
                }}
                style={{
                  backgroundColor: '#7d5a00',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Got it, don't remind me again
              </button>
            </div>
          </div>
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

        <Layout>

          {/* 🆕 Error status card — only shown when label or fulfill failed */}
          {(labelStatus === 'failed' || fulfillStatus === 'failed') && (
            <Layout.Section>
              <Card>
                <div style={{ padding: '16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <Text variant="headingSm" as="h3">Pack & Label It Status</Text>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Label status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{labelStatus === 'success' ? '✅' : labelStatus === 'failed' ? '❌' : '—'}</span>
                      <div>
                        <Text variant="bodyMd" fontWeight="semibold">
                          Label {labelStatus === 'success' ? 'created successfully' : labelStatus === 'failed' ? 'creation failed' : 'not attempted'}
                        </Text>
                        {labelStatus === 'success' && labelTrackingNumber && (
                          <Text variant="bodySm" tone="subdued">Tracking: {labelTrackingNumber}</Text>
                        )}
                        {labelStatus === 'failed' && labelError && (
                          <Text variant="bodySm" tone="critical">{labelError}</Text>
                        )}
                      </div>
                    </div>

                    {/* Fulfill status — only shown if label succeeded */}
                    {labelStatus === 'success' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>{fulfillStatus === 'success' ? '✅' : fulfillStatus === 'failed' ? '❌' : '—'}</span>
                        <div>
                          <Text variant="bodyMd" fontWeight="semibold">
                            Order fulfillment {fulfillStatus === 'success' ? 'succeeded' : fulfillStatus === 'failed' ? 'failed' : 'not attempted'}
                          </Text>
                          {fulfillStatus === 'failed' && fulfillError && (
                            <Text variant="bodySm" tone="critical">{fulfillError}</Text>
                          )}
                          {fulfillStatus === 'failed' && (
                            <Text variant="bodySm" tone="subdued">
                              You can manually fulfill this order in Shopify Admin using tracking number: {labelTrackingNumber}
                            </Text>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Layout.Section>
          )}

          {/* 🆕 Label Options card — shown when Pack & Label It is enabled */}
          {packLabelEnabled && (
            <Layout.Section>
              <Card>
                <div style={{ padding: '16px' }}>
                  {/* Header row with title + expand button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text variant="headingSm" as="h3">Label Options</Text>
                      {/* Show active options summary when collapsed */}
                      {!labelOptionsOpen && (
                        <Text variant="bodySm" tone="subdued">
                          {[
                            labelOptions.signature && 'Signature',
                            labelOptions.cardForPickup && 'Card for Pickup',
                            labelOptions.leaveAtDoor && 'Leave at Door',
                            'Liability Coverage'
                          ].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </div>
                    <Button onClick={() => setLabelOptionsOpen(o => !o)}>
                      {labelOptionsOpen ? 'Collapse' : 'Expand'}
                    </Button>
                  </div>

                  {/* Expandable content */}
                  {labelOptionsOpen && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                        {/* Signature */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            id="opt-signature"
                            checked={labelOptions.signature || false}
                            onChange={e => setLabelOptions(p => ({ ...p, signature: e.target.checked }))}
                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                          />
                          <label htmlFor="opt-signature" style={{ cursor: 'pointer', fontSize: '14px' }}>
                            Signature Required
                          </label>
                        </div>

                        {/* Card for pickup — mutually exclusive with Leave at Door */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            id="opt-card-pickup"
                            checked={labelOptions.cardForPickup || false}
                            onChange={e => {
                              const val = e.target.checked;
                              setLabelOptions(p => ({
                                ...p,
                                cardForPickup: val,
                                leaveAtDoor: val ? false : p.leaveAtDoor
                              }));
                            }}
                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                          />
                          <label htmlFor="opt-card-pickup" style={{ cursor: 'pointer', fontSize: '14px' }}>
                            Card for Pickup
                          </label>
                        </div>

                        {/* Leave at Door — mutually exclusive with Card for Pickup */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            id="opt-leave-door"
                            checked={labelOptions.leaveAtDoor || false}
                            onChange={e => {
                              const val = e.target.checked;
                              setLabelOptions(p => ({
                                ...p,
                                leaveAtDoor: val,
                                cardForPickup: val ? false : p.cardForPickup
                              }));
                            }}
                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                          />
                          <label htmlFor="opt-leave-door" style={{ cursor: 'pointer', fontSize: '14px' }}>
                            Leave at Door, No Card
                          </label>
                        </div>

                        {/* Liability Coverage — always on, display only */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            checked={true}
                            disabled
                            style={{ width: '18px', height: '18px' }}
                            readOnly
                          />
                          <label style={{ fontSize: '14px', color: '#8c9196' }}>
                            Liability Coverage up to $100 (always included)
                          </label>
                        </div>
                      </div>

                      <Button
                        variant="primary"
                        disabled={JSON.stringify(labelOptions) === JSON.stringify(labelOptionsSaved)}
                        loading={labelOptionsLoading}
                        onClick={handleLabelOptionsSave}
                      >
                        Save Label Options
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </Layout.Section>
          )}

          <Layout.Section>
            <Card>
              <div style={{ padding: '16px', position: 'relative' }}>
                {order.status === 'holding' && (
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#9c6ade',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}>
                      Holding
                    </span>
                  </div>
                )}

                <Text variant="headingSm" as="h3">Shipping Address</Text>
                <div style={{ marginTop: '12px' }}>
                  <BlockStack gap="1">
                    <Text as="p">{order.shipping_name}</Text>
                    <Text as="p">{order.shipping_address1}</Text>
                    {order.shipping_address2 && <Text as="p">{order.shipping_address2}</Text>}
                    <Text as="p">
                      {order.shipping_city}, {order.shipping_province} {order.shipping_zip}
                    </Text>
                    <Text as="p">{order.shipping_country}</Text>
                  </BlockStack>
                </div>

                {order.packer_note && (
                  <div style={{ 
                    marginTop: '16px', 
                    paddingTop: '16px', 
                    borderTop: '1px solid #e1e3e5' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="headingSm" as="h3">Note</Text>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button 
                          size="slim" 
                          onClick={() => {
                            setNoteValue(order.packer_note);
                            setNoteModal(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button 
                          size="slim" 
                          destructive 
                          onClick={handleNoteDelete}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <Text as="p">{order.packer_note}</Text>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <div>
                {lineItems.map(item => (
                  <div key={item.id}>
                    {renderLineItem(item)}
                  </div>
                ))}
              </div>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={noteModal}
          onClose={() => setNoteModal(false)}
          title="Order Note"
          primaryAction={{
            content: 'Save',
            onAction: handleNoteSave
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setNoteModal(false)
            }
          ]}
        >
          <Modal.Section>
            <TextField
              label="Note (max 50 characters)"
              value={noteValue}
              onChange={setNoteValue}
              maxLength={50}
              autoComplete="off"
              placeholder="Enter a note for this order"
              showCharacterCount
            />
          </Modal.Section>
        </Modal>

        <Modal
          open={selectedImage !== null}
          onClose={() => setSelectedImage(null)}
          title={selectedImage?.title || 'Product Image'}
        >
          <Modal.Section>
            {selectedImage && (
              <BlockStack gap="4">
                <img 
                  src={selectedImage.url} 
                  alt="Product" 
                  style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }} 
                />
                <Button 
                  url={selectedImage.link} 
                  external
                  variant="primary"
                  fullWidth
                >
                  View Product on Website
                </Button>
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>

        <WeightInputModal
          open={weightModal !== null}
          item={weightModal}
          onClose={() => setWeightModal(null)}
          onSubmit={handleWeightSubmit}
        />

        <CompleteOrderModal
          open={completeModal}
          orderName={order.name}
          hasWeightWarning={hasWeightWarning}
          boxTypes={boxTypes}
          onClose={() => setCompleteModal(false)}
          onComplete={handleOrderComplete}
        />
      </Page>
    </>
  );
};

export default OrderDetail;