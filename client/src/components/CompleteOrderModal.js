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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!customLength || !customWidth || !customHeight) {
      alert('Please fill in all dimensions');
      return;
    }
    // 无重量警告(情况4)：custom 页必须填总重；有警告(情况2)：重量在主页填，这里跳过
    if (!hasWeightWarning && !customBoxWeight) {
      alert('Please enter the total weight');
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

    // 有重量警告(情况1、2)：无论普通还是 custom，都在主页填总重
    if (hasWeightWarning && !orderWeight) {
      alert('Please enter the total weight');
      return;
    }

    const payload = { boxType, weight: orderWeight || null };

    // 🆕 Attach custom dimensions if Custom box was used
    if (boxType === 'Custom') {
      payload.customDimensions = {
        length: customLength,
        width: customWidth,
        height: customHeight,
        // 情况2(有警告)时 custom 页没填重量，这里为 0；后端会改用主页的 weight
        boxWeightGrams: parseFloat(customBoxWeight) || 0
      };
    }

    onComplete(payload);
    setIsSubmitting(true);

    // 不在这里 reset — 父组件处理完后会调 onClose → handleClose 统一 reset
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
    setIsSubmitting(false);
    onClose();
  };

  // 🆕 Custom size fields
  // 有重量警告时(情况2)，custom 页不填重量，改在主页填总重 → boxWeight 框变灰禁用
  const customFields = [
    { key: 'length', label: 'Length (inch)', value: customLength },
    { key: 'width', label: 'Width (inch)', value: customWidth },
    { key: 'height', label: 'Height (inch)', value: customHeight },
    {
      key: 'boxWeight',
      label: 'Total Weight (g)',
      value: customBoxWeight,
      disabled: hasWeightWarning,
      hint: hasWeightWarning ? 'Please input the total weight on the main page' : null
    }
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
                    onClick={() => { if (!field.disabled) setActiveCustomInput(field.key); }}
                    className="complete-order-field"
                    style={field.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodySm" as="p">{field.label}:</Text>
                      {!field.disabled && activeCustomInput === field.key && <Badge tone="info">Active</Badge>}
                    </InlineStack>
                    <div className={`complete-order-display ${(!field.disabled && activeCustomInput === field.key) ? 'active' : ''}`}>
                      {field.disabled ? (field.hint || '—') : (field.value || '0')}
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
        <Button onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
        <Button onClick={() => { setShowCustomSize(true); setActiveCustomInput('length'); }} disabled={isSubmitting}>
          Custom Size
        </Button>
        <Button variant="primary" onClick={handleComplete} loading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? 'Processing...' : 'Complete Order'}
        </Button>
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