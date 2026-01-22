import React, { useState } from 'react';
import { Modal, Text, Button, BlockStack } from '@shopify/polaris';
import NumericKeypad from './NumericKeypad';

const WeightInputModal = ({ open, item, onClose, onSubmit }) => {
  const [weightValue, setWeightValue] = useState('');

  const handleNumberClick = (number) => {
    setWeightValue(prev => prev + number);
  };

  const handleBackspace = () => {
    setWeightValue(prev => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    const weight = parseFloat(weightValue);
    if (!weight || weight <= 0) {
      alert('Please enter a valid weight');
      return;
    }
    onSubmit(weight);
    setWeightValue('');
  };

  const handleClose = () => {
    setWeightValue('');
    onClose();
  };

  if (!item) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Update Weight"
    >
      <Modal.Section>
        <BlockStack gap="4">
          {/* 产品信息 */}
          <Text>{item.brand} {item.title}</Text>
          
          {/* 输入显示区域 */}
          <div>
            <Text variant="bodySm" as="p">Weight (g):</Text>
            <div style={{
              border: '2px solid #008060',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '32px',
              fontWeight: 'bold',
              textAlign: 'center',
              backgroundColor: '#f6f6f7',
              minHeight: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '8px'
            }}>
              {weightValue || '0'} g
            </div>
          </div>

          {/* 嵌入式数字键盘 */}
          <div style={{ marginTop: '8px' }}>
            <NumericKeypad
              onNumberClick={handleNumberClick}
              onBackspace={handleBackspace}
            />
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
            <Button variant="primary" onClick={handleSubmit}>
              Update
            </Button>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
};

export default WeightInputModal;