import React, { useState, useEffect, useCallback } from 'react';
import axios from '../api/axios';
import {
  Modal,
  TextField,
  Button,
  Badge,
  Text,
  BlockStack,
  Banner
} from '@shopify/polaris';

const RefundLabelModal = ({ open, onClose }) => {
  // ── List state ─────────────────────────────────────────────
  const [shipments, setShipments] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState(null);

  // ── Confirm state ──────────────────────────────────────────
  const [confirmTarget, setConfirmTarget] = useState(null); // { id, order_name, tracking_number }
  const [refundEmail, setRefundEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // ── Result state ───────────────────────────────────────────
  const [result, setResult] = useState(null); // { orderName, trackingNumber, serviceTicketId, serviceTicketDate }

  // ── Fetch list ─────────────────────────────────────────────
  const fetchShipments = useCallback(async (searchValue) => {
    setIsLoading(true);
    setListError(null);
    try {
      const params = searchValue && searchValue.trim() ? { search: searchValue.trim() } : {};
      const response = await axios.get('/api/packer/refund/recent', { params });
      setShipments(response.data.shipments || []);
    } catch (error) {
      console.error('Error fetching shipments:', error);
      setListError('Failed to load label history.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Fetch refund email default ─────────────────────────────
  const fetchRefundEmail = useCallback(async () => {
    try {
      const response = await axios.get('/api/settings');
      const s = response.data.settings || {};
      setRefundEmail(s.refund_email || '');
    } catch (error) {
      console.error('Error fetching refund email:', error);
    }
  }, []);

  // ── Load on open ───────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setSearch('');
      setConfirmTarget(null);
      setSubmitError(null);
      setResult(null);
      fetchShipments('');
      fetchRefundEmail();
    }
  }, [open, fetchShipments, fetchRefundEmail]);

  // ── Search with debounce ───────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      fetchShipments(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, open, fetchShipments]);

  // ── Submit refund ──────────────────────────────────────────
  const handleSubmitRefund = async () => {
    if (!confirmTarget) return;
    if (!refundEmail || !refundEmail.trim()) {
      setSubmitError('Please enter a refund notification email.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await axios.post('/api/packer/refund/request', {
        shipmentId: confirmTarget.id,
        email: refundEmail.trim()
      });
      setResult({
        orderName: response.data.orderName,
        trackingNumber: response.data.trackingNumber,
        serviceTicketId: response.data.serviceTicketId,
        serviceTicketDate: response.data.serviceTicketDate
      });
      setConfirmTarget(null);
      // Refresh list so this row shows "Requested"
      fetchShipments(search);
    } catch (error) {
      const msg = error.response?.data?.error || 'Refund request failed. Please try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────
  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  };

  const handleClose = () => {
    setConfirmTarget(null);
    setSubmitError(null);
    setResult(null);
    onClose();
  };

  // ── Result view ────────────────────────────────────────────
  if (result) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Refund Requested"
        primaryAction={{ content: 'Close', onAction: handleClose }}
      >
        <Modal.Section>
          <BlockStack gap="4">
            <Banner tone="success">
              Refund request submitted successfully.
            </Banner>
            <div style={{ padding: '12px', backgroundColor: '#f6f6f7', borderRadius: '8px' }}>
              <BlockStack gap="2">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Text variant="bodySm" tone="subdued">Order:</Text>
                  <Text variant="bodySm" fontWeight="semibold">{result.orderName}</Text>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Text variant="bodySm" tone="subdued">Tracking:</Text>
                  <Text variant="bodySm">{result.trackingNumber}</Text>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Text variant="bodySm" tone="subdued">Service Ticket ID:</Text>
                  <Text variant="bodySm" fontWeight="semibold">{result.serviceTicketId || '—'}</Text>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Text variant="bodySm" tone="subdued">Ticket Date:</Text>
                  <Text variant="bodySm">{result.serviceTicketDate || '—'}</Text>
                </div>
              </BlockStack>
            </div>
            <Text variant="bodySm" tone="subdued">
              Canada Post will verify the label was not used and process the refund. You will receive a confirmation at the email provided.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    );
  }

  // ── Confirm view ───────────────────────────────────────────
  if (confirmTarget) {
    return (
      <Modal
        open={open}
        onClose={() => { setConfirmTarget(null); setSubmitError(null); }}
        title="Confirm Refund Request"
        primaryAction={{
          content: 'Submit Refund',
          onAction: handleSubmitRefund,
          loading: isSubmitting,
          disabled: isSubmitting
        }}
        secondaryActions={[{
          content: 'Back',
          onAction: () => { setConfirmTarget(null); setSubmitError(null); },
          disabled: isSubmitting
        }]}
      >
        <Modal.Section>
          <BlockStack gap="4">
            <Text variant="bodySm" tone="subdued">
              Canada Post will verify this label was not used before issuing a refund.
              This action cannot be undone.
            </Text>
            <div style={{ padding: '12px', backgroundColor: '#f6f6f7', borderRadius: '8px' }}>
              <BlockStack gap="2">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Text variant="bodySm" tone="subdued">Order:</Text>
                  <Text variant="bodySm" fontWeight="semibold">{confirmTarget.order_name}</Text>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Text variant="bodySm" tone="subdued">Tracking:</Text>
                  <Text variant="bodySm">{confirmTarget.tracking_number}</Text>
                </div>
              </BlockStack>
            </div>
            <TextField
              label="Refund notification email"
              value={refundEmail}
              onChange={setRefundEmail}
              placeholder="name@example.com"
              autoComplete="off"
              helpText="Canada Post will send refund confirmation to this address"
            />
            {submitError && (
              <Banner tone="critical">{submitError}</Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    );
  }

  // ── Main list view ─────────────────────────────────────────
  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Void / Refund Label"
      secondaryActions={[{ content: 'Close', onAction: handleClose }]}
    >
      <Modal.Section>
        <BlockStack gap="4">
          <Text variant="bodySm" tone="subdued">
            Labels purchased with <code>transmit-shipment=true</code> cannot be voided.
            Use this form to request a refund from Canada Post.
            Canada Post will verify the label was not used before processing.
          </Text>
          <TextField
            label="Search by order number"
            value={search}
            onChange={setSearch}
            placeholder="e.g. #3750"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearch('')}
          />
        </BlockStack>
      </Modal.Section>

      <Modal.Section>
        {isLoading && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <Text variant="bodySm" tone="subdued">Loading...</Text>
          </div>
        )}

        {!isLoading && listError && (
          <Banner tone="critical">{listError}</Banner>
        )}

        {!isLoading && !listError && shipments.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <Text variant="bodySm" tone="subdued">
              {search.trim() ? 'No labels found matching your search.' : 'No label history found.'}
            </Text>
          </div>
        )}

        {!isLoading && !listError && shipments.length > 0 && (
          <div>
            {shipments.map((shipment, index) => (
              <div
                key={shipment.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: index < shipments.length - 1 ? '1px solid #e1e3e5' : 'none',
                  gap: '12px'
                }}
              >
                {/* Left: order info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <BlockStack gap="1">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Text variant="bodyMd" fontWeight="semibold">
                        {shipment.order_name}
                      </Text>
                      {shipment.refund_status === 'requested' && (
                        <Badge tone="success">Refund Requested</Badge>
                      )}
                    </div>
                    <Text variant="bodySm" tone="subdued">
                      {shipment.tracking_number || '—'}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      {shipment.service_code || '—'} · {formatDate(shipment.label_bought_at)}
                    </Text>
                  </BlockStack>
                </div>

                {/* Right: refund button */}
                <div style={{ flexShrink: 0 }}>
                  {shipment.refund_status === 'requested' ? (
                    <Button disabled size="slim">Refunded</Button>
                  ) : !shipment.refund_link ? (
                    <Button disabled size="slim">No Link</Button>
                  ) : (
                    <Button
                      size="slim"
                      tone="critical"
                      onClick={() => {
                        setConfirmTarget({
                          id: shipment.id,
                          order_name: shipment.order_name,
                          tracking_number: shipment.tracking_number
                        });
                        setSubmitError(null);
                      }}
                    >
                      Refund
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal.Section>
    </Modal>
  );
};

export default RefundLabelModal;