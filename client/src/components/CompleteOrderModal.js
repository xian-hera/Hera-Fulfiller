import React, { useState, useEffect, useRef } from 'react';
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
  // 用 ref 再挡一次：连点时 state 还没来得及更新，按钮可能被点到两次
  const submittingRef = useRef(false);

  // 🔒 每次弹窗打开（或切到另一张订单）都清空上一次的选择。
  // 之前只在点 Cancel / X 时才清空；完成订单后父组件直接关弹窗并跳到下一单，
  // 箱型和重量会被带到下一单，可能用错箱型/重量买运单。
  useEffect(() => {
    if (open) {
      setBoxType('');
      setOrderWeight('');
      setActiveInput('boxType');
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [open, orderName]);

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

  const handleComplete = async () => {
    if (submittingRef.current) return;
    if (!boxType) {
      alert('Please select a box type');
      return;
    }

    if (hasWeightWarning && !orderWeight) {
      alert('Please enter the total weight');
      return;
    }

    const payload = { boxType, weight: orderWeight || null };

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onComplete(payload);
    } finally {
      // 请求结束（成功或失败）都解除"处理中"，失败时按钮不会一直卡在 Processing...
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submittingRef.current) return; // 正在买运单时不允许关闭
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
          <Button variant="primary" onClick={handleComplete} loading={isSubmitting} disabled={isSubmitting || !boxType} fullWidth>
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