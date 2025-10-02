import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  ChoiceList,
  Banner,
  Icon
} from '@shopify/polaris';
import { AlertCircleIcon, CheckCircleIcon, InfoIcon } from '@shopify/polaris-icons';

const Packer = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState(['packing', 'waiting', 'ready', 'holding']);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, statusFilter]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const applyFilters = () => {
    const filtered = orders.filter(order => {
      const status = order.status || order.orderStatus;
      return statusFilter.includes(status);
    });
    setFilteredOrders(filtered);
  };

  const handleOrderClick = (order) => {
    navigate(`/packer/order/${order.shopify_order_id}`);
  };

  const handleStatusClick = async (order, e) => {
    e.stopPropagation();
    const currentStatus = order.status || order.orderStatus;
    const newStatus = currentStatus === 'holding' ? order.orderStatus : 'holding';

    try {
      await axios.patch(`/api/packer/orders/${order.shopify_order_id}/status`, {
        status: newStatus
      });
      await fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const getOrderBadge = (order) => {
    const status = order.status || order.orderStatus;
    switch (status) {
      case 'ready':
        return <Badge tone="success">Ready</Badge>;
      case 'waiting':
        return <Badge tone="info">Waiting</Badge>;
      case 'holding':
        return <Badge tone="warning">Holding</Badge>;
      default:
        return <Badge>Packing</Badge>;
    }
  };

  const renderOrder = (order) => {
    const status = order.status || order.orderStatus;
    const { name, hasWeightWarning, box_type, weight, shipping_code, transferInfo, hasTransferring } = order;

    return (
      <ResourceItem
        id={order.shopify_order_id}
        onClick={() => handleOrderClick(order)}
        verticalAlignment="center"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <BlockStack gap="2">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="headingMd" as="h3">
                  {name}
                </Text>
                {hasWeightWarning && (
                  <Icon source={AlertCircleIcon} tone="critical" />
                )}
              </div>

              {status === 'ready' && (
                <InlineStack gap="2">
                  {box_type && (
                    <Badge>Box: {box_type}</Badge>
                  )}
                  {weight && (
                    <Badge>{weight}</Badge>
                  )}
                  {shipping_code && (
                    <Text variant="bodySm" color="subdued">
                      {shipping_code}
                    </Text>
                  )}
                </InlineStack>
              )}

              {status === 'waiting' && transferInfo && (
                <Text variant="bodySm" color="subdued">
                  {transferInfo.quantity} items from {transferInfo.transferFroms.join(', ')} - 
                  Est: {transferInfo.estimateMonth}/{transferInfo.estimateDay}
                </Text>
              )}

              <div>{getOrderBadge(order)}</div>
            </BlockStack>
          </div>

          <div onClick={(e) => handleStatusClick(order, e)} style={{ cursor: 'pointer', padding: '8px' }}>
            {status === 'holding' ? (
              <div style={{ width: '32px', height: '32px', background: '#B98900', borderRadius: '50%' }} />
            ) : status === 'ready' ? (
              <div style={{ position: 'relative' }}>
                <Icon source={CheckCircleIcon} tone="success" />
                {hasTransferring && (
                  <div style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    width: '12px',
                    height: '12px',
                    background: '#0080FF',
                    borderRadius: '50%',
                    border: '2px solid white'
                  }} />
                )}
              </div>
            ) : status === 'waiting' ? (
              <Icon source={InfoIcon} tone="info" />
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', border: '2px solid #666', borderRadius: '50%' }} />
                {hasTransferring && (
                  <div style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    width: '14px',
                    height: '14px',
                    background: '#0080FF',
                    borderRadius: '50%',
                    border: '2px solid white'
                  }} />
                )}
              </div>
            )}
          </div>
        </div>
      </ResourceItem>
    );
  };

  return (
    <Page
      title="Packer"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <ChoiceList
                title="Show orders"
                choices={[
                  { label: 'Packing', value: 'packing' },
                  { label: 'Waiting', value: 'waiting' },
                  { label: 'Ready', value: 'ready' },
                  { label: 'Holding', value: 'holding' }
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
            <ResourceList
              items={filteredOrders}
              renderItem={renderOrder}
              emptyState={<Banner>No orders to pack</Banner>}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Packer;