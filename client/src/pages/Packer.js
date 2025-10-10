import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';  // 确保使用正确的 axios
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
        // 自定义紫色标签
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
      shipping_title, 
      status,
      orderStatus, 
      box_type, 
      weight, 
      hasWeightWarning,
      transferInfo,
      is_edited  // 添加 is_edited
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
                {name}
              </Text>
              <Text variant="bodySm" color="subdued">
                Items: {total_quantity}
              </Text>
            </BlockStack>
          </div>
          
          {/* 右侧区域：从右往左排列 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* 位置5-1（从左到右） */}
            
            {/* Ready 状态的额外信息 */}
            {orderStatus === 'ready' && (
              <>
                {/* 位置5: Shipping（只在 ready 且有 warning 时显示）*/}
                {hasWeightWarning && shipping_title && (
                  <Badge tone="info">{shipping_title}</Badge>
                )}
                
                {/* 位置4/3: Box Type */}
                {box_type && (
                  <Badge tone="info">Box: {box_type}</Badge>
                )}
                
                {/* 位置3/2: Weight（如果没有 warning，这是位置3；有 warning 则是位置4）*/}
                {weight && (
                  <Badge>Weight: {weight}g</Badge>
                )}
                
                {/* 位置2: Shipping（只在 ready 且没有 warning 时显示）*/}
                {!hasWeightWarning && shipping_title && (
                  <Badge tone="info">{shipping_title}</Badge>
                )}
              </>
            )}
            
            {/* Waiting 状态的 Transfer Info */}
            {orderStatus === 'waiting' && transferInfo && (
              <Text variant="bodySm" fontWeight="bold" tone="info">
                {transferInfo.transferFroms.join(', ')}, {formatDate(transferInfo.estimateMonth, transferInfo.estimateDay)}
              </Text>
            )}
            
            {/* 位置3: Edited Badge（红色）*/}
            {is_edited && (
              <Badge tone="critical">Edited</Badge>
            )}
            
            {/* 位置2: Weight Warning */}
            {hasWeightWarning && (
              <Badge tone="warning">⚠️ Weight</Badge>
            )}
            
            {/* 位置1: 状态标签 */}
            {getStatusBadge(orderStatus)}
            
            {/* Hold/Undo 按钮（所有状态都显示）*/}
            <Button onClick={(e) => handleStatusClick(e, shopify_order_id, status)}>
              {status === 'holding' ? 'Undo' : 'Hold'}
            </Button>
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