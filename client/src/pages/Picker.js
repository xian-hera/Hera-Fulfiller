import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
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
  ButtonGroup,
  ChoiceList,
  Modal,
  BlockStack,
  Banner,
  InlineStack
} from '@shopify/polaris';
import { SortIcon, ImageIcon } from '@shopify/polaris-icons';
import NumericKeypad from '../components/NumericKeypad';

const Picker = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [isSorted, setIsSorted] = useState(() => {
    // 🆕 从 localStorage 恢复排序状态
    return localStorage.getItem('pickerSortEnabled') === 'true';
  });
  const [statusFilter, setStatusFilter] = useState(['picking', 'missing', 'picked']);
  const [selectedImage, setSelectedImage] = useState(null);
  const [quantityModal, setQuantityModal] = useState(null);
  const [pickedQuantity, setPickedQuantity] = useState('');
  // 🆕 MTL10 库存相关
  const [mtl10Inventory, setMtl10Inventory] = useState({});
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  // 🆕 Clean 功能相关
  const [cleanModal, setCleanModal] = useState(null);
  const [isCheckingClean, setIsCheckingClean] = useState(false);

  // 🆕 计算每个状态的实时数量（按 quantity 累加）
  const getStatusCounts = useCallback(() => {
    return {
      picking: items
        .filter(item => item.picker_status === 'picking')
        .reduce((sum, item) => sum + item.quantity, 0),
      missing: items
        .filter(item => item.picker_status === 'missing')
        .reduce((sum, item) => sum + item.quantity, 0),
      picked: items
        .filter(item => item.picker_status === 'picked')
        .reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [items]);

  // 🆕 增强的排序函数：先按 type，再按 SKU 数字
  const sortItems = useCallback((itemsToSort) => {
    return [...itemsToSort].sort((a, b) => {
      // 1. 先按 type 排序
      const typeA = (a.sort_type || '').toLowerCase();
      const typeB = (b.sort_type || '').toLowerCase();
      const typeCompare = typeA.localeCompare(typeB);
      
      if (typeCompare !== 0) return typeCompare;
      
      // 2. 相同 type 内按 SKU 数字排序
      const skuA = a.sku || '';
      const skuB = b.sku || '';
      
      // 提取 SKU 中的数字部分
      const numA = parseInt(skuA.match(/\d+/)?.[0] || '0');
      const numB = parseInt(skuB.match(/\d+/)?.[0] || '0');
      
      return numA - numB;
    });
  }, []);

  // 修复：applyFilters 现在会保持排序状态
  const applyFilters = useCallback(() => {
    let filtered = items.filter(item => statusFilter.includes(item.picker_status));
    
    // 🆕 如果当前是排序状态，应用排序（忽略状态，对所有 item 排序）
    if (isSorted) {
      filtered = sortItems(filtered);
    }
    
    setFilteredItems(filtered);
  }, [items, statusFilter, isSorted, sortItems]);

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [items, statusFilter, applyFilters]);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/picker/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  // 🆕 查询 MTL10 库存（只查询 picking 且未查询过的 items）
  const handleCheckStock = async () => {
    setIsLoadingInventory(true);
    try {
      // 查询 picking 和 missing 状态且未查询过的 items
      const pickingItems = items.filter(
        item => (item.picker_status === 'picking' || item.picker_status === 'missing') && mtl10Inventory[item.id] === undefined
      );
      
      if (pickingItems.length === 0) {
        setIsLoadingInventory(false);
        return;
      }
      
      const itemIds = pickingItems.map(item => item.id);
      
      console.log(`📦 Checking MTL10 stock for ${itemIds.length} items...`);
      
      const response = await axios.post('/api/picker/items/batch-mtl10-inventory', {
        itemIds
      });
      
      console.log(`✓ Received inventory for ${Object.keys(response.data.inventory).length} items`);
      
      // 🔍 调试：打印返回的数据
      console.log('Inventory data:', response.data.inventory);
      Object.entries(response.data.inventory).forEach(([itemId, data]) => {
        console.log(`  Item ${itemId}:`, data);
      });
      
      // 合并新查询的库存
      setMtl10Inventory(prev => {
        const merged = { ...prev, ...response.data.inventory };
        console.log('Merged inventory:', merged);
        return merged;
      });
    } catch (error) {
      console.error('Error fetching MTL10 inventory:', error);
    } finally {
      setIsLoadingInventory(false);
    }
  };

  // 🆕 Clean 功能：检查已完成的订单
  const handleCheckClean = async () => {
    setIsCheckingClean(true);
    try {
      console.log('🧹 Checking for fulfilled orders...');
      
      const response = await axios.get('/api/picker/check-fulfilled-orders');
      
      console.log('✓ Clean check result:', response.data);
      
      if (response.data.orders.length === 0) {
        // 没有需要清理的订单
        alert('No fulfilled orders found in Picker.');
        return;
      }
      
      // 显示确认弹窗
      setCleanModal({
        orders: response.data.orders,
        item_ids: response.data.item_ids,
        total_items: response.data.total_items,
        total_quantity: response.data.total_quantity
      });
    } catch (error) {
      console.error('Error checking fulfilled orders:', error);
      alert('Error checking fulfilled orders. Please try again.');
    } finally {
      setIsCheckingClean(false);
    }
  };

  // 🆕 Clean 功能：执行清理
  const handleConfirmClean = async () => {
    if (!cleanModal) return;
    
    try {
      console.log(`🗑️ Cleaning ${cleanModal.item_ids.length} items...`);
      
      const response = await axios.post('/api/picker/clean-fulfilled-items', {
        item_ids: cleanModal.item_ids
      });
      
      console.log(`✓ Cleaned ${response.data.deleted_count} items`);
      
      // 关闭弹窗
      setCleanModal(null);
      
      // 重新加载 items
      loadItems();
      
      alert(`Successfully cleaned ${response.data.deleted_count} items from ${cleanModal.orders.length} fulfilled orders.`);
    } catch (error) {
      console.error('Error cleaning fulfilled items:', error);
      alert('Error cleaning items. Please try again.');
    }
  };

  // 🆕 改进的排序切换函数
  const handleSort = () => {
    const newSortState = !isSorted;
    setIsSorted(newSortState);
    
    // 🆕 持久化到 localStorage
    localStorage.setItem('pickerSortEnabled', newSortState.toString());
    
    if (newSortState) {
      // 启用排序
      const sorted = sortItems(filteredItems);
      setFilteredItems(sorted);
    } else {
      // 取消排序 - 重新应用过滤，不排序
      applyFilters();
    }
  };

  const updateItemStatus = async (itemId, newStatus) => {
    try {
      await axios.patch(`/api/picker/items/${itemId}/status`, { status: newStatus });
      setItems(items.map(item => 
        item.id === itemId ? { ...item, picker_status: newStatus } : item
      ));
      // isSorted 状态会保持，applyFilters 会自动重新排序
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleGreenClick = (item) => {
    if (item.picker_status === 'picked') {
      updateItemStatus(item.id, 'picking');
    } else {
      updateItemStatus(item.id, 'picked');
    }
  };

  const handleRedClick = (item) => {
    if (item.quantity === 1) {
      updateItemStatus(item.id, 'missing');
    } else {
      setQuantityModal(item);
      setPickedQuantity('');
    }
  };

  const handleUndoMissing = (item) => {
    updateItemStatus(item.id, 'picking');
  };

  const handleNumberClick = (number) => {
    setPickedQuantity(prev => prev + number);
  };

  const handleBackspace = () => {
    setPickedQuantity(prev => prev.slice(0, -1));
  };

  const handleQuantitySubmit = async () => {
    const qty = parseInt(pickedQuantity);
    
    // 验证：必须是 0 到 quantity-1 之间的数字
    if (isNaN(qty) || qty < 0 || qty >= quantityModal.quantity) {
      alert(`Please enter a valid quantity (0-${quantityModal.quantity - 1})`);
      return;
    }

    try {
      if (qty === 0) {
        // 如果输入 0，直接将整个 item 标记为 missing
        await axios.patch(`/api/picker/items/${quantityModal.id}/status`, { 
          status: 'missing' 
        });
        await fetchItems();
      } else {
        // 如果输入 1 到 quantity-1，调用 split API
        await axios.post(`/api/picker/items/${quantityModal.id}/split`, {
          pickedQuantity: qty
        });
        await fetchItems();
      }
      
      setQuantityModal(null);
      setPickedQuantity('');
      // isSorted 状态会保持，applyFilters 会自动重新排序
    } catch (error) {
      console.error('Error handling quantity:', error);
      alert('Error processing item. Please try again.');
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url && item.url_handle) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand} ${item.title}`
      });
    }
  };

  const getItemBadge = (status) => {
    switch (status) {
      case 'picked':
        return <Badge tone="success">Picked</Badge>;
      case 'missing':
        return <Badge tone="critical">Missing</Badge>;
      default:
        return <Badge>Picking</Badge>;
    }
  };

  // 格式化 SKU：每4位加一个空格
  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  const renderItem = (item) => {
    const { id, quantity, image_url, order_name, display_type, sku, brand, title, size, picker_status, variant_title } = item;
    
    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail
          source={image_url}
          alt={title}
          size="large"
        />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <div className="picker-item-container">
        {/* 桌面端：状态标签在右上角 */}
        <div className="picker-item-badge-desktop">
          {getItemBadge(picker_status)}
        </div>

        <div className="picker-item-main">
          {/* 桌面布局 */}
          <div className="picker-item-desktop">
            <div className="picker-item-thumbnail">
              {media}
            </div>

            <div className="picker-item-quantity">
              {quantity}
            </div>

            <div className="picker-item-info">
              <BlockStack gap="1">
                <div style={{ 
                  wordWrap: 'break-word', 
                  overflowWrap: 'break-word'
                }}>
                  <Text variant="bodyLg" fontWeight="bold">
                    {brand} {title} {size}
                  </Text>
                </div>
                
                {variant_title && (
                  <Text variant="bodyMd">
                    {variant_title}
                  </Text>
                )}
                
                <Text variant="bodySm">
                  {display_type}
                </Text>
                
                <Text variant="bodySm">
                  {formatSKU(sku)}
                </Text>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Text variant="bodySm" tone="subdued">
                    {order_name}
                  </Text>
                  {/* 🆕 Desktop: QOH 显示在订单号右边 */}
                  {mtl10Inventory[id] !== undefined && mtl10Inventory[id] !== null && (
                    <span style={{ fontSize: '12px' }}>
                      <span style={{ color: '#8c9196', fontSize: '11px' }}>QOH </span>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: (typeof mtl10Inventory[id] === 'object' && mtl10Inventory[id].discontinued) ? '#d72c0d' : '#202223' 
                      }}>
                        {typeof mtl10Inventory[id] === 'object' ? mtl10Inventory[id].quantity : mtl10Inventory[id]}
                      </span>
                    </span>
                  )}
                </div>
              </BlockStack>
            </div>

            <div className="picker-item-buttons-desktop">
              {picker_status === 'picked' ? (
                <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-undo">
                  Undo
                </button>
              ) : picker_status === 'missing' ? (
                <button onClick={() => handleUndoMissing(item)} className="picker-btn picker-btn-undo">
                  Undo
                </button>
              ) : (
                <div className="picker-btn-group">
                  <button onClick={() => handleRedClick(item)} className="picker-btn picker-btn-missing">
                    Missing
                  </button>
                  <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-picked">
                    Picked
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 手机布局 */}
          <div className="picker-item-mobile">
            {/* 上半部分：文本信息 */}
            <div className="picker-item-mobile-text">
              <div style={{ marginBottom: '4px' }}>
                <Text variant="bodyMd" fontWeight="bold">
                  {brand} {title} {size}
                </Text>
              </div>
              
              {/* 添加 variant_title */}
              {variant_title && (
                <div style={{ marginBottom: '4px' }}>
                  <Text variant="bodySm">
                    {variant_title}
                  </Text>
                </div>
              )}
              
              <div style={{ marginBottom: '2px' }}>
                <Text variant="bodySm">
                  {display_type}
                </Text>
              </div>
              <div style={{ marginBottom: '2px' }}>
                <Text variant="bodySm">
                  {formatSKU(sku)}
                </Text>
              </div>
              <div>
                <Text variant="bodySm" tone="subdued">
                  {order_name}
                </Text>
              </div>
            </div>

            {/* 下半部分：图片 + 数量 + 状态&按钮 */}
            <div className="picker-item-mobile-bottom">
              <div className="picker-item-thumbnail-mobile">
                {media}
              </div>

              <div className="picker-item-quantity-mobile">
                {quantity}
                {/* 🆕 Mobile: QOH 显示在 quantity 下方 */}
                {mtl10Inventory[id] !== undefined && mtl10Inventory[id] !== null && (
                  <div style={{ 
                    fontSize: '11px',
                    marginTop: '4px',
                    lineHeight: '1.2'
                  }}>
                    <span style={{ color: '#8c9196', fontSize: '10px' }}>QOH </span>
                    <span style={{ 
                      fontWeight: 'bold', 
                      color: (typeof mtl10Inventory[id] === 'object' && mtl10Inventory[id].discontinued) ? '#d72c0d' : '#202223' 
                    }}>
                      {typeof mtl10Inventory[id] === 'object' ? mtl10Inventory[id].quantity : mtl10Inventory[id]}
                    </span>
                  </div>
                )}
              </div>

              <div className="picker-item-mobile-right">
                <div className="picker-item-badge-mobile">
                  {getItemBadge(picker_status)}
                </div>

                <div className="picker-item-buttons-mobile">
                  {picker_status === 'picked' ? (
                    <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-undo">
                      Undo
                    </button>
                  ) : picker_status === 'missing' ? (
                    <button onClick={() => handleUndoMissing(item)} className="picker-btn picker-btn-undo">
                      Undo
                    </button>
                  ) : (
                    <div className="picker-btn-group-mobile">
                      <button onClick={() => handleRedClick(item)} className="picker-btn picker-btn-missing">
                        Missing
                      </button>
                      <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-picked">
                        Picked
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 🆕 获取实时数量
  const statusCounts = getStatusCounts();

  return (
    <>
      <style>{`
        /* Picker 响应式样式 */
        .picker-item-container {
          padding: 22px 16px;
          position: relative;
        }

        .picker-item-badge-desktop {
          position: absolute;
          top: 22px;
          right: 16px;
        }

        .picker-item-badge-mobile {
          display: none;
        }

        .picker-item-main {
          display: flex;
          align-items: center;
        }

        .picker-item-desktop {
          display: flex;
          align-items: center;
          width: 100%;
        }

        .picker-item-mobile {
          display: none;
        }

        .picker-item-thumbnail {
          margin-right: 16px;
          flex-shrink: 0;
        }

        .picker-item-quantity {
          font-size: 38px;
          line-height: 1;
          margin-right: 20px;
          margin-top: 5px;
          min-width: 50px;
          flex-shrink: 0;
        }

        .picker-item-info {
          flex: 1;
          margin-left: -30px;
          max-width: calc(100% - 300px);
        }

        .picker-item-buttons-desktop {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          margin-top: 10px;
        }

        .picker-btn-group {
          display: flex;
          gap: 25px;
        }

        .picker-btn {
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }

        .picker-btn-undo {
          background-color: white;
          color: black;
          border: 1px solid #c4cdd5;
          padding: 6px 12px;
          font-size: 13px;
          min-width: 60px;
        }

        .picker-btn-missing {
          background-color: #ec8b84ff;
          color: white;
          border: none;
          padding: 6px 12px;
          font-size: 13px;
          min-width: 60px;
        }

        .picker-btn-picked {
          background-color: #6db477ff;
          color: white;
          border: none;
          padding: 8px 16px;
          font-size: 14px;
          min-width: 80px;
        }

        /* 手机端 ChoiceList 横向布局 */
        @media (max-width: 600px) {
          .Polaris-ChoiceList__Choices {
            display: flex !important;
            flex-direction: row !important;
            gap: 16px !important;
          }

          .Polaris-ChoiceList__Choice {
            margin-bottom: 0 !important;
          }
        }

        /* Modal 和 Keypad 布局修复 */
        .picker-modal-content {
          position: relative;
          min-height: 400px;
        }

        .picker-modal-input-section {
          margin-bottom: 30px;
        }

        .picker-modal-keypad {
          margin-top: 30px;
        }

        /* 手机响应式 (600px 以下) */
        @media (max-width: 600px) {
          .picker-item-container {
            padding: 16px 12px;
          }

          /* 隐藏桌面布局 */
          .picker-item-desktop {
            display: none;
          }

          .picker-item-badge-desktop {
            display: none;
          }

          /* 显示手机布局 */
          .picker-item-mobile {
            display: block;
            width: 100%;
          }

          .picker-item-mobile-text {
            margin-bottom: 12px;
          }

          .picker-item-mobile-bottom {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .picker-item-thumbnail-mobile {
            flex-shrink: 0;
          }

          .picker-item-quantity-mobile {
            font-size: 30px;
            line-height: 1;
            margin-top: 5px;
            min-width: 45px;
            flex-shrink: 0;
          }

          .picker-item-mobile-right {
            margin-left: auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
          }

          .picker-item-badge-mobile {
            display: block;
          }

          .picker-item-buttons-mobile {
            display: flex;
            justify-content: flex-end;
          }

          .picker-btn-group-mobile {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .picker-btn-missing,
          .picker-btn-picked {
            min-width: 70px;
            padding: 6px 12px;
            font-size: 13px;
          }
        }
      `}</style>

      <Page
        title="Picker"
        backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
        primaryAction={{
          content: isSorted ? 'Unsort' : 'Sort by Type',
          icon: SortIcon,
          onAction: handleSort
        }}
        secondaryActions={[
          {
            content: isLoadingInventory ? 'Checking...' : 'Check Stock',
            onAction: handleCheckStock,
            loading: isLoadingInventory,
            disabled: isLoadingInventory
          },
          {
            content: isCheckingClean ? 'Checking...' : 'Clean',
            onAction: handleCheckClean,
            loading: isCheckingClean,
            disabled: isCheckingClean,
            destructive: true
          }
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <ChoiceList
                  title="Show items"
                  choices={[
                    { label: `Picking (${statusCounts.picking})`, value: 'picking' },
                    { label: `Missing (${statusCounts.missing})`, value: 'missing' },
                    { label: `Picked (${statusCounts.picked})`, value: 'picked' }
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
              <div>
                {filteredItems.length === 0 ? (
                  <Banner>No items to pick</Banner>
                ) : (
                  filteredItems.map(item => (
                    <div key={item.id} style={{ borderBottom: '1px solid #e1e3e5' }}>
                      {renderItem(item)}
                    </div>
                  ))
                )}
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

        {/* Quantity Modal */}
        <Modal
          open={quantityModal !== null}
          onClose={() => setQuantityModal(null)}
          title="Enter Picked Quantity"
        >
          <Modal.Section>
            {quantityModal && (
              <div className="picker-modal-content">
                <div className="picker-modal-input-section">
                  <Text>Total quantity: {quantityModal.quantity}</Text>
                  <Text variant="bodySm" tone="subdued">Enter 0 if you have none, or 1-{quantityModal.quantity - 1} for the amount you have</Text>
                  <div style={{ marginTop: '12px' }}>
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
                      justifyContent: 'center'
                    }}>
                      {pickedQuantity || '0'}
                    </div>
                  </div>
                </div>

                <div className="picker-modal-keypad">
                  <NumericKeypad
                    onNumberClick={handleNumberClick}
                    onBackspace={handleBackspace}
                  />
                </div>

                <div style={{ 
                  marginTop: '20px',
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end'
                }}>
                  <Button onClick={() => setQuantityModal(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleQuantitySubmit}>
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </Modal.Section>
        </Modal>
      </Page>

      {/* 🆕 Clean Confirmation Modal */}
      {cleanModal && (
        <Modal
          open={true}
          onClose={() => setCleanModal(null)}
          title="Clean Fulfilled Orders"
          primaryAction={{
            content: 'Proceed',
            onAction: handleConfirmClean,
            destructive: true
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setCleanModal(null)
            }
          ]}
        >
          <Modal.Section>
            <BlockStack gap="4">
              <Text variant="headingMd">
                The following orders have been fulfilled and will be removed from Picker:
              </Text>
              
              <Box>
                {cleanModal.orders.map((order, index) => (
                  <div key={index} style={{ 
                    padding: '12px', 
                    borderBottom: index < cleanModal.orders.length - 1 ? '1px solid #e1e3e5' : 'none' 
                  }}>
                    <Text variant="bodyMd" fontWeight="bold">
                      {order.order_name}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Status: {order.fulfillment_status} | Items: {order.item_count} | Quantity: {order.total_quantity}
                    </Text>
                  </div>
                ))}
              </Box>
              
              <div style={{ 
                padding: '12px', 
                backgroundColor: '#f6f6f7', 
                borderRadius: '8px' 
              }}>
                <Text variant="headingSm">
                  Total: {cleanModal.orders.length} orders, {cleanModal.total_items} items, {cleanModal.total_quantity} units
                </Text>
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </>
  );
};

export default Picker;