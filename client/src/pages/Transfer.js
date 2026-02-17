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
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

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
      showToast('Error loading transfer items');
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
      showToast('Error copying text');
    }
  };

  const handleSkuCopy = (sku) => {
    if (!sku) return;
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

  // 🔧 修复并发删除问题
  const handleClearSelected = async () => {
    if (selectedItems.length === 0) return;
    
    try {
      console.log(`Attempting to delete ${selectedItems.length} items:`, selectedItems);
      
      const response = await axios.post('/api/transfer/items/bulk-delete', {
        ids: selectedItems
      });

      console.log('Delete response:', response.data);

      // 重新获取数据
      await fetchItems();
      setSelectedItems([]);
      setClearMode(false);

      // 显示更详细的消息
      const { deleted, notFound } = response.data;
      if (notFound > 0) {
        showToast(`Deleted ${deleted} items (${notFound} already deleted by another user)`);
      } else {
        showToast(`Deleted ${deleted} items`);
      }
    } catch (error) {
      console.error('Error clearing items:', error);
      
      // 更好的错误处理
      if (error.response?.status === 500) {
        showToast('Server error. Refreshing data...');
        await fetchItems();
        setSelectedItems([]);
        setClearMode(false);
      } else {
        showToast('Failed to delete items. Please try again.');
      }
    }
  };

  const handleGenerateStockReport = async () => {
    setIsGeneratingReport(true);
    try {
      console.log('Generating stock report...');
      
      const response = await axios.get('/api/transfer/stock-report', {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `stock-report-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      console.log('✓ Stock report downloaded successfully');
      showToast('Stock report downloaded successfully');
    } catch (error) {
      console.error('Error generating stock report:', error);
      
      if (error.response?.status === 404) {
        showToast('No transferring items found to generate a report');
      } else {
        showToast('Failed to generate stock report. Please try again');
      }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleGreenClick = async (item) => {
    const newStatus = item.status === 'transferring' ? 'found' : 'received';
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: newStatus });
      await fetchItems();
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Error updating status');
    }
  };

  const handleBlueClick = (item) => {
    const currentDate = new Date();
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity ? item.quantity.toString() : '1',
      transferFrom: '',
      estimateDay: currentDate.getDate().toString()
    });
  };

  const handleWaitingBadgeClick = (item) => {
    const currentDate = new Date();
    setTransferModal(item);
    setTransferData({
      transferQuantity: item.quantity ? item.quantity.toString() : '1',
      transferFrom: item.transfer_from || '',
      estimateDay: item.estimate_day ? item.estimate_day.toString() : currentDate.getDate().toString()
    });
  };

  const handleReceivedUndo = async (item) => {
    try {
      await axios.patch(`/api/transfer/items/${item.id}`, { status: 'transferring' });
      await fetchItems();
      showToast('Status changed to Transferring');
    } catch (error) {
      console.error('Error undoing received status:', error);
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
        out_of_stock: 0, 
        status: 'transferring' 
      });
      await fetchItems();
      showToast('Out of Stock status removed');
    } catch (error) {
      console.error('Error removing out of stock:', error);
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
      await fetchReceivingOptions();
      setTransferModal(null);
    } catch (error) {
      console.error('Error updating transfer:', error);
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

  const getItemBadge = (status, item, onBadgeClick) => {
    if (item.out_of_stock === 1) {
      return (
        <Badge tone="critical">Out of Stock</Badge>
      );
    }

    switch (status) {
      case 'waiting':
        return (
          <span 
            onClick={(e) => {
              e.stopPropagation();
              onBadgeClick(item);
            }}
            style={{ cursor: 'pointer' }}
          >
            <Badge tone="info">Waiting</Badge>
          </span>
        );
      case 'received':
      case 'found':
        return (
          <span 
            onClick={(e) => {
              e.stopPropagation();
              handleReceivedUndo(item);
            }}
            style={{ cursor: 'pointer' }}
          >
            <Badge tone="success">Received</Badge>
          </span>
        );
      default:
        return <Badge>Transferring</Badge>;
    }
  };

  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  // 🔧 修复 formatDate - 添加 null 检查
  const formatDate = (month, day) => {
    if (month == null || day == null || month === '' || day === '') {
      return 'N/A';
    }
    
    try {
      const m = String(month).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      return `${m}/${d}`;
    } catch (error) {
      console.error('Error formatting date:', { month, day, error });
      return 'N/A';
    }
  };

  // 🔧 修复 renderItem - 添加完整的 null 检查
  const renderItem = (item) => {
    if (!item) {
      console.error('renderItem received null item');
      return null;
    }

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
      out_of_stock 
    } = item;
    
    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={image_url} alt={title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <div className="transfer-item-container">
        {/* 桌面端布局 */}
        <div className="transfer-item-desktop">
          <div style={{ marginRight: '16px' }}>
            {media}
          </div>

          <div style={{ 
            fontSize: '38px', 
            lineHeight: 1,
            marginRight: '20px',
            marginTop: '5px',
            minWidth: '50px'
          }}>
            {quantity}
          </div>

          <div style={{ flex: 1, maxWidth: 'calc(100% - 350px)' }}>
            <BlockStack gap="1">
              <div style={{ 
                wordWrap: 'break-word', 
                overflowWrap: 'break-word',
                maxWidth: '60ch'
              }}>
                <Text variant="bodyLg" fontWeight="bold">
                  {brand} {title} {size}
                </Text>
              </div>
              
              {variant_title && (
                <Text variant="bodyMd">
                  {variant_title}
                </Text>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="bodySm">
                  {formatSKU(sku)}
                </Text>
                <button
                  onClick={() => handleSkuCopy(sku)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#005bd3',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: 0
                  }}
                >
                  Copy
                </button>
              </div>
              
              <Text variant="bodySm" tone="subdued">
                #{order_number}
              </Text>
            </BlockStack>
          </div>

          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '17px',
            marginLeft: 'auto'
          }}>
            {clearMode ? (
              <input
                type="checkbox"
                checked={selectedItems.includes(id)}
                onChange={() => handleItemSelect(id)}
                style={{ width: '20px', height: '20px' }}
              />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {(status === 'waiting' || status === 'received' || status === 'found') && 
                   transfer_from && 
                   out_of_stock !== 1 && 
                   estimate_month != null && 
                   estimate_day != null && (
                    <Text variant="bodySm" fontWeight="bold" as="span" tone="info">
                      {transfer_from}, {formatDate(estimate_month, estimate_day)}
                    </Text>
                  )}
                  {getItemBadge(status, item, handleWaitingBadgeClick)}
                </div>
                
                {out_of_stock !== 1 ? (
                  <>
                    {status === 'transferring' && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => handleBlueClick(item)}
                          style={{
                            backgroundColor: 'white',
                            color: '#0080FF',
                            border: '2px solid #0080FF',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            minWidth: '80px'
                          }}
                        >
                          Transfer
                        </button>
                        <button
                          onClick={() => handleGreenClick(item)}
                          style={{
                            backgroundColor: '#00A047',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            minWidth: '80px'
                          }}
                        >
                          Found
                        </button>
                      </div>
                    )}
                    
                    {status === 'waiting' && (
                      <button
                        onClick={() => handleGreenClick(item)}
                        style={{
                          backgroundColor: '#0080FF',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 16px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          minWidth: '100px'
                        }}
                      >
                        Received
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => handleOutUndo(item)}
                    style={{
                      backgroundColor: '#0080FF',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      minWidth: '100px'
                    }}
                  >
                    Undo
                  </button>
                )}
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  {out_of_stock !== 1 && status === 'waiting' && (
                    <button
                      onClick={() => handleReceivedUndo(item)}
                      style={{
                        backgroundColor: 'white',
                        color: '#6d7175',
                        border: '1px solid #6d7175',
                        borderRadius: '6px',
                        padding: '4px 12px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        minWidth: '60px'
                      }}
                    >
                      Undo
                    </button>
                  )}
                  {out_of_stock !== 1 && (status === 'transferring' || status === 'waiting') && (
                    <button
                      onClick={() => handleOutClick(item)}
                      style={{
                        backgroundColor: 'white',
                        color: '#D72C0D',
                        border: '1px solid #D72C0D',
                        borderRadius: '6px',
                        padding: '4px 12px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        minWidth: '60px'
                      }}
                    >
                      OUT
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleCopy(id)}
                    style={{
                      backgroundColor: 'white',
                      color: '#202223',
                      border: '1px solid #c9cccf',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      minWidth: '60px'
                    }}
                  >
                    Copy
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 移动端布局 */}
        <div className="transfer-item-mobile">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ 
              fontSize: '12px',
              color: '#6d7175',
              marginBottom: '4px',
              wordBreak: 'break-word'
            }}>
              {brand}
            </div>
            
            <div style={{ 
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '4px',
              wordBreak: 'break-word',
              lineHeight: '1.4'
            }}>
              {title} {size}
            </div>
            
            {variant_title && (
              <div style={{ 
                fontSize: '12px',
                color: '#6d7175',
                marginBottom: '4px',
                wordBreak: 'break-word'
              }}>
                {variant_title}
              </div>
            )}
            
            <div 
              onClick={() => handleSkuCopy(sku)}
              style={{ 
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '4px',
                wordBreak: 'break-all',
                cursor: 'pointer',
                color: '#0080FF'
              }}
            >
              SKU: {formatSKU(sku)}
            </div>
            
            <div style={{ 
              fontSize: '12px',
              color: '#6d7175',
              marginBottom: '8px'
            }}>
              Order: #{order_number}
            </div>

            <div style={{ 
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '8px'
            }}>
              {getItemBadge(status, item, handleWaitingBadgeClick)}
              {out_of_stock === 1 && <Badge tone="critical">Out of Stock</Badge>}
            </div>

            {(status === 'waiting' || status === 'received' || status === 'found') && 
             transfer_from && 
             out_of_stock !== 1 && 
             estimate_month != null && 
             estimate_day != null && (
              <div style={{ 
                fontSize: '12px',
                color: '#0080FF',
                fontWeight: '600',
                marginBottom: '8px',
                wordBreak: 'break-word'
              }}>
                From: {transfer_from}, Est: {formatDate(estimate_month, estimate_day)}
              </div>
            )}
          </div>

          <div style={{ 
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <div style={{ flexShrink: 0 }}>
              {media}
            </div>

            <div style={{
              fontSize: '24px',
              fontWeight: 'bold',
              flexShrink: 0,
              minWidth: '30px',
              alignSelf: 'center'
            }}>
              {quantity}
            </div>

            <div style={{
              marginLeft: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '8px'
            }}>
              {clearMode ? (
                <input
                  type="checkbox"
                  checked={selectedItems.includes(id)}
                  onChange={() => handleItemSelect(id)}
                  style={{ width: '20px', height: '20px' }}
                />
              ) : (
                <>
                  {out_of_stock !== 1 ? (
                    <>
                      {status === 'transferring' && (
                        <>
                          <button
                            onClick={() => handleBlueClick(item)}
                            style={{
                              backgroundColor: 'white',
                              color: '#0080FF',
                              border: '2px solid #0080FF',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '13px',
                              cursor: 'pointer',
                              fontWeight: '500',
                              minWidth: '80px'
                            }}
                          >
                            Transfer
                          </button>
                          <button
                            onClick={() => handleGreenClick(item)}
                            style={{
                              backgroundColor: '#00A047',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '13px',
                              cursor: 'pointer',
                              fontWeight: '500',
                              minWidth: '80px'
                            }}
                          >
                            Found
                          </button>
                        </>
                      )}
                      
                      {status === 'waiting' && (
                        <button
                          onClick={() => handleGreenClick(item)}
                          style={{
                            backgroundColor: '#0080FF',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            minWidth: '80px'
                          }}
                        >
                          Received
                        </button>
                      )}
                      
                      {(status === 'transferring' || status === 'waiting') && (
                        <>
                          {status === 'waiting' && (
                            <button
                              onClick={() => handleReceivedUndo(item)}
                              style={{
                                backgroundColor: 'white',
                                color: '#6d7175',
                                border: '1px solid #6d7175',
                                borderRadius: '6px',
                                padding: '4px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                fontWeight: '500',
                                minWidth: '60px'
                              }}
                            >
                              Undo
                            </button>
                          )}
                          <button
                            onClick={() => handleOutClick(item)}
                            style={{
                              backgroundColor: 'white',
                              color: '#D72C0D',
                              border: '1px solid #D72C0D',
                              borderRadius: '6px',
                              padding: '4px 12px',
                              fontSize: '13px',
                              cursor: 'pointer',
                              fontWeight: '500',
                              minWidth: '60px'
                            }}
                          >
                            OUT
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => handleOutUndo(item)}
                      style={{
                        backgroundColor: '#0080FF',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        minWidth: '80px'
                      }}
                    >
                      Undo
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleCopy(id)}
                    style={{
                      backgroundColor: 'white',
                      color: '#202223',
                      border: '1px solid #c9cccf',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      minWidth: '60px'
                    }}
                  >
                    Copy
                  </button>
                </>
              )}
            </div>
          </div>
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
    <>
      <style>{`
        .transfer-item-container {
          padding: 22px 16px;
          border-bottom: 1px solid #e1e3e5;
          position: relative;
        }

        .transfer-item-desktop {
          display: flex;
          align-items: center;
          width: 100%;
        }

        .transfer-item-mobile {
          display: none;
        }

        @media (max-width: 600px) {
          .transfer-item-container {
            padding: 16px;
          }

          .transfer-item-desktop {
            display: none;
          }

          .transfer-item-mobile {
            display: block;
            width: 100%;
          }
        }
      `}</style>

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
            : [
                {
                  content: isGeneratingReport ? 'Generating...' : 'Stock Report',
                  onAction: handleGenerateStockReport,
                  loading: isGeneratingReport,
                  disabled: isGeneratingReport
                }
              ]
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
  </>
  );
};

export default Transfer;