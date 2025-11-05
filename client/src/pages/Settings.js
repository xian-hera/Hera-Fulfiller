import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { Page, Layout, Card, TextField, Button, Text, BlockStack } from '@shopify/polaris';

const Settings = () => {
  const navigate = useNavigate();
  const [boxTypes, setBoxTypes] = useState([]);
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
  
  // 🆕 Box 统计开始日期
  const [boxStatsStartDate, setBoxStatsStartDate] = useState(null);

  useEffect(() => {
    fetchSettings();
    fetchDbStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setBoxTypes(response.data.boxTypes || []);
      
      // 🆕 获取 box stats start date
      const startDate = response.data.settings?.box_stats_start_date;
      if (startDate) {
        setBoxStatsStartDate(startDate);
      }
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
      await fetchSettings();
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
      
      await fetchDbStats();
      await fetchSettings();
      setCleanupPreview(null);
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

  // 🆕 重置 Box 使用统计
  const handleResetBoxUsage = async () => {
    if (!window.confirm('Are you sure you want to reset all box usage statistics? This will clear usage counts and quantities for all boxes.')) {
      return;
    }

    try {
      const response = await axios.post('/api/settings/reset-box-usage');
      showMessage(response.data.message);
      
      // 🆕 更新 box stats start date
      if (response.data.startDate) {
        setBoxStatsStartDate(response.data.startDate);
      }
      
      await fetchSettings();
      await fetchDbStats();
    } catch (error) {
      console.error('Error resetting box usage:', error);
      showMessage('Failed to reset box usage: ' + (error.response?.data?.error || error.message));
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
      await fetchDbStats();
      showMessage('Box type deleted!');
    } catch (error) {
      showMessage('Error deleting box type');
    }
  };

  // 🆕 保存单个 box type（包括 quantity）
  const handleBoxSave = async (box) => {
    try {
      await axios.patch(`/api/settings/box-types/${box.id}`, {
        code: box.code.toUpperCase(),
        dimensions: box.dimensions,
        quantity: box.quantity
      });
      await fetchSettings();
      await fetchDbStats();
      showMessage('Box type saved!');
    } catch (error) {
      showMessage(error.response?.data?.error || 'Error saving box type');
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

  // 🆕 按使用次数和字母排序 box types
  const sortedBoxTypes = [...boxTypes].sort((a, b) => {
    if (b.usage_count !== a.usage_count) {
      return b.usage_count - a.usage_count;
    }
    return a.code.localeCompare(b.code);
  });

  return (
    <Page
      title="Settings"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
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
              {/* 🆕 数据库统计 + Box Type 统计 */}
              <div>
                <Text variant="headingSm" as="h3">Database Statistics</Text>
                {dbStats && (
                  <div style={{ marginTop: '12px' }}>
                    {/* 🆕 日期信息移到顶部 */}
                    <div style={{ marginBottom: '16px' }}>
                      <Text variant="bodySm" tone="subdued">
                        Oldest order: {formatDate(dbStats.oldestOrder?.created_at)}
                      </Text>
                      <br />
                      <Text variant="bodySm" tone="subdued">
                        Newest order: {formatDate(dbStats.newestOrder?.created_at)}
                      </Text>
                    </div>

                    {/* Orders 统计 */}
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '8px',
                      marginBottom: '16px'
                    }}>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '100px',
                        flex: '0 0 auto'
                      }}>
                        <Text variant="bodySm" tone="subdued">Total Orders</Text>
                        <Text variant="headingMd" as="p">{dbStats.orders?.count || 0}</Text>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '100px',
                        flex: '0 0 auto'
                      }}>
                        <Text variant="bodySm" tone="subdued">Total Line Items</Text>
                        <Text variant="headingMd" as="p">{dbStats.lineItems?.count || 0}</Text>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '100px',
                        flex: '0 0 auto'
                      }}>
                        <Text variant="bodySm" tone="subdued">Transfer Items</Text>
                        <Text variant="headingMd" as="p">{dbStats.transferItems?.count || 0}</Text>
                      </div>
                    </div>

                    {/* 🆕 Box 统计开始日期 */}
                    <div style={{ marginBottom: '12px' }}>
                      <Text variant="bodySm" tone="subdued">
                        Box from {boxStatsStartDate ? formatDate(boxStatsStartDate) : 'N/A'}
                      </Text>
                    </div>

                    {/* 🆕 Box Type 统计（新行） */}
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '8px'
                    }}>
                      {sortedBoxTypes.map((box) => {
                        // 🆕 quantity 就是剩余数量
                        const remainingDisplay = (box.quantity !== undefined && box.quantity !== null) ? box.quantity : 'null';
                        
                        return (
                          <div 
                            key={box.id}
                            style={{ 
                              padding: '12px', 
                              backgroundColor: '#f6f6f7', 
                              borderRadius: '8px',
                              minWidth: '90px',
                              flex: '0 0 auto'
                            }}
                          >
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
                              <Text variant="bodySm" tone="subdued" as="span">{remainingDisplay}</Text>
                            </div>
                          </div>
                        );
                      })}
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
                {/* 🆕 Reset Box Usage 按钮 */}
                <Button 
                  onClick={handleResetBoxUsage}
                  tone="critical"
                >
                  Reset Box Usage
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
                {/* 🆕 3列布局 */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: '16px' 
                }}>
                  {boxTypes.map((box) => (
                    <div 
                      key={box.id} 
                      style={{ 
                        padding: '16px', 
                        border: '1px solid #e1e3e5',
                        borderRadius: '8px',
                        backgroundColor: '#fafbfb'
                      }}
                    >
                      {/* Code */}
                      <div style={{ marginBottom: '12px' }}>
                        <TextField
                          label="Code"
                          value={box.code}
                          onChange={(value) => {
                            const updated = boxTypes.map(b => 
                              b.id === box.id ? { ...b, code: value } : b
                            );
                            setBoxTypes(updated);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      
                      {/* Dimensions */}
                      <div style={{ marginBottom: '12px' }}>
                        <TextField
                          label="Dimensions"
                          value={box.dimensions || ''}
                          onChange={(value) => {
                            const updated = boxTypes.map(b => 
                              b.id === box.id ? { ...b, dimensions: value } : b
                            );
                            setBoxTypes(updated);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      
                      {/* 🆕 Quantity */}
                      <div style={{ marginBottom: '12px' }}>
                        <TextField
                          label="Quantity"
                          type="number"
                          value={box.quantity?.toString() || '0'}
                          onChange={(value) => {
                            const updated = boxTypes.map(b => 
                              b.id === box.id ? { ...b, quantity: parseInt(value) || 0 } : b
                            );
                            setBoxTypes(updated);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      
                      {/* 🆕 Delete & Save 按钮 */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button 
                          onClick={() => handleDeleteBox(box.id)}
                          tone="critical"
                        >
                          Delete
                        </Button>
                        <Button 
                          onClick={() => handleBoxSave(box)}
                          variant="primary"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
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