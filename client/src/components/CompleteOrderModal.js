import React, { useState } from 'react';
import { Modal, Text, Button, BlockStack, InlineStack, Badge } from '@shopify/polaris';
import NumericKeypad from './NumericKeypad';
import BoxTypeKeypad from './BoxTypeKeypad';
import './CompleteOrderModal.css';

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

  // 左列：输入区 + 操作按钮
  const inputSection = (
    <div className="complete-order-inputs">
      {/* Box Type 输入区 */}
      <div onClick={() => setActiveInput('boxType')} className="complete-order-field">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" as="p">Box Type:</Text>
          {activeInput === 'boxType' && <Badge tone="info">Active</Badge>}
        </InlineStack>
        <div className={`complete-order-display ${activeInput === 'boxType' ? 'active' : ''}`}>
          {boxType || 'Tap to select'}
        </div>
      </div>

      {/* Weight 输入区（仅在有 weight warning 时显示）*/}
      {hasWeightWarning && (
        <div onClick={() => setActiveInput('weight')} className="complete-order-field">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="bodySm" as="p">Total Weight (g):</Text>
            {activeInput === 'weight' && <Badge tone="info">Active</Badge>}
          </InlineStack>
          <div className={`complete-order-display ${activeInput === 'weight' ? 'active' : ''}`}>
            {orderWeight || '0'} g
          </div>
        </div>
      )}

      {/* 操作按钮 — 在两列布局时固定在左列底部 */}
      <div className="complete-order-actions">
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="primary" onClick={handleComplete}>Complete Order</Button>
      </div>
    </div>
  );

  // 右列（或下方）：键盘
  const keypadSection = (
    <div className="complete-order-keypad">
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
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Complete Order ${orderName}`}
    >
      <Modal.Section>
        {/* 
          .complete-order-layout:
          - 竖屏：单列，inputs 在上，keypad 在下
          - 横屏：两列，inputs（左）+ keypad（右）
        */}
        <div className="complete-order-layout">
          {inputSection}
          {keypadSection}
        </div>
      </Modal.Section>
    </Modal>
  );
};

export default CompleteOrderModal;