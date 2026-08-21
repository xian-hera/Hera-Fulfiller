import React, { useState, useEffect } from 'react';
import { Modal, Text, Button, InlineStack, Badge } from '@shopify/polaris';
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
  const [activeInput, setActiveInput] = useState('boxType');
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    setIsSubmitting(false);
  }, [orderName]);

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
      alert('Please enter the total weight');
      return;
    }

    const payload = { boxType, weight: orderWeight || null };

    onComplete(payload);
    setIsSubmitting(true);

    // 不在这里 reset — 父组件处理完后会调 onClose → handleClose 统一 reset
  };

  const handleClose = () => {
    setBoxType('');
    setOrderWeight('');
    setActiveInput('boxType');
    setIsSubmitting(false);
    onClose();
  };

  // Normal view
  const inputSection = (
    <div className="complete-order-inputs">
      <div onClick={() => setActiveInput('boxType')} className="complete-order-field">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" as="p">Box Type:</Text>
          {activeInput === 'boxType' && <Badge tone="info">Active</Badge>}
        </InlineStack>
        <div className={`complete-order-display ${activeInput === 'boxType' ? 'active' : ''}`}>
          {boxType || 'Tap to select'}
        </div>
      </div>

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

      {/* Complete Order on top (large, easy to tap) | Cancel at the bottom (small) */}
      <div className="complete-order-actions">
        <div className="complete-order-btn-complete">
          <Button variant="primary" onClick={handleComplete} loading={isSubmitting} disabled={isSubmitting} fullWidth>
            {isSubmitting ? 'Processing...' : 'Complete Order'}
          </Button>
        </div>
        <div className="complete-order-btn-cancel">
          <Button onClick={handleClose} disabled={isSubmitting} fullWidth>Cancel</Button>
        </div>
      </div>
    </div>
  );

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
        <div className="complete-order-layout">
          {inputSection}
          {keypadSection}
        </div>
      </Modal.Section>
    </Modal>
  );
};

export default CompleteOrderModal;