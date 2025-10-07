import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
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
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isSorted, setIsSorted] = useState(false);
  const [weightModal, setWeightModal] = useState(null);
  const [weightValue, setWeightValue] = useState('');
  const [completeModal, setCompleteModal] = useState(false);
  const [boxType, setBoxType] = useState('');
  const [orderWeight, setOrderWeight] = useState('');
  const [boxTypes, setBoxTypes] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeInput, setActiveInput] = useState('boxType'); // 'boxType' or 'weight'

  // Touch gesture support
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const pageRef = useRef(null);

  useEffect(() => {
    fetchAllOrders();
  }, []);

  useEffect(() => {
    if (shopifyOrderId) {
      fetchOrderDetail();
    }
  }, [shopifyOrderId]);

  useEffect(() => {
    if (allOrders.length > 0 && shopifyOrderId) {
      const index = allOrders.findIndex(o => o.shopify_order_id === shopifyOrderId);
      setCurrentIndex(index);
    }
  }, [allOrders, shopifyOrderId]);

  // Add touch event listeners
  useEffect(() => {
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e) => {
      touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      const swipeDistance = touchStartX.current - touchEndX.current;
      const minSwipeDistance = 50;

      if (Math.abs(swipeDistance) > minSwipeDistance) {
        if (swipeDistance > 0) {
          handleNextOrder();
        } else {
          handlePreviousOrder();
        }
      }

      touchStartX.current = 0;
      touchEndX.current = 0;
    };

    const element = pageRef.current;
    if (element) {
      element.addEventListener('touchstart', handleTouchStart);
      element.addEventListener('touchmove', handleTouchMove);
      element.addEventListener('touchend', handleTouchEnd);

      return () => {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchmove', handleTouchMove);
        element.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [currentIndex, allOrders]);

  const fetchAllOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      setAllOrders(response.data);
    } catch (error) {
      console.error('Error fetching all orders:', error);
    }
  };

  const fetchOrderDetail = async () => {
    try {
      const response = await axios.get(`/api/packer/orders/${shopifyOrderId}`);
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

  const handlePreviousOrder = () => {
    if (currentIndex > 0) {
      const prevOrder = allOrders[currentIndex - 1];
      navigate(`/packer/${prevOrder.shopify_order_id}`);
    }
  };

  const handleNextOrder = () => {
    if (currentIndex < allOrders.length - 1) {
      const nextOrder = allOrders[currentIndex + 1];
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
      await axios.post(`/api/packer/orders/${shopifyOrderId}/complete`, {
        boxType,
        weight: orderWeight || null
      });
      navigate('/packer');
    } catch (error) {
      console.error('Error completing order:', error);
      setMessage('Error completing order');
    }
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
      <ResourceItem
        id={item.id}
        media={media}
        verticalAlignment="center"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '8px' }}>
              <Text variant="bodyMd" as="p">
                ×{item.quantity}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Text variant="bodySm" tone={hasWarning ? 'critical' : 'subdued'}>
                {item.weight}{item.weight_unit}
              </Text>
              {hasWarning && (
                <Button
                  plain
                  onClick={() => {
                    setWeightModal(item);
                    setWeightValue('');
                  }}
                >
                  ⚠️
                </Button>
              )}
            </div>
            <div style={{ marginBottom: '4px' }}>
              <Text variant="bodySm">
                {item.brand} {item.title} {item.size} {item.variant_title && `- ${item.variant_title}`}
              </Text>
            </div>
            <div style={{ marginBottom: '4px' }}>
              <Text variant="bodySm" tone="subdued">
                {item.sku}
              </Text>
            </div>
            {item.transferInfo && (
              <div style={{ marginTop: '8px' }}>
                <Badge tone="info">
                  Transfer: {item.transferInfo.quantity} from {item.transferInfo.transferFrom}, 
                  Est: {item.transferInfo.estimateMonth}/{item.transferInfo.estimateDay}
                </Badge>
              </div>
            )}
          </div>

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
      </ResourceItem>
    );
  };

  const secondaryActions = [
    {
      content: 'Previous',
      icon: ChevronLeftIcon,
      onAction: handlePreviousOrder,
      disabled: currentIndex <= 0
    },
    {
      content: 'Next',
      icon: ChevronRightIcon,
      onAction: handleNextOrder,
      disabled: currentIndex >= allOrders.length - 1 || currentIndex === -1
    },
    {
      content: isSorted ? 'Unsort' : 'Sort',
      onAction: handleSort
    }
  ];

  return (
    <div ref={pageRef} style={{ touchAction: 'pan-y' }}>
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
              <ResourceList
                items={lineItems}
                renderItem={renderLineItem}
              />
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
    </div>
  );
};

export default OrderDetail;