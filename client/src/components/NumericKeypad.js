import React from 'react';
import './NumericKeypad.css';

const NumericKeypad = ({ onNumberClick, onBackspace, onClose }) => {
  const handleNumberClick = (number) => {
    if (onNumberClick) {
      onNumberClick(number);
    }
  };

  const handleBackspace = () => {
    if (onBackspace) {
      onBackspace();
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="numeric-keypad">
      <div className="keypad-row">
        <button className="keypad-button" onClick={() => handleNumberClick('1')}>1</button>
        <button className="keypad-button" onClick={() => handleNumberClick('2')}>2</button>
        <button className="keypad-button" onClick={() => handleNumberClick('3')}>3</button>
      </div>
      <div className="keypad-row">
        <button className="keypad-button" onClick={() => handleNumberClick('4')}>4</button>
        <button className="keypad-button" onClick={() => handleNumberClick('5')}>5</button>
        <button className="keypad-button" onClick={() => handleNumberClick('6')}>6</button>
      </div>
      <div className="keypad-row">
        <button className="keypad-button" onClick={() => handleNumberClick('7')}>7</button>
        <button className="keypad-button" onClick={() => handleNumberClick('8')}>8</button>
        <button className="keypad-button" onClick={() => handleNumberClick('9')}>9</button>
      </div>
      <div className="keypad-row">
        <div className="keypad-empty"></div>
        <button className="keypad-button" onClick={() => handleNumberClick('0')}>0</button>
        <button className="keypad-button keypad-backspace" onClick={handleBackspace}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/>
          </svg>
        </button>
      </div>
      {onClose && (
        <div className="keypad-row">
          <button className="keypad-button keypad-close" onClick={handleClose}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default NumericKeypad;