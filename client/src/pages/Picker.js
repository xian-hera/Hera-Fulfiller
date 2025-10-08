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
                
                <Text variant="bodySm" tone="subdued">
                  {order_name}
                </Text>
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
              <div className="picker-modal-content">
                <div className="picker-modal-input-section">
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
    </>
  );
};

export default Picker;