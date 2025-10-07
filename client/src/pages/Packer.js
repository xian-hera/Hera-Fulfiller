import React, { useState, useEffect, useCallback } from 'react';
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
  Button,
  ChoiceList,
  BlockStack,
  Banner,
  InlineStack
} from '@shopify/polaris';

const Packer = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState(['packing', 'waiting', 'holding', 'ready']);

  const applyFilters = useCallback(() => {
    const filtered = orders.filter(order => statusFilter.includes(order.orderStatus));
    setFilteredOrders(filtered);
  }, [orders, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, statusFilter, applyFilters]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      console.log('Fetched orders:', response.data);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
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
      await fetchOrders(); // 重新获取以更新 orderStatus
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
        return <Badge tone="warning">Holding</Badge>;
      case 'waiting':
        return <Badge tone="info">Waiting</Badge>;
      default:
        return <Badge>Packing</Badge>;
    }
  };

  // 格式化日期：补零
  const formatDate = (month, day) => {
    if (!month || !day) return '';
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}/${d}`;
  };

  const renderItem = (order) => {
    const { 
      shopify_order_id, 
      order_number, 
      name, 
      total_quantity, 
      shipping_code, 
      status,
      orderStatus, 
      box_type, 
      weight, 
      hasWeightWarning,
      transferInfo
    } = order;

    return (
      <ResourceItem
        id={shopify_order_id}
        onClick={() => handleOrderClick(shopify_order_id)}
        verticalAlignment="center"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <BlockStack gap="2">
              <Text variant="bodyMd" as="h3" fontWeight="semibold">
                {name} (#{order_number})
              </Text>
              <Text variant="bodySm" color="subdued">
                Items: {total_quantity} | Shipping: {shipping_code || 'Standard'}
              </Text>
              <InlineStack gap="2" align="start">
                {/* Transfer info（在状态标签左侧）*/}
                {orderStatus === 'waiting' && transferInfo && (
                  <Text variant="bodySm" fontWeight="bold" tone="info">
                    {transferInfo.transferFroms.join(', ')}, {formatDate(transferInfo.estimateMonth, transferInfo.estimateDay)}
                  </Text>
                )}
                
                {/* 状态标签 */}
                {getStatusBadge(orderStatus)}
                
                {box_type && (
                  <Badge tone="info">Box: {box_type}</Badge>
                )}
                {weight && (
                  <Badge>Weight: {weight}g</Badge>
                )}
                {hasWeightWarning && (
                  <Badge tone="warning">⚠️ Weight Warning</Badge>
                )}
              </InlineStack>
            </BlockStack>
          </div>
          <div>
            {/* Waiting 状态不显示按钮 */}
            {orderStatus !== 'waiting' && (
              <Button onClick={(e) => handleStatusClick(e, shopify_order_id, status)}>
                {status === 'holding' ? 'Resume' : status === 'ready' ? 'Reopen' : 'Hold'}
              </Button>
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
                  { label: 'Holding', value: 'holding' },
                  { label: 'Ready', value: 'ready' }
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
              renderItem={renderItem}
              emptyState={<Banner>No orders to pack</Banner>}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Packer;