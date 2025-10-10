import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';  // 使用正确的 axios
import { Page, Layout, Card, TextField, Button, Text, BlockStack, InlineStack, Badge } from '@shopify/polaris';

const Settings = () => {
  const navigate = useNavigate();
  const [transferColumn, setTransferColumn] = useState('E');
  const [pickerColumn, setPickerColumn] = useState('E');
  const [skuColumn, setSkuColumn] = useState('A');
  const [boxTypes, setBoxTypes] = useState([]);
  const [lastUpload, setLastUpload] = useState('');
  const [newBoxCode, setNewBoxCode] = useState('');
  const [newBoxDimensions, setNewBoxDimensions] = useState('');
  const [message, setMessage] = useState('');
  
  // 清理相关状态
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [isCleanupLoading, setIsCleanupLoading] = useState(false);
  
  // 清空所有数据相关状态
  const [isClearingData, setIsClearingData] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchDbStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setTransferColumn(response.data.settings.transfer_csv_column || 'E');
      setPickerColumn(response.data.settings.picker_wig_column || 'E');
      setSkuColumn(response.data.settings.sku_column || 'A');
      setBoxTypes(response.data.boxTypes || []);
      setLastUpload(response.data.settings.csv_uploaded_at || '');
    } catch (error) {
      console.error('Error:', error);
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

  const fetchCleanupPreview = async () => {
    setIsCleanupLoading(true);
    try {
      const response = await axios.get('/api/settings/cleanup-preview');
      setCleanupPreview(response.data);
      showMessage(`Found ${response.data.count} orders to clean up`);
    } catch (error) {
      console.error('Error fetching cleanup preview:', error);
      showMessage('Error loading cleanup preview');
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const handleManualCleanup = async () => {
    if (!window.confirm('Are you sure you want to delete all data older than 60 days? This action cannot be undone.')) {
      return;
    }

    setIsCleanupLoading(true);
    try {
      const response = await axios.post('/api/settings/cleanup');
      showMessage(response.data.message);
      await fetchCleanupPreview();
      await fetchDbStats();
    } catch (error) {
      console.error('Error running cleanup:', error);
      showMessage('Cleanup failed');
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      return;
    }

    setIsClearingData(true);
    try {
      const response = await axios.post('/api/settings/clear-all-data');
      showMessage(response.data.message);
      setShowClearConfirm(false);
      
      // 刷新统计数据
      await fetchDbStats();
      setCleanupPreview(null); // 清除预览
    } catch (error) {
      console.error('Error clearing data:', error);
      showMessage('Failed to clear data: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsClearingData(false);
    }
  };

  const handleCancelClear = () => {
    setShowClearConfirm(false);
  };

  const handleSave = async () => {
    try {
      await axios.post('/api/settings/update', {
        transferCsvColumn: transferColumn,
        pickerWigColumn: pickerColumn,
        skuColumn: skuColumn
      });
      showMessage('Settings saved successfully!');
    } catch (error) {
      showMessage('Error saving settings');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/settings/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setLastUpload(res.data.uploadedAt);
      showMessage(`CSV uploaded! ${res.data.rowsImported} rows imported`);
      e.target.value = '';
    } catch (err) {
      showMessage('Upload failed');
    }
  };

  const handleAddBox = async () => {
    if (!newBoxCode) {
      showMessage('Please enter a box code');
      return;
    }

    try {
      await axios.post('/api/settings/box-types', {
        code: newBoxCode.toUpperCase(),
        dimensions: newBoxDimensions
      });
      setNewBoxCode('');
      setNewBoxDimensions('');
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
      showMessage('Box type deleted!');
    } catch (error) {
      showMessage('Error deleting box type');
    }
  };

  const handleBoxUpdate = async (id, code, dimensions) => {
    try {
      await axios.patch(`/api/settings/box-types/${id}`, {
        code: code.toUpperCase(),
        dimensions
      });
      showMessage('Box type updated!');
    } catch (error) {
      showMessage(error.response?.data?.error || 'Error updating box type');
    }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 5000);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  return (
    <Page
      title="Settings"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
      primaryAction={{ content: 'Save', onAction: handleSave }}
    >
      {message && (
        <div style={{ 
          padding: '12px', 
          marginBottom: '16px', 
          backgroundColor: message.includes('Error') || message.includes('failed') || message.includes('Failed') ? '#f8d7da' : '#d4edda', 
          borderRadius: '4px',
          border: `1px solid ${message.includes('Error') || message.includes('failed') || message.includes('Failed') ? '#f5c6cb' : '#c3e6cb'}`
        }}>
          {message}
        </div>
      )}

      <Layout>
        {/* 数据库统计和清理 */}
        <Layout.Section>
          <Card title="Database Management" sectioned>
            <BlockStack gap="4">
              {/* 数据库统计 */}
              <div>
                <Text variant="headingSm" as="h3">Database Statistics</Text>
                {dbStats && (
                  <div style={{ marginTop: '12px' }}>
                    <InlineStack gap="4" wrap>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '150px'
                      }}>
                        <Text variant="bodySm" tone="subdued">Total Orders</Text>
                        <Text variant="headingMd" as="p">{dbStats.orders?.count || 0}</Text>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '150px'
                      }}>
                        <Text variant="bodySm" tone="subdued">Total Line Items</Text>
                        <Text variant="headingMd" as="p">{dbStats.lineItems?.count || 0}</Text>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '150px'
                      }}>
                        <Text variant="bodySm" tone="subdued">Transfer Items</Text>
                        <Text variant="headingMd" as="p">{dbStats.transferItems?.count || 0}</Text>
                      </div>
                    </InlineStack>
                    <div style={{ marginTop: '12px' }}>
                      <Text variant="bodySm" tone="subdued">
                        Oldest order: {formatDate(dbStats.oldestOrder?.created_at)}
                      </Text>
                      <br />
                      <Text variant="bodySm" tone="subdued">
                        Newest order: {formatDate(dbStats.newestOrder?.created_at)}
                      </Text>
                    </div>
                  </div>
                )}
              </div>

              {/* 自动清理信息 */}
              <div style={{ 
                padding: '16px', 
                backgroundColor: '#e3f2fd', 
                borderRadius: '8px',
                border: '1px solid #90caf9'
              }}>
                <Text variant="headingSm" as="h3">Automatic Cleanup</Text>
                <div style={{ marginTop: '8px' }}>
                  <Text variant="bodySm">
                    The system automatically deletes data older than <strong>60 days</strong> every day at <strong>2:00 AM</strong>.
                  </Text>
                </div>
              </div>

              {/* 清理预览 */}
              {cleanupPreview && (
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: '#fff3e0', 
                  borderRadius: '8px',
                  border: '1px solid #ffb74d'
                }}>
                  <Text variant="headingSm" as="h3">Cleanup Preview</Text>
                  <div style={{ marginTop: '12px' }}>
                    <Text variant="bodyMd">
                      <strong>{cleanupPreview.count}</strong> orders will be deleted
                    </Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">
                      Cutoff date: {formatDate(cleanupPreview.cutoffDate)}
                    </Text>
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

              {/* 清理操作按钮 */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button 
                  onClick={fetchCleanupPreview}
                  loading={isCleanupLoading}
                >
                  Check Preview
                </Button>
                <Button 
                  onClick={handleManualCleanup}
                  tone="critical"
                  loading={isCleanupLoading}
                  disabled={cleanupPreview?.count === 0}
                >
                  Run Cleanup Now
                </Button>
                <Button 
                  onClick={fetchDbStats}
                  plain
                >
                  Refresh Stats
                </Button>
              </div>

              {/* 危险区域：清空所有数据 */}
              <div style={{ 
                marginTop: '24px',
                padding: '16px', 
                backgroundColor: '#fff1f0', 
                borderRadius: '8px',
                border: '2px solid #ff4d4f'
              }}>
                <Text variant="headingSm" as="h3">⚠️ Danger Zone</Text>
                <div style={{ marginTop: '12px' }}>
                  <Text variant="bodySm" tone="critical">
                    This will permanently delete ALL orders, line items, and transfer items from the database. 
                    CSV data and settings will NOT be affected.
                  </Text>
                </div>
                
                {showClearConfirm && (
                  <div style={{ 
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#fff',
                    borderRadius: '4px',
                    border: '1px solid #ff4d4f'
                  }}>
                    <Text variant="bodyMd" fontWeight="bold" tone="critical">
                      Are you absolutely sure?
                    </Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">
                      This action cannot be undone. All order data will be permanently deleted.
                    </Text>
                  </div>
                )}
                
                <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                  {!showClearConfirm ? (
                    <Button 
                      onClick={handleClearAllData}
                      tone="critical"
                      disabled={isClearingData}
                    >
                      Clear All Data
                    </Button>
                  ) : (
                    <>
                      <Button 
                        onClick={handleClearAllData}
                        tone="critical"
                        loading={isClearingData}
                      >
                        Yes, Delete Everything
                      </Button>
                      <Button 
                        onClick={handleCancelClear}
                        disabled={isClearingData}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="CSV Upload" sectioned>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{
                padding: '8px',
                border: '1px solid #c9cccf',
                borderRadius: '4px',
                width: '100%',
                marginBottom: '8px'
              }}
            />
            {lastUpload && (
              <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
                Last upload: {new Date(lastUpload).toLocaleString()}
              </p>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="CSV SKU Column" sectioned>
            <TextField
              label="SKU Column"
              value={skuColumn}
              onChange={setSkuColumn}
              maxLength={2}
              autoComplete="off"
              helpText="Column letter where SKU is located (e.g., A)"
            />
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Transfer CSV Column" sectioned>
            <TextField
              label="Transfer Column"
              value={transferColumn}
              onChange={setTransferColumn}
              maxLength={2}
              autoComplete="off"
              helpText="Column for transfer copy text (e.g., H)"
            />
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Picker WIG Column" sectioned>
            <TextField
              label="WIG Column"
              value={pickerColumn}
              onChange={setPickerColumn}
              maxLength={2}
              autoComplete="off"
              helpText="Column for WIG product number (e.g., E)"
            />
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Box Types" sectioned>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>Add New Box Type</p>
              <div style={{ marginBottom: '12px' }}>
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
                  label="Dimensions"
                  value={newBoxDimensions}
                  onChange={setNewBoxDimensions}
                  placeholder="10x8x4"
                  autoComplete="off"
                />
              </div>
              <Button onClick={handleAddBox}>Add Box Type</Button>
            </div>

            {boxTypes.length > 0 && (
              <div>
                <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>Current Box Types</p>
                {boxTypes.map((box) => (
                  <div 
                    key={box.id} 
                    style={{ 
                      padding: '16px', 
                      border: '1px solid #e1e3e5',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      backgroundColor: '#fafbfb'
                    }}
                  >
                    <div style={{ marginBottom: '8px' }}>
                      <TextField
                        label="Code"
                        value={box.code}
                        onChange={(value) => {
                          const updated = boxTypes.map(b => 
                            b.id === box.id ? { ...b, code: value } : b
                          );
                          setBoxTypes(updated);
                        }}
                        onBlur={() => handleBoxUpdate(box.id, box.code, box.dimensions)}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <TextField
                        label="Dimensions"
                        value={box.dimensions}
                        onChange={(value) => {
                          const updated = boxTypes.map(b => 
                            b.id === box.id ? { ...b, dimensions: value } : b
                          );
                          setBoxTypes(updated);
                        }}
                        onBlur={() => handleBoxUpdate(box.id, box.code, box.dimensions)}
                        autoComplete="off"
                      />
                    </div>
                    <Button onClick={() => handleDeleteBox(box.id)}>Delete</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <p style={{ padding: '16px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
            Settings should be configured on desktop/PC. Click Save after making changes.
          </p>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Settings;