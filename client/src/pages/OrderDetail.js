import React, { useState, useEffect } from 'react';
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
  BlockStack,
  Button,
  Modal,
  TextField,
  Select,
  Banner,
  Icon,
  Frame,
  Toast
} from '@shopify/polaris';
import { SortIcon, AlertCircleIcon, ImageIcon, CheckCircleIcon } from '@shopify/polaris-icons';

const OrderDetail = () => {
  const navigate = useNavigate();
  const { shopifyOrderId } = useParams();
  const [order, setOrder] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [isSorted, setIsSorted] = useState(false);
  const [weightModal, setWeightModal] = useState(null);
  const [weightValue, setWeightValue] = useState('');
  const [completeModal, setCompleteModal] = useState(false);
  const [boxType, setBoxType] = useState('C');
  const [orderWeight, setOrderWeight] = useState('');
  const [boxTypes, setBoxTypes] = useState([]);
  const [toastActive, setToastActive] = useState(false);

  useEffect(() => {
    fetchOrderDetail();
    fetchBoxTypes();
  }, [shopifyOrderId]);

  const fetchOrderDetail = async () => {
    try {
      const response = await axios.get(`/api/packer/orders/${shopifyOrderId}`);
      setOrder(response.data);
      setLineItems(response.data.lineItems);
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
      setLineItems(order.lineItems);
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
      }
    } catch (error) {
      console.error('Error updating item status:', error);
    }
  };

  const handleWeightSubmit = async () => {
    const weight = parseFloat(weightValue);
    if (!weight || weight <= 0) {
      alert('Please enter a valid weight');
      return;
    }

    try {
      await axios.patch(`/api/packer/items/${weightModal.id}/update-weight`, {
        weight
      });
      await fetchOrderDetail();
      setWeightModal(null);
      setWeightValue('');
      setToastActive(true);
    } catch (error) {
      console.error('Error updating weight:', error);
    }
  };

  const handleOrderComplete = async () => {
    if (!boxType) {
      alert('Please select a box type');
      return;
    }

    const hasWeightWarning = lineItems.some(item => 
      item.weight === 0 || item.weight_unit !== 'g'
    );

    if (hasWeightWarning && !orderWeight) {
      alert('Please enter the order weight');
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
    item.weight === 0 || item.weight_unit !== 'g'
  );

  const renderLineItem = (item) => {
    const status = getItemStatus(item);
    const hasWarning = item.weight === 0 || item.weight_unit !== 'g';
    
    const media = item.image_url ? (
      <Thumbnail source={item.image_url} alt={item.title} size="large" />
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
            <BlockStack gap="2">
              <Text variant="bodyMd" as="p">
                ×{item.quantity}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="bodySm" tone={hasWarning ? 'critical' : 'subdued'}>
                  {item.weight}{item.weight_unit}
                </Text>
                {hasWarning && (
                  <Button
                    plain
                    icon={AlertCircleIcon}
                    onClick={() => {
                      setWeightModal(item);
                      setWeightValue('');
                    }}
                  />
                )}
              </div>
              <Text variant="bodySm">
                {item.brand} {item.title} {item.size}
              </Text>
              <Text variant="bodySm" color="subdued">
                {item.sku}
              </Text>
              {item.transferInfo && (
                <Badge tone="info">
                  Transfer: {item.transferInfo.quantity} from {item.transferInfo.transferFrom}, 
                  Est: {item.transferInfo.estimateMonth}/{item.transferInfo.estimateDay}
                </Badge>
              )}
            </BlockStack>
          </div>

          <div onClick={() => handleItemClick(item)} style={{ cursor: 'pointer', padding: '8px' }}>
            {item.packer_status === 'ready' ? (
              <Icon source={CheckCircleIcon} tone="success" />
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

  const boxTypeOptions = boxTypes.map(box => ({
    label: `${box.code} - ${box.dimensions}`,
    value: box.code
  }));

  const toastMarkup = toastActive ? (
    <Toast content="Weight updated successfully" onDismiss={() => setToastActive(false)} />
  ) : null;

  return (
    <Frame>
      <Page
        title={`Order ${order.name}`}
        subtitle={`${new Date(order.created_at).toLocaleDateString()} • $${order.subtotal_price} • ${order.total_quantity} items`}
        backAction={{ content: 'Back to Packer', onAction: () => navigate('/packer') }}
        secondaryActions={[
          {
            content: isSorted ? 'Unsort' : 'Sort',
            icon: SortIcon,
            onAction: handleSort
          }
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card title="Shipping Address">
              <Card.Section>
                <BlockStack gap="1">
                  <Text as="p">{order.shipping_name}</Text>
                  <Text as="p">{order.shipping_address1}</Text>
                  {order.shipping_address2 && <Text as="p">{order.shipping_address2}</Text>}
                  <Text as="p">
                    {order.shipping_city}, {order.shipping_province} {order.shipping_zip}
                  </Text>
                  <Text as="p">{order.shipping_country}</Text>
                </BlockStack>
              </Card.Section>
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

        <Modal
          open={weightModal !== null}
          onClose={() => setWeightModal(null)}
          title={weightModal ? `${weightModal.brand} ${weightModal.title}` : ''}
          primaryAction={{
            content: 'Update Weight',
            onAction: handleWeightSubmit
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setWeightModal(null)
            }
          ]}
        >
          <Modal.Section>
            <TextField
              label="Weight (grams)"
              type="number"
              value={weightValue}
              onChange={setWeightValue}
              suffix="g"
              autoComplete="off"
            />
          </Modal.Section>
        </Modal>

        <Modal
          open={completeModal}
          onClose={() => setCompleteModal(false)}
          title={`Complete Order ${order.name}`}
          primaryAction={{
            content: 'Complete',
            onAction: handleOrderComplete
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setCompleteModal(false)
            }
          ]}
        >
          <Modal.Section>
            <BlockStack gap="4">
              <Select
                label="Box Type"
                options={boxTypeOptions}
                value={boxType}
                onChange={setBoxType}
              />
              {hasWeightWarning && (
                <TextField
                  label="Total Weight"
                  type="number"
                  value={orderWeight}
                  onChange={setOrderWeight}
                  suffix="g"
                  autoComplete="off"
                  helpText="Enter the total weight since some items have weight warnings"
                />
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {toastMarkup}
      </Page>
    </Frame>
  );
};

export default OrderDetail;