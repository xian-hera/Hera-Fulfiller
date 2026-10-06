// 🆕 Home 页右上角 "Add Order"：输入订单名 → 从 Shopify 查到订单 → 确认后导入 Fulfiller
// 导入后的订单跟 webhook 收到的一样，会出现在 Picker / Transfer / Packer。
// 后端：server/routes/orders.js（GET /api/orders/lookup，POST /api/orders/import）

import React, { useState, useCallback } from 'react';
import { Modal, TextField, Banner, BlockStack, InlineStack, Text, Checkbox, Badge, Box } from '@shopify/polaris';
import api from '../api/axios';

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return value;
  }
};

const errorMessage = (err, fallback) =>
  err?.response?.data?.error || (err?.code === 'ECONNABORTED' ? 'Request timed out. Please try again.' : fallback);

const AddOrderModal = ({ open, onClose, onGoToPicker }) => {
  const [orderName, setOrderName] = useState('');
  const [lookup, setLookup] = useState(null);      // { order, canImport, blockReason }
  const [sendGiftEmail, setSendGiftEmail] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(null);  // order summary after success

  const reset = useCallback(() => {
    setOrderName('');
    setLookup(null);
    setSendGiftEmail(false);
    setError('');
    setSearching(false);
    setImporting(false);
    setImported(null);
  }, []);

  const handleClose = useCallback(() => {
    if (importing) return; // 导入进行中不允许关闭，避免用户以为没加上又点一次
    reset();
    onClose();
  }, [importing, reset, onClose]);

  const handleNameChange = useCallback((value) => {
    setOrderName(value);
    // 改了订单名，之前查到的结果就作废
    setLookup(null);
    setError('');
    setSendGiftEmail(false);
  }, []);

  const handleFind = useCallback(async () => {
    const name = orderName.trim();
    if (!name || searching) return;
    setSearching(true);
    setError('');
    setLookup(null);
    try {
      const res = await api.get('/api/orders/lookup', { params: { name } });
      setLookup(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to look up the order.'));
    } finally {
      setSearching(false);
    }
  }, [orderName, searching]);

  const handleImport = useCallback(async () => {
    if (!lookup?.canImport || importing) return;
    setImporting(true);
    setError('');
    try {
      // 商品多的订单要逐个去 Shopify 取商品信息，给足时间
      const res = await api.post(
        '/api/orders/import',
        { orderId: lookup.order.id, sendGiftEmail: lookup.order.isGift && sendGiftEmail },
        { timeout: 120000 }
      );
      setImported(res.data.order);
    } catch (err) {
      setError(errorMessage(err, 'Failed to add the order.'));
    } finally {
      setImporting(false);
    }
  }, [lookup, sendGiftEmail, importing]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (lookup?.canImport) handleImport();
      else handleFind();
    }
  };

  // ── 主按钮随步骤变化 ───────────────────────────────
  let primaryAction;
  let secondaryActions = [{ content: 'Cancel', onAction: handleClose, disabled: importing }];

  if (imported) {
    primaryAction = {
      content: 'Go to Picker',
      onAction: () => { reset(); onGoToPicker(); }
    };
    secondaryActions = [
      { content: 'Add another order', onAction: reset },
      { content: 'Close', onAction: handleClose }
    ];
  } else if (lookup?.canImport) {
    primaryAction = { content: 'Add to Fulfiller', onAction: handleImport, loading: importing };
  } else {
    primaryAction = {
      content: 'Find order',
      onAction: handleFind,
      loading: searching,
      disabled: !orderName.trim()
    };
  }

  const order = lookup?.order;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Order"
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
    >
      <Modal.Section>
        {imported ? (
          <Banner tone="success" title={`${imported.name} added to Fulfiller`}>
            <p>
              {imported.itemCount} item{imported.itemCount === 1 ? '' : 's'} added.
              The order now appears in Picker and Packer, just like an order received by webhook.
            </p>
          </Banner>
        ) : (
          <BlockStack gap="400">
            <div onKeyDown={handleKeyDown}>
              <TextField
                label="Order name"
                placeholder="#1234"
                value={orderName}
                onChange={handleNameChange}
                autoComplete="off"
                autoFocus
                disabled={importing}
                helpText="Enter the order name as shown in Shopify, e.g. #1234."
              />
            </div>

            {error && <Banner tone="critical">{error}</Banner>}

            {order && (
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h3" variant="headingMd">{order.name}</Text>
                    <Badge>{order.fulfillmentStatus}</Badge>
                    {order.financialStatus && <Badge>{order.financialStatus}</Badge>}
                    {order.isGift && <Badge tone="info">Gift</Badge>}
                  </InlineStack>
                  {order.customerName && <Text as="p">{order.customerName}</Text>}
                  <Text as="p" tone="subdued">
                    Created {formatDate(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                  </Text>
                </BlockStack>
              </Box>
            )}

            {lookup && !lookup.canImport && (
              <Banner tone="warning" title="This order can't be added">
                <p>{lookup.blockReason}</p>
              </Banner>
            )}

            {lookup?.canImport && order?.isPartiallyFulfilled && (
              <Banner tone="warning" title="Partially fulfilled">
                <p>
                  Some items of this order have already been shipped. Fulfiller will list all
                  non-refunded items, including the shipped ones — the same as it does for webhook orders.
                </p>
              </Banner>
            )}

            {lookup?.canImport && order?.isGift && (
              <Checkbox
                label={`Send gift email to ${order.giftRecipientEmail || 'recipient (no email on order)'}`}
                checked={sendGiftEmail}
                onChange={setSendGiftEmail}
                disabled={!order.giftRecipientEmail || importing}
                helpText="Only check this if the recipient never received the gift email (e.g. the order webhook was missed). Leave unchecked if the order was in Fulfiller before."
              />
            )}
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
};

export default AddOrderModal;
