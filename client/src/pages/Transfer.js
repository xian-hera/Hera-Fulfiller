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
  const [previousStatusFilter, setPreviousStatusFilter] = useState(['transferring', 'waiting', 'received']);
  const [receivingEnabled, setReceivingEnabled] = useState(false);
  const [receivingFromFilter, setReceivingFromFilter] = useState([]);
  const [receivingDateFilter, setReceivingDateFilter] = useState([]);
  const [receivingOptions, setReceivingOptions] = useState({ transferFroms: [], transferDates: [] });
  const [transferModal, setTransferModal] = useState(null);
  const [transferData, setTransferData] = useState({
    transferQuantity: '',
    transferFrom: '',
    estimateDay: ''
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Emoji mapping
  const EMOJI_MAP = {
    '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
    '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
  };

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
      if (item.status === 'transferring' && !statusFilter.includes('transferring')) return false;
      if (item.status === 'waiting' && !statusFilter.includes('waiting')) return false;
      if ((item.status === 'received' || item.status === 'found') && !statusFilter.includes('received')) return false;
      
      if (receivingEnabled) {
        if (receivingFromFilter.length > 0 && !receivingFromFilter.includes(item.transfer_from)) {
          return false;
        }
        
        if (receivingDateFilter.length > 0 && !receivingDateFilter.includes(item.transfer_date)) {
          return false;
        }
      }
      
      return true;
    });
    
    if (receivingEnabled) {
      filtered = filtered.sort((a, b) => {
        const fromA = a.transfer_from || '';
        const fromB = b.transfer_from || '';
        if (fromA !== fromB) {
          return fromA.localeCompare(fromB);
        }
        
        const dateA = a.transfer_date || '';
        const dateB = b.transfer_date || '';
        return dateA.localeCompare(dateB);
      });
    }
    
    setFilteredItems(filtered);
  }, [items, statusFilter, receivingEnabled, receivingFromFilter, receivingDateFilter]);

  useEffect(() => {
    fetchItems();
    fetchReceivingOptions();
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

  const fetchReceivingOptions = async () => {
    try {
      const response = await axios.get('/api/transfer/receiving-options');
      setReceivingOptions(response.data);
    } catch (error) {
      console.error('Error fetching receiving options:', error);
    }
  };

  const handleReceivingToggle = (checked) => {
    if (checked) {
      setPreviousStatusFilter(statusFilter);
      setStatusFilter(['waiting', 'received']);
    } else {
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

  const handleReceivedClick = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: 'received' });
      await fetchItems();
      showToast('Status changed to Received');
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Error updating status');
    }
  };

  const handleFoundClick = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: 'found' });
      await fetchItems();
      showToast('Status changed to Found');
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Error updating status');
    }
  };

  const handleTransferClick = (item) => {
    const currentDate = new Date();
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity.toString(),
      transferFrom: '',
      estimateDay: currentDate.getDate().toString()
    });
  };

  const handleUndoClick = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: 'transferring' });
      await fetchItems();
      showToast('Status changed to Transferring');
    } catch (error) {
      console.error('Error undoing status:', error);
      showToast('Error updating status');
    }
  };

  const handleOutClick = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { 
        out_of_stock: 1
      });
      await fetchItems();
      showToast('Marked as Out of Stock');
    } catch (error) {
      console.error('Error setting out of stock:', error);
      showToast('Error updating status');
    }
  };

  const handleOutUndo = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { 
        out_of_stock: 0
      });
      await fetchItems();
      showToast('Out of Stock removed');
    } catch (error) {
      console.error('Error removing out of stock:', error);
      showToast('Error updating status');
    }
  };

  const handleTransferSubmit = async () => {
    if (!transferData.transferFrom || !transferData.estimateDay) {
      showToast('Please fill in all fields');
      return;
    }

    const qty = parseInt(transferData.transferQuantity);
    const day = parseInt(transferData.estimateDay);

    if (isNaN(qty) || qty < 1 || qty > transferModal.quantity) {
      showToast('Invalid quantity');
      return;
    }

    if (isNaN(day) || day < 1 || day > 31) {
      showToast('Invalid day');
      return;
    }

    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;

      if (qty === transferModal.quantity) {
        await axios.patch(`/api/transfer/items/${transferModal.id}`, {
          status: 'waiting',
          transfer_from: transferData.transferFrom,
          estimate_month: month,
          estimate_day: day
        });
      } else {
        await axios.post(`/api/transfer/items/${transferModal.id}/split`, {
          transferQuantity: qty,
          transfer_from: transferData.transferFrom,
          estimate_month: month,
          estimate_day: day
        });
      }

      await fetchItems();
      await fetchReceivingOptions();
      setTransferModal(null);
      showToast('Transfer information updated');
    } catch (error) {
      console.error('Error submitting transfer:', error);
      showToast('Error updating transfer');
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle || ''}`,
        title: `${item.brand} ${item.title}`
      });
    }
  };

  const renderItem = (item) => {
    const { id, status, out_of_stock } = item;
    const isWaiting = status === 'waiting';
    const isReceived = status === 'received';
    const isFound = status === 'found';
    const isOutOfStock = out_of_stock === 1;
    const emoji = EMOJI_MAP[item.transfer_from] || '';

    return (
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e1e3e5',
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        {/* Clear Mode Checkbox */}
        {clearMode && (
          <div style={{ 
            flexShrink: 0,
            alignSelf: 'center'
          }}>
            <Checkbox
              checked={selectedItems.includes(id)}
              onChange={() => handleItemSelect(id)}
            />
          </div>
        )}

        {/* Thumbnail */}
        <div 
          onClick={() => handleImageClick(item)}
          style={{ 
            flexShrink: 0,
            width: '60px',
            height: '60px',
            cursor: item.image_url ? 'pointer' : 'default'
          }}
        >
          {item.image_url ? (
            <Thumbnail source={item.image_url} alt={item.title} size="large" />
          ) : (
            <Thumbnail source={ImageIcon} alt="No image" size="large" />
          )}
        </div>

        {/* Quantity */}
        <div style={{
          fontSize: '24px',
          fontWeight: 'bold',
          flexShrink: 0,
          minWidth: '30px',
          alignSelf: 'center'
        }}>
          {item.quantity}
        </div>

        {/* Product Info */}
        <div style={{ 
          flex: 1,
          minWidth: 0,
          overflow: 'hidden'
        }}>
          {/* Brand */}
          <div style={{
            fontSize: '12px',
            color: '#6d7175',
            marginBottom: '4px',
            wordBreak: 'break-word',
            whiteSpace: 'normal'
          }}>
            {item.brand}
          </div>

          {/* Title */}
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '4px',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
            lineHeight: '1.4'
          }}>
            {item.custom_name || item.title}
          </div>

          {/* Size */}
          {item.size && (
            <div style={{
              fontSize: '12px',
              color: '#6d7175',
              marginBottom: '4px',
              wordBreak: 'break-word',
              whiteSpace: 'normal'
            }}>
              {item.size}
            </div>
          )}

          {/* SKU */}
          <div 
            onClick={() => handleSkuCopy(item.sku)}
            style={{
              fontSize: '12px',
              fontWeight: '600',
              marginBottom: '8px',
              wordBreak: 'break-all',
              whiteSpace: 'normal',
              cursor: 'pointer',
              color: '#0080FF'
            }}
          >
            SKU: {item.sku}
          </div>

          {/* Order Number */}
          <div style={{
            fontSize: '12px',
            color: '#6d7175',
            marginBottom: '8px',
            wordBreak: 'break-word',
            whiteSpace: 'normal'
          }}>
            Order: #{item.order_number}
          </div>

          {/* Status Badges and Transfer Info */}
          <div style={{ 
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '8px'
          }}>
            {isOutOfStock && <Badge tone="critical">Out of Stock</Badge>}
            {isWaiting && <Badge tone="info">Waiting</Badge>}
            {isReceived && <Badge tone="success">Received</Badge>}
            {isFound && <Badge tone="success">Found</Badge>}
          </div>

          {/* Transfer Details (只在 waiting 状态显示) */}
          {isWaiting && item.transfer_from && (
            <div style={{
              fontSize: '13px',
              color: '#0080FF',
              fontWeight: '600',
              marginBottom: '8px',
              wordBreak: 'break-word',
              whiteSpace: 'normal'
            }}>
              {emoji} From: {item.transfer_from} | Est: {item.estimate_month}/{item.estimate_day}
            </div>
          )}

          {/* Action Buttons */}
          {!clearMode && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '12px'
            }}>
              {/* OUT Button */}
              {!isOutOfStock && (status === 'transferring' || status === 'waiting') && (
                <Button
                  size="slim"
                  onClick={() => handleOutClick(item)}
                >
                  OUT
                </Button>
              )}

              {/* Undo OUT Button */}
              {isOutOfStock && (
                <Button
                  size="slim"
                  onClick={() => handleOutUndo(item)}
                >
                  Undo OUT
                </Button>
              )}

              {/* Transfer Button */}
              {status === 'transferring' && (
                <Button
                  variant="primary"
                  size="slim"
                  onClick={() => handleTransferClick(item)}
                >
                  Transfer
                </Button>
              )}

              {/* Received Button */}
              {status === 'waiting' && (
                <Button
                  variant="primary"
                  size="slim"
                  onClick={() => handleReceivedClick(item)}
                >
                  Received
                </Button>
              )}

              {/* Found Button */}
              {(status === 'waiting' || status === 'received') && (
                <Button
                  size="slim"
                  onClick={() => handleFoundClick(item)}
                >
                  Found
                </Button>
              )}

              {/* Undo Button */}
              {(status === 'waiting' || status === 'received' || status === 'found') && (
                <Button
                  size="slim"
                  onClick={() => handleUndoClick(item)}
                >
                  Undo
                </Button>
              )}

              {/* Copy Button */}
              <Button
                size="slim"
                onClick={() => handleCopy(id)}
              >
                Copy
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
  ) : null;

  const currentMonth = new Date().getMonth() + 1;
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