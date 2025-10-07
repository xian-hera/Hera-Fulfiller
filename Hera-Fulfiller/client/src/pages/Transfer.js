import React, { useState, useEffect } from 'react';
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
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame
} from '@shopify/polaris';
import { DeleteMinor, ImageIcon } from '@shopify/polaris-icons';

const Transfer = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [clearMode, setClearMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState(['transferring', 'waiting', 'received']);
  const [transferModal, setTransferModal] = useState(null);
  const [transferData, setTransferData] = useState({
    transferQuantity: '',
    transferFrom: '',
    estimateDay: ''
  });
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [items, statusFilter]);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/transfer/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching transfer items:', error);
    }
  };

  const applyFilters = () => {
    const filtered = items.filter(item => {
      if (item.status === 'transferring' && !statusFilter.includes('transferring')) return false;
      if (item.status === 'waiting' && !statusFilter.includes('waiting')) return false;
      if ((item.status === 'received' || item.status === 'found') && !statusFilter.includes('received')) return false;
      return true;
    });
    setFilteredItems(filtered);
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
      setTransferModal(null);
    } catch (error) {
      console.error('Error updating transfer:', error);
    }
  };

  const getItemBadge = (status) => {
    switch (status) {
      case 'waiting':
        return <Badge tone="info">Waiting</Badge>;
      case 'received':
      case 'found':
        return <Badge tone="success">Received</Badge>;
      default:
        return <Badge>Transferring</Badge>;
    }
  };

  const renderItem = (item) => {
    const { id, quantity, image_url, order_number, sku, brand, title, size, status, transfer_from, estimate_month, estimate_day } = item;
    
    const media = image_url ? (
      <Thumbnail source={image_url} alt={title} size="large" />
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <ResourceItem
        id={id}
        media={media}
        verticalAlignment="center"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <BlockStack gap="2">
              <Text variant="bodyMd" as="h3" fontWeight="semibold">
                Order: {order_number} | Qty: {quantity}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="bodySm" color="subdued">
                  SKU: {sku}
                </Text>
                <Button plain monochrome onClick={() => handleSkuCopy(sku)}>
                  Copy
                </Button>
              </div>
              <Text variant="bodySm">
                {brand} {title} {size}
              </Text>
              {status === 'waiting' && (
                <Text variant="bodySm" color="subdued">
                  From: {transfer_from}, Est: {estimate_month}/{estimate_day}
                </Text>
              )}
              <div>{getItemBadge(status)}</div>
            </BlockStack>
          </div>
          <div>
            {clearMode ? (
              <input
                type="checkbox"
                checked={selectedItems.includes(id)}
                onChange={() => handleItemSelect(id)}
              />
            ) : (
              <ButtonGroup>
                <Button plain onClick={() => handleCopy(id)}>
                  Copy All
                </Button>
                {status === 'transferring' && (
                  <>
                    <Button onClick={() => handleBlueClick(item)}>
                      Transfer
                    </Button>
                    <Button variant="primary" onClick={() => handleGreenClick(item)}>
                      Found
                    </Button>
                  </>
                )}
                {status === 'waiting' && (
                  <Button variant="primary" onClick={() => handleGreenClick(item)}>
                    Received
                  </Button>
                )}
              </ButtonGroup>
            )}
          </div>
        </div>
      </ResourceItem>
    );
  };

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
  ) : null;

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
                <ChoiceList
                  title="Show items"
                  choices={[
                    { label: 'Transferring', value: 'transferring' },
                    { label: 'Waiting', value: 'waiting' },
                    { label: 'Received/Found', value: 'received' }
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
                items={filteredItems}
                renderItem={renderItem}
                emptyState={<Banner>No items to transfer</Banner>}
              />
            </Card>
          </Layout.Section>
        </Layout>

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
                <TextField
                  label="Estimated Arrival Day"
                  type="number"
                  value={transferData.estimateDay}
                  onChange={(value) => setTransferData({ ...transferData, estimateDay: value })}
                  min={1}
                  max={31}
                  autoComplete="off"
                />
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