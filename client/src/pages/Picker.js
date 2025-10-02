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
  InlineStack,
  BlockStack,
  Banner
} from '@shopify/polaris';
import { SortIcon, ImageIcon } from '@shopify/polaris-icons';

const Picker = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [isSorted, setIsSorted] = useState(false);
  const [statusFilter, setStatusFilter] = useState(['picking', 'missing', 'picked']);
  const [selectedImage, setSelectedImage] = useState(null);
  const [quantityModal, setQuantityModal] = useState(null);
  const [pickedQuantity, setPickedQuantity] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [items, statusFilter]);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/picker/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const applyFilters = () => {
    const filtered = items.filter(item => statusFilter.includes(item.picker_status));
    setFilteredItems(filtered);
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

  const renderItem = (item) => {
    const { id, quantity, image_url, order_name, display_type, sku, brand, title, size, picker_status, url_handle } = item;
    const media = image_url ? (
      <Thumbnail
        source={image_url}
        alt={title}
        size="large"
      />
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <ResourceItem id={id} media={media}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <BlockStack gap="2">
              <Text variant="bodyMd" as="h3" fontWeight="semibold">
                Order: {order_name} | Qty: {quantity}
              </Text>
              <Text variant="bodySm" color="subdued">
                Type: {display_type}
              </Text>
              <Text variant="bodySm" color="subdued">
                SKU: {sku}
              </Text>
              <Text variant="bodySm">
                {brand} {title} {size}
              </Text>
              <div>{getItemBadge(picker_status)}</div>
            </BlockStack>
          </div>
          <div>
            <ButtonGroup>
              {picker_status === 'picked' ? (
                <Button variant="primary" onClick={() => handleGreenClick(item)}>
                  Undo
                </Button>
              ) : (
                <>
                  <Button tone="critical" onClick={() => handleRedClick(item)}>
                    Missing
                  </Button>
                  <Button variant="primary" onClick={() => handleGreenClick(item)}>
                    Picked
                  </Button>
                </>
              )}
            </ButtonGroup>
          </div>
        </div>
      </ResourceItem>
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
            <ResourceList
              items={filteredItems}
              renderItem={renderItem}
              emptyState={<Banner>No items to pick</Banner>}
            />
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
        title="Product Image"
      >
        <Modal.Section>
          {selectedImage && (
            <>
              <img src={selectedImage.url} alt="Product" style={{ width: '100%' }} />
              <div style={{ marginTop: '16px' }}>
                <Button url={selectedImage.link} external>
                  View Product
                </Button>
              </div>
            </>
          )}
        </Modal.Section>
      </Modal>

      <Modal
        open={quantityModal !== null}
        onClose={() => setQuantityModal(null)}
        title="Enter Picked Quantity"
        primaryAction={{
          content: 'Submit',
          onAction: handleQuantitySubmit
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setQuantityModal(null)
          }
        ]}
      >
        <Modal.Section>
          {quantityModal && (
            <>
              <Text>Total quantity: {quantityModal.quantity}</Text>
              <div style={{ marginTop: '16px' }}>
                <TextField
                  label="Picked quantity"
                  type="number"
                  value={pickedQuantity}
                  onChange={setPickedQuantity}
                  min={1}
                  max={quantityModal.quantity - 1}
                  autoComplete="off"
                />
              </div>
            </>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default Picker;