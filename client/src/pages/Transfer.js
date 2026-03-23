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
  Modal,
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame,
  ChoiceList,
} from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';

const Transfer = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [clearMode, setClearMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [transferModal, setTransferModal] = useState(null);
  const [transferData, setTransferData] = useState({
    transferQuantity: '',
    transferFrom: '',
    estimateDay: ''
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState(['transferring', 'waiting', 'received']);

  // ── Tag filter state ────────────────────────────────────────────────────────
  // null = no filter, otherwise filter by this value
  const [taskDateFilter, setTaskDateFilter] = useState(null);
  const [shopifyTransferFilter, setShopifyTransferFilter] = useState(null);
  const [transferValidation, setTransferValidation] = useState(null); // result from validate API
  const [isValidating, setIsValidating] = useState(false);
  const [isMarkingTransferred, setIsMarkingTransferred] = useState(false);

  const showToast = (message) => {
    setToastMessage(message);
    setToastActive(true);
  };

  const fetchItems = useCallback(async () => {
    try {
      const response = await axios.get('/api/transfer/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching transfer items:', error);
      showToast('Error loading transfer items');
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ── Grouping logic ──────────────────────────────────────────────────────────

  const getGroupedItems = useCallback(() => {
    let filtered = items;

    // Status filter
    filtered = filtered.filter(item => {
      if (item.out_of_stock === 1) return true; // always show OOS
      if (item.status === 'transferring') return statusFilter.includes('transferring');
      if (item.status === 'waiting') return statusFilter.includes('waiting');
      if (item.status === 'received' || item.status === 'found') return statusFilter.includes('received');
      return true;
    });

    // If tag filter is active, filter all items by that tag
    if (taskDateFilter) {
      filtered = filtered.filter(i => i.connecteam_task_title_date === taskDateFilter);
    }
    if (shopifyTransferFilter) {
      filtered = filtered.filter(i => i.shopify_transfer_number === shopifyTransferFilter);
    }

    // Group 1: transferring + out_of_stock
    const group1 = filtered.filter(
      i => i.out_of_stock === 1 || i.status === 'transferring'
    );
    // Sort: out_of_stock first, then transferring
    group1.sort((a, b) => {
      if (a.out_of_stock === 1 && b.out_of_stock !== 1) return -1;
      if (a.out_of_stock !== 1 && b.out_of_stock === 1) return 1;
      return 0;
    });

    // Group 2+: waiting + received, grouped by transfer_from (ascending)
    const waitingReceived = filtered.filter(
      i => i.out_of_stock !== 1 && (i.status === 'waiting' || i.status === 'received' || i.status === 'found')
    );

    const locationGroups = {};
    for (const item of waitingReceived) {
      const loc = item.transfer_from || 'Unknown';
      if (!locationGroups[loc]) locationGroups[loc] = [];
      locationGroups[loc].push(item);
    }

    // Sort each location group: waiting first, then received
    for (const loc of Object.keys(locationGroups)) {
      locationGroups[loc].sort((a, b) => {
        const aIsWaiting = a.status === 'waiting' ? 0 : 1;
        const bIsWaiting = b.status === 'waiting' ? 0 : 1;
        return aIsWaiting - bIsWaiting;
      });
    }

    const sortedLocations = Object.keys(locationGroups).sort();

    return { group1, locationGroups, sortedLocations };
  }, [items, taskDateFilter, shopifyTransferFilter, statusFilter]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCopy = async (itemId) => {
    try {
      const response = await axios.get(`/api/transfer/items/${itemId}/copy-text`);
      navigator.clipboard.writeText(response.data.copyText);
      showToast('Copied to clipboard!');
    } catch (error) {
      showToast('Error copying text');
    }
  };

  const handleSkuCopy = (sku) => {
    if (!sku) return;
    navigator.clipboard.writeText(sku);
    showToast('SKU copied!');
  };

  const handleClearToggle = () => {
    setClearMode(!clearMode);
    setSelectedItems([]);
  };

  const handleItemSelect = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const handleClearSelected = async () => {
    if (selectedItems.length === 0) return;
    try {
      const response = await axios.post('/api/transfer/items/bulk-delete', { ids: selectedItems });
      await fetchItems();
      setSelectedItems([]);
      setClearMode(false);
      const { deleted, notFound } = response.data;
      showToast(notFound > 0
        ? `Deleted ${deleted} items (${notFound} already deleted)`
        : `Deleted ${deleted} items`
      );
    } catch (error) {
      showToast('Failed to delete items. Please try again.');
    }
  };

  const handleGreenClick = async (item) => {
    const newStatus = item.status === 'transferring' ? 'found' : 'received';
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: newStatus });
      await fetchItems();
    } catch {
      showToast('Error updating status');
    }
  };

  const handleBlueClick = (item) => {
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity ? item.quantity.toString() : '1',
      transferFrom: '',
      estimateDay: new Date().getDate().toString()
    });
  };

  const handleWaitingBadgeClick = (item) => {
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity ? item.quantity.toString() : '1',
      transferFrom: item.transfer_from || '',
      estimateDay: item.estimate_day ? item.estimate_day.toString() : new Date().getDate().toString()
    });
  };

  const handleReceivedUndo = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: 'waiting' });
      await fetchItems();
      showToast('Status changed to Waiting');
    } catch {
      showToast('Error updating status');
    }
  };

  const handleOutClick = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { out_of_stock: 1 });
      await fetchItems();
      showToast('Marked as Out of Stock');
    } catch {
      showToast('Error updating status');
    }
  };

  const handleOutUndo = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { out_of_stock: 0, status: 'transferring' });
      await fetchItems();
      showToast('Out of Stock status removed');
    } catch {
      showToast('Error updating status');
    }
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
      const originalFrom = transferModal.transfer_from;

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

      // If from location changed and item was already tasked/transferred, mark stale
      const fromChanged = originalFrom && originalFrom !== transferData.transferFrom;
      if (fromChanged && (transferModal.connecteam_tasked || transferModal.shopify_transferred)) {
        await axios.patch(`/api/transfer/items/${transferModal.id}`, { from_location_changed: 1 });
      }

      await fetchItems();
      setTransferModal(null);
    } catch {
      showToast('Error updating transfer');
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url && item.url_handle) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand || ''} ${item.title || ''}`
      });
    }
  };

  // ── Tag label click ─────────────────────────────────────────────────────────
  const handleTaskLabelClick = (titleDate) => {
    setShopifyTransferFilter(null);
    setTaskDateFilter(prev => prev === titleDate ? null : titleDate);
  };

  const handleShopifyLabelClick = async (transferNumber) => {
    setTaskDateFilter(null);
    const isDeselecting = shopifyTransferFilter === transferNumber;
    setShopifyTransferFilter(isDeselecting ? null : transferNumber);
    setTransferValidation(null);

    if (!isDeselecting) {
      setIsValidating(true);
      try {
        const res = await axios.get(`/api/shopify-transfer/validate/${transferNumber}`);
        setTransferValidation(res.data);
      } catch (err) {
        setTransferValidation({ error: err.response?.data?.error || 'Failed to validate transfer' });
      } finally {
        setIsValidating(false);
      }
    }
  };

  const handleMarkAsTransferred = async () => {
    if (!shopifyTransferFilter) return;
    setIsMarkingTransferred(true);
    try {
      await axios.post('/api/shopify-transfer/mark-transferred', {
        transferNumber: shopifyTransferFilter
      });
      showToast(`Transfer #${shopifyTransferFilter} marked as transferred`);
      setShopifyTransferFilter(null);
      setTransferValidation(null);
      await fetchItems();
    } catch (err) {
      showToast(`Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsMarkingTransferred(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  const formatDate = (month, day) => {
    if (month == null || day == null || month === '' || day === '') return 'N/A';
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  };

  // ── Render item ─────────────────────────────────────────────────────────────

  const renderItem = (item) => {
    if (!item) return null;

    const {
      id,
      quantity = 0,
      image_url,
      order_number = '',
      sku = '',
      brand = '',
      title = '',
      size = '',
      status,
      transfer_from,
      estimate_month,
      estimate_day,
      variant_title,
      out_of_stock,
      connecteam_tasked,
      connecteam_task_title_date,
      from_location_changed,
      shopify_transferred,
      shopify_transfer_number,
    } = item;

    const isWaitingOrReceived = status === 'waiting' || status === 'received' || status === 'found';

    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={image_url} alt={title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    // Status badge
    const statusBadge = () => {
      if (out_of_stock === 1) return <Badge tone="critical">Out of Stock</Badge>;
      switch (status) {
        case 'waiting':
          return (
            <span onClick={(e) => { e.stopPropagation(); handleWaitingBadgeClick(item); }} style={{ cursor: 'pointer' }}>
              <Badge tone="info">Waiting</Badge>
            </span>
          );
        case 'received':
        case 'found':
          return (
            <span onClick={(e) => { e.stopPropagation(); handleReceivedUndo(item); }} style={{ cursor: 'pointer' }}>
              <Badge tone="success">Received</Badge>
            </span>
          );
        default:
          return <Badge>Transferring</Badge>;
      }
    };

    // Connecteam tasked tag
    const taskedTag = connecteam_tasked && connecteam_task_title_date ? (
      <span
        onClick={() => handleTaskLabelClick(connecteam_task_title_date)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: '#2998ff',
          color: 'white',
          borderRadius: '12px',
          padding: '2px 8px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {connecteam_task_title_date}
        {from_location_changed === 1 && (
          <span style={{ color: '#ff4444', fontWeight: 'bold', marginLeft: '2px' }}>!</span>
        )}
      </span>
    ) : null;

    // Shopify transfer tag
    const shopifyTag = shopify_transferred && shopify_transfer_number ? (
      <span
        onClick={() => handleShopifyLabelClick(shopify_transfer_number)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: '#96c046',
          color: 'white',
          borderRadius: '12px',
          padding: '2px 8px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {shopify_transfer_number}
        {from_location_changed === 1 && (
          <span style={{ color: '#ff4444', fontWeight: 'bold', marginLeft: '2px' }}>!</span>
        )}
      </span>
    ) : null;

    return (
      <div className="transfer-item-container" key={id}>
        {/* Desktop layout */}
        <div className="transfer-item-desktop">
          <div style={{ marginRight: '16px', flexShrink: 0 }}>
            {media}
          </div>

          <div style={{ fontSize: '38px', lineHeight: 1, marginRight: '20px', marginTop: '5px', minWidth: '50px', flexShrink: 0 }}>
            {quantity}
          </div>

          <div style={{ flex: 1, maxWidth: 'calc(100% - 350px)' }}>
            <BlockStack gap="1">
              <div style={{ wordWrap: 'break-word', overflowWrap: 'break-word', maxWidth: '60ch' }}>
                <Text variant="bodyLg" fontWeight="bold">{brand} {title} {size}</Text>
              </div>
              {variant_title && <Text variant="bodyMd">{variant_title}</Text>}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="bodySm">{formatSKU(sku)}</Text>
                <button onClick={() => handleSkuCopy(sku)} style={btnLinkStyle}>Copy</button>
              </div>
              <Text variant="bodySm" tone="subdued">#{order_number}</Text>

              {/* Tasked + Shopify tags */}
              {isWaitingOrReceived && (taskedTag || shopifyTag) && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {taskedTag}
                  {shopifyTag}
                </div>
              )}
            </BlockStack>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '17px', marginLeft: 'auto' }}>
            {clearMode ? (
              <input type="checkbox" checked={selectedItems.includes(id)} onChange={() => handleItemSelect(id)} style={{ width: '20px', height: '20px' }} />
            ) : (
              <>
                {/* Status badge row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isWaitingOrReceived && transfer_from && out_of_stock !== 1 && estimate_month != null && estimate_day != null && (
                    <Text variant="bodySm" fontWeight="bold" as="span" tone="info">
                      {transfer_from}, {formatDate(estimate_month, estimate_day)}
                    </Text>
                  )}
                  {statusBadge()}
                </div>

                {/* Action buttons */}
                {out_of_stock !== 1 ? (
                  <>
                    {status === 'transferring' && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => handleBlueClick(item)} style={btnTransferStyle}>Transfer</button>
                        <button onClick={() => handleGreenClick(item)} style={btnFoundStyle}>Found</button>
                      </div>
                    )}
                    {status === 'waiting' && (
                      <button onClick={() => handleGreenClick(item)} style={btnReceivedStyle}>Received</button>
                    )}
                  </>
                ) : (
                  <button onClick={() => handleOutUndo(item)} style={btnReceivedStyle}>Undo</button>
                )}

                {/* Bottom row: Undo, OUT, Copy */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {out_of_stock !== 1 && status === 'waiting' && (
                    <button onClick={() => handleReceivedUndo(item)} style={btnSmallStyle}>Undo</button>
                  )}
                  {out_of_stock !== 1 && (status === 'transferring' || status === 'waiting') && (
                    <button onClick={() => handleOutClick(item)} style={btnOutStyle}>OUT</button>
                  )}
                  <button onClick={() => handleCopy(id)} style={btnCopyStyle}>Copy</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="transfer-item-mobile">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>{brand}</div>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', wordBreak: 'break-word', lineHeight: '1.4' }}>{title} {size}</div>
            {variant_title && <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>{variant_title}</div>}
            <div onClick={() => handleSkuCopy(sku)} style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', cursor: 'pointer', color: '#0080FF' }}>
              SKU: {formatSKU(sku)}
            </div>
            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '8px' }}>Order: #{order_number}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              {statusBadge()}
            </div>
            {isWaitingOrReceived && transfer_from && out_of_stock !== 1 && estimate_month != null && estimate_day != null && (
              <div style={{ fontSize: '12px', color: '#0080FF', fontWeight: '600', marginBottom: '8px' }}>
                From: {transfer_from}, Est: {formatDate(estimate_month, estimate_day)}
              </div>
            )}
            {isWaitingOrReceived && (taskedTag || shopifyTag) && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {taskedTag}
                {shopifyTag}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flexShrink: 0 }}>{media}</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', flexShrink: 0, minWidth: '30px', alignSelf: 'center' }}>{quantity}</div>
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              {clearMode ? (
                <input type="checkbox" checked={selectedItems.includes(id)} onChange={() => handleItemSelect(id)} style={{ width: '20px', height: '20px' }} />
              ) : (
                <>
                  {out_of_stock !== 1 ? (
                    <>
                      {status === 'transferring' && (
                        <>
                          <button onClick={() => handleBlueClick(item)} style={btnTransferSmStyle}>Transfer</button>
                          <button onClick={() => handleGreenClick(item)} style={btnFoundSmStyle}>Found</button>
                        </>
                      )}
                      {status === 'waiting' && (
                        <button onClick={() => handleGreenClick(item)} style={btnReceivedSmStyle}>Received</button>
                      )}
                      {(status === 'transferring' || status === 'waiting') && (
                        <>
                          {status === 'waiting' && <button onClick={() => handleReceivedUndo(item)} style={btnSmallSmStyle}>Undo</button>}
                          <button onClick={() => handleOutClick(item)} style={btnOutSmStyle}>OUT</button>
                        </>
                      )}
                    </>
                  ) : (
                    <button onClick={() => handleOutUndo(item)} style={btnReceivedSmStyle}>Undo</button>
                  )}
                  <button onClick={() => handleCopy(id)} style={btnCopySmStyle}>Copy</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────

  const { group1, locationGroups, sortedLocations } = getGroupedItems();
  const toastMarkup = toastActive ? <Toast content={toastMessage} onDismiss={() => setToastActive(false)} /> : null;

  // Status counts (from all items, ignoring current filter)
  const statusCounts = {
    transferring: items.filter(i => i.status === 'transferring' && i.out_of_stock !== 1).length,
    waiting: items.filter(i => i.status === 'waiting').length,
    received: items.filter(i => i.status === 'received' || i.status === 'found').length,
  };

  // ── Shopify transfer validation banner ──────────────────────────────────────
  const shopifyValidationBanner = shopifyTransferFilter ? (() => {
    if (isValidating) {
      return (
        <Banner tone="info">
          Checking transfer #{shopifyTransferFilter} in Shopify...
        </Banner>
      );
    }
    if (!transferValidation) return null;
    if (transferValidation.error) {
      return <Banner tone="critical">{transferValidation.error}</Banner>;
    }

    const { isValid, allReceived, canMarkAsTransferred, mismatches, shopifyStatus } = transferValidation;

    // All received + match → show Mark as Transferred button (only if draft)
    if (canMarkAsTransferred && shopifyStatus === 'DRAFT') {
      return (
        <Banner tone="success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span>All items received and match Shopify transfer #{shopifyTransferFilter}.</span>
            <button
              onClick={handleMarkAsTransferred}
              disabled={isMarkingTransferred}
              style={{
                backgroundColor: '#008060',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: isMarkingTransferred ? 'not-allowed' : 'pointer',
                opacity: isMarkingTransferred ? 0.7 : 1,
              }}
            >
              {isMarkingTransferred ? 'Processing...' : 'Mark as Transferred'}
            </button>
          </div>
        </Banner>
      );
    }

    // All received but content doesn't match
    if (allReceived && !isValid) {
      return (
        <Banner tone="critical">
          Content does not match Shopify transfer #{shopifyTransferFilter}.
          {mismatches && mismatches.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {mismatches.map((m, i) => <div key={i} style={{ fontSize: '12px' }}>{m}</div>)}
            </div>
          )}
        </Banner>
      );
    }

    // Not all received yet — show nothing (per requirement)
    return null;
  })() : null;

  const filterBanner = (taskDateFilter || shopifyTransferFilter) ? (
    <Banner
      tone="info"
      onDismiss={() => { setTaskDateFilter(null); setShopifyTransferFilter(null); setTransferValidation(null); }}
    >
      {taskDateFilter
        ? `Showing items in Connecteam task: ${taskDateFilter}`
        : `Showing items in Shopify transfer: #${shopifyTransferFilter}`
      }
      {' '}<button
        onClick={() => { setTaskDateFilter(null); setShopifyTransferFilter(null); setTransferValidation(null); }}
        style={{ background: 'none', border: 'none', color: '#005bd3', cursor: 'pointer', padding: 0, fontSize: '14px' }}
      >
        Clear filter
      </button>
    </Banner>
  ) : null;

  const currentMonth = new Date().getMonth() + 1;

  return (
    <>
      <style>{`
        .transfer-item-container { padding: 22px 16px; border-bottom: 1px solid #e1e3e5; position: relative; }
        .transfer-item-desktop { display: flex; align-items: center; width: 100%; }
        .transfer-item-mobile { display: none; }
        @media (max-width: 600px) {
          .transfer-item-container { padding: 16px; }
          .transfer-item-desktop { display: none; }
          .transfer-item-mobile { display: block; width: 100%; }
        }
      `}</style>

      <Frame>
        <Page
          title="Transfer"
          backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
          primaryAction={
            clearMode
              ? { content: 'Delete Selected', destructive: true, onAction: handleClearSelected }
              : undefined
          }
          secondaryActions={
            clearMode
              ? [{ content: 'Cancel', onAction: () => { setClearMode(false); setSelectedItems([]); } }]
              : [
                  { content: 'Transfer Planner', onAction: () => navigate('/transfer-planner') },
                  { content: 'Clear Mode', onAction: handleClearToggle },
                  { content: 'Connecteam Task', onAction: () => navigate('/connecteam-task') },
                  { content: 'Shopify Transfer', onAction: () => navigate('/shopify-transfer') },
                ]
          }
        >
          <Layout>
            {/* Status filter card */}
            <Layout.Section>
              <Card>
                <div style={{ padding: '16px' }}>
                  <ChoiceList
                    title="Show items"
                    choices={[
                      { label: `Transferring (${statusCounts.transferring})`, value: 'transferring' },
                      { label: `Waiting (${statusCounts.waiting})`, value: 'waiting' },
                      { label: `Received (${statusCounts.received})`, value: 'received' },
                    ]}
                    selected={statusFilter}
                    onChange={setStatusFilter}
                    allowMultiple
                  />
                </div>
              </Card>
            </Layout.Section>

            {/* Filter banner */}
            {filterBanner && (
              <Layout.Section>
                {filterBanner}
              </Layout.Section>
            )}

            {/* Shopify transfer validation banner */}
            {shopifyValidationBanner && (
              <Layout.Section>
                {shopifyValidationBanner}
              </Layout.Section>
            )}

            {/* Card 1: Transferring + Out of Stock */}
            {group1.length > 0 && (
              <Layout.Section>
                <Card>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e1e3e5' }}>
                    <Text variant="headingSm" as="h3">Transferring & Out of Stock</Text>
                  </div>
                  <div>
                    {group1.map(item => renderItem(item))}
                  </div>
                </Card>
              </Layout.Section>
            )}

            {/* Cards by location */}
            {sortedLocations.map(loc => (
              <Layout.Section key={loc}>
                <Card>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e1e3e5' }}>
                    <Text variant="headingSm" as="h3">MTL{loc}</Text>
                  </div>
                  <div>
                    {locationGroups[loc].map(item => renderItem(item))}
                  </div>
                </Card>
              </Layout.Section>
            ))}

            {/* Empty state */}
            {group1.length === 0 && sortedLocations.length === 0 && (
              <Layout.Section>
                <Card>
                  <Banner>No items to transfer</Banner>
                </Card>
              </Layout.Section>
            )}
          </Layout>

          {/* Image modal */}
          <Modal open={selectedImage !== null} onClose={() => setSelectedImage(null)} title={selectedImage?.title || 'Product Image'}>
            <Modal.Section>
              {selectedImage && (
                <BlockStack gap="4">
                  <img src={selectedImage.url} alt="Product" style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }} />
                  <Button url={selectedImage.link} external variant="primary" fullWidth>View Product on Website</Button>
                </BlockStack>
              )}
            </Modal.Section>
          </Modal>

          {/* Transfer info modal */}
          <Modal
            open={transferModal !== null}
            onClose={() => setTransferModal(null)}
            title="Transfer Information"
            primaryAction={{ content: 'Submit', onAction: handleTransferSubmit }}
            secondaryActions={[{ content: 'Cancel', onAction: () => setTransferModal(null) }]}
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
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Estimated Arrival (Month/Day)</Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <TextField type="number" value={currentMonth.toString()} onChange={() => {}} disabled prefix="Month:" autoComplete="off" />
                      </div>
                      <Text variant="bodyLg">/</Text>
                      <div style={{ flex: 1 }}>
                        <TextField type="number" value={transferData.estimateDay} onChange={(value) => setTransferData({ ...transferData, estimateDay: value })} min={1} max={31} prefix="Day:" autoComplete="off" />
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
    </>
  );
};

