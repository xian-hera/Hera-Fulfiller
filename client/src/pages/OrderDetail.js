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
  BlockStack
} from '@shopify/polaris';
import { ImageIcon, ChevronLeftIcon, ChevronRightIcon } from '@shopify/polaris-icons';
import NumericKeypad from '../components/NumericKeypad';
import BoxTypeKeypad from '../components/BoxTypeKeypad';

const OrderDetail = () => {
  const navigate = useNavigate();
  const { shopifyOrderId } = useParams();
  const [order, setOrder] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [isSorted, setIsSorted] = useState(false);
  const [weightModal, setWeightModal] = useState(null);
  const [weightValue, setWeightValue] = useState('');
  const [completeModal, setCompleteModal] = useState(false);
  const [boxType, setBoxType] = useState('');
  const [orderWeight, setOrderWeight] = useState('');
  const [boxTypes, setBoxTypes] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeInput, setActiveInput] = useState('boxType');

  useEffect(() => {
    fetchAllOrders();
  }, []);

  useEffect(() => {
    if (shopifyOrderId) {
      fetchOrderDetail();
    }
  }, [shopifyOrderId]);

  const fetchAllOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      // 按订单号排序
      const sorted = response.data.sort((a, b) => {
        const numA = parseInt(a.order_number) || 0;
        const numB = parseInt(b.order_number) || 0;
        return numA - numB;
      });
      console.log('All orders sorted:', sorted.map(o => o.order_number));
      setAllOrders(sorted);
    } catch (error) {
      console.error('Error fetching all orders:', error);
    }
  };

  const fetchOrderDetail = async () => {
    try {
      const response = await axios.get(`/api/packer/orders/${shopifyOrderId}`);
      console.log('Current order:', response.data.order_number);
      setOrder(response.data);
      setLineItems(response.data.lineItems);
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

  // 根据订单号查找上一个和下一个订单
  const findPreviousOrder = () => {
    if (!order || allOrders.length === 0) return null;
    
    const currentNum = parseInt(order.order_number);
    console.log('Finding previous order, current:', currentNum);
    
    // 找到订单号小于当前订单的最大订单号
    for (let i = allOrders.length - 1; i >= 0; i--) {
      const orderNum = parseInt(allOrders[i].order_number) || 0;
      if (orderNum < currentNum) {
        console.log('Found previous order:', allOrders[i].order_number);
        return allOrders[i];
      }
    }
    console.log('No previous order found');
    return null;
  };

  const findNextOrder = () => {
    if (!order || allOrders.length === 0) return null;
    
    const currentNum = parseInt(order.order_number);
    console.log('Finding next order, current:', currentNum);
    
    // 找到订单号大于当前订单的最小订单号
    for (let i = 0; i < allOrders.length; i++) {
      const orderNum = parseInt(allOrders[i].order_number) || 0;
      if (orderNum > currentNum) {
        console.log('Found next order:', allOrders[i].order_number);
        return allOrders[i];
      }
    }
    console.log('No next order found');
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
    const newStatus = item.packer_status === 'ready' ? 'packing' : 'ready';
    
    try {
      await axios.patch(`/api/packer/items/${item.id}/packer-status`, {
        status: newStatus
      });
      
      const updatedItems = lineItems.map(li => 
        li.id === item.id ? { ...li, packer_status: newStatus } : li
      );
      setLineItems(updatedItems);

      const allReady = updatedItems.every(li => li.packer_status === 'ready');
      
      if (allReady && newStatus === 'ready') {
        setCompleteModal(true);
        setBoxType('');
        setOrderWeight('');
        setActiveInput('boxType');
      }
    } catch (error) {
      console.error('Error updating item status:', error);
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

  // Weight Modal handlers
  const handleWeightNumberClick = (number) => {
    setWeightValue(prev => prev + number);
  };

  const handleWeightBackspace = () => {
    setWeightValue(prev => prev.slice(0, -1));
  };

  const handleWeightSubmit = async () => {
    const weight = parseFloat(weightValue);
    if (!weight || weight <= 0) {
      setMessage('Please enter a valid weight');
      return;
    }

    try {
      await axios.patch(`/api/packer/items/${weightModal.id}/update-weight`, {
        weight
      });
      await fetchOrderDetail();
      setWeightModal(null);
      setWeightValue('');
      setMessage('Weight updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating weight:', error);
      setMessage('Error updating weight');
    }
  };

  // Complete Modal handlers
  const handleBoxTypeClick = (code) => {
    setBoxType(code);
  };

  const handleBoxTypeBackspace = () => {
    setBoxType('');
  };

  const handleOrderWeightNumberClick = (number) => {
    setOrderWeight(prev => prev + number);
  };

  const handleOrderWeightBackspace = () => {
    setOrderWeight(prev => prev.slice(0, -1));
  };

  const handleOrderComplete = async () => {
    if (!boxType) {
      setMessage('Please select a box type');
      return;
    }

    const hasWeightWarning = lineItems.some(item => 
      item.has_weight_warning === 1
    );

    if (hasWeightWarning && !orderWeight) {
      setMessage('Please enter the order weight');
      return;
    }

    try {
      console.log('Completing order:', shopifyOrderId);
      await axios.post(`/api/packer/orders/${shopifyOrderId}/complete`, {
        boxType,
        weight: orderWeight || null
      });
      
      console.log('Order completed, closing modal');
      setCompleteModal(false);
      
      // 重新获取所有订单以确保数据最新
      await fetchAllOrders();
      
      // 查找下一个订单
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
    }
  };

  // 格式化 SKU：每4位加一个空格
  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  // 格式化日期：补零
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
    
    const media = item.image_url ? (
      <div onClick={(e) => handleImageClick(e, item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={item.image_url} alt={item.title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <div style={{ 
        padding: '22px 16px', 
        borderBottom: '1px solid #e1e3e5',
        display: 'flex',
        alignItems: 'center'
      }}>
        {/* Thumbnail */}
        <div style={{ marginRight: '16px' }}>
          {media}
        </div>

        {/* 数量（30px）*/}
        <div style={{ 
          fontSize: '30px', 
          lineHeight: 1,
          marginRight: '20px',
          marginTop: '5px',
          minWidth: '50px'
        }}>
          {item.quantity}
        </div>

        {/* 产品信息 */}
        <div style={{ flex: 1, maxWidth: 'calc(100% - 350px)' }}>
          <BlockStack gap="1">
            {/* 第1行：Brand */}
            <Text variant="bodySm">
              {item.brand}
            </Text>
            
            {/* 第2行：Title（加粗）*/}
            <Text variant="bodyMd" fontWeight="bold">
              {item.title} {item.size}
            </Text>
            
            {/* 第3行：Variant Title */}
            {item.variant_title && (
              <Text variant="bodySm">
                {item.variant_title}
              </Text>
            )}
            
            {/* 第4行：Weight + Warning */}
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
                    setWeightValue('');
                  }}
                >
                  ⚠️
                </Button>
              )}
            </div>
            
            {/* 第5行：SKU（加粗，每4位加空格）*/}
            <Text variant="bodySm" fontWeight="bold">
              {formatSKU(item.sku)}
            </Text>
          </BlockStack>
        </div>

        {/* 右侧区域：Transfer info 和状态按钮 */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginLeft: 'auto'
        }}>
          {/* Transfer info */}
          {item.transferInfo && (
            <Text variant="bodySm" fontWeight="bold" tone="info">
              Transfer: {item.transferInfo.quantity} from {item.transferInfo.transferFrom}, Est: {formatDate(item.transferInfo.estimateMonth, item.transferInfo.estimateDay)}
            </Text>
          )}
          
          {/* 状态按钮 */}
          <div onClick={() => handleItemClick(item)} style={{ cursor: 'pointer', padding: '8px' }}>
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
    }
  ];

  return (
    <Page
      title={`Order ${order.name}`}
      subtitle={`${new Date(order.created_at).toLocaleDateString()} • $${order.subtotal_price} • ${order.total_quantity} items`}
      backAction={{ content: 'Back to Packer', onAction: () => navigate('/packer') }}
      secondaryActions={secondaryActions}
    >
      {message && (
        <div style={{ 
          padding: '12px', 
          marginBottom: '16px', 
          backgroundColor: '#d4edda', 
          borderRadius: '4px' 
        }}>
          {message}
        </div>
      )}

      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
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

      {/* Image Modal */}
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

      {/* Weight Modal */}
      <Modal
        open={weightModal !== null}
        onClose={() => setWeightModal(null)}
        title={weightModal ? `Update Weight` : ''}
      >
        <Modal.Section>
          {weightModal && (
            <>
              <Text>{weightModal.brand} {weightModal.title}</Text>
              <div style={{ marginTop: '12px' }}>
                <Text variant="bodySm" as="p">Weight (g):</Text>
                <div style={{
                  border: '2px solid #c4cdd5',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  backgroundColor: '#ffffff',
                  minHeight: '50px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '8px'
                }}>
                  {weightValue || '0'} g
                </div>
              </div>
              <div style={{ 
                marginTop: '20px',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end'
              }}>
                <Button onClick={() => setWeightModal(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleWeightSubmit}>
                  Update
                </Button>
              </div>
            </>
          )}
        </Modal.Section>
      </Modal>

      {/* Weight Modal Numeric Keypad */}
      {weightModal && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000
        }}>
          <NumericKeypad
            onNumberClick={handleWeightNumberClick}
            onBackspace={handleWeightBackspace}
          />
        </div>
      )}

      {/* Complete Order Modal */}
      <Modal
        open={completeModal}
        onClose={() => setCompleteModal(false)}
        title={`Complete Order ${order.name}`}
      >
        <Modal.Section>
          <>
            <div style={{ marginBottom: '16px' }} onClick={() => setActiveInput('boxType')}>
              <Text variant="bodySm" as="p">Box Type:</Text>
              <div style={{
                border: activeInput === 'boxType' ? '2px solid #008060' : '2px solid #c4cdd5',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '24px',
                fontWeight: 'bold',
                textAlign: 'center',
                backgroundColor: '#ffffff',
                minHeight: '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '8px',
                cursor: 'pointer'
              }}>
                {boxType || 'Select box type'}
              </div>
            </div>

            {hasWeightWarning && (
              <div style={{ marginBottom: '16px' }} onClick={() => setActiveInput('weight')}>
                <Text variant="bodySm" as="p">Total Weight (g):</Text>
                <div style={{
                  border: activeInput === 'weight' ? '2px solid #008060' : '2px solid #c4cdd5',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  backgroundColor: '#ffffff',
                  minHeight: '50px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '8px',
                  cursor: 'pointer'
                }}>
                  {orderWeight || '0'} g
                </div>
              </div>
            )}

            <div style={{ 
              marginTop: '20px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <Button onClick={() => setCompleteModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleOrderComplete}>
                Complete
              </Button>
            </div>
          </>
        </Modal.Section>
      </Modal>

      {/* Complete Modal Keypads */}
      {completeModal && activeInput === 'boxType' && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000
        }}>
          <BoxTypeKeypad
            boxTypes={boxTypes}
            onBoxTypeClick={handleBoxTypeClick}
            onBackspace={handleBoxTypeBackspace}
          />
        </div>
      )}

      {completeModal && activeInput === 'weight' && hasWeightWarning && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000
        }}>
          <NumericKeypad
            onNumberClick={handleOrderWeightNumberClick}
            onBackspace={handleOrderWeightBackspace}
          />
        </div>
      )}
    </Page>
  );
};

export default OrderDetail;