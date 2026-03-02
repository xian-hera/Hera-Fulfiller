import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Button,
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame,
  Checkbox
} from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';

const TransferPlanner = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [estimateDay, setEstimateDay] = useState('');
  const [inventoryData, setInventoryData] = useState({}); // { itemId: { location: qoh } }
  const [selectedTransfers, setSelectedTransfers] = useState({}); // { itemId: location }
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const LOCATIONS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11'];
  const LOCATION_MAP = {
    '01': 'MTL01', '02': 'MTL02', '03': 'MTL03', '04': 'MTL04', '05': 'MTL05',
    '06': 'MTL06', '07': 'MTL07', '08': 'MTL08', '09': 'MTL09', '11': 'MTL11'
  };

  useEffect(() => {
    fetchItems();
    // 设置默认 estimate day 为今天
    setEstimateDay(new Date().getDate().toString());
  }, []);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/transfer/items');
      // 只显示 transferring 状态的 items
      const transferringItems = response.data.filter(item => item.status === 'transferring');
      setItems(transferringItems);
    } catch (error) {
      console.error('Error fetching transfer items:', error);
    }
  };

  const showToast = (message) => {
    setToastMessage(message);
    setToastActive(true);
  };

  const handleLocationToggle = (location) => {
    setSelectedLocations(prev => 
      prev.includes(location) 
        ? prev.filter(l => l !== location)
        : [...prev, location]
    );
  };

  // 🆕 查询库存（增量查询）
  const handleCheckStock = async () => {
    if (selectedLocations.length === 0) {
      showToast('Please select at least one location');
      return;
    }

    // 找出还没有查询过的 locations
    const uncheckedLocations = selectedLocations.filter(loc => {
      // 检查是否所有 items 都已经有这个 location 的库存数据
      return items.some(item => !inventoryData[item.id]?.[loc]);
    });

    if (uncheckedLocations.length === 0) {
      showToast('Stock already loaded for selected locations');
      return;
    }

    setIsLoadingInventory(true);
    try {
      // 获取所有 SKUs
      const skuList = [...new Set(items.map(item => item.sku).filter(sku => sku))];
      
      // 查询选中的 locations
      const locationNames = uncheckedLocations.map(loc => LOCATION_MAP[loc]);
      
      console.log(`Checking stock for ${skuList.length} SKUs in ${locationNames.length} locations`);
      
      const response = await axios.post('/api/transfer/check-planner-stock', {
        skus: skuList,
        locations: locationNames
      });

      // 更新 inventory data
      const newInventoryData = { ...inventoryData };
      
      response.data.inventory.forEach(result => {
        const sku = result.sku;
        const location = result.location;
        const qoh = result.qoh;
        
        // 找到对应的 items
        items.forEach(item => {
          if (item.sku === sku) {
            if (!newInventoryData[item.id]) {
              newInventoryData[item.id] = {};
            }
            // 从 MTL01 转换为 01
            const shortLocation = location.replace('MTL', '');
            newInventoryData[item.id][shortLocation] = qoh;
          }
        });
      });

      setInventoryData(newInventoryData);
      showToast(`Stock loaded for ${uncheckedLocations.length} locations`);
    } catch (error) {
      console.error('Error checking stock:', error);
      showToast('Failed to load stock');
    } finally {
      setIsLoadingInventory(false);
    }
  };

  // 选择 transfer location
  const handleSelectTransferLocation = (itemId, location) => {
    setSelectedTransfers(prev => ({
      ...prev,
      [itemId]: prev[itemId] === location ? null : location
    }));
  };

  // 提交
  const handleSubmit = async () => {
    const itemsToUpdate = Object.entries(selectedTransfers)
      .filter(([itemId, location]) => location !== null)
      .map(([itemId, location]) => ({
        itemId: parseInt(itemId),
        location
      }));

    if (itemsToUpdate.length === 0) {
      showToast('Please select transfer location for at least one item');
      return;
    }

    if (!estimateDay || estimateDay < 1 || estimateDay > 31) {
      showToast('Please enter a valid estimate day');
      return;
    }

    // 计算 month
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const day = parseInt(estimateDay);
    let month = currentMonth;

    if (day < currentDate.getDate()) {
      month = currentMonth === 12 ? 1 : currentMonth + 1;
    }

    try {
      // 批量更新
      await axios.post('/api/transfer/batch-update-planner', {
        items: itemsToUpdate.map(({ itemId, location }) => ({
          id: itemId,
          transfer_from: location,
          estimate_month: month,
          estimate_day: day,
          status: 'waiting'
        }))
      });

      showToast(`Updated ${itemsToUpdate.length} items`);
      
      // 延迟返回，让用户看到 toast
      setTimeout(() => {
        navigate('/transfer');
      }, 1000);
    } catch (error) {
      console.error('Error submitting:', error);
      showToast('Failed to update items');
    }
  };

  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  const handleCopy = async (itemId) => {
    try {
      const response = await axios.get(`/api/transfer/items/${itemId}/copy-text`);
      navigator.clipboard.writeText(response.data.copyText);
      showToast('Copied to clipboard!');
    } catch (error) {
      console.error('Error copying text:', error);
      showToast('Error copying text');
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url && item.url_handle) {
      window.open(`https://herabeauty.ca/products/${item.url_handle}`, '_blank');
    }
  };

  const renderItem = (item) => {
    const { 
      id, 
      quantity = 0, 
      image_url = '', 
      order_number = '', 
      sku = '', 
      brand = '', 
      title = '', 
      size = '', 
      variant_title = '', 
      custom_name = '' 
    } = item || {};
    
    const itemInventory = inventoryData[id] || {};
    const selectedLocation = selectedTransfers[id];

    // 获取有库存的 locations (QOH > 0)
    const availableLocations = selectedLocations
      .filter(loc => itemInventory[loc] && itemInventory[loc] > 0)
      .sort((a, b) => a.localeCompare(b));

    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={image_url} alt={title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <div key={id} style={{
        padding: '22px 16px',
        borderBottom: '1px solid #e1e3e5',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        {/* 左侧：图片 */}
        <div style={{ flexShrink: 0 }}>
          {media}
        </div>

        {/* 数量 */}
        <div style={{ 
          fontSize: '38px', 
          fontWeight: 'bold',
          minWidth: '50px',
          flexShrink: 0
        }}>
          {quantity}
        </div>

        {/* 信息区 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="1">
            <Text variant="bodyLg" fontWeight="bold">
              {String(brand || '')} {String(title || '')} {String(size || '')}
            </Text>
            
            {variant_title && (
              <Text variant="bodyMd">
                {variant_title}
              </Text>
            )}

            {custom_name && (
              <Text variant="bodySm" tone="subdued">
                {custom_name}
              </Text>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text variant="bodySm">
                {formatSKU(sku)}
              </Text>
              <button
                onClick={() => handleCopy(id)}
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
            
            <Text variant="bodySm" tone="subdued">
              #{order_number}
            </Text>
          </BlockStack>
        </div>

        {/* 右侧：库存按钮 */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          minWidth: '200px'
        }}>
          {availableLocations.map(loc => {
            const qoh = itemInventory[loc];
            const isSelected = selectedLocation === loc;
            
            return (
              <button
                key={loc}
                onClick={() => handleSelectTransferLocation(id, loc)}
                style={{
                  backgroundColor: isSelected ? '#0080FF' : '#E3E3E3',
                  color: isSelected ? 'white' : '#202223',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: '70px',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontWeight: '600' }}>{loc}</span>
                {' '}
                <span style={{ fontWeight: 'bold' }}>{qoh}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
  ) : null;

  const hasSelectedTransfer = Object.values(selectedTransfers).some(loc => loc !== null);

  return (
    <Frame>
      <Page
        title="Transfer Planner"
        backAction={{ content: 'Back', onAction: () => navigate('/transfer') }}
      >
        <Layout>
          {/* 筛选区 */}
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <BlockStack gap="4">
                  <Text variant="headingMd" as="h3">Transfer from</Text>
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: '16px', 
                    flexWrap: 'wrap',
                    alignItems: 'center'
                  }}>
                    {LOCATIONS.map(loc => (
                      <Checkbox
                        key={loc}
                        label={loc}
                        checked={selectedLocations.includes(loc)}
                        onChange={() => handleLocationToggle(loc)}
                      />
                    ))}

                    <div style={{ marginLeft: 'auto', minWidth: '120px' }}>
                      <TextField
                        label="Estimate"
                        type="number"
                        value={estimateDay}
                        onChange={setEstimateDay}
                        prefix="Day:"
                        min={1}
                        max={31}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    gap: '12px',
                    justifyContent: 'space-between'
                  }}>
                    <Button
                      onClick={handleCheckStock}
                      disabled={selectedLocations.length === 0 || isLoadingInventory}
                      loading={isLoadingInventory}
                    >
                      {isLoadingInventory ? 'Checking...' : 'Check Stock'}
                    </Button>

                    <Button
                      variant="primary"
                      onClick={handleSubmit}
                      disabled={!hasSelectedTransfer || !estimateDay}
                    >
                      Submit
                    </Button>
                  </div>
                </BlockStack>
              </div>
            </Card>
          </Layout.Section>

          {/* Item 列表 */}
          <Layout.Section>
            <Card>
              <div>
                {items.length === 0 ? (
                  <Banner>No transferring items</Banner>
                ) : (
                  items.map(item => renderItem(item))
                )}
              </div>
            </Card>
          </Layout.Section>
        </Layout>

        {toastMarkup}
      </Page>
    </Frame>
  );
};

export default TransferPlanner;
