import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchAllOrders();
  }, []);

  useEffect(() => {
    if (shopifyOrderId) {
      fetchOrderDetail();
    }
  }, [shopifyOrderId]);

  useEffect(() => {
    applyPackerFilters();
  }, [allOrders]);

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

  const handleItemClick = async (item) => {
    // 🆕 拦截：数量 >= 2 的第1次点击
    const itemId = item.id;
    const currentState = quantityConfirmStates[itemId] || {};
    
    if (item.quantity >= 2 && item.packer_status !== 'ready') {
      if (!currentState.needsConfirm) {
        // 第1次点击：只显示提示，不执行下面的逻辑
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
      
      const updatedItems = lineItems.map(li => 
        li.id === item.id ? { ...li, packer_status: newStatus, _updating: false } : li
      );
      setLineItems(updatedItems);

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
  };

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
      // 🆕 重置确认状态
      setQuantityConfirmStates(prev => {
        const newState = { ...prev };
        delete newState[itemId];
        return newState;
      });
      setWeightModal(null);
      setMessage('Weight updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating weight:', error);
      setMessage('Error updating weight');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleOrderComplete = async ({ boxType, weight }) => {
    try {
      console.log('Completing order:', shopifyOrderId);
      await axios.post(`/api/packer/orders/${shopifyOrderId}/complete`, {
        boxType,
        weight
      });
      
      console.log('Order completed, closing modal');
      setCompleteModal(false);
      
      await fetchAllOrders();
      
      const nextOrder = findNextOrder();
      
      console.log('Next order:', nextOrder);
      
      if (nextOrder) {
        console.log('Jumping to next order:', nextOrder.shopify_order_id);
        navigate(`/packer/${nextOrder.shopify_order_id}`);
      } else {
        console.log('No next order, returning to list');
        navigate('/packer');
      }
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
    
    // 🆕 确认状态和样式
    const confirmState = quantityConfirmStates[item.id] || {};
    const showConfirm = confirmState.needsConfirm && item.packer_status !== 'ready';
    const isConfirmed = confirmState.confirmed;
    const quantityColor = showConfirm ? (isConfirmed ? '#00a047' : '#d72c0d') : '#202223';
    const quantitySize = '36px';
    
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
      <div className="orderdetail-item-container">
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

        \3 - 新增 */}
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

        <Layout>
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