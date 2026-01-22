import React, { useState } from 'react';
import { Modal, Text, Button, BlockStack, InlineStack, Badge } from '@shopify/polaris';
import NumericKeypad from './NumericKeypad';
import BoxTypeKeypad from './BoxTypeKeypad';

const CompleteOrderModal = ({ 
  open, 
  orderName, 
  hasWeightWarning, 
  boxTypes, 
  onClose, 
  onComplete 
}) => {
  const [boxType, setBoxType] = useState('');
  const [orderWeight, setOrderWeight] = useState('');
  const [activeInput, setActiveInput] = useState('boxType'); // 'boxType' or 'weight'

  const handleBoxTypeClick = (code) => {
    setBoxType(code);
  };

  const handleBoxTypeBackspace = () => {
    setBoxType('');
  };

  const handleWeightNumberClick = (number) => {
    setOrderWeight(prev => prev + number);
  };

  const handleWeightBackspace = () => {
    setOrderWeight(prev => prev.slice(0, -1));
  };

  const handleComplete = () => {
    if (!boxType) {
      alert('Please select a box type');
      return;
    }

    if (hasWeightWarning && !orderWeight) {
      alert('Please enter the order weight');
      return;
    }

    onComplete({
      boxType,
      weight: orderWeight || null
    });

    // 重置状态
    setBoxType('');
    setOrderWeight('');
    setActiveInput('boxType');
  };

  const handleClose = () => {
    setBoxType('');
    setOrderWeight('');
    setActiveInput('boxType');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Complete Order ${orderName}`}
    >
      <Modal.Section>
        <BlockStack gap="4">
          {/* Box Type 输入区 */}
          <div onClick={() => setActiveInput('boxType')}>
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" as="p">Box Type:</Text>
              {activeInput === 'boxType' && <Badge tone="info">Active</Badge>}
            </InlineStack>
            <div style={{
              border: activeInput === 'boxType' ? '3px solid #008060' : '2px solid #c4cdd5',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '32px',
              fontWeight: 'bold',
              textAlign: 'center',
              backgroundColor: activeInput === 'boxType' ? '#f6f6f7' : '#ffffff',
              minHeight: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}>
              {boxType || 'Tap to select'}
            </div>
          </div>

          {/* Weight 输入区（仅在有 weight warning 时显示）*/}
          {hasWeightWarning && (
            <div onClick={() => setActiveInput('weight')}>
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" as="p">Total Weight (g):</Text>
                {activeInput === 'weight' && <Badge tone="info">Active</Badge>}
              </InlineStack>
              <div style={{
                border: activeInput === 'weight' ? '3px solid #008060' : '2px solid #c4cdd5',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '32px',
                fontWeight: 'bold',
                textAlign: 'center',
                backgroundColor: activeInput === 'weight' ? '#f6f6f7' : '#ffffff',
                minHeight: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}>
                {orderWeight || '0'} g
              </div>
            </div>
          )}

          {/* 嵌入式键盘 */}
          <div style={{ marginTop: '8px' }}>
            {activeInput === 'boxType' ? (
              <BoxTypeKeypad
                boxTypes={boxTypes}
                onBoxTypeClick={handleBoxTypeClick}
                onBackspace={handleBoxTypeBackspace}
              />
            ) : (
              <NumericKeypad
                onNumberClick={handleWeightNumberClick}
                onBackspace={handleWeightBackspace}
              />
            )}
          </div>

          {/* 操作按钮 */}
          <div style={{ 
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '8px'
          }}>
            <Button onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleComplete}>
              Complete Order
            </Button>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
};

export default CompleteOrderModal;