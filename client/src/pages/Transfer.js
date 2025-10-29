import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Badge,
  Button,
  ChoiceList,
  Modal,
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame,
  Checkbox
} from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';

const Transfer = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [clearMode, setClearMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState(['transferring', 'waiting', 'received']);
  const [previousStatusFilter, setPreviousStatusFilter] = useState(['transferring', 'waiting', 'received']); // 🆕 保存之前的状态
  const [receivingEnabled, setReceivingEnabled] = useState(false); // 🆕 Receiving 筛选开关
  const [receivingFromFilter, setReceivingFromFilter] = useState([]); // 🆕 transfer_from 筛选
  const [receivingDateFilter, setReceivingDateFilter] = useState([]); // 🆕 transfer_date 筛选
  const [receivingOptions, setReceivingOptions] = useState({ transferFroms: [], transferDates: [] }); // 🆕 筛选选项
  const [transferModal, setTransferModal] = useState(null);
  const [transferData, setTransferData] = useState({
    transferQuantity: '',
    transferFrom: '',
    estimateDay: ''
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 🆕 计算每个状态的实时数量（按 quantity 累加）
  const getStatusCounts = useCallback(() => {
    return {
      transferring: items
        .filter(item => item.status === 'transferring')
        .reduce((sum, item) => sum + item.quantity, 0),
      waiting: items
        .filter(item => item.status === 'waiting')
        .reduce((sum, item) => sum + item.quantity, 0),
      received: items
        .filter(item => item.status === 'received' || item.status === 'found')
        .reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [items]);

  const applyFilters = useCallback(() => {
    let filtered = items.filter(item => {
      // 状态筛选
      if (item.status === 'transferring' && !statusFilter.includes('transferring')) return false;
      if (item.status === 'waiting' && !statusFilter.includes('waiting')) return false;
      if ((item.status === 'received' || item.status === 'found') && !statusFilter.includes('received')) return false;
      
      // 🆕 Receiving 筛选（只在启用时生效）
      if (receivingEnabled) {
        // transfer_from 筛选
        if (receivingFromFilter.length > 0 && !receivingFromFilter.includes(item.transfer_from)) {
          return false;
        }
        
        // transfer_date 筛选
        if (receivingDateFilter.length > 0 && !receivingDateFilter.includes(item.transfer_date)) {
          return false;
        }
      }
      
      return true;
    });
    
    // 🆕 如果 Receiving 启用，按 transfer_from 升序 → transfer_date 升序排序
    if (receivingEnabled) {
      filtered = filtered.sort((a, b) => {
        // 先按 transfer_from 排序
        const fromA = a.transfer_from || '';
        const fromB = b.transfer_from || '';
        if (fromA !== fromB) {
          return fromA.localeCompare(fromB);
        }
        
        // 相同 transfer_from，按 transfer_date 排序（早的在前）
        const dateA = a.transfer_date || '';
        const dateB = b.transfer_date || '';
        return dateA.localeCompare(dateB);
      });
    }
    
    setFilteredItems(filtered);
  }, [items, statusFilter, receivingEnabled, receivingFromFilter, receivingDateFilter]);

  useEffect(() => {
    fetchItems();
    fetchReceivingOptions(); // 🆕 获取筛选选项
  }, []);

  useEffect(() => {
    applyFilters();
  }, [items, statusFilter, receivingEnabled, receivingFromFilter, receivingDateFilter, applyFilters]);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/transfer/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching transfer items:', error);
    }
  };

  // 🆕 获取 Receiving 筛选选项
  const fetchReceivingOptions = async () => {
    try {
      const response = await axios.get('/api/transfer/receiving-options');
      setReceivingOptions(response.data);
    } catch (error) {
      console.error('Error fetching receiving options:', error);
    }
  };

  // 🆕 Receiving 开关切换
  const handleReceivingToggle = (checked) => {
    if (checked) {
      // 开启：保存当前状态，设置为 waiting + received
      setPreviousStatusFilter(statusFilter);
      setStatusFilter(['waiting', 'received']);
    } else {
      // 关闭：恢复之前的状态
      setStatusFilter(previousStatusFilter);
      setReceivingFromFilter([]);
      setReceivingDateFilter([]);
    }
    setReceivingEnabled(checked);
  };

  const handleCopy = async (itemId) => {
    try {
      const response = await axios.get(`/api/transfer/items/${itemId}/copy-text`);
      navigator.clipboard.writeText(response.data.copyText);
      showToast('Copied to clipboard!');
    } catch (error) {
      console.error('Error copying text:', error);
    }
  };

  const handleSkuCopy = (sku) => {
    navigator.clipboard.writeText(sku);
    showToast('SKU copied!');
  };

  const showToast = (message) => {
    setToastMessage(message);
    setToastActive(true);
  };

  const handleClearToggle = () => {
    setClearMode(!clearMode);
    setSelectedItems([]);
  };

  const handleItemSelect = (itemId) => {
    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter(id => id !== itemId));
    } else {
      setSelectedItems([...selectedItems, itemId]);
    }
  };

  const handleClearSelected = async () => {
    if (selectedItems.length === 0) return;
    
    try {
      await axios.post('/api/transfer/items/bulk-delete', {
        ids: selectedItems
      });
      await fetchItems();
      setSelectedItems([]);
      setClearMode(false);
      showToast(`Deleted ${selectedItems.length} items`);
    } catch (error) {
      console.error('Error clearing items:', error);
    }
  };

  const handleGreenClick = async (item) => {
    const newStatus = item.status === 'transferring' ? 'found' : 'received';
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: newStatus });
      setItems(items.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleBlueClick = (item) => {
    const currentDate = new Date();
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity.toString(),
      transferFrom: '',
      estimateDay: currentDate.getDate().toString()
    });
  };

  // 🆕 点击 Waiting 标签打开编辑 modal（预填充数据）
  const handleWaitingBadgeClick = (item) => {
    const currentDate = new Date();
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity.toString(),
      transferFrom: item.transfer_from || '',
      estimateDay: item.estimate_day ? item.estimate_day.toString() : currentDate.getDate().toString()
    });
  };

  const handleTransferSubmit = async () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const day = parseInt(transferData.estimateDay);
    let month = currentMonth;

    if (day < currentDate.getDate()) {
      month = currentMonth === 12 ? 1 : currentMonth + 1;
    }

    if (!transferData.transferFrom) {
      alert('Please enter Transfer From location');
      return;
    }

    try {
      const qty = parseInt(transferData.transferQuantity);
      if (qty < transferModal.quantity) {
        await axios.post(`/api/transfer/items/${transferModal.id}/split`, {
          transferQuantity: qty,
          transfer_from: transferData.transferFrom,
          estimate_month: month,
          estimate_day: day
        });
      } else {
        await axios.patch(`/api/transfer/items/${transferModal.id}`, {
          status: 'waiting',
          transfer_from: transferData.transferFrom,
          estimate_month: month,
          estimate_day: day
        });
      }
      await fetchItems();
      await fetchReceivingOptions(); // 🆕 刷新筛选选项
      setTransferModal(null);
    } catch (error) {
      console.error('Error updating transfer:', error);
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand} ${item.title}`
      });
    }
  };

  const getItemBadge = (status, item, onBadgeClick) => {
    switch (status) {
      case 'waiting':
        // 🆕 Waiting 标签可点击
        return (
          <span 
            onClick={(e) => {
              e.stopPropagation();
              onBadgeClick(item);
            }}
            style={{ cursor: 'pointer' }}
          >
            <Badge tone="info">Waiting</Badge>
          </span>
        );
      case 'received':
      case 'found':
        return <Badge tone="success">Received</Badge>;
      default:
        return <Badge>Transferring</Badge>;
    }
  };

  // 格式化 SKU：每4位加一个空格
  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  // 格式化日期：补零
  const formatDate = (month, day) => {
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}/${d}`;
  };

  const renderItem = (item) => {
    const { id, quantity, image_url, order_number, sku, brand, title, size, status, transfer_from, estimate_month, estimate_day, variant_title } = item;
    
    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={image_url} alt={title} size="large" />
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

        {/* 数量（38px）*/}
        <div style={{ 
          fontSize: '38px', 
          lineHeight: 1,
          marginRight: '20px',
          marginTop: '5px',
          minWidth: '50px'
        }}>
          {quantity}
        </div>

        {/* 产品信息 */}
        <div style={{ flex: 1, maxWidth: 'calc(100% - 350px)' }}>
          <BlockStack gap="1">
            {/* Brand + Title（加粗，自动换行）*/}
            <div style={{ 
              wordWrap: 'break-word', 
              overflowWrap: 'break-word',
              maxWidth: '60ch'
            }}>
              <Text variant="bodyLg" fontWeight="bold">
                {brand} {title} {size}
              </Text>
            </div>
            
            {/* Variant Title */}
            {variant_title && (
              <Text variant="bodyMd">
                {variant_title}
              </Text>
            )}
            
            {/* SKU（每4位一个空格，可点击复制）*/}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text variant="bodySm">
                {formatSKU(sku)}
              </Text>
              <button
                onClick={() => handleSkuCopy(sku)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#005bd3',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: 0
                }}
              >
                Copy
              </button>
            </div>
            
            {/* Order Number（灰色，添加#）*/}
            <Text variant="bodySm" tone="subdued">
              #{order_number}
            </Text>
          </BlockStack>
        </div>

        {/* 右侧按钮区域（垂直居中，右对齐）*/}
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '17px',
          marginLeft: 'auto'
        }}>
          {clearMode ? (
            <input
              type="checkbox"
              checked={selectedItems.includes(id)}
              onChange={() => handleItemSelect(id)}
              style={{ width: '20px', height: '20px' }}
            />
          ) : (
            <>
              {/* Transfer info 和状态标签同行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* 🆕 waiting 和 received/found 都显示 transfer info */}
                {(status === 'waiting' || status === 'received' || status === 'found') && transfer_from && (
                  <Text variant="bodySm" fontWeight="bold" as="span" tone="info">
                    {transfer_from}, {formatDate(estimate_month, estimate_day)}
                  </Text>
                )}
                {getItemBadge(status, item, handleWaitingBadgeClick)}
              </div>
              
              {/* 主按钮 */}
              {status === 'transferring' && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleBlueClick(item)}
                    style={{
                      backgroundColor: 'white',
                      color: '#0080FF',
                      border: '2px solid #0080FF',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      minWidth: '80px'
                    }}
                  >
                    Transfer
                  </button>
                  <button
                    onClick={() => handleGreenClick(item)}
                    style={{
                      backgroundColor: '#00A047',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      minWidth: '80px'
                    }}
                  >
                    Found
                  </button>
                </div>
              )}
              
              {status === 'waiting' && (
                <button
                  onClick={() => handleGreenClick(item)}
                  style={{
                    backgroundColor: '#0080FF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    minWidth: '100px'
                  }}
                >
                  Received
                </button>
              )}
              
              {/* Copy 按钮（最小尺寸，白底黑字）*/}
              <button
                onClick={() => handleCopy(id)}
                style={{
                  backgroundColor: 'white',
                  color: '#202223',
                  border: '1px solid #c9cccf',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  minWidth: '60px'
                }}
              >
                Copy
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
  ) : null;

  // Get current month for display
  const currentMonth = new Date().getMonth() + 1;
  
  // 🆕 获取实时数量
  const statusCounts = getStatusCounts();

  return (
    <Frame>
      <Page
        title="Transfer"
        backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
        primaryAction={{
          content: clearMode ? 'Delete Selected' : 'Clear Mode',
          destructive: clearMode,
          onAction: clearMode ? handleClearSelected : handleClearToggle
        }}
        secondaryActions={
          clearMode
            ? [
                {
                  content: 'Cancel',
                  onAction: () => {
                    setClearMode(false);
                    setSelectedItems([]);
                  }
                }
              ]
            : []
        }
      >
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <BlockStack gap="4">
                  <ChoiceList
                    title="Show items"
                    choices={[
                      { label: `Transferring (${statusCounts.transferring})`, value: 'transferring' },
                      { label: `Waiting (${statusCounts.waiting})`, value: 'waiting' },
                      { label: `Received/Found (${statusCounts.received})`, value: 'received' }
                    ]}
                    selected={statusFilter}
                    onChange={setStatusFilter}
                    allowMultiple
                  />
                  
                  {/* 🆕 Receiving 筛选 */}
                  <div style={{ 
                    paddingTop: '12px', 
                    borderTop: '1px solid #e1e3e5'
                  }}>
                    <div style={{ marginBottom: '12px' }}>
                      <Checkbox
                        label="Receiving"
                        checked={receivingEnabled}
                        onChange={handleReceivingToggle}
                      />
                    </div>
                    
                    {receivingEnabled && (
                      <BlockStack gap="3">
                        <ChoiceList
                          title="Transfer From"
                          choices={receivingOptions.transferFroms.map(from => ({
                            label: from,
                            value: from
                          }))}
                          selected={receivingFromFilter}
                          onChange={setReceivingFromFilter}
                          allowMultiple
                        />
                        
                        <ChoiceList
                          title="Transfer Date"
                          choices={receivingOptions.transferDates.map(date => ({
                            label: date,
                            value: date
                          }))}
                          selected={receivingDateFilter}
                          onChange={setReceivingDateFilter}
                          allowMultiple
                        />
                      </BlockStack>
                    )}
                  </div>
                </BlockStack>
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <div>
                {filteredItems.length === 0 ? (
                  <Banner>No items to transfer</Banner>
                ) : (
                  filteredItems.map(item => (
                    <div key={item.id}>
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

        {/* Transfer Modal */}
        <Modal
          open={transferModal !== null}
          onClose={() => setTransferModal(null)}
          title="Transfer Information"
          primaryAction={{
            content: 'Submit',
            onAction: handleTransferSubmit
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setTransferModal(null)
            }
          ]}
        >
          <Modal.Section>
            {transferModal && (
              <BlockStack gap="4">
                {transferModal.quantity > 1 && (
                  <TextField
                    label="Transfer Quantity"
                    type="number"
                    value={transferData.transferQuantity}
                    onChange={(value) => setTransferData({ ...transferData, transferQuantity: value })}
                    max={transferModal.quantity}
                    autoComplete="off"
                  />
                )}
                <TextField
                  label="Transfer From (warehouse number)"
                  value={transferData.transferFrom}
                  onChange={(value) => setTransferData({ ...transferData, transferFrom: value })}
                  placeholder="e.g., 01, 02, 03"
                  autoComplete="off"
                />
                <div>
                  <Text variant="bodyMd" as="p" fontWeight="semibold">
                    Estimated Arrival (Month/Day)
                  </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <TextField
                        type="number"
                        value={currentMonth.toString()}
                        onChange={() => {}}
                        disabled
                        prefix="Month:"
                        autoComplete="off"
                      />
                    </div>
                    <Text variant="bodyLg">/</Text>
                    <div style={{ flex: 1 }}>
                      <TextField
                        type="number"
                        value={transferData.estimateDay}
                        onChange={(value) => setTransferData({ ...transferData, estimateDay: value })}
                        min={1}
                        max={31}
                        prefix="Day:"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>

        {toastMarkup}
      </Page>
    </Frame>
  );
};

export default Transfer;