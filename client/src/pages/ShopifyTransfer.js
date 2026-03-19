import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Button,
  Modal,
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame,
  Badge,
  Spinner,
} from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';

// ── Settings modal ────────────────────────────────────────────────────────────

const SettingsModal = ({ open, onClose, settings, onSave }) => {
  const [local, setLocal] = useState(settings);

  useEffect(() => { setLocal(settings); }, [settings]);

  const handleTagChange = (index, value) => {
    const tags = [...(local.default_tags || [])];
    tags[index] = value;
    setLocal({ ...local, default_tags: tags });
  };

  const handleAddTag = () => {
    setLocal({ ...local, default_tags: [...(local.default_tags || []), ''] });
  };

  const handleRemoveTag = (index) => {
    const tags = (local.default_tags || []).filter((_, i) => i !== index);
    setLocal({ ...local, default_tags: tags });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shopify Transfer Settings"
      primaryAction={{ content: 'Save', onAction: () => onSave(local) }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="4">
          <TextField
            label="Default Reference Name"
            value={local.default_reference_name || ''}
            onChange={(v) => setLocal({ ...local, default_reference_name: v })}
            autoComplete="off"
          />
          <TextField
            label="Default Destination"
            value={local.default_destination || 'MTL10'}
            onChange={(v) => setLocal({ ...local, default_destination: v })}
            autoComplete="off"
            helpText="e.g. MTL10"
          />
          <div>
            <Text variant="bodyMd" fontWeight="semibold">Default Tags</Text>
            <BlockStack gap="2">
              {(local.default_tags || []).map((tag, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      value={tag}
                      onChange={(v) => handleTagChange(i, v)}
                      autoComplete="off"
                    />
                  </div>
                  <Button tone="critical" onClick={() => handleRemoveTag(i)}>Remove</Button>
                </div>
              ))}
              <div style={{ marginTop: '6px' }}>
                <Button onClick={handleAddTag}>Add Tag</Button>
              </div>
            </BlockStack>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
};

// ── Validation modal (for shopify label click) ────────────────────────────────

const ValidationModal = ({ open, onClose, transferNumber, onMarkAsTransferred }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!open || !transferNumber) return;
    setLoading(true);
    axios.get(`/api/shopify-transfer/validate/${transferNumber}`)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, transferNumber]);

  const handleMark = async () => {
    setMarking(true);
    try {
      await onMarkAsTransferred(transferNumber);
      onClose();
    } finally {
      setMarking(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Transfer #${transferNumber}`}>
      <Modal.Section>
        {loading && <div style={{ textAlign: 'center', padding: '24px' }}><Spinner /></div>}
        {!loading && data && (
          <BlockStack gap="4">
            <div style={{ display: 'flex', gap: '16px' }}>
              <div>
                <Text variant="bodySm" tone="subdued">Shopify Status</Text>
                <Badge tone={data.shopifyStatus === 'DRAFT' ? 'attention' : 'success'}>
                  {data.shopifyStatus}
                </Badge>
              </div>
              <div>
                <Text variant="bodySm" tone="subdued">Fulfiller Items</Text>
                <Text variant="bodyMd">{data.dbItems}</Text>
              </div>
              <div>
                <Text variant="bodySm" tone="subdued">Shopify Items</Text>
                <Text variant="bodyMd">{data.shopifyItems}</Text>
              </div>
            </div>

            {data.mismatches.length > 0 && (
              <Banner tone="critical" title="Mismatches found">
                <BlockStack gap="1">
                  {data.mismatches.map((m, i) => (
                    <Text key={i} variant="bodySm">{m}</Text>
                  ))}
                </BlockStack>
              </Banner>
            )}

            {data.isValid && !data.allReceived && (
              <Banner tone="info">All items match Shopify. Waiting for all items to be received before marking as transferred.</Banner>
            )}

            {data.canMarkAsTransferred && (
              <Button variant="primary" onClick={handleMark} loading={marking}>
                Mark as Transferred
              </Button>
            )}

            {data.isValid && data.mismatches.length === 0 && !data.canMarkAsTransferred && (
              <Banner tone="success">Items match Shopify transfer.</Banner>
            )}
          </BlockStack>
        )}
        {!loading && !data && (
          <Banner tone="critical">Failed to load transfer validation data.</Banner>
        )}
      </Modal.Section>
    </Modal>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ShopifyTransfer = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [settings, setSettings] = useState({
    default_reference_name: 'Online Transfer',
    default_destination: 'MTL10',
    default_tags: ['Online Transfer', 'WEB'],
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [validationModal, setValidationModal] = useState(null);
  const [resultBanner, setResultBanner] = useState(null);

  const showToast = (msg) => { setToastMessage(msg); setToastActive(true); };

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get('/api/shopify-transfer/not-transferred');
      setItems(res.data);
    } catch {
      showToast('Error loading items');
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get('/api/shopify-transfer/settings');
      setSettings(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchItems();
    fetchSettings();
  }, [fetchItems, fetchSettings]);

  const handleSelectItem = (id) => {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => setSelectedItemIds(items.map(i => i.id));
  const handleDeselectAll = () => setSelectedItemIds([]);

  const handleSaveSettings = async (newSettings) => {
    try {
      for (const [key, value] of Object.entries(newSettings)) {
        await axios.post('/api/shopify-transfer/settings', { key, value });
      }
      setSettings(newSettings);
      setSettingsOpen(false);
      showToast('Settings saved');
    } catch {
      showToast('Failed to save settings');
    }
  };

  const handleCreate = async (idsToCreate) => {
    if (idsToCreate.length === 0) { showToast('No items selected'); return; }
    setIsCreating(true);
    setResultBanner(null);
    try {
      const res = await axios.post('/api/shopify-transfer/create', { itemIds: idsToCreate });
      const { results, errors } = res.data;
      let msg = results.map(r => `MTL${r.location}: #${r.transferNumber} (${r.itemCount} items)`).join(', ');
      if (errors.length > 0) msg += ` | Errors: ${errors.join('; ')}`;
      setResultBanner({ tone: errors.length > 0 ? 'warning' : 'success', message: msg });
      await fetchItems();
      setSelectedItemIds([]);
    } catch (err) {
      showToast(`Failed to create transfers: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddToTransfer = async (idsToAdd) => {
    if (idsToAdd.length === 0) { showToast('No items selected'); return; }
    setIsAdding(true);
    setResultBanner(null);
    try {
      const res = await axios.post('/api/shopify-transfer/add-to-transfer', { itemIds: idsToAdd });
      const { results, errors } = res.data;
      let msg = results.map(r => `MTL${r.location}: added ${r.itemsAdded} items to #${r.transferNumber}`).join(', ');
      if (errors.length > 0) msg += ` | Errors: ${errors.join('; ')}`;
      setResultBanner({ tone: errors.length > 0 ? 'warning' : 'success', message: msg });
      await fetchItems();
      setSelectedItemIds([]);
    } catch (err) {
      showToast(`Failed to add to transfer: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleMarkAsTransferred = async (transferNumber) => {
    try {
      await axios.post('/api/shopify-transfer/mark-transferred', { transferNumber });
      showToast(`Transfer #${transferNumber} marked as transferred`);
      await fetchItems();
    } catch (err) {
      showToast(`Failed: ${err.response?.data?.error || err.message}`);
      throw err;
    }
  };

  const formatSKU = (sku) => sku ? (sku.match(/.{1,4}/g)?.join(' ') || sku) : '';
  const formatDate = (month, day) => {
    if (month == null || day == null) return '';
    return `${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
  };

  const renderItem = (item) => {
    const isSelected = selectedItemIds.includes(item.id);
    return (
      <div
        key={item.id}
        style={{
          padding: '16px',
          borderBottom: '1px solid #e1e3e5',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: isSelected ? '#f0fff4' : 'white',
          cursor: 'pointer',
        }}
        onClick={() => handleSelectItem(item.id)}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => handleSelectItem(item.id)}
          onClick={e => e.stopPropagation()}
          style={{ width: '18px', height: '18px', flexShrink: 0 }}
        />

        {/* Image */}
        <div style={{ flexShrink: 0 }}>
          {item.image_url
            ? <Thumbnail source={item.image_url} alt={item.title} size="medium" />
            : <Thumbnail source={ImageIcon} alt="No image" size="medium" />
          }
        </div>

        {/* Quantity */}
        <div style={{ fontSize: '28px', fontWeight: 'bold', minWidth: '40px', flexShrink: 0 }}>
          {item.quantity}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ wordWrap: 'break-word', maxWidth: '60ch' }}>
            <Text variant="bodyMd" fontWeight="bold">
              {item.brand} {item.title} {item.size}
            </Text>
          </div>
          {item.variant_title && <Text variant="bodySm">{item.variant_title}</Text>}
          <Text variant="bodySm" tone="subdued">{formatSKU(item.sku)}</Text>
          <Text variant="bodySm" tone="subdued">#{item.order_number}</Text>
        </div>

        {/* From + date */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {item.transfer_from && (
            <Text variant="bodyMd" fontWeight="bold" tone="info">
              MTL{item.transfer_from}
            </Text>
          )}
          {item.estimate_month != null && (
            <Text variant="bodySm" tone="subdued">
              Est. {formatDate(item.estimate_month, item.estimate_day)}
            </Text>
          )}
        </div>
      </div>
    );
  };

  const toastMarkup = toastActive
    ? <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
    : null;

  return (
    <Frame>
      <Page
        title="Shopify Transfer"
        backAction={{ content: 'Transfer', onAction: () => navigate('/transfer') }}
      >
        <Layout>
          {/* Controls */}
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <BlockStack gap="4">

                  {/* Settings summary */}
                  <div style={{ padding: '10px 12px', backgroundColor: '#f6f6f7', borderRadius: '6px' }}>
                    <BlockStack gap="1">
                      <Text variant="bodySm" tone="subdued">Destination: <strong>{settings.default_destination}</strong></Text>
                      <Text variant="bodySm" tone="subdued">Reference: <strong>{settings.default_reference_name}</strong></Text>
                      <Text variant="bodySm" tone="subdued">Tags: <strong>{(settings.default_tags || []).join(', ')}</strong></Text>
                    </BlockStack>
                  </div>

                  {/* Result banner */}
                  {resultBanner && (
                    <Banner tone={resultBanner.tone} onDismiss={() => setResultBanner(null)}>
                      {resultBanner.message}
                    </Banner>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <Button onClick={() => navigate('/transfer')}>Cancel</Button>

                    <Button
                      variant="primary"
                      onClick={() => handleCreate(selectedItemIds)}
                      disabled={selectedItemIds.length === 0 || isCreating}
                      loading={isCreating}
                    >
                      Create Selected ({selectedItemIds.length})
                    </Button>

                    <Button
                      variant="primary"
                      onClick={() => handleCreate(items.map(i => i.id))}
                      disabled={items.length === 0 || isCreating}
                      loading={isCreating}
                    >
                      Create All ({items.length})
                    </Button>

                    <Button
                      onClick={() => handleAddToTransfer(selectedItemIds)}
                      disabled={selectedItemIds.length === 0 || isAdding}
                      loading={isAdding}
                    >
                      Add Selected to Transfer
                    </Button>

                    <Button
                      onClick={() => handleAddToTransfer(items.map(i => i.id))}
                      disabled={items.length === 0 || isAdding}
                      loading={isAdding}
                    >
                      Add All to Transfer
                    </Button>

                    <Button onClick={() => setSettingsOpen(true)}>Settings</Button>
                  </div>

                  {/* Select all / deselect */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleSelectAll}
                      style={{ background: 'none', border: 'none', color: '#005bd3', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                    >
                      Select all ({items.length})
                    </button>
                    {selectedItemIds.length > 0 && (
                      <button
                        onClick={handleDeselectAll}
                        style={{ background: 'none', border: 'none', color: '#6d7175', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                      >
                        Deselect all
                      </button>
                    )}
                  </div>

                </BlockStack>
              </div>
            </Card>
          </Layout.Section>

          {/* Item list */}
          <Layout.Section>
            <Card>
              {items.length === 0 ? (
                <div style={{ padding: '24px' }}>
                  <Banner>No waiting items without a Shopify transfer.</Banner>
                </div>
              ) : (
                items.map(item => renderItem(item))
              )}
            </Card>
          </Layout.Section>
        </Layout>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSave={handleSaveSettings}
        />

        {validationModal && (
          <ValidationModal
            open={true}
            onClose={() => setValidationModal(null)}
            transferNumber={validationModal}
            onMarkAsTransferred={handleMarkAsTransferred}
          />
        )}

        {toastMarkup}
      </Page>
    </Frame>
  );
};

export default ShopifyTransfer;