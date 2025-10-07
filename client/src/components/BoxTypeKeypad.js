import React from 'react';
import './BoxTypeKeypad.css';

const BoxTypeKeypad = ({ boxTypes, onBoxTypeClick, onBackspace }) => {
  const handleBoxClick = (code) => {
    if (onBoxTypeClick) {
      onBoxTypeClick(code);
    }
  };

  const handleBackspace = () => {
    if (onBackspace) {
      onBackspace();
    }
  };

  // 将 box types 按照 3 列排列
  const rows = [];
  for (let i = 0; i < boxTypes.length; i += 3) {
    rows.push(boxTypes.slice(i, i + 3));
  }

  return (
    <div className="box-keypad">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="box-keypad-row">
          {row.map((box) => (
            <button
              key={box.code}
              className="box-keypad-button"
              onClick={() => handleBoxClick(box.code)}
            >
              <div className="box-code">{box.code}</div>
              <div className="box-dimensions">{box.dimensions}</div>
            </button>
          ))}
          {/* 填充空白位置 */}
          {row.length < 3 && Array(3 - row.length).fill(0).map((_, idx) => (
            <div key={`empty-${idx}`} className="box-keypad-empty"></div>
          ))}
        </div>
      ))}
      <div className="box-keypad-row">
        <div className="box-keypad-empty"></div>
        <div className="box-keypad-empty"></div>
        <button className="box-keypad-button box-keypad-backspace" onClick={handleBackspace}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default BoxTypeKeypad;