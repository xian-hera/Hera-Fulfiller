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
  const [activeInput, setActiveInput] = useState('boxType');

  // 🆕 Custom size state
  const [showCustomSize, setShowCustomSize] = useState(false);
  const [customLength, setCustomLength] = useState('');
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [customBoxWeight, setCustomBoxWeight] = useState('');
  const [activeCustomInput, setActiveCustomInput] = useState('length');

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

  // 🆕 Custom size keypad handlers
  const handleCustomNumberClick = (number) => {
    const setters = {
      length: setCustomLength,
      width: setCustomWidth,
      height: setCustomHeight,
      boxWeight: setCustomBoxWeight
    };
    setters[activeCustomInput]?.(prev => prev + number);
  };

  const handleCustomBackspace = () => {
    const setters = {
      length: setCustomLength,
      width: setCustomWidth,
      height: setCustomHeight,
      boxWeight: setCustomBoxWeight
    };
    setters[activeCustomInput]?.(prev => prev.slice(0, -1));
  };

  // 🆕 Submit custom size — return to main modal with 'Custom' as box type
  const handleCustomSizeSubmit = () => {
    if (!customLength || !customWidth || !customHeight || !customBoxWeight) {
      alert('Please fill in all dimensions and box weight');
      return;
    }
    setBoxType('Custom');
    setShowCustomSize(false);
  };

  const handleComplete = () => {
    if (!boxType) {
      alert('Please select a box type');
      return;
    }

    if (hasWeightWarning && !orderWeight && boxType !== 'Custom') {
      alert('Please enter the order weight');
      return;
    }

    const payload = { boxType, weight: orderWeight || null };

    // 🆕 Attach custom dimensions if Custom box was used
    if (boxType === 'Custom') {
      payload.customDimensions = {
        length: customLength,
        width: customWidth,
        height: customHeight,
        boxWeightGrams: parseFloat(customBoxWeight) || 0
      };
    }

    onComplete(payload);

    // Reset
    setBoxType('');
    setOrderWeight('');
    setActiveInput('boxType');
    setShowCustomSize(false);
    setCustomLength('');
    setCustomWidth('');
    setCustomHeight('');
    setCustomBoxWeight('');
    setActiveCustomInput('length');
  };

  const handleClose = () => {
    setBoxType('');
    setOrderWeight('');
    setActiveInput('boxType');
    setShowCustomSize(false);
    setCustomLength('');
    setCustomWidth('');
    setCustomHeight('');
    setCustomBoxWeight('');
    setActiveCustomInput('length');
    onClose();
  };

  // 🆕 Custom size fields
  const customFields = [
    { key: 'length', label: 'Length (inch)', value: customLength },
    { key: 'width', label: 'Width (inch)', value: customWidth },
    { key: 'height', label: 'Height (inch)', value: customHeight },
    { key: 'boxWeight', label: 'Box Weight (g)', value: customBoxWeight }
  ];

  // 🆕 Custom Size view
  if (showCustomSize) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title={`Custom Size — Order ${orderName}`}
      >
        <Modal.Section>
          <div className="complete-order-layout">
            <div className="complete-order-inputs">
              <Text variant="bodySm" tone="subdued">
                Enter box dimensions (inches) and box weight (grams).
              </Text>
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {customFields.map(field => (
                  <div
                    key={field.key}
                    onClick={() => setActiveCustomInput(field.key)}
                    className="complete-order-field"
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodySm" as="p">{field.label}:</Text>
                      {activeCustomInput === field.key && <Badge tone="info">Active</Badge>}
                    </InlineStack>
                    <div className={`complete-order-display ${activeCustomInput === field.key ? 'active' : ''}`}>
                      {field.value || '0'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="complete-order-actions" style={{ marginTop: '16px' }}>
                <Button onClick={() => setShowCustomSize(false)}>Back</Button>
                <Button variant="primary" onClick={handleCustomSizeSubmit}>Confirm</Button>
              </div>
            </div>
            <div className="complete-order-keypad">
              <NumericKeypad
                onNumberClick={handleCustomNumberClick}
                onBackspace={handleCustomBackspace}
              />
            </div>
          </div>
        </Modal.Section>
      </Modal>
    );
  }

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

      {/* 🆕 Three buttons: Cancel | Custom Size | Complete Order */}
      <div className="complete-order-actions">
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={() => { setShowCustomSize(true); setActiveCustomInput('length'); }}>
          Custom Size
        </Button>
        <Button variant="primary" onClick={handleComplete}>Complete Order</Button>
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