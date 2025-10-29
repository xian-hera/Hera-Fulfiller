import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
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
  Banner
} from '@shopify/polaris';
import { SortIcon } from '@shopify/polaris-icons';

const Packer = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  
  // 🆕 从 localStorage 恢复筛选设置
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = localStorage.getItem('packerStatusFilter');
    return saved ? JSON.parse(saved) : ['packing', 'waiting', 'holding', 'ready'];
  });
  
  const [showEditedOnly, setShowEditedOnly] = useState(() => {
    const saved = localStorage.getItem('packerShowEditedOnly');
    return saved === 'true';
  });
  
  const [isSorted, setIsSorted] = useState(false);

  // 🆕 保存筛选设置到 localStorage
  useEffect(() => {
    localStorage.setItem('packerStatusFilter', JSON.stringify(statusFilter));
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem('packerShowEditedOnly', showEditedOnly.toString());
  }, [showEditedOnly]);

  const applyFilters = useCallback(() => {
    let filtered = orders.filter(order => statusFilter.includes(order.orderStatus));
    
    // 如果启用了 "只显示 Edited"，进一步过滤
    if (showEditedOnly) {
      filtered = filtered.filter(order => order.is_edited);
    }
    
    // 如果启用了排序，按订单号排序
    if (isSorted) {
      filtered = filtered.sort((a, b) => {
        const orderNumA = parseInt(a.order_number) || 0;
        const orderNumB = parseInt(b.order_number) || 0;
        return orderNumA - orderNumB;
      });
    }
    
    setFilteredOrders(filtered);
  }, [orders, statusFilter, showEditedOnly, isSorted]);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, statusFilter, showEditedOnly, isSorted, applyFilters]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      console.log('Fetched orders:', response.data);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const handleSort = () => {
    setIsSorted(!isSorted);
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
      await fetchOrders();
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

  const formatDate = (month, day) => {
    if (!month || !day) return '';
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}/${d}`;
  };

  // 计算每种状态的数量
  const getStatusCounts = () => {
    const counts = {
      packing: 0,
      waiting: 0,
      holding: 0,
      ready: 0,
      edited: 0
    };
    
    orders.forEach(order => {
      if (counts.hasOwnProperty(order.orderStatus)) {
        counts[order.orderStatus]++;
      }
      if (order.is_edited) {
        counts.edited++;
      }
    });
    
    return counts;
  };

  const statusCounts = getStatusCounts();

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
      is_edited,
      packer_note // 🆕 note 字段
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <Text variant="bodyMd" as="h3" fontWeight="semibold">
                  {name}
                </Text>
                {/* 🆕 显示 note（小字，灰色）*/}
                {packer_note && (
                  <Text variant="bodySm" tone="subdued">
                    {packer_note}
                  </Text>
                )}
              </div>
              <Text variant="bodySm" color="subdued">
                Items: {total_quantity}
              </Text>
            </BlockStack>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {orderStatus === 'ready' && (
              <>
                {hasWeightWarning && shipping_title && (
                  <Badge tone="info">{shipping_title}</Badge>
                )}
                
                {box_type && (
                  <Badge tone="info">Box: {box_type}</Badge>
                )}
                
                {weight && (
                  <Badge>Weight: {weight}g</Badge>
                )}
                
                {!hasWeightWarning && shipping_title && (
                  <Badge tone="info">{shipping_title}</Badge>
                )}
              </>
            )}
            
            {orderStatus === 'waiting' && transferInfo && (
              <Text variant="bodySm" fontWeight="bold" tone="info">
                {transferInfo.transferFroms.join(', ')}, {formatDate(transferInfo.estimateMonth, transferInfo.estimateDay)}
              </Text>
            )}
            
            {is_edited && (
              <Badge tone="critical">Edited</Badge>
            )}
            
            {hasWeightWarning && (
              <Badge tone="warning">⚠️ Weight</Badge>
            )}
            
            {getStatusBadge(orderStatus)}
            
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
      primaryAction={{
        content: isSorted ? 'Unsort' : 'Sort by Order #',
        icon: SortIcon,
        onAction: handleSort
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <BlockStack gap="4">
                <ChoiceList
                  title="Show orders"
                  choices={[
                    { label: `Packing (${statusCounts.packing})`, value: 'packing' },
                    { label: `Waiting (${statusCounts.waiting})`, value: 'waiting' },
                    { label: `Holding (${statusCounts.holding})`, value: 'holding' },
                    { label: `Ready (${statusCounts.ready})`, value: 'ready' }
                  ]}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  allowMultiple
                />
                
                {/* Edited 单独的复选框 */}
                <div style={{ 
                  paddingTop: '12px', 
                  borderTop: '1px solid #e1e3e5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <input
                    type="checkbox"
                    id="edited-filter"
                    checked={showEditedOnly}
                    onChange={(e) => setShowEditedOnly(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label 
                    htmlFor="edited-filter" 
                    style={{ cursor: 'pointer', fontSize: '14px' }}
                  >
                    Show only Edited orders ({statusCounts.edited})
                  </label>
                </div>
              </BlockStack>
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