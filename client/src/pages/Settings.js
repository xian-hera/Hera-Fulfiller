import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { Page, Layout, Card, TextField, Button, Text, BlockStack, Select } from '@shopify/polaris';

// ── Collapsible Card helper ──────────────────────────────────
const CollapsibleCard = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="headingMd" as="h2">{title}</Text>
          <Button onClick={() => setOpen(o => !o)}>
            {open ? 'Collapse' : 'Expand'}
          </Button>
        </div>
        {open && <div style={{ marginTop: '20px' }}>{children}</div>}
      </div>
    </Card>
  );
};

// ── Save button (disabled when UI === saved state) ───────────
const SaveButton = ({ isDirty, onSave, loading }) => (
  <Button
    variant="primary"
    disabled={!isDirty}
    loading={loading}
    onClick={onSave}
  >
    Save
  </Button>
);

const Settings = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');

  // ── Box types ──────────────────────────────────────────────
  const [boxTypes, setBoxTypes] = useState([]);
  const [newBoxCode, setNewBoxCode] = useState('');
  const [newBoxDimensions, setNewBoxDimensions] = useState('');
  const [newBoxWeight, setNewBoxWeight] = useState('');
  const [boxStatsStartDate, setBoxStatsStartDate] = useState(null);
  // 🆕 单位开关（控制发给 Canada Post 前是否换算）
  const [lengthUnit, setLengthUnit] = useState('inch');
  const [weightUnit, setWeightUnit] = useState('gram');
  const [unitSaving, setUnitSaving] = useState(false);

  // ── DB stats / cleanup ─────────────────────────────────────
  const [dbStats, setDbStats] = useState(null);
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [isCleanupLoading, setIsCleanupLoading] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Scanner — UI state & saved state ──────────────────────
  const [scannerUI, setScannerUI] = useState({
    enabled: false, picker: false, packingOrders: false, packer: false, transfer: false
  });
  const [scannerSaved, setScannerSaved] = useState({
    enabled: false, picker: false, packingOrders: false, packer: false, transfer: false
  });
  const [scannerSaving, setScannerSaving] = useState(false);
  const scannerDirty =
    scannerUI.enabled !== scannerSaved.enabled ||
    scannerUI.picker !== scannerSaved.picker ||
    scannerUI.packingOrders !== scannerSaved.packingOrders ||
    scannerUI.packer !== scannerSaved.packer ||
    scannerUI.transfer !== scannerSaved.transfer;

  // ── Pack & Label It — UI state & saved state ───────────────
  const [packLabelUI, setPackLabelUI] = useState({ enabled: false });
  const [packLabelSaved, setPackLabelSaved] = useState({ enabled: false });
  const [packLabelSaving, setPackLabelSaving] = useState(false);
  const packLabelDirty = packLabelUI.enabled !== packLabelSaved.enabled;

  // ── Refund email ──────────────────────────────────────────
  const [refundEmail, setRefundEmail] = useState('');
  const [refundEmailSaved, setRefundEmailSaved] = useState('');
  const [refundEmailSaving, setRefundEmailSaving] = useState(false);
  const refundEmailDirty = refundEmail !== refundEmailSaved;
  const [refundHistoryClearedAt, setRefundHistoryClearedAt] = useState('');
  const [clearingHistory, setClearingHistory] = useState(false);

  // ── Fulfilment Manage (sender address) — UI & saved ────────
  const defaultSender = {
    company: '', contact: '', address1: '', address2: '',
    city: '', province: '', postalCode: ''
  };
  const [senderUI, setSenderUI] = useState(defaultSender);
  const [senderSaved, setSenderSaved] = useState(defaultSender);
  const [senderSaving, setSenderSaving] = useState(false);
  const senderDirty = JSON.stringify(senderUI) !== JSON.stringify(senderSaved);

  // ── Init ───────────────────────────────────────────────────
  useEffect(() => {
    fetchSettings();
    fetchDbStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      const s = response.data.settings || {};
      setBoxTypes(response.data.boxTypes || []);

      if (s.box_stats_start_date) setBoxStatsStartDate(s.box_stats_start_date);

      // 🆕 单位设置（默认 inch / gram）
      setLengthUnit(s.length_unit || 'inch');
      setWeightUnit(s.weight_unit || 'gram');

      const scannerVals = {
        enabled: s.scanner_enabled === 'true',
        picker: s.scanner_picker === 'true',
        packingOrders: s.scanner_packing_orders === 'true',
        packer: s.scanner_packer === 'true',
        transfer: s.scanner_transfer === 'true'
      };
      setScannerUI(scannerVals);
      setScannerSaved(scannerVals);

      const packVals = { enabled: s.pack_label_enabled === 'true' };
      setPackLabelUI(packVals);
      setPackLabelSaved(packVals);

      // Refund email
      setRefundEmail(s.refund_email || '');
      setRefundEmailSaved(s.refund_email || '');
      setRefundHistoryClearedAt(s.refund_history_cleared_at || '');

      const senderVals = {
        company: s.sender_company || '',
        contact: s.sender_contact || '',
        address1: s.sender_address1 || '',
        address2: s.sender_address2 || '',
        city: s.sender_city || '',
        province: s.sender_province || '',
        postalCode: s.sender_postal_code || ''
      };
      setSenderUI(senderVals);
      setSenderSaved(senderVals);
    } catch (error) {
      console.error('Error fetching settings:', error);
      showMessage('Error loading settings');
    }
  };

  const fetchDbStats = async () => {
    try {
      const response = await axios.get('/api/settings/database-stats');
      setDbStats(response.data);
    } catch (error) {
      console.error('Error fetching database stats:', error);
    }
  };

  // ── Scanner save ───────────────────────────────────────────
  const handleScannerSave = async () => {
    setScannerSaving(true);
    try {
      await axios.post('/api/settings/scanner', {
        scannerEnabled: scannerUI.enabled,
        scannerPicker: scannerUI.picker,
        scannerPackingOrders: scannerUI.packingOrders,
        scannerPacker: scannerUI.packer,
        scannerTransfer: scannerUI.transfer,
      });
      setScannerSaved({ ...scannerUI });
      showMessage('Scanner settings saved');
    } catch (error) {
      showMessage('Error saving scanner settings');
    } finally {
      setScannerSaving(false);
    }
  };

  const handleScannerToggle = (field, value) => {
    setScannerUI(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'enabled' && !value) {
        next.picker = false;
        next.packingOrders = false;
        next.packer = false;
      }
      return next;
    });
  };

  // ── Pack & Label It save ───────────────────────────────────
  const handlePackLabelSave = async () => {
    setPackLabelSaving(true);
    try {
      await axios.post('/api/settings/update', {
        key: 'pack_label_enabled',
        value: packLabelUI.enabled ? 'true' : 'false'
      });
      setPackLabelSaved({ ...packLabelUI });
      showMessage('Pack & Label It settings saved');
    } catch (error) {
      showMessage('Error saving Pack & Label It settings');
    } finally {
      setPackLabelSaving(false);
    }
  };

  // ── Refund email save ──────────────────────────────────────
  const handleRefundEmailSave = async () => {
    setRefundEmailSaving(true);
    try {
      await axios.post('/api/settings/update', { key: 'refund_email', value: refundEmail });
      setRefundEmailSaved(refundEmail);
      showMessage('Refund email saved');
    } catch (error) {
      showMessage('Error saving refund email');
    } finally {
      setRefundEmailSaving(false);
    }
  };

  // ── Clear label history ────────────────────────────────────
  const handleClearLabelHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all label history? This cannot be undone.')) return;
    setClearingHistory(true);
    try {
      const response = await axios.post('/api/packer/refund/clear-history');
      showMessage(`Label history cleared (${response.data.deletedCount} records deleted)`);
      setRefundHistoryClearedAt(new Date().toISOString());
    } catch (error) {
      showMessage('Error clearing label history');
    } finally {
      setClearingHistory(false);
    }
  };

  // ── 单位开关 save（选中即存）──────────────────────────────
  const handleUnitChange = async (key, value) => {
    if (key === 'length_unit') setLengthUnit(value);
    if (key === 'weight_unit') setWeightUnit(value);
    setUnitSaving(true);
    try {
      await axios.post('/api/settings/update', { key, value });
      showMessage('Unit setting saved');
    } catch (error) {
      showMessage('Error saving unit setting');
    } finally {
      setUnitSaving(false);
    }
  };

  // ── Sender address save ────────────────────────────────────
  const handleSenderSave = async () => {
    setSenderSaving(true);
    try {
      await axios.post('/api/settings/update-multiple', {
        sender_company: senderUI.company,
        sender_contact: senderUI.contact,
        sender_address1: senderUI.address1,
        sender_address2: senderUI.address2,
        sender_city: senderUI.city,
        sender_province: senderUI.province,
        sender_postal_code: senderUI.postalCode
      });
      setSenderSaved({ ...senderUI });
      showMessage('Fulfilment settings saved');
    } catch (error) {
      showMessage('Error saving Fulfilment settings');
    } finally {
      setSenderSaving(false);
    }
  };

  // ── Box types ──────────────────────────────────────────────
  const handleAddBox = async () => {
    if (!newBoxCode) { showMessage('Please enter a box code'); return; }
    try {
      await axios.post('/api/settings/box-types', {
        code: newBoxCode.toUpperCase(),
        dimensions: newBoxDimensions,
        weightGrams: parseInt(newBoxWeight) || 0
      });
      setNewBoxCode('');
      setNewBoxDimensions('');
      setNewBoxWeight('');
      await fetchSettings();
      showMessage('Box type added!');
    } catch (error) {
      showMessage(error.response?.data?.error || 'Error adding box type');
    }
  };

  const handleDeleteBox = async (id) => {
    try {
      await axios.delete(`/api/settings/box-types/${id}`);
      await fetchSettings();
      await fetchDbStats();
      showMessage('Box type deleted!');
    } catch (error) {
      showMessage('Error deleting box type');
    }
  };

  const handleBoxSave = async (box) => {
    try {
      await axios.patch(`/api/settings/box-types/${box.id}`, {
        code: box.code.toUpperCase(),
        dimensions: box.dimensions,
        quantity: box.quantity,
        weightGrams: parseInt(box.weight_grams) || 0
      });
      await fetchSettings();
      await fetchDbStats();
      showMessage('Box type saved!');
    } catch (error) {
      showMessage(error.response?.data?.error || 'Error saving box type');
    }
  };

  // ── Cleanup ────────────────────────────────────────────────
  const fetchCleanupPreview = async () => {
    setIsCleanupLoading(true);
    try {
      const response = await axios.get('/api/settings/cleanup-preview');
      setCleanupPreview(response.data);
      showMessage(`Found ${response.data.count} orders to clean up`);
    } catch (error) {
      showMessage('Error loading cleanup preview');
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const handleManualCleanup = async () => {
    if (!window.confirm('Are you sure you want to delete all data older than 60 days? This action cannot be undone.')) return;
    setIsCleanupLoading(true);
    try {
      const response = await axios.post('/api/settings/cleanup');
      showMessage(response.data.message);
      await fetchCleanupPreview();
      await fetchDbStats();
      await fetchSettings();
    } catch (error) {
      showMessage('Cleanup failed');
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const handleResetBoxUsage = async () => {
    if (!window.confirm('Are you sure you want to reset all box usage statistics?')) return;
    try {
      const response = await axios.post('/api/settings/reset-box-usage');
      showMessage(response.data.message);
      if (response.data.startDate) setBoxStatsStartDate(response.data.startDate);
      await fetchSettings();
      await fetchDbStats();
    } catch (error) {
      showMessage('Failed to reset box usage: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleClearAllData = async () => {
    if (!showClearConfirm) { setShowClearConfirm(true); return; }
    setIsClearingData(true);
    try {
      const response = await axios.post('/api/settings/clear-all-data');
      showMessage(response.data.message);
      setShowClearConfirm(false);
      await fetchDbStats();
      await fetchSettings();
      setCleanupPreview(null);
    } catch (error) {
      showMessage('Failed to clear data: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsClearingData(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────
  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 5000);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const calculateDaysUntilEmpty = (box) => {
    if (!boxStatsStartDate || !box.usage_count || box.usage_count === 0 || !box.quantity || box.quantity <= 0) return null;
    const daysPassed = Math.max(1, Math.floor((new Date() - new Date(boxStatsStartDate)) / 86400000));
    const dailyUsage = box.usage_count / daysPassed;
    if (dailyUsage === 0) return null;
    return Math.floor(box.quantity / dailyUsage);
  };

  const sortedBoxTypes = [...boxTypes].sort((a, b) => {
    if (b.usage_count !== a.usage_count) return b.usage_count - a.usage_count;
    return a.code.localeCompare(b.code);
  });

  const isError = (msg) =>
    msg.includes('Error') || msg.includes('failed') || msg.includes('Failed');

  const CheckRow = ({ id, label, checked, disabled, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
      />
      <label
        htmlFor={id}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          color: disabled ? '#8c9196' : '#202223'
        }}
      >
        {label}
      </label>
    </div>
  );

  return (
    <Page
      title="Settings"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
    >
      {message && (
        <div style={{
          padding: '12px', marginBottom: '16px',
          backgroundColor: isError(message) ? '#f8d7da' : '#d4edda',
          borderRadius: '4px',
          border: `1px solid ${isError(message) ? '#f5c6cb' : '#c3e6cb'}`
        }}>
          {message}
        </div>
      )}

      <Layout>

        {/* ── 1. Database Statistics ── */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text variant="headingMd" as="h2">Database Statistics</Text>
              {dbStats && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <Text variant="bodySm" tone="subdued">Oldest order: {formatDate(dbStats.oldestOrder?.created_at)}</Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">Newest order: {formatDate(dbStats.newestOrder?.created_at)}</Text>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    {[
                      { label: 'Total Orders', value: dbStats.orders?.count || 0 },
                      { label: 'Total Line Items', value: dbStats.lineItems?.count || 0 },
                      { label: 'Transfer Items', value: dbStats.transferItems?.count || 0 }
                    ].map(stat => (
                      <div key={stat.label} style={{
                        padding: '12px', backgroundColor: '#f6f6f7',
                        borderRadius: '8px', minWidth: '100px', flex: '0 0 auto'
                      }}>
                        <Text variant="bodySm" tone="subdued">{stat.label}</Text>
                        <Text variant="headingMd" as="p">{stat.value}</Text>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <Text variant="bodySm" tone="subdued">
                      Box stats from {boxStatsStartDate ? formatDate(boxStatsStartDate) : 'N/A'}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {sortedBoxTypes.map(box => {
                      const remaining = box.quantity ?? 'null';
                      const days = calculateDaysUntilEmpty(box);
                      return (
                        <div key={box.id} style={{
                          padding: '12px', backgroundColor: '#f6f6f7',
                          borderRadius: '8px', minWidth: '90px', flex: '0 0 auto'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                            <Text variant="bodySm" fontWeight="medium">{box.code}</Text>
                            {box.dimensions && (
                              <Text variant="bodySm" tone="subdued" as="span" style={{ fontSize: '11px' }}>
                                {box.dimensions}
                              </Text>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <Text variant="headingMd" as="span">{box.usage_count || 0}</Text>
                            <Text variant="bodySm" tone="subdued" as="span">{remaining}</Text>
                          </div>
                          {days !== null && (
                            <div style={{ marginTop: '4px' }}>
                              <Text variant="bodySm" tone="subdued" as="span" style={{ fontSize: '11px' }}>~{days}d</Text>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Layout.Section>

        {/* ── 2. Enable Scanner ── */}
        <Layout.Section>
          <CollapsibleCard title="Enable Scanner">
            <BlockStack gap="3">
              <CheckRow
                id="scanner-enabled"
                label="Enable scanner"
                checked={scannerUI.enabled}
                onChange={v => handleScannerToggle('enabled', v)}
              />
              <div style={{ paddingLeft: '26px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <CheckRow
                  id="scanner-picker"
                  label="Enable scanner in Picker"
                  checked={scannerUI.picker}
                  disabled={!scannerUI.enabled}
                  onChange={v => handleScannerToggle('picker', v)}
                />
                <CheckRow
                  id="scanner-packing-orders"
                  label="Enable scanner in Packing Orders"
                  checked={scannerUI.packingOrders}
                  disabled={!scannerUI.enabled}
                  onChange={v => handleScannerToggle('packingOrders', v)}
                />
                <CheckRow
                  id="scanner-packer"
                  label="Enable scanner in Packer"
                  checked={scannerUI.packer}
                  disabled={!scannerUI.enabled}
                  onChange={v => handleScannerToggle('packer', v)}
                />
                <CheckRow
                  id="scanner-transfer"
                  label="Enable scanner in Transfer"
                  checked={scannerUI.transfer}
                  disabled={!scannerUI.enabled}
                  onChange={v => handleScannerToggle('transfer', v)}
                />
              </div>
              <div style={{ marginTop: '8px' }}>
                <SaveButton isDirty={scannerDirty} onSave={handleScannerSave} loading={scannerSaving} />
              </div>
            </BlockStack>
          </CollapsibleCard>
        </Layout.Section>

        {/* ── 3. Pack & Label It ── */}
        <Layout.Section>
          <CollapsibleCard title="Pack & Label It">
            <BlockStack gap="3">
              <Text variant="bodySm" tone="subdued">
                When enabled, submitting a packed order will automatically purchase a Canada Post label,
                fulfill the order in Shopify, and send the label to the printer.
              </Text>
              <CheckRow
                id="pack-label-enabled"
                label="Enable Pack & Label It"
                checked={packLabelUI.enabled}
                onChange={v => setPackLabelUI({ enabled: v })}
              />
              <div style={{ marginTop: '8px' }}>
                <SaveButton isDirty={packLabelDirty} onSave={handlePackLabelSave} loading={packLabelSaving} />
              </div>

              {/* Refund email */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e1e3e5' }}>
                <Text variant="headingSm" as="h3">Refund Settings</Text>
                <div style={{ marginTop: '12px' }}>
                  <TextField
                    label="Refund notification email"
                    value={refundEmail}
                    onChange={setRefundEmail}
                    placeholder="name@example.com"
                    autoComplete="off"
                    helpText="This email will receive refund confirmation from Canada Post"
                  />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <SaveButton isDirty={refundEmailDirty} onSave={handleRefundEmailSave} loading={refundEmailSaving} />
                </div>
              </div>

              {/* Clear label history */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e1e3e5' }}>
                <Text variant="headingSm" as="h3">Label History</Text>
                <div style={{ marginTop: '8px' }}>
                  <Text variant="bodySm" tone="subdued">
                    {refundHistoryClearedAt
                      ? `Last cleared: ${new Date(refundHistoryClearedAt).toLocaleString()}`
                      : 'History has never been cleared.'}
                  </Text>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <Button tone="critical" onClick={handleClearLabelHistory} loading={clearingHistory}>
                    Clear Label History
                  </Button>
                </div>
              </div>
            </BlockStack>
          </CollapsibleCard>
        </Layout.Section>

        {/* ── 4. Manage Boxes ── */}
        <Layout.Section>
          <CollapsibleCard title="Manage Boxes">
            {/* 🆕 单位开关 + 动态提示 */}
            <div style={{
              marginBottom: '20px', padding: '16px',
              backgroundColor: '#f1f8f5', border: '1px solid #b7e0c9', borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '160px' }}>
                  <Select
                    label="Length unit"
                    options={[
                      { label: 'Inches (in)', value: 'inch' },
                      { label: 'Centimeters (cm)', value: 'cm' }
                    ]}
                    value={lengthUnit}
                    onChange={value => handleUnitChange('length_unit', value)}
                    disabled={unitSaving}
                  />
                </div>
                <div style={{ minWidth: '160px' }}>
                  <Select
                    label="Weight unit"
                    options={[
                      { label: 'Grams (g)', value: 'gram' },
                      { label: 'Kilograms (kg)', value: 'kg' }
                    ]}
                    value={weightUnit}
                    onChange={value => handleUnitChange('weight_unit', value)}
                    disabled={unitSaving}
                  />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <Text variant="bodyMd" fontWeight="medium" as="p">
                  {`All sizes are in ${lengthUnit === 'cm' ? 'centimeters' : 'inches'}, all weights are in ${weightUnit === 'kg' ? 'kilograms' : 'grams'}.`}
                </Text>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <Text variant="headingSm" as="h3">Add New Box Type</Text>
              <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                <TextField
                  label="Code"
                  value={newBoxCode}
                  onChange={setNewBoxCode}
                  placeholder="A"
                  maxLength={2}
                  autoComplete="off"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <TextField
                  label="Dimensions (e.g. 10x8x4)"
                  value={newBoxDimensions}
                  onChange={setNewBoxDimensions}
                  placeholder="10x8x4"
                  autoComplete="off"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <TextField
                  label="Box Weight"
                  type="number"
                  value={newBoxWeight}
                  onChange={setNewBoxWeight}
                  placeholder="0"
                  autoComplete="off"
                />
              </div>
              <Button onClick={handleAddBox}>Add Box Type</Button>
            </div>
            {boxTypes.length > 0 && (
              <div>
                <Text variant="headingSm" as="h3">Current Box Types</Text>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '16px', marginTop: '12px'
                }}>
                  {boxTypes.map(box => (
                    <div key={box.id} style={{
                      padding: '16px', border: '1px solid #e1e3e5',
                      borderRadius: '8px', backgroundColor: '#fafbfb'
                    }}>
                      <div style={{ marginBottom: '12px' }}>
                        <TextField label="Code" value={box.code} autoComplete="off"
                          onChange={value => setBoxTypes(prev => prev.map(b => b.id === box.id ? { ...b, code: value } : b))} />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <TextField label="Dimensions" value={box.dimensions || ''} autoComplete="off"
                          onChange={value => setBoxTypes(prev => prev.map(b => b.id === box.id ? { ...b, dimensions: value } : b))} />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <TextField label="Quantity" type="number" value={box.quantity?.toString() || '0'} autoComplete="off"
                          onChange={value => setBoxTypes(prev => prev.map(b => b.id === box.id ? { ...b, quantity: parseInt(value) || 0 } : b))} />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <TextField label="Box Weight" type="number" value={box.weight_grams?.toString() || '0'} autoComplete="off"
                          onChange={value => setBoxTypes(prev => prev.map(b => b.id === box.id ? { ...b, weight_grams: parseInt(value) || 0 } : b))} />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button tone="critical" onClick={() => handleDeleteBox(box.id)}>Delete</Button>
                        <Button variant="primary" onClick={() => handleBoxSave(box)}>Save</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleCard>
        </Layout.Section>

        {/* ── 5. Fulfilment Manage ── */}
        <Layout.Section>
          <CollapsibleCard title="Fulfilment Manage">
            <BlockStack gap="3">
              <Text variant="bodySm" tone="subdued">
                This address will appear as the sender on all Canada Post shipping labels.
              </Text>
              <TextField label="Company Name" value={senderUI.company} autoComplete="off"
                onChange={v => setSenderUI(p => ({ ...p, company: v }))} />
              <TextField label="Contact Name (optional)" value={senderUI.contact} autoComplete="off"
                onChange={v => setSenderUI(p => ({ ...p, contact: v }))} />
              <TextField label="Address Line 1" value={senderUI.address1} autoComplete="off"
                onChange={v => setSenderUI(p => ({ ...p, address1: v }))} />
              <TextField label="Address Line 2 (optional)" value={senderUI.address2} autoComplete="off"
                onChange={v => setSenderUI(p => ({ ...p, address2: v }))} />
              <TextField label="City" value={senderUI.city} autoComplete="off"
                onChange={v => setSenderUI(p => ({ ...p, city: v }))} />
              <TextField label="Province (e.g. QC)" value={senderUI.province} autoComplete="off"
                onChange={v => setSenderUI(p => ({ ...p, province: v }))} />
              <TextField label="Postal Code (e.g. J4L1M8)" value={senderUI.postalCode} autoComplete="off"
                onChange={v => setSenderUI(p => ({ ...p, postalCode: v }))} />
              <div style={{ marginTop: '8px' }}>
                <SaveButton isDirty={senderDirty} onSave={handleSenderSave} loading={senderSaving} />
              </div>
            </BlockStack>
          </CollapsibleCard>
        </Layout.Section>

        {/* ── 6. Cleanup Statistics ── */}
        <Layout.Section>
          <CollapsibleCard title="Cleanup Statistics">
            <BlockStack gap="4">
              <div style={{
                padding: '16px', backgroundColor: '#e3f2fd',
                borderRadius: '8px', border: '1px solid #90caf9'
              }}>
                <Text variant="headingSm" as="h3">Automatic Cleanup</Text>
                <div style={{ marginTop: '8px' }}>
                  <Text variant="bodySm">
                    The system automatically deletes data older than <strong>60 days</strong> every day at <strong>2:00 AM</strong>.
                  </Text>
                </div>
              </div>

              {cleanupPreview && (
                <div style={{
                  padding: '16px', backgroundColor: '#fff3e0',
                  borderRadius: '8px', border: '1px solid #ffb74d'
                }}>
                  <Text variant="headingSm" as="h3">Cleanup Preview</Text>
                  <div style={{ marginTop: '12px' }}>
                    <Text variant="bodyMd"><strong>{cleanupPreview.count}</strong> orders will be deleted</Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">Cutoff date: {formatDate(cleanupPreview.cutoffDate)}</Text>
                    {cleanupPreview.count > 0 && (
                      <div style={{ marginTop: '12px', maxHeight: '200px', overflow: 'auto' }}>
                        <Text variant="bodySm" fontWeight="bold">Orders to be deleted:</Text>
                        <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                          {cleanupPreview.orders.slice(0, 10).map(order => (
                            <li key={order.shopify_order_id}>
                              <Text variant="bodySm">
                                {order.name} - {formatDate(order.created_at)} ({order.fulfillment_status})
                              </Text>
                            </li>
                          ))}
                          {cleanupPreview.orders.length > 10 && (
                            <li>
                              <Text variant="bodySm" tone="subdued">
                                ... and {cleanupPreview.orders.length - 10} more
                              </Text>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button onClick={fetchCleanupPreview} loading={isCleanupLoading}>Check Preview</Button>
                <Button tone="critical" loading={isCleanupLoading}
                  disabled={cleanupPreview?.count === 0} onClick={handleManualCleanup}>
                  Run Cleanup Now
                </Button>
                <Button tone="critical" onClick={handleResetBoxUsage}>Reset Box Usage</Button>
              </div>

              <div style={{
                marginTop: '8px', padding: '16px',
                backgroundColor: '#fff1f0', borderRadius: '8px', border: '2px solid #ff4d4f'
              }}>
                <Text variant="headingSm" as="h3">⚠️ Danger Zone</Text>
                <div style={{ marginTop: '12px' }}>
                  <Text variant="bodySm" tone="critical">
                    This will permanently delete ALL orders, line items, and transfer items from the database.
                  </Text>
                </div>
                {showClearConfirm && (
                  <div style={{
                    marginTop: '12px', padding: '12px',
                    backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #ff4d4f'
                  }}>
                    <Text variant="bodyMd" fontWeight="bold" tone="critical">Are you absolutely sure?</Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">
                      This action cannot be undone. All order data will be permanently deleted.
                    </Text>
                  </div>
                )}
                <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                  {!showClearConfirm ? (
                    <Button tone="critical" disabled={isClearingData} onClick={handleClearAllData}>
                      Clear All Data
                    </Button>
                  ) : (
                    <>
                      <Button tone="critical" loading={isClearingData} onClick={handleClearAllData}>
                        Yes, Delete Everything
                      </Button>
                      <Button disabled={isClearingData} onClick={() => setShowClearConfirm(false)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </BlockStack>
          </CollapsibleCard>
        </Layout.Section>

        <Layout.Section>
          <p style={{ padding: '16px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
            Settings should be configured on desktop/PC.
          </p>
        </Layout.Section>

      </Layout>
    </Page>
  );
};

export default Settings;