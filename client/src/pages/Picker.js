import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [isSorted, setIsSorted] = useState(false);
  const [statusFilter, setStatusFilter] = useState(['picking', 'missing', 'picked']);
  const [selectedImage, setSelectedImage] = useState(null);
  const [quantityModal, setQuantityModal] = useState(null);
  const [pickedQuantity, setPickedQuantity] = useState('');

  const applyFilters = useCallback(() => {
    const filtered = items.filter(item => statusFilter.includes(item.picker_status));
    setFilteredItems(filtered);
  }, [items, statusFilter]);

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

  const handleSort = () => {
    if (!isSorted) {
      const sorted = [...filteredItems].sort((a, b) => {
        const typeA = a.sort_type || '';
        const typeB = b.sort_type || '';
        return typeA.localeCompare(typeB);
      });
      setFilteredItems(sorted);
      setIsSorted(true);
    } else {
      applyFilters();
      setIsSorted(false);
    }
  };

  const updateItemStatus = async (itemId, newStatus) => {
    try {
      await axios.patch(`/api/picker/items/${itemId}/status`, { status: newStatus });
      setItems(items.map(item => 
        item.id === itemId ? { ...item, picker_status: newStatus } : item
      ));
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
    if (!qty || qty >= quantityModal.quantity || qty < 1) {
      alert(`Please enter a valid quantity (1-${quantityModal.quantity - 1})`);
      return;
    }

    try {
      await axios.post(`/api/picker/items/${quantityModal.id}/split`, {
        pickedQuantity: qty
      });
      await fetchItems();
      setQuantityModal(null);
      setPickedQuantity('');
    } catch (error) {
      console.error('Error splitting item:', error);
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
      <div style={{ padding: '22px 16px', position: 'relative' }}>
        {/* 状态标签固定在右上角 */}
        <div style={{ position: 'absolute', top: '22px', right: '16px' }}>
          {getItemBadge(picker_status)}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
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

          {/* 产品信息（向左移动30px，添加最大宽度限制）*/}
          <div style={{ flex: 1, marginLeft: '-30px', maxWidth: 'calc(100% - 300px)' }}>
            <BlockStack gap="1">
              {/* 第1行：Brand + Title（加粗，自动换行）*/}
              <div style={{ 
                wordWrap: 'break-word', 
                overflowWrap: 'break-word',
                maxWidth: '60ch'
              }}>
                <Text variant="bodyLg" fontWeight="bold">
                  {brand} {title} {size}
                </Text>
              </div>
              
              {/* 第2行：Variant Title */}
              {variant_title && (
                <Text variant="bodyMd">
                  {variant_title}
                </Text>
              )}
              
              {/* 第3行：Type */}
              <Text variant="bodySm">
                {display_type}
              </Text>
              
              {/* 第4行：SKU（每4位一个空格）*/}
              <Text variant="bodySm">
                {formatSKU(sku)}
              </Text>
              
              {/* 第5行：Order Number（灰色）*/}
              <Text variant="bodySm" tone="subdued">
                {order_name}
              </Text>
            </BlockStack>
          </div>

          {/* 右侧按钮（垂直居中）*/}
          <div style={{ 
            position: 'absolute', 
            right: '16px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            marginTop: '10px'
          }}>
            {picker_status === 'picked' ? (
              <button
                onClick={() => handleGreenClick(item)}
                style={{
                  backgroundColor: 'white',
                  color: 'black',
                  border: '1px solid #c4cdd5',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  minWidth: '60px'
                }}
              >
                Undo
              </button>
            ) : picker_status === 'missing' ? (
              <button
                onClick={() => handleUndoMissing(item)}
                style={{
                  backgroundColor: 'white',
                  color: 'black',
                  border: '1px solid #c4cdd5',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  minWidth: '60px'
                }}
              >
                Undo
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '25px' }}>
                <button
                  onClick={() => handleRedClick(item)}
                  style={{
                    backgroundColor: '#ec8b84ff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    minWidth: '60px'
                  }}
                >
                  Missing
                </button>
                <button
                  onClick={() => handleGreenClick(item)}
                  style={{
                    backgroundColor: '#6db477ff',
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
                  Picked
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Page
      title="Picker"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
      primaryAction={{
        content: isSorted ? 'Unsort' : 'Sort by Type',
        icon: SortIcon,
        onAction: handleSort
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <ChoiceList
                title="Show items"
                choices={[
                  { label: 'Picking', value: 'picking' },
                  { label: 'Missing', value: 'missing' },
                  { label: 'Picked', value: 'picked' }
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
            <>
              <Text>Total quantity: {quantityModal.quantity}</Text>
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
            </>
          )}
        </Modal.Section>
      </Modal>

      {/* Floating Numeric Keypad */}
      {quantityModal && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000
        }}>
          <NumericKeypad
            onNumberClick={handleNumberClick}
            onBackspace={handleBackspace}
          />
        </div>
      )}
    </Page>
  );
};

export default Picker;