// ── Button styles ─────────────────────────────────────────────────────────────

const btnLinkStyle = { background: 'none', border: 'none', color: '#005bd3', cursor: 'pointer', fontSize: '12px', padding: 0 };

const btnTransferStyle = { backgroundColor: 'white', color: '#0080FF', border: '2px solid #0080FF', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', minWidth: '80px' };
const btnFoundStyle = { backgroundColor: '#00A047', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', minWidth: '80px' };
const btnReceivedStyle = { backgroundColor: '#0080FF', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', minWidth: '100px' };
const btnSmallStyle = { backgroundColor: 'white', color: '#6d7175', border: '1px solid #6d7175', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', minWidth: '60px' };
const btnOutStyle = { backgroundColor: 'white', color: '#D72C0D', border: '1px solid #D72C0D', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', minWidth: '60px' };
const btnCopyStyle = { backgroundColor: 'white', color: '#202223', border: '1px solid #c9cccf', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', minWidth: '60px' };

// Mobile variants
const btnTransferSmStyle = { ...btnTransferStyle, padding: '6px 12px', fontSize: '13px' };
const btnFoundSmStyle = { ...btnFoundStyle, padding: '6px 12px', fontSize: '13px' };
const btnReceivedSmStyle = { ...btnReceivedStyle, padding: '6px 12px', fontSize: '13px' };
const btnSmallSmStyle = { ...btnSmallStyle };
const btnOutSmStyle = { ...btnOutStyle };
const btnCopySmStyle = { ...btnCopyStyle };

export default Transfer;