# Hera Fulfiller - Complete Project Export
**Generated:** 2026-03-19T15:10:25.512Z  
**Purpose:** Claude Project Knowledge Base  
**Branch:** new-Transfer (Development)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [File Structure](#file-structure)
3. [Project Files](#project-files)
4. [Statistics](#statistics)

---

## 📋 Project Overview

**Hera Fulfiller** is the backend/management system for Hera Beauty's fulfillment operations.

**Current Development:**
- Feature: Transfer system redesign
- Integration: Connecteam API for task management
- Branch: new-Transfer

**Tech Stack:**
- Backend: Node.js + Express
- Database: SQL
- Integrations: Shopify, Connecteam

---

## 📁 File Structure

```
Hera Fulfiller/
├── 📄 add-variant-title.js
├── 📁 client/
│   ├── 📄 package.json
│   ├── 📁 public/
│   └── 📁 src/
│       ├── 📁 api/
│       │   └── 📄 axios.js
│       ├── 📄 App.js
│       ├── 📁 components/
│       │   ├── 📄 BoxTypeKeypad.js
│       │   ├── 📄 CompleteOrderModal.js
│       │   ├── 📄 ErrorBoundary.js
│       │   ├── 📄 NumericKeypad.js
│       │   └── 📄 WeightInputModal.js
│       ├── 📄 index.js
│       ├── 📁 pages/
│       │   ├── 📄 Dashboard.js
│       │   ├── 📄 OrderDetail.js
│       │   ├── 📄 Packer.js
│       │   ├── 📄 Picker.js
│       │   ├── 📄 Settings.js
│       │   ├── 📄 Transfer.js
│       │   └── 📄 TransferPlanner.js
│       └── 📁 styles/
├── 📄 export-hera-project.js
├── 📄 export.js
├── 📄 package.json
├── 📄 PROJECT_STRUCTURE.md
├── 📁 server/
│   ├── 📁 database/
│   │   ├── 📄 adapter.js
│   │   ├── 📄 init-postgres.js
│   │   ├── 📄 init.js
│   │   └── 📄 migrations.js
│   ├── 📄 index.js
│   ├── 📁 middleware/
│   │   └── 📄 webhookVerification.js
│   ├── 📁 routes/
│   │   ├── 📄 packer.js
│   │   ├── 📄 picker.js
│   │   ├── 📄 settings.js
│   │   ├── 📄 transfer.js
│   │   └── 📄 webhooks.js
│   ├── 📁 scripts/
│   │   └── 📄 setupWebhooks.js
│   ├── 📁 shopify/
│   │   └── 📄 client.js
│   ├── 📁 utils/
│   │   ├── 📄 cleanup.js
│   │   └── 📄 logger.js
│   └── 📁 webhooks/
│       └── 📄 orderHandler.js
├── 📄 setup-order-edits-wbhook.js

```

---

## 📄 Project Files

Below are all the source files in the Hera Fulfiller project:

---


## 📄 `add-variant-title.js`

```javascript
const db = require('./server/database/init');

try {
  db.exec(`
    ALTER TABLE line_items ADD COLUMN variant_title TEXT;
  `);
  console.log('✓ Added variant_title column');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column variant_title already exists');
  } else {
    console.error('✗ Error:', error.message);
  }
}
```

---

## 📄 `client\package.json`

```json
{
  "name": "warehouse-client",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "react-scripts": "5.0.1",
    "axios": "^1.6.2",
    "@shopify/polaris": "^12.0.0",
    "@shopify/polaris-icons": "^8.0.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "proxy": "http://localhost:3001"
}
```

---

## 📄 `client\src\api\axios.js`

```javascript
import axios from 'axios';

// 根据环境自动选择 baseURL
const getBaseURL = () => {
  // 如果在 Shopify Admin 中（通过 iframe），使用完整 URL
  if (window.location.hostname === 'admin.shopify.com') {
    return 'https://hera-fulfiller.onrender.com';
  }
  
  // 生产环境
  if (process.env.NODE_ENV === 'production') {
    return 'https://hera-fulfiller.onrender.com';
  }
  
  // 开发环境
  return 'http://localhost:5000';
};

const instance = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 添加请求拦截器（调试用）
instance.interceptors.request.use(
  config => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  error => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// 添加响应拦截器（调试用）
instance.interceptors.response.use(
  response => {
    console.log('API Response:', response.config.url, response.status);
    return response;
  },
  error => {
    console.error('Response error:', error.config?.url, error.message);
    return Promise.reject(error);
  }
);

export default instance;
```

---

## 📄 `client\src\App.js`

```javascript
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import enTranslations from '@shopify/polaris/locales/en.json';
import Dashboard from './pages/Dashboard';
import Picker from './pages/Picker';
import Transfer from './pages/Transfer';
import Packer from './pages/Packer';
import OrderDetail from './pages/OrderDetail';
import Settings from './pages/Settings';
import ErrorBoundary from './components/ErrorBoundary';
import TransferPlanner from './pages/TransferPlanner';

function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <ErrorBoundary>
        <Router>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/picker" element={<Picker />} />
            <Route path="/transfer" element={<Transfer />} />
            <Route path="/packer" element={<Packer />} />
            <Route path="/packer/:shopifyOrderId" element={<OrderDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/transfer-planner" element={<TransferPlanner />} />
          </Routes>
        </Router>
      </ErrorBoundary>
    </AppProvider>
  );
}

export default App;
```

---

## 📄 `client\src\components\BoxTypeKeypad.js`

```javascript
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
```

---

## 📄 `client\src\components\CompleteOrderModal.js`

```javascript
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
```

---

## 📄 `client\src\components\ErrorBoundary.js`

```javascript
import React from 'react';
import { Banner, Page, Button } from '@shopify/polaris';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Page>
          <Banner
            title="Something went wrong"
            tone="critical"
          >
            <p>The page encountered an error. Please reload to continue.</p>
            <div style={{ marginTop: '16px' }}>
              <Button onClick={this.handleReload} variant="primary">
                Reload Page
              </Button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <details style={{ marginTop: '16px' }}>
                <summary>Error details</summary>
                <pre style={{ 
                  marginTop: '8px', 
                  padding: '12px', 
                  background: '#f6f6f7',
                  borderRadius: '4px',
                  overflow: 'auto'
                }}>
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
          </Banner>
        </Page>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

---

## 📄 `client\src\components\NumericKeypad.js`

```javascript
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
```

---

## 📄 `client\src\components\WeightInputModal.js`

```javascript
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
```

---

## 📄 `client\src\index.js`

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## 📄 `client\src\pages\Dashboard.js`

```javascript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Layout, Card, Button } from '@shopify/polaris';
import { PackageIcon, TransferIcon, OrderIcon, SettingsIcon } from '@shopify/polaris-icons';

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <Page title="Hera Beauté Fulfiller">
      <Layout>
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            <Card>
              <div style={{ padding: '1rem' }}>
                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={() => navigate('/picker')}
                  icon={PackageIcon}
                >
                  Picker
                </Button>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '1rem' }}>
                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={() => navigate('/transfer')}
                  icon={TransferIcon}
                >
                  Transfer
                </Button>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '1rem' }}>
                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={() => navigate('/packer')}
                  icon={OrderIcon}
                >
                  Packer
                </Button>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '1rem' }}>
                <Button
                  size="large"
                  fullWidth
                  onClick={() => navigate('/settings')}
                  icon={SettingsIcon}
                >
                  Settings
                </Button>
              </div>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Dashboard;
```

---

## 📄 `client\src\pages\OrderDetail.js`

```javascript
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Button,
  Modal,
  Banner,
  BlockStack,
  TextField,
  Badge
} from '@shopify/polaris';
import { ImageIcon, ChevronLeftIcon, ChevronRightIcon } from '@shopify/polaris-icons';
import WeightInputModal from '../components/WeightInputModal';
import CompleteOrderModal from '../components/CompleteOrderModal';

const OrderDetail = () => {
  const navigate = useNavigate();
  const { shopifyOrderId } = useParams();
  const [order, setOrder] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isSorted, setIsSorted] = useState(false);
  
  // Modal 状态
  const [weightModal, setWeightModal] = useState(null);
  const [completeModal, setCompleteModal] = useState(false);
  const [boxTypes, setBoxTypes] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Note 功能状态
  const [noteModal, setNoteModal] = useState(false);
  const [noteValue, setNoteValue] = useState('');
  const [quantityConfirmStates, setQuantityConfirmStates] = useState({});

  useEffect(() => {
    fetchAllOrders();
  }, []);

  useEffect(() => {
    if (shopifyOrderId) {
      fetchOrderDetail();
    }
  }, [shopifyOrderId]);

  useEffect(() => {
    applyPackerFilters();
  }, [allOrders]);

  const fetchAllOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      const sorted = response.data.sort((a, b) => {
        const numA = parseInt(a.order_number) || 0;
        const numB = parseInt(b.order_number) || 0;
        return numA - numB;
      });
      console.log('All orders sorted:', sorted.map(o => `${o.order_number}(${o.orderStatus})`));
      setAllOrders(sorted);
    } catch (error) {
      console.error('Error fetching all orders:', error);
    }
  };

  const applyPackerFilters = () => {
    try {
      const savedFilters = localStorage.getItem('packerStatusFilter');
      const statusFilter = savedFilters ? JSON.parse(savedFilters) : ['packing', 'waiting', 'holding', 'ready'];
      
      console.log('Applying Packer filters:', statusFilter);
      console.log('All orders:', allOrders.map(o => `${o.order_number}: ${o.orderStatus || o.status}`));
      
      const filtered = allOrders.filter(order => {
        const status = order.orderStatus || order.status;
        const match = statusFilter.includes(status);
        console.log(`Order ${order.order_number}: orderStatus=${status}, match=${match}`);
        return match;
      });
      
      console.log('Filtered orders:', filtered.map(o => `${o.order_number}(${o.orderStatus || o.status})`));
      console.log('Filtered orders count:', filtered.length);
      setFilteredOrders(filtered);
    } catch (error) {
      console.error('Error applying packer filters:', error);
      setFilteredOrders(allOrders);
    }
  };

  const fetchOrderDetail = async () => {
    try {
      const response = await axios.get(`/api/packer/orders/${shopifyOrderId}`);
      console.log('Current order:', response.data.order_number);
      setOrder(response.data);
      setLineItems(response.data.lineItems);
      setNoteValue(response.data.packer_note || '');
      await fetchBoxTypes();
    } catch (error) {
      console.error('Error fetching order details:', error);
    }
  };

  const fetchBoxTypes = async () => {
    try {
      const response = await axios.get('/api/settings/box-types');
      setBoxTypes(response.data);
    } catch (error) {
      console.error('Error fetching box types:', error);
    }
  };

  const handleNoteSave = async () => {
    if (noteValue.length > 50) {
      setMessage('Note must be 50 characters or less');
      return;
    }

    try {
      await axios.patch(`/api/packer/orders/${shopifyOrderId}/note`, {
        note: noteValue
      });
      await fetchOrderDetail();
      setNoteModal(false);
      setMessage('Note saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving note:', error);
      setMessage('Error saving note');
    }
  };

  const handleNoteDelete = async () => {
    try {
      await axios.patch(`/api/packer/orders/${shopifyOrderId}/note`, {
        note: ''
      });
      setNoteValue('');
      await fetchOrderDetail();
      setMessage('Note deleted successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting note:', error);
      setMessage('Error deleting note');
    }
  };

  const handleDeleteOrder = async () => {
    if (!window.confirm(`Are you sure you want to delete order ${order.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`/api/packer/orders/${shopifyOrderId}`);
      setMessage('Order deleted successfully');
      setTimeout(() => {
        navigate('/packer');
      }, 1000);
    } catch (error) {
      console.error('Error deleting order:', error);
      setMessage('Error deleting order');
    }
  };

  const findPreviousOrder = () => {
    if (!order || filteredOrders.length === 0) return null;
    
    const currentNum = parseInt(order.order_number);
    console.log('Finding previous order in filtered list, current:', currentNum);
    console.log('Filtered orders:', filteredOrders.map(o => o.order_number));
    
    for (let i = filteredOrders.length - 1; i >= 0; i--) {
      const orderNum = parseInt(filteredOrders[i].order_number) || 0;
      if (orderNum < currentNum) {
        console.log('Found previous order:', filteredOrders[i].order_number);
        return filteredOrders[i];
      }
    }
    console.log('No previous order found in filtered list');
    return null;
  };

  const findNextOrder = () => {
    if (!order || filteredOrders.length === 0) return null;
    
    const currentNum = parseInt(order.order_number);
    console.log('Finding next order in filtered list, current:', currentNum);
    console.log('Filtered orders:', filteredOrders.map(o => o.order_number));
    
    for (let i = 0; i < filteredOrders.length; i++) {
      const orderNum = parseInt(filteredOrders[i].order_number) || 0;
      if (orderNum > currentNum) {
        console.log('Found next order:', filteredOrders[i].order_number);
        return filteredOrders[i];
      }
    }
    console.log('No next order found in filtered list');
    return null;
  };

  const handlePreviousOrder = () => {
    const prevOrder = findPreviousOrder();
    if (prevOrder) {
      console.log('Navigating to previous order:', prevOrder.shopify_order_id);
      navigate(`/packer/${prevOrder.shopify_order_id}`);
    }
  };

  const handleNextOrder = () => {
    const nextOrder = findNextOrder();
    if (nextOrder) {
      console.log('Navigating to next order:', nextOrder.shopify_order_id);
      navigate(`/packer/${nextOrder.shopify_order_id}`);
    }
  };

  const handleSort = () => {
    if (!isSorted) {
      const sorted = [...lineItems].sort((a, b) => {
        const statusOrder = {
          packing: 1,
          waiting: 2,
          transferring: 3,
          ready: 4,
          received: 5
        };
        return statusOrder[getItemStatus(a)] - statusOrder[getItemStatus(b)];
      });
      setLineItems(sorted);
      setIsSorted(true);
    } else {
      const currentStatusMap = new Map(lineItems.map(item => [item.id, item.packer_status]));
      const restored = order.lineItems.map(item => ({
        ...item,
        packer_status: currentStatusMap.get(item.id) || item.packer_status
      }));
      setLineItems(restored);
      setIsSorted(false);
    }
  };

  const getItemStatus = (item) => {
    if (item.transferStatus === 'transferring') return 'transferring';
    if (item.transferStatus === 'waiting') return 'waiting';
    if (item.packer_status === 'ready') {
      return item.transferStatus === 'received' ? 'received' : 'ready';
    }
    return 'packing';
  };

  const handleItemClick = async (item) => {
    const itemId = item.id;
    const currentState = quantityConfirmStates[itemId] || {};
    
    // 拦截：数量 >= 2 的第1次点击
    if (item.quantity >= 2 && item.packer_status !== 'ready') {
      if (!currentState.needsConfirm) {
        setQuantityConfirmStates(prev => ({
          ...prev,
          [itemId]: { needsConfirm: true, confirmed: false }
        }));
        return;
      }
    }
    
    if (item._updating) return;
    
    const newStatus = item.packer_status === 'ready' ? 'packing' : 'ready';
    
    try {
      setLineItems(prev => prev.map(li => 
        li.id === item.id ? { ...li, _updating: true } : li
      ));

      await axios.patch(`/api/packer/items/${item.id}/packer-status`, {
        status: newStatus
      });
      
      const updatedItems = lineItems.map(li => 
        li.id === item.id ? { ...li, packer_status: newStatus, _updating: false } : li
      );
      setLineItems(updatedItems);

      // 更新确认状态
      if (newStatus === 'packing') {
        // 取消 check 时重置
        setQuantityConfirmStates(prev => {
          const newState = { ...prev };
          delete newState[itemId];
          return newState;
        });
      } else if (newStatus === 'ready' && item.quantity >= 2) {
        // check 成功时标记已确认
        setQuantityConfirmStates(prev => ({
          ...prev,
          [itemId]: { needsConfirm: true, confirmed: true }
        }));
      }

      const allReady = updatedItems.every(li => li.packer_status === 'ready');
      
      if (allReady && newStatus === 'ready') {
        setCompleteModal(true);
      }
    } catch (error) {
      console.error('Error updating item status:', error);
      setLineItems(prev => prev.map(li => 
        li.id === item.id ? { ...li, _updating: false } : li
      ));
      setMessage('Error updating item status');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleImageClick = (e, item) => {
    e.stopPropagation();
    if (item.image_url && item.url_handle) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand || ''} ${item.title || ''}`
      });
    }
  };

  const handleWeightSubmit = async (weight) => {
    if (!weightModal) return;

    try {
      await axios.patch(`/api/packer/items/${weightModal.id}/update-weight`, {
        weight
      });
      await fetchOrderDetail();
      setWeightModal(null);
      setMessage('Weight updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating weight:', error);
      setMessage('Error updating weight');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleOrderComplete = async ({ boxType, weight }) => {
    try {
      console.log('Completing order:', shopifyOrderId);
      await axios.post(`/api/packer/orders/${shopifyOrderId}/complete`, {
        boxType,
        weight
      });
      
      console.log('Order completed, closing modal');
      setCompleteModal(false);
      
      await fetchAllOrders();
      
      const nextOrder = findNextOrder();
      
      console.log('Next order:', nextOrder);
      
      if (nextOrder) {
        console.log('Jumping to next order:', nextOrder.shopify_order_id);
        navigate(`/packer/${nextOrder.shopify_order_id}`);
      } else {
        console.log('No next order, returning to list');
        navigate('/packer');
      }
    } catch (error) {
      console.error('Error completing order:', error);
      setMessage('Error completing order');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  const formatDate = (month, day) => {
    if (!month || !day) return '';
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}/${d}`;
  };

  if (!order) {
    return (
      <Page>
        <Banner>Loading...</Banner>
      </Page>
    );
  }

  const hasWeightWarning = lineItems.some(item => 
    item.has_weight_warning === 1
  );

  const renderLineItem = (item) => {
    const status = getItemStatus(item);
    const hasWarning = item.has_weight_warning === 1;
    const isOutOfStock = item.outOfStock === true;
    const isUpdating = item._updating;
    
    // 确认状态和样式
    const confirmState = quantityConfirmStates[item.id] || {};
    const showConfirm = confirmState.needsConfirm && item.packer_status !== 'ready';
    const isConfirmed = confirmState.confirmed;
    const quantityColor = showConfirm ? (isConfirmed ? '#00a047' : '#d72c0d') : '#202223';
    const quantitySize = '36px';
    
    const media = item.image_url ? (
      <div onClick={(e) => handleImageClick(e, item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={item.image_url} alt={item.title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    // 状态按钮组件
    const StatusButton = () => (
      <div 
        onTouchStart={(e) => {
          e.preventDefault();
          if (!isUpdating) handleItemClick(item);
        }}
        onClick={(e) => {
          if (!isUpdating) handleItemClick(item);
        }}
        style={{ 
          cursor: isUpdating ? 'not-allowed' : 'pointer', 
          padding: '8px',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none'
        }}
      >
        {item.packer_status === 'ready' ? (
          <span style={{ fontSize: '32px', color: '#00a047' }}>✓</span>
        ) : (
          <div style={{ width: '32px', height: '32px', border: '2px solid #00A0AC', borderRadius: '50%', position: 'relative' }}>
            {status === 'transferring' && (
              <div style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '14px',
                height: '14px',
                border: '2px solid #0080FF',
                borderRadius: '50%',
                background: 'white'
              }} />
            )}
            {status === 'waiting' && (
              <div style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '10px',
                height: '10px',
                background: '#0080FF',
                borderRadius: '50%'
              }} />
            )}
          </div>
        )}
      </div>
    );

    return (
      <div className="orderdetail-item-container">
        {/* 桌面端布局 - 完全保留原有样式 */}
        <div className="orderdetail-item-desktop">
          <div className="orderdetail-item-thumbnail">
            {media}
          </div>

          <div className="orderdetail-item-info">
            <BlockStack gap="1">
              <Text variant="bodySm">
                {item.brand}
              </Text>
              
              <Text variant="bodyMd" fontWeight="bold">
                {item.title} {item.size}
              </Text>
              
              {item.variant_title && (
                <Text variant="bodySm">
                  {item.variant_title}
                </Text>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text variant="bodySm" tone={hasWarning ? 'critical' : 'subdued'}>
                  {item.weight}{item.weight_unit}
                </Text>
                {hasWarning && (
                  <Button
                    plain
                    onClick={(e) => {
                      e.stopPropagation();
                      setWeightModal(item);
                    }}
                  >
                    ⚠️
                  </Button>
                )}
              </div>
              
              <Text variant="bodySm" fontWeight="bold">
                {formatSKU(item.sku)}
              </Text>
            </BlockStack>
          </div>

          <div className="orderdetail-item-right-desktop" style={{ 
          display: 'flex', 
          flexDirection: 'row',
          alignItems: 'center',
          gap: '16px',
          minWidth: '200px'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '4px',
            flex: 1
          }}>
            {isOutOfStock && (
              <Badge tone="critical">Out of Stock</Badge>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {showConfirm && (
                <span style={{ fontSize: '14px', color: quantityColor, fontWeight: '500' }}>
                  confirm quantity
                </span>
              )}
              <span style={{ fontSize: quantitySize, color: quantityColor, fontWeight: 'bold', lineHeight: '1' }}>
                {item.quantity}
              </span>
            </div>
            
            {item.transferInfo && !isOutOfStock && (
              <Text variant="bodySm" fontWeight="bold" tone="info">
                Transfer: {item.transferInfo.quantity} from {item.transferInfo.transferFrom}, Est: {formatDate(item.transferInfo.estimateMonth, item.transferInfo.estimateDay)}
              </Text>
            )}
          </div>
          
          <StatusButton />
        </div>
        </div>

       
        <div className="orderdetail-item-mobile">
          {/* 第一行：产品信息文本 */}
          <div className="orderdetail-mobile-text">
            <div style={{ 
              fontSize: '12px',
              color: '#6d7175',
              marginBottom: '4px',
              wordBreak: 'break-word'
            }}>
              {item.brand}
            </div>
            
            <div style={{ 
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '4px',
              wordBreak: 'break-word',
              lineHeight: '1.4'
            }}>
              {item.title} {item.size}
            </div>
            
            {item.variant_title && (
              <div style={{ 
                fontSize: '12px',
                color: '#6d7175',
                marginBottom: '4px',
                wordBreak: 'break-word'
              }}>
                {item.variant_title}
              </div>
            )}
            
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
              flexWrap: 'wrap'
            }}>
              <span style={{ 
                fontSize: '12px',
                color: hasWarning ? '#d72c0d' : '#6d7175'
              }}>
                {item.weight}{item.weight_unit}
              </span>
              {hasWarning && (
                <Button
                  plain
                  onClick={(e) => {
                    e.stopPropagation();
                    setWeightModal(item);
                  }}
                >
                  ⚠️
                </Button>
              )}
            </div>
            
            <div style={{ 
              fontSize: '12px',
              fontWeight: '600',
              wordBreak: 'break-all',
              marginBottom: '8px'
            }}>
              {formatSKU(item.sku)}
            </div>

            {item.transferInfo && !isOutOfStock && (
              <div style={{ 
                fontSize: '12px',
                color: '#0080FF',
                fontWeight: '600',
                marginBottom: '8px',
                wordBreak: 'break-word'
              }}>
                Transfer: {item.transferInfo.quantity} from {item.transferInfo.transferFrom}, Est: {formatDate(item.transferInfo.estimateMonth, item.transferInfo.estimateDay)}
              </div>
            )}

            {isOutOfStock && (
              <div style={{ marginBottom: '8px' }}>
                <Badge tone="critical">Out of Stock</Badge>
              </div>
            )}
          </div>

          {/* 第二行：图片 + 数量 + 状态按钮 */}
          <div className="orderdetail-mobile-bottom">
            <div className="orderdetail-thumbnail-mobile">
              {media}
            </div>

            <div className="orderdetail-quantity-mobile">
              {item.quantity}
            </div>

            <div className="orderdetail-mobile-right">
              <StatusButton />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const secondaryActions = [
    {
      content: 'Previous',
      icon: ChevronLeftIcon,
      onAction: handlePreviousOrder,
      disabled: !findPreviousOrder()
    },
    {
      content: 'Next',
      icon: ChevronRightIcon,
      onAction: handleNextOrder,
      disabled: !findNextOrder()
    },
    {
      content: isSorted ? 'Unsort' : 'Sort',
      onAction: handleSort
    },
    {
      content: 'Delete',
      destructive: true,
      onAction: handleDeleteOrder
    }
  ];

  const primaryAction = {
    content: order.packer_note ? 'Edit Note' : 'Add Note',
    onAction: () => {
      setNoteValue(order.packer_note || '');
      setNoteModal(true);
    }
  };

  return (
    <>
      <style>{`
        /* OrderDetail 响应式样式 - 完全参考 Picker.js */
        .orderdetail-item-container {
          padding: 22px 16px;
          border-bottom: 1px solid #e1e3e5;
          position: relative;
        }

        /* 桌面端布局 - 默认显示 */
        .orderdetail-item-desktop {
          display: flex;
          alignItems: center;
          width: 100%;
        }

        .orderdetail-item-thumbnail {
          margin-right: 16px;
          flex-shrink: 0;
        }

        .orderdetail-item-quantity {
          font-size: 30px;
          line-height: 1;
          margin-right: 20px;
          margin-top: 5px;
          min-width: 50px;
          flex-shrink: 0;
        }

        .orderdetail-item-info {
          flex: 1;
          max-width: calc(100% - 350px);
        }

        .orderdetail-item-right-desktop {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
        }

        /* 移动端布局 - 默认隐藏 */
        .orderdetail-item-mobile {
          display: none;
        }

        /* 手机响应式 (600px 以下) */
        @media (max-width: 600px) {
          .orderdetail-item-container {
            padding: 16px;
          }

          /* 隐藏桌面布局 */
          .orderdetail-item-desktop {
            display: none;
          }

          /* 显示手机布局 */
          .orderdetail-item-mobile {
            display: block;
            width: 100%;
          }

          .orderdetail-mobile-text {
            margin-bottom: 12px;
          }

          .orderdetail-mobile-bottom {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .orderdetail-thumbnail-mobile {
            flex-shrink: 0;
          }

          .orderdetail-quantity-mobile {
            font-size: 24px;
            line-height: 1;
            min-width: 30px;
            flex-shrink: 0;
            align-self: center;
          }

          .orderdetail-mobile-right {
            margin-left: auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
          }
        }
      `}</style>

      <Page
        title={`Order ${order.name}`}
        subtitle={`${new Date(order.created_at).toLocaleDateString()} • $${order.subtotal_price} • ${order.total_quantity} items`}
        backAction={{ content: 'Back to Packer', onAction: () => navigate('/packer') }}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      >
        {message && (
          <div style={{ 
            padding: '12px', 
            marginBottom: '16px', 
            backgroundColor: message.includes('Error') || message.includes('error') ? '#fef1f2' : '#d4edda', 
            borderRadius: '4px',
            color: message.includes('Error') || message.includes('error') ? '#d72c0d' : '#1a7f37'
          }}>
            {message}
          </div>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px', position: 'relative' }}>
                {order.status === 'holding' && (
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#9c6ade',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}>
                      Holding
                    </span>
                  </div>
                )}

                <Text variant="headingSm" as="h3">Shipping Address</Text>
                <div style={{ marginTop: '12px' }}>
                  <BlockStack gap="1">
                    <Text as="p">{order.shipping_name}</Text>
                    <Text as="p">{order.shipping_address1}</Text>
                    {order.shipping_address2 && <Text as="p">{order.shipping_address2}</Text>}
                    <Text as="p">
                      {order.shipping_city}, {order.shipping_province} {order.shipping_zip}
                    </Text>
                    <Text as="p">{order.shipping_country}</Text>
                  </BlockStack>
                </div>

                {order.packer_note && (
                  <div style={{ 
                    marginTop: '16px', 
                    paddingTop: '16px', 
                    borderTop: '1px solid #e1e3e5' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="headingSm" as="h3">Note</Text>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button 
                          size="slim" 
                          onClick={() => {
                            setNoteValue(order.packer_note);
                            setNoteModal(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button 
                          size="slim" 
                          destructive 
                          onClick={handleNoteDelete}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <Text as="p">{order.packer_note}</Text>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <div>
                {lineItems.map(item => (
                  <div key={item.id}>
                    {renderLineItem(item)}
                  </div>
                ))}
              </div>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={noteModal}
          onClose={() => setNoteModal(false)}
          title="Order Note"
          primaryAction={{
            content: 'Save',
            onAction: handleNoteSave
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setNoteModal(false)
            }
          ]}
        >
          <Modal.Section>
            <TextField
              label="Note (max 50 characters)"
              value={noteValue}
              onChange={setNoteValue}
              maxLength={50}
              autoComplete="off"
              placeholder="Enter a note for this order"
              showCharacterCount
            />
          </Modal.Section>
        </Modal>

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

        <WeightInputModal
          open={weightModal !== null}
          item={weightModal}
          onClose={() => setWeightModal(null)}
          onSubmit={handleWeightSubmit}
        />

        <CompleteOrderModal
          open={completeModal}
          orderName={order.name}
          hasWeightWarning={hasWeightWarning}
          boxTypes={boxTypes}
          onClose={() => setCompleteModal(false)}
          onComplete={handleOrderComplete}
        />
      </Page>
    </>
  );
};

export default OrderDetail;
```

---

## 📄 `client\src\pages\Packer.js`

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  Button,
  ChoiceList,
  BlockStack,
  Banner
} from '@shopify/polaris';
import { SortIcon } from '@shopify/polaris-icons';

const Packer = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  
  // 🆕 从 localStorage 恢复筛选设置
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = localStorage.getItem('packerStatusFilter');
    return saved ? JSON.parse(saved) : ['packing', 'waiting', 'holding', 'ready'];
  });
  
  const [showEditedOnly, setShowEditedOnly] = useState(() => {
    const saved = localStorage.getItem('packerShowEditedOnly');
    return saved === 'true';
  });
  
  const [isSorted, setIsSorted] = useState(false);

  // 🆕 保存筛选设置到 localStorage
  useEffect(() => {
    localStorage.setItem('packerStatusFilter', JSON.stringify(statusFilter));
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem('packerShowEditedOnly', showEditedOnly.toString());
  }, [showEditedOnly]);

  const applyFilters = useCallback(() => {
    let filtered = orders.filter(order => statusFilter.includes(order.orderStatus));
    
    // 如果启用了 "只显示 Edited"，进一步过滤
    if (showEditedOnly) {
      filtered = filtered.filter(order => order.is_edited);
    }
    
    // 如果启用了排序，按订单号排序
    if (isSorted) {
      filtered = filtered.sort((a, b) => {
        const orderNumA = parseInt(a.order_number) || 0;
        const orderNumB = parseInt(b.order_number) || 0;
        return orderNumA - orderNumB;
      });
    }
    
    setFilteredOrders(filtered);
  }, [orders, statusFilter, showEditedOnly, isSorted]);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, statusFilter, showEditedOnly, isSorted, applyFilters]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get('/api/packer/orders');
      console.log('Fetched orders:', response.data);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const handleSort = () => {
    setIsSorted(!isSorted);
  };

  const handleStatusClick = async (e, orderId, currentStatus) => {
    e.stopPropagation();
    
    let newStatus;
    if (currentStatus === 'packing') {
      newStatus = 'holding';
    } else if (currentStatus === 'holding') {
      newStatus = 'packing';
    } else if (currentStatus === 'ready') {
      newStatus = 'packing';
    }

    console.log(`Changing order ${orderId} from ${currentStatus} to ${newStatus}`);

    try {
      await axios.patch(`/api/packer/orders/${orderId}`, { status: newStatus });
      await fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const handleOrderClick = (orderId) => {
    console.log('Navigating to order:', orderId);
    navigate(`/packer/${orderId}`);
  };

  const getStatusBadge = (orderStatus) => {
    switch (orderStatus) {
      case 'ready':
        return <Badge tone="success">Ready</Badge>;
      case 'holding':
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '6px',
            backgroundColor: '#9c6ade',
            color: 'white',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            Holding
          </span>
        );
      case 'waiting':
        return <Badge tone="info">Waiting</Badge>;
      default:
        return <Badge>Packing</Badge>;
    }
  };

  const formatDate = (month, day) => {
    if (!month || !day) return '';
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}/${d}`;
  };

  // 计算每种状态的数量
  const getStatusCounts = () => {
    const counts = {
      packing: 0,
      waiting: 0,
      holding: 0,
      ready: 0,
      edited: 0
    };
    
    orders.forEach(order => {
      if (counts.hasOwnProperty(order.orderStatus)) {
        counts[order.orderStatus]++;
      }
      if (order.is_edited) {
        counts.edited++;
      }
    });
    
    return counts;
  };

  const statusCounts = getStatusCounts();

  const renderItem = (order) => {
    const { 
      shopify_order_id, 
      order_number, 
      name, 
      total_quantity, 
      shipping_title, 
      status,
      orderStatus, 
      box_type, 
      weight, 
      hasWeightWarning,
      hasOutOfStock, // 🆕 out of stock 标记
      transferInfo,
      is_edited,
      packer_note
    } = order;

    return (
      <ResourceItem
        id={shopify_order_id}
        onClick={() => handleOrderClick(shopify_order_id)}
        verticalAlignment="center"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <BlockStack gap="2">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <Text variant="bodyMd" as="h3" fontWeight="semibold">
                  {name}
                </Text>
                {packer_note && (
                  <Text variant="bodySm" tone="subdued">
                    {packer_note}
                  </Text>
                )}
              </div>
              <Text variant="bodySm" color="subdued">
                Items: {total_quantity}
              </Text>
            </BlockStack>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {orderStatus === 'ready' && (
              <>
                {hasWeightWarning && shipping_title && (
                  <Badge tone="info">{shipping_title}</Badge>
                )}
                
                {box_type && (
                  <Badge tone="warning">{box_type}</Badge>
                )}
                
                {weight && (
                  <Badge>{weight}g</Badge>
                )}
                
                {!hasWeightWarning && shipping_title && (
                  <Badge tone="info">{shipping_title}</Badge>
                )}
              </>
            )}
            
            {orderStatus === 'waiting' && transferInfo && (
              <Text variant="bodySm" fontWeight="bold" tone="info">
                {transferInfo.transferFroms.join(', ')}, {formatDate(transferInfo.estimateMonth, transferInfo.estimateDay)}
              </Text>
            )}
            
            {/* 🆕 Out of Stock 标记 */}
            {hasOutOfStock && (
              <Badge tone="critical">Out of Stock</Badge>
            )}
            
            {is_edited && (
              <Badge tone="critical">Edited</Badge>
            )}
            
            {hasWeightWarning && (
              <Badge tone="critical">⚠️ Weight</Badge>
            )}
            
            {getStatusBadge(orderStatus)}
            
            <Button onClick={(e) => handleStatusClick(e, shopify_order_id, status)}>
              {status === 'holding' ? 'Undo' : 'Hold'}
            </Button>
          </div>
        </div>
      </ResourceItem>
    );
  };

  return (
    <Page
      title="Packer"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
      primaryAction={{
        content: isSorted ? 'Unsort' : 'Sort by Order #',
        icon: SortIcon,
        onAction: handleSort
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <BlockStack gap="4">
                <ChoiceList
                  title="Show orders"
                  choices={[
                    { label: `Packing (${statusCounts.packing})`, value: 'packing' },
                    { label: `Waiting (${statusCounts.waiting})`, value: 'waiting' },
                    { label: `Holding (${statusCounts.holding})`, value: 'holding' },
                    { label: `Ready (${statusCounts.ready})`, value: 'ready' }
                  ]}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  allowMultiple
                />
                
                {/* Edited 单独的复选框 */}
                <div style={{ 
                  paddingTop: '12px', 
                  borderTop: '1px solid #e1e3e5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <input
                    type="checkbox"
                    id="edited-filter"
                    checked={showEditedOnly}
                    onChange={(e) => setShowEditedOnly(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label 
                    htmlFor="edited-filter" 
                    style={{ cursor: 'pointer', fontSize: '14px' }}
                  >
                    Show only Edited orders ({statusCounts.edited})
                  </label>
                </div>
              </BlockStack>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <ResourceList
              items={filteredOrders}
              renderItem={renderItem}
              emptyState={<Banner>No orders to pack</Banner>}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Packer;
```

---

## 📄 `client\src\pages\Picker.js`

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Text,
  Badge,
  Button,
  ButtonGroup,
  ChoiceList,
  Modal,
  BlockStack,
  Banner,
  InlineStack,
  Box
} from '@shopify/polaris';
import { SortIcon, ImageIcon } from '@shopify/polaris-icons';
import NumericKeypad from '../components/NumericKeypad';

const Picker = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [isSorted, setIsSorted] = useState(() => {
    // 🆕 从 localStorage 恢复排序状态
    return localStorage.getItem('pickerSortEnabled') === 'true';
  });
  const [statusFilter, setStatusFilter] = useState(['picking', 'missing', 'picked']);
  const [selectedImage, setSelectedImage] = useState(null);
  const [quantityModal, setQuantityModal] = useState(null);
  const [pickedQuantity, setPickedQuantity] = useState('');
  // 🆕 MTL10 库存相关
  const [mtl10Inventory, setMtl10Inventory] = useState({});
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  // 🆕 Clean 功能相关
  const [cleanModal, setCleanModal] = useState(null);
  const [isCheckingClean, setIsCheckingClean] = useState(false);

  // 🆕 计算每个状态的实时数量（按 quantity 累加）
  const getStatusCounts = useCallback(() => {
    return {
      picking: items
        .filter(item => item.picker_status === 'picking')
        .reduce((sum, item) => sum + item.quantity, 0),
      missing: items
        .filter(item => item.picker_status === 'missing')
        .reduce((sum, item) => sum + item.quantity, 0),
      picked: items
        .filter(item => item.picker_status === 'picked')
        .reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [items]);

  // 🆕 增强的排序函数：先按 type，再按 SKU 数字
  const sortItems = useCallback((itemsToSort) => {
    return [...itemsToSort].sort((a, b) => {
      // 1. 先按 type 排序
      const typeA = (a.sort_type || '').toLowerCase();
      const typeB = (b.sort_type || '').toLowerCase();
      const typeCompare = typeA.localeCompare(typeB);
      
      if (typeCompare !== 0) return typeCompare;
      
      // 2. 相同 type 内按 SKU 数字排序
      const skuA = a.sku || '';
      const skuB = b.sku || '';
      
      // 提取 SKU 中的数字部分
      const numA = parseInt(skuA.match(/\d+/)?.[0] || '0');
      const numB = parseInt(skuB.match(/\d+/)?.[0] || '0');
      
      return numA - numB;
    });
  }, []);

  // 修复：applyFilters 现在会保持排序状态
  const applyFilters = useCallback(() => {
    let filtered = items.filter(item => statusFilter.includes(item.picker_status));
    
    // 🆕 如果当前是排序状态，应用排序（忽略状态，对所有 item 排序）
    if (isSorted) {
      filtered = sortItems(filtered);
    }
    
    setFilteredItems(filtered);
  }, [items, statusFilter, isSorted, sortItems]);

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [items, statusFilter, applyFilters]);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/picker/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  // 🆕 查询 MTL10 库存（只查询 picking 且未查询过的 items）
  const handleCheckStock = async () => {
    setIsLoadingInventory(true);
    try {
      // 查询 picking 和 missing 状态且未查询过的 items
      const pickingItems = items.filter(
        item => (item.picker_status === 'picking' || item.picker_status === 'missing') && mtl10Inventory[item.id] === undefined
      );
      
      if (pickingItems.length === 0) {
        setIsLoadingInventory(false);
        return;
      }
      
      const itemIds = pickingItems.map(item => item.id);
      
      console.log(`📦 Checking MTL10 stock for ${itemIds.length} items...`);
      
      const response = await axios.post('/api/picker/items/batch-mtl10-inventory', {
        itemIds
      });
      
      console.log(`✓ Received inventory for ${Object.keys(response.data.inventory).length} items`);
      
      // 🔍 调试：打印返回的数据
      console.log('Inventory data:', response.data.inventory);
      Object.entries(response.data.inventory).forEach(([itemId, data]) => {
        console.log(`  Item ${itemId}:`, data);
      });
      
      // 合并新查询的库存
      setMtl10Inventory(prev => {
        const merged = { ...prev, ...response.data.inventory };
        console.log('Merged inventory:', merged);
        return merged;
      });
    } catch (error) {
      console.error('Error fetching MTL10 inventory:', error);
    } finally {
      setIsLoadingInventory(false);
    }
  };

  // 🆕 Clean 功能：检查已完成的订单
  const handleCheckClean = async () => {
    setIsCheckingClean(true);
    try {
      console.log('🧹 Checking for fulfilled orders...');
      
      const response = await axios.get('/api/picker/check-fulfilled-orders');
      
      console.log('✓ Clean check result:', response.data);
      
      if (response.data.orders.length === 0) {
        // 没有需要清理的订单
        alert('No fulfilled orders found in Picker.');
        return;
      }
      
      // 显示确认弹窗
      setCleanModal({
        orders: response.data.orders,
        item_ids: response.data.item_ids,
        total_items: response.data.total_items,
        total_quantity: response.data.total_quantity
      });
    } catch (error) {
      console.error('Error checking fulfilled orders:', error);
      alert('Error checking fulfilled orders. Please try again.');
    } finally {
      setIsCheckingClean(false);
    }
  };

  // 🆕 Clean 功能：执行清理
  const handleConfirmClean = async () => {
    if (!cleanModal) return;
    
    try {
      console.log(`🗑️ Cleaning ${cleanModal.item_ids.length} items...`);
      
      const response = await axios.post('/api/picker/clean-fulfilled-items', {
        item_ids: cleanModal.item_ids
      });
      
      console.log(`✓ Cleaned ${response.data.deleted_count} items`);
      
      // 关闭弹窗
      setCleanModal(null);
      
      // 重新加载 items
      fetchItems();
      
      alert(`Successfully cleaned ${response.data.deleted_count} items from ${cleanModal.orders.length} fulfilled orders.`);
    } catch (error) {
      console.error('Error cleaning fulfilled items:', error);
      alert('Error cleaning items. Please try again.');
    }
  };

  // 🆕 改进的排序切换函数
  const handleSort = () => {
    const newSortState = !isSorted;
    setIsSorted(newSortState);
    
    // 🆕 持久化到 localStorage
    localStorage.setItem('pickerSortEnabled', newSortState.toString());
    
    if (newSortState) {
      // 启用排序
      const sorted = sortItems(filteredItems);
      setFilteredItems(sorted);
    } else {
      // 取消排序 - 重新应用过滤，不排序
      applyFilters();
    }
  };

  const updateItemStatus = async (itemId, newStatus) => {
    try {
      await axios.patch(`/api/picker/items/${itemId}/status`, { status: newStatus });
      setItems(items.map(item => 
        item.id === itemId ? { ...item, picker_status: newStatus } : item
      ));
      // isSorted 状态会保持，applyFilters 会自动重新排序
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleGreenClick = (item) => {
    if (item.picker_status === 'picked') {
      updateItemStatus(item.id, 'picking');
    } else {
      updateItemStatus(item.id, 'picked');
    }
  };

  const handleRedClick = (item) => {
    if (item.quantity === 1) {
      updateItemStatus(item.id, 'missing');
    } else {
      setQuantityModal(item);
      setPickedQuantity('');
    }
  };

  const handleUndoMissing = (item) => {
    updateItemStatus(item.id, 'picking');
  };

  const handleNumberClick = (number) => {
    setPickedQuantity(prev => prev + number);
  };

  const handleBackspace = () => {
    setPickedQuantity(prev => prev.slice(0, -1));
  };

  const handleQuantitySubmit = async () => {
    const qty = parseInt(pickedQuantity);
    
    // 验证：必须是 0 到 quantity-1 之间的数字
    if (isNaN(qty) || qty < 0 || qty >= quantityModal.quantity) {
      alert(`Please enter a valid quantity (0-${quantityModal.quantity - 1})`);
      return;
    }

    try {
      if (qty === 0) {
        // 如果输入 0，直接将整个 item 标记为 missing
        await axios.patch(`/api/picker/items/${quantityModal.id}/status`, { 
          status: 'missing' 
        });
        await fetchItems();
      } else {
        // 如果输入 1 到 quantity-1，调用 split API
        await axios.post(`/api/picker/items/${quantityModal.id}/split`, {
          pickedQuantity: qty
        });
        await fetchItems();
      }
      
      setQuantityModal(null);
      setPickedQuantity('');
      // isSorted 状态会保持，applyFilters 会自动重新排序
    } catch (error) {
      console.error('Error handling quantity:', error);
      alert('Error processing item. Please try again.');
    }
  };

  const handleImageClick = (item) => {
    if (item.image_url && item.url_handle) {
      setSelectedImage({
        url: item.image_url,
        link: `https://herabeauty.ca/products/${item.url_handle}`,
        title: `${item.brand} ${item.title}`
      });
    }
  };

  const getItemBadge = (status) => {
    switch (status) {
      case 'picked':
        return <Badge tone="success">Picked</Badge>;
      case 'missing':
        return <Badge tone="critical">Missing</Badge>;
      default:
        return <Badge>Picking</Badge>;
    }
  };

  // 格式化 SKU：每4位加一个空格
  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
  };

  const renderItem = (item) => {
    const { id, quantity, image_url, order_name, display_type, sku, brand, title, size, picker_status, variant_title } = item;
    
    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail
          source={image_url}
          alt={title}
          size="large"
        />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <div className="picker-item-container">
        {/* 桌面端：状态标签在右上角 */}
        <div className="picker-item-badge-desktop">
          {getItemBadge(picker_status)}
        </div>

        <div className="picker-item-main">
          {/* 桌面布局 */}
          <div className="picker-item-desktop">
            <div className="picker-item-thumbnail">
              {media}
            </div>

            <div className="picker-item-quantity">
              {quantity}
            </div>

            <div className="picker-item-info">
              <BlockStack gap="1">
                <div style={{ 
                  wordWrap: 'break-word', 
                  overflowWrap: 'break-word'
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
                
                <Text variant="bodySm">
                  {display_type}
                </Text>
                
                <Text variant="bodySm">
                  {formatSKU(sku)}
                </Text>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Text variant="bodySm" tone="subdued">
                    {order_name}
                  </Text>
                  {/* 🆕 Desktop: QOH 显示在订单号右边 */}
                  {mtl10Inventory[id] !== undefined && mtl10Inventory[id] !== null && (
                    <span style={{ fontSize: '12px' }}>
                      <span style={{ color: '#8c9196', fontSize: '11px' }}>QOH </span>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: (typeof mtl10Inventory[id] === 'object' && mtl10Inventory[id].discontinued) ? '#d72c0d' : '#202223' 
                      }}>
                        {typeof mtl10Inventory[id] === 'object' ? mtl10Inventory[id].quantity : mtl10Inventory[id]}
                      </span>
                    </span>
                  )}
                </div>
              </BlockStack>
            </div>

            <div className="picker-item-buttons-desktop">
              {picker_status === 'picked' ? (
                <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-undo">
                  Undo
                </button>
              ) : picker_status === 'missing' ? (
                <button onClick={() => handleUndoMissing(item)} className="picker-btn picker-btn-undo">
                  Undo
                </button>
              ) : (
                <div className="picker-btn-group">
                  <button onClick={() => handleRedClick(item)} className="picker-btn picker-btn-missing">
                    Missing
                  </button>
                  <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-picked">
                    Picked
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 手机布局 */}
          <div className="picker-item-mobile">
            {/* 上半部分：文本信息 */}
            <div className="picker-item-mobile-text">
              <div style={{ marginBottom: '4px' }}>
                <Text variant="bodyMd" fontWeight="bold">
                  {brand} {title} {size}
                </Text>
              </div>
              
              {/* 添加 variant_title */}
              {variant_title && (
                <div style={{ marginBottom: '4px' }}>
                  <Text variant="bodySm">
                    {variant_title}
                  </Text>
                </div>
              )}
              
              <div style={{ marginBottom: '2px' }}>
                <Text variant="bodySm">
                  {display_type}
                </Text>
              </div>
              <div style={{ marginBottom: '2px' }}>
                <Text variant="bodySm">
                  {formatSKU(sku)}
                </Text>
              </div>
              <div>
                <Text variant="bodySm" tone="subdued">
                  {order_name}
                </Text>
              </div>
            </div>

            {/* 下半部分：图片 + 数量 + 状态&按钮 */}
            <div className="picker-item-mobile-bottom">
              <div className="picker-item-thumbnail-mobile">
                {media}
              </div>

              <div className="picker-item-quantity-mobile">
                {quantity}
                {/* 🆕 Mobile: QOH 显示在 quantity 下方 */}
                {mtl10Inventory[id] !== undefined && mtl10Inventory[id] !== null && (
                  <div style={{ 
                    fontSize: '11px',
                    marginTop: '4px',
                    lineHeight: '1.2'
                  }}>
                    <span style={{ color: '#8c9196', fontSize: '10px' }}>QOH </span>
                    <span style={{ 
                      fontWeight: 'bold', 
                      color: (typeof mtl10Inventory[id] === 'object' && mtl10Inventory[id].discontinued) ? '#d72c0d' : '#202223' 
                    }}>
                      {typeof mtl10Inventory[id] === 'object' ? mtl10Inventory[id].quantity : mtl10Inventory[id]}
                    </span>
                  </div>
                )}
              </div>

              <div className="picker-item-mobile-right">
                <div className="picker-item-badge-mobile">
                  {getItemBadge(picker_status)}
                </div>

                <div className="picker-item-buttons-mobile">
                  {picker_status === 'picked' ? (
                    <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-undo">
                      Undo
                    </button>
                  ) : picker_status === 'missing' ? (
                    <button onClick={() => handleUndoMissing(item)} className="picker-btn picker-btn-undo">
                      Undo
                    </button>
                  ) : (
                    <div className="picker-btn-group-mobile">
                      <button onClick={() => handleRedClick(item)} className="picker-btn picker-btn-missing">
                        Missing
                      </button>
                      <button onClick={() => handleGreenClick(item)} className="picker-btn picker-btn-picked">
                        Picked
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 🆕 获取实时数量
  const statusCounts = getStatusCounts();

  return (
    <>
      <style>{`
        /* Picker 响应式样式 */
        .picker-item-container {
          padding: 22px 16px;
          position: relative;
        }

        .picker-item-badge-desktop {
          position: absolute;
          top: 22px;
          right: 16px;
        }

        .picker-item-badge-mobile {
          display: none;
        }

        .picker-item-main {
          display: flex;
          align-items: center;
        }

        .picker-item-desktop {
          display: flex;
          align-items: center;
          width: 100%;
        }

        .picker-item-mobile {
          display: none;
        }

        .picker-item-thumbnail {
          margin-right: 16px;
          flex-shrink: 0;
        }

        .picker-item-quantity {
          font-size: 38px;
          line-height: 1;
          margin-right: 20px;
          margin-top: 5px;
          min-width: 50px;
          flex-shrink: 0;
        }

        .picker-item-info {
          flex: 1;
          margin-left: -30px;
          max-width: calc(100% - 300px);
        }

        .picker-item-buttons-desktop {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          margin-top: 10px;
        }

        .picker-btn-group {
          display: flex;
          gap: 25px;
        }

        .picker-btn {
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }

        .picker-btn-undo {
          background-color: white;
          color: black;
          border: 1px solid #c4cdd5;
          padding: 6px 12px;
          font-size: 13px;
          min-width: 60px;
        }

        .picker-btn-missing {
          background-color: #ec8b84ff;
          color: white;
          border: none;
          padding: 6px 12px;
          font-size: 13px;
          min-width: 60px;
        }

        .picker-btn-picked {
          background-color: #6db477ff;
          color: white;
          border: none;
          padding: 8px 16px;
          font-size: 14px;
          min-width: 80px;
        }

        /* 手机端 ChoiceList 横向布局 */
        @media (max-width: 600px) {
          .Polaris-ChoiceList__Choices {
            display: flex !important;
            flex-direction: row !important;
            gap: 16px !important;
          }

          .Polaris-ChoiceList__Choice {
            margin-bottom: 0 !important;
          }
        }

        /* Modal 和 Keypad 布局修复 */
        .picker-modal-content {
          position: relative;
          min-height: 400px;
        }

        .picker-modal-input-section {
          margin-bottom: 30px;
        }

        .picker-modal-keypad {
          margin-top: 30px;
        }

        /* 手机响应式 (600px 以下) */
        @media (max-width: 600px) {
          .picker-item-container {
            padding: 16px 12px;
          }

          /* 隐藏桌面布局 */
          .picker-item-desktop {
            display: none;
          }

          .picker-item-badge-desktop {
            display: none;
          }

          /* 显示手机布局 */
          .picker-item-mobile {
            display: block;
            width: 100%;
          }

          .picker-item-mobile-text {
            margin-bottom: 12px;
          }

          .picker-item-mobile-bottom {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .picker-item-thumbnail-mobile {
            flex-shrink: 0;
          }

          .picker-item-quantity-mobile {
            font-size: 30px;
            line-height: 1;
            margin-top: 5px;
            min-width: 45px;
            flex-shrink: 0;
          }

          .picker-item-mobile-right {
            margin-left: auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
          }

          .picker-item-badge-mobile {
            display: block;
          }

          .picker-item-buttons-mobile {
            display: flex;
            justify-content: flex-end;
          }

          .picker-btn-group-mobile {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .picker-btn-missing,
          .picker-btn-picked {
            min-width: 70px;
            padding: 6px 12px;
            font-size: 13px;
          }
        }
      `}</style>

      <Page
        title="Picker"
        backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
        primaryAction={{
          content: isSorted ? 'Unsort' : 'Sort by Type',
          icon: SortIcon,
          onAction: handleSort
        }}
        secondaryActions={[
          {
            content: isLoadingInventory ? 'Checking...' : 'Check Stock',
            onAction: handleCheckStock,
            loading: isLoadingInventory,
            disabled: isLoadingInventory
          },
          {
            content: isCheckingClean ? 'Checking...' : 'Clean',
            onAction: handleCheckClean,
            loading: isCheckingClean,
            disabled: isCheckingClean,
            destructive: true
          }
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <ChoiceList
                  title="Show items"
                  choices={[
                    { label: `Picking (${statusCounts.picking})`, value: 'picking' },
                    { label: `Missing (${statusCounts.missing})`, value: 'missing' },
                    { label: `Picked (${statusCounts.picked})`, value: 'picked' }
                  ]}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  allowMultiple
                />
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <div>
                {filteredItems.length === 0 ? (
                  <Banner>No items to pick</Banner>
                ) : (
                  filteredItems.map(item => (
                    <div key={item.id} style={{ borderBottom: '1px solid #e1e3e5' }}>
                      {renderItem(item)}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Image Modal */}
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

        {/* Quantity Modal */}
        <Modal
          open={quantityModal !== null}
          onClose={() => setQuantityModal(null)}
          title="Enter Picked Quantity"
        >
          <Modal.Section>
            {quantityModal && (
              <div className="picker-modal-content">
                <div className="picker-modal-input-section">
                  <Text>Total quantity: {quantityModal.quantity}</Text>
                  <Text variant="bodySm" tone="subdued">Enter 0 if you have none, or 1-{quantityModal.quantity - 1} for the amount you have</Text>
                  <div style={{ marginTop: '12px' }}>
                    <div style={{
                      border: '2px solid #c4cdd5',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      backgroundColor: '#ffffff',
                      minHeight: '50px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {pickedQuantity || '0'}
                    </div>
                  </div>
                </div>

                <div className="picker-modal-keypad">
                  <NumericKeypad
                    onNumberClick={handleNumberClick}
                    onBackspace={handleBackspace}
                  />
                </div>

                <div style={{ 
                  marginTop: '20px',
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end'
                }}>
                  <Button onClick={() => setQuantityModal(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleQuantitySubmit}>
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </Modal.Section>
        </Modal>
      </Page>

      {/* 🆕 Clean Confirmation Modal */}
      {cleanModal && (
        <Modal
          open={true}
          onClose={() => setCleanModal(null)}
          title="Clean Fulfilled Orders"
          primaryAction={{
            content: 'Proceed',
            onAction: handleConfirmClean,
            destructive: true
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setCleanModal(null)
            }
          ]}
        >
          <Modal.Section>
            <BlockStack gap="4">
              <Text variant="headingMd">
                The following orders have been fulfilled and will be removed from Picker:
              </Text>
              
              <Box>
                {cleanModal.orders.map((order, index) => (
                  <div key={index} style={{ 
                    padding: '12px', 
                    borderBottom: index < cleanModal.orders.length - 1 ? '1px solid #e1e3e5' : 'none' 
                  }}>
                    <Text variant="bodyMd" fontWeight="bold">
                      {order.order_name}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Status: {order.fulfillment_status} | Items: {order.item_count} | Quantity: {order.total_quantity}
                    </Text>
                  </div>
                ))}
              </Box>
              
              <div style={{ 
                padding: '12px', 
                backgroundColor: '#f6f6f7', 
                borderRadius: '8px' 
              }}>
                <Text variant="headingSm">
                  Total: {cleanModal.orders.length} orders, {cleanModal.total_items} items, {cleanModal.total_quantity} units
                </Text>
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </>
  );
};

export default Picker;
```

---

## 📄 `client\src\pages\Settings.js`

```javascript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { Page, Layout, Card, TextField, Button, Text, BlockStack } from '@shopify/polaris';

const Settings = () => {
  const navigate = useNavigate();
  const [boxTypes, setBoxTypes] = useState([]);
  const [newBoxCode, setNewBoxCode] = useState('');
  const [newBoxDimensions, setNewBoxDimensions] = useState('');
  const [message, setMessage] = useState('');
  
  // 清理相关状态
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [isCleanupLoading, setIsCleanupLoading] = useState(false);
  
  // 清空所有数据相关状态
  const [isClearingData, setIsClearingData] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // 🆕 Box 统计开始日期
  const [boxStatsStartDate, setBoxStatsStartDate] = useState(null);

  useEffect(() => {
    fetchSettings();
    fetchDbStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setBoxTypes(response.data.boxTypes || []);
      
      // 🆕 获取 box stats start date
      const startDate = response.data.settings?.box_stats_start_date;
      if (startDate) {
        setBoxStatsStartDate(startDate);
      }
    } catch (error) {
      console.error('Error:', error);
      showMessage('Error loading settings');
    }
  };

  const fetchDbStats = async () => {
    try {
      const response = await axios.get('/api/settings/database-stats');
      setDbStats(response.data);
    } catch (error) {
      console.error('Error fetching database stats:', error);
    }
  };

  const fetchCleanupPreview = async () => {
    setIsCleanupLoading(true);
    try {
      const response = await axios.get('/api/settings/cleanup-preview');
      setCleanupPreview(response.data);
      showMessage(`Found ${response.data.count} orders to clean up`);
    } catch (error) {
      console.error('Error fetching cleanup preview:', error);
      showMessage('Error loading cleanup preview');
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const handleManualCleanup = async () => {
    if (!window.confirm('Are you sure you want to delete all data older than 60 days? This action cannot be undone.')) {
      return;
    }

    setIsCleanupLoading(true);
    try {
      const response = await axios.post('/api/settings/cleanup');
      showMessage(response.data.message);
      await fetchCleanupPreview();
      await fetchDbStats();
      await fetchSettings();
    } catch (error) {
      console.error('Error running cleanup:', error);
      showMessage('Cleanup failed');
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      return;
    }

    setIsClearingData(true);
    try {
      const response = await axios.post('/api/settings/clear-all-data');
      showMessage(response.data.message);
      setShowClearConfirm(false);
      
      await fetchDbStats();
      await fetchSettings();
      setCleanupPreview(null);
    } catch (error) {
      console.error('Error clearing data:', error);
      showMessage('Failed to clear data: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsClearingData(false);
    }
  };

  const handleCancelClear = () => {
    setShowClearConfirm(false);
  };

  // 🆕 重置 Box 使用统计
  const handleResetBoxUsage = async () => {
    if (!window.confirm('Are you sure you want to reset all box usage statistics? This will clear usage counts and quantities for all boxes.')) {
      return;
    }

    try {
      const response = await axios.post('/api/settings/reset-box-usage');
      showMessage(response.data.message);
      
      // 🆕 更新 box stats start date
      if (response.data.startDate) {
        setBoxStatsStartDate(response.data.startDate);
      }
      
      await fetchSettings();
      await fetchDbStats();
    } catch (error) {
      console.error('Error resetting box usage:', error);
      showMessage('Failed to reset box usage: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleAddBox = async () => {
    if (!newBoxCode) {
      showMessage('Please enter a box code');
      return;
    }

    try {
      await axios.post('/api/settings/box-types', {
        code: newBoxCode.toUpperCase(),
        dimensions: newBoxDimensions
      });
      setNewBoxCode('');
      setNewBoxDimensions('');
      await fetchSettings();
      showMessage('Box type added!');
    } catch (error) {
      showMessage(error.response?.data?.error || 'Error adding box type');
    }
  };

  const handleDeleteBox = async (id) => {
    try {
      await axios.delete(`/api/settings/box-types/${id}`);
      await fetchSettings();
      await fetchDbStats();
      showMessage('Box type deleted!');
    } catch (error) {
      showMessage('Error deleting box type');
    }
  };

  // 🆕 保存单个 box type（包括 quantity）
  const handleBoxSave = async (box) => {
    try {
      await axios.patch(`/api/settings/box-types/${box.id}`, {
        code: box.code.toUpperCase(),
        dimensions: box.dimensions,
        quantity: box.quantity
      });
      await fetchSettings();
      await fetchDbStats();
      showMessage('Box type saved!');
    } catch (error) {
      showMessage(error.response?.data?.error || 'Error saving box type');
    }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 5000);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  // 🆕 计算预计用完天数
  const calculateDaysUntilEmpty = (box) => {
    if (!boxStatsStartDate || !box.usage_count || box.usage_count === 0 || !box.quantity || box.quantity <= 0) {
      return null;
    }

    // 计算从开始日期到今天的天数
    const startDate = new Date(boxStatsStartDate);
    const today = new Date();
    const daysPassed = Math.max(1, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)));

    // 计算日均使用量
    const dailyUsage = box.usage_count / daysPassed;

    // 如果日均使用量为 0，返回 null
    if (dailyUsage === 0) {
      return null;
    }

    // 计算剩余天数（向下取整）
    const daysRemaining = Math.floor(box.quantity / dailyUsage);

    return daysRemaining;
  };

  // 🆕 按使用次数和字母排序 box types
  const sortedBoxTypes = [...boxTypes].sort((a, b) => {
    if (b.usage_count !== a.usage_count) {
      return b.usage_count - a.usage_count;
    }
    return a.code.localeCompare(b.code);
  });

  return (
    <Page
      title="Settings"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
    >
      {message && (
        <div style={{ 
          padding: '12px', 
          marginBottom: '16px', 
          backgroundColor: message.includes('Error') || message.includes('failed') || message.includes('Failed') ? '#f8d7da' : '#d4edda', 
          borderRadius: '4px',
          border: `1px solid ${message.includes('Error') || message.includes('failed') || message.includes('Failed') ? '#f5c6cb' : '#c3e6cb'}`
        }}>
          {message}
        </div>
      )}

      <Layout>
        {/* 数据库统计和清理 */}
        <Layout.Section>
          <Card title="Database Management" sectioned>
            <BlockStack gap="4">
              {/* 🆕 数据库统计 + Box Type 统计 */}
              <div>
                <Text variant="headingSm" as="h3">Database Statistics</Text>
                {dbStats && (
                  <div style={{ marginTop: '12px' }}>
                    {/* 🆕 日期信息移到顶部 */}
                    <div style={{ marginBottom: '16px' }}>
                      <Text variant="bodySm" tone="subdued">
                        Oldest order: {formatDate(dbStats.oldestOrder?.created_at)}
                      </Text>
                      <br />
                      <Text variant="bodySm" tone="subdued">
                        Newest order: {formatDate(dbStats.newestOrder?.created_at)}
                      </Text>
                    </div>

                    {/* Orders 统计 */}
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '8px',
                      marginBottom: '16px'
                    }}>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '100px',
                        flex: '0 0 auto'
                      }}>
                        <Text variant="bodySm" tone="subdued">Total Orders</Text>
                        <Text variant="headingMd" as="p">{dbStats.orders?.count || 0}</Text>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '100px',
                        flex: '0 0 auto'
                      }}>
                        <Text variant="bodySm" tone="subdued">Total Line Items</Text>
                        <Text variant="headingMd" as="p">{dbStats.lineItems?.count || 0}</Text>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f6f6f7', 
                        borderRadius: '8px',
                        minWidth: '100px',
                        flex: '0 0 auto'
                      }}>
                        <Text variant="bodySm" tone="subdued">Transfer Items</Text>
                        <Text variant="headingMd" as="p">{dbStats.transferItems?.count || 0}</Text>
                      </div>
                    </div>

                    {/* 🆕 Box 统计开始日期 */}
                    <div style={{ marginBottom: '12px' }}>
                      <Text variant="bodySm" tone="subdued">
                        Box from {boxStatsStartDate ? formatDate(boxStatsStartDate) : 'N/A'}
                      </Text>
                    </div>

                    {/* 🆕 Box Type 统计（新行） */}
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '8px'
                    }}>
                      {sortedBoxTypes.map((box) => {
                        // 🆕 quantity 就是剩余数量
                        const remainingDisplay = (box.quantity !== undefined && box.quantity !== null) ? box.quantity : 'null';
                        
                        // 🆕 计算预计用完天数
                        const daysUntilEmpty = calculateDaysUntilEmpty(box);
                        
                        return (
                          <div 
                            key={box.id}
                            style={{ 
                              padding: '12px', 
                              backgroundColor: '#f6f6f7', 
                              borderRadius: '8px',
                              minWidth: '90px',
                              flex: '0 0 auto'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                              <Text variant="bodySm" fontWeight="medium">{box.code}</Text>
                              {box.dimensions && (
                                <Text variant="bodySm" tone="subdued" as="span" style={{ fontSize: '11px' }}>
                                  {box.dimensions}
                                </Text>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                              <Text variant="headingMd" as="span">{box.usage_count || 0}</Text>
                              <Text variant="bodySm" tone="subdued" as="span">{remainingDisplay}</Text>
                            </div>
                            {/* 🆕 第三行：预计用完天数 */}
                            {daysUntilEmpty !== null && (
                              <div style={{ marginTop: '4px' }}>
                                <Text variant="bodySm" tone="subdued" as="span" style={{ fontSize: '11px' }}>
                                  ~{daysUntilEmpty}d
                                </Text>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 自动清理信息 */}
              <div style={{ 
                padding: '16px', 
                backgroundColor: '#e3f2fd', 
                borderRadius: '8px',
                border: '1px solid #90caf9'
              }}>
                <Text variant="headingSm" as="h3">Automatic Cleanup</Text>
                <div style={{ marginTop: '8px' }}>
                  <Text variant="bodySm">
                    The system automatically deletes data older than <strong>60 days</strong> every day at <strong>2:00 AM</strong>.
                  </Text>
                </div>
              </div>

              {/* 清理预览 */}
              {cleanupPreview && (
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: '#fff3e0', 
                  borderRadius: '8px',
                  border: '1px solid #ffb74d'
                }}>
                  <Text variant="headingSm" as="h3">Cleanup Preview</Text>
                  <div style={{ marginTop: '12px' }}>
                    <Text variant="bodyMd">
                      <strong>{cleanupPreview.count}</strong> orders will be deleted
                    </Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">
                      Cutoff date: {formatDate(cleanupPreview.cutoffDate)}
                    </Text>
                    {cleanupPreview.count > 0 && (
                      <div style={{ marginTop: '12px', maxHeight: '200px', overflow: 'auto' }}>
                        <Text variant="bodySm" fontWeight="bold">Orders to be deleted:</Text>
                        <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                          {cleanupPreview.orders.slice(0, 10).map(order => (
                            <li key={order.shopify_order_id}>
                              <Text variant="bodySm">
                                {order.name} - {formatDate(order.created_at)} ({order.fulfillment_status})
                              </Text>
                            </li>
                          ))}
                          {cleanupPreview.orders.length > 10 && (
                            <li>
                              <Text variant="bodySm" tone="subdued">
                                ... and {cleanupPreview.orders.length - 10} more
                              </Text>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 清理操作按钮 */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button 
                  onClick={fetchCleanupPreview}
                  loading={isCleanupLoading}
                >
                  Check Preview
                </Button>
                <Button 
                  onClick={handleManualCleanup}
                  tone="critical"
                  loading={isCleanupLoading}
                  disabled={cleanupPreview?.count === 0}
                >
                  Run Cleanup Now
                </Button>
                {/* 🆕 Reset Box Usage 按钮 */}
                <Button 
                  onClick={handleResetBoxUsage}
                  tone="critical"
                >
                  Reset Box Usage
                </Button>
              </div>

              {/* 危险区域：清空所有数据 */}
              <div style={{ 
                marginTop: '24px',
                padding: '16px', 
                backgroundColor: '#fff1f0', 
                borderRadius: '8px',
                border: '2px solid #ff4d4f'
              }}>
                <Text variant="headingSm" as="h3">⚠️ Danger Zone</Text>
                <div style={{ marginTop: '12px' }}>
                  <Text variant="bodySm" tone="critical">
                    This will permanently delete ALL orders, line items, and transfer items from the database.
                  </Text>
                </div>
                
                {showClearConfirm && (
                  <div style={{ 
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#fff',
                    borderRadius: '4px',
                    border: '1px solid #ff4d4f'
                  }}>
                    <Text variant="bodyMd" fontWeight="bold" tone="critical">
                      Are you absolutely sure?
                    </Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">
                      This action cannot be undone. All order data will be permanently deleted.
                    </Text>
                  </div>
                )}
                
                <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                  {!showClearConfirm ? (
                    <Button 
                      onClick={handleClearAllData}
                      tone="critical"
                      disabled={isClearingData}
                    >
                      Clear All Data
                    </Button>
                  ) : (
                    <>
                      <Button 
                        onClick={handleClearAllData}
                        tone="critical"
                        loading={isClearingData}
                      >
                        Yes, Delete Everything
                      </Button>
                      <Button 
                        onClick={handleCancelClear}
                        disabled={isClearingData}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Box Types" sectioned>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>Add New Box Type</p>
              <div style={{ marginBottom: '12px' }}>
                <TextField
                  label="Code"
                  value={newBoxCode}
                  onChange={setNewBoxCode}
                  placeholder="A"
                  maxLength={2}
                  autoComplete="off"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <TextField
                  label="Dimensions"
                  value={newBoxDimensions}
                  onChange={setNewBoxDimensions}
                  placeholder="10x8x4"
                  autoComplete="off"
                />
              </div>
              <Button onClick={handleAddBox}>Add Box Type</Button>
            </div>

            {boxTypes.length > 0 && (
              <div>
                <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>Current Box Types</p>
                {/* 🆕 3列布局 */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: '16px' 
                }}>
                  {boxTypes.map((box) => (
                    <div 
                      key={box.id} 
                      style={{ 
                        padding: '16px', 
                        border: '1px solid #e1e3e5',
                        borderRadius: '8px',
                        backgroundColor: '#fafbfb'
                      }}
                    >
                      {/* Code */}
                      <div style={{ marginBottom: '12px' }}>
                        <TextField
                          label="Code"
                          value={box.code}
                          onChange={(value) => {
                            const updated = boxTypes.map(b => 
                              b.id === box.id ? { ...b, code: value } : b
                            );
                            setBoxTypes(updated);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      
                      {/* Dimensions */}
                      <div style={{ marginBottom: '12px' }}>
                        <TextField
                          label="Dimensions"
                          value={box.dimensions || ''}
                          onChange={(value) => {
                            const updated = boxTypes.map(b => 
                              b.id === box.id ? { ...b, dimensions: value } : b
                            );
                            setBoxTypes(updated);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      
                      {/* 🆕 Quantity */}
                      <div style={{ marginBottom: '12px' }}>
                        <TextField
                          label="Quantity"
                          type="number"
                          value={box.quantity?.toString() || '0'}
                          onChange={(value) => {
                            const updated = boxTypes.map(b => 
                              b.id === box.id ? { ...b, quantity: parseInt(value) || 0 } : b
                            );
                            setBoxTypes(updated);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      
                      {/* 🆕 Delete & Save 按钮 */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button 
                          onClick={() => handleDeleteBox(box.id)}
                          tone="critical"
                        >
                          Delete
                        </Button>
                        <Button 
                          onClick={() => handleBoxSave(box)}
                          variant="primary"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <p style={{ padding: '16px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
            Settings should be configured on desktop/PC.
          </p>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Settings;
```

---

## 📄 `client\src\pages\Transfer.js`

```javascript
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
                  content: 'Transfer Planner',
                  onAction: () => navigate('/transfer-planner')
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
```

---

## 📄 `client\src\pages\TransferPlanner.js`

```javascript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Button,
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame,
  Checkbox
} from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';

const TransferPlanner = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [estimateDay, setEstimateDay] = useState('');
  const [inventoryData, setInventoryData] = useState({}); // { itemId: { location: qoh } }
  const [selectedTransfers, setSelectedTransfers] = useState({}); // { itemId: location }
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const LOCATIONS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11'];
  const LOCATION_MAP = {
    '01': 'MTL01', '02': 'MTL02', '03': 'MTL03', '04': 'MTL04', '05': 'MTL05',
    '06': 'MTL06', '07': 'MTL07', '08': 'MTL08', '09': 'MTL09', '11': 'MTL11'
  };

  useEffect(() => {
    fetchItems();
    // 设置默认 estimate day 为今天
    setEstimateDay(new Date().getDate().toString());
  }, []);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/transfer/items');
      // 只显示 transferring 状态的 items
      const transferringItems = response.data.filter(item => item.status === 'transferring');
      setItems(transferringItems);
    } catch (error) {
      console.error('Error fetching transfer items:', error);
    }
  };

  const showToast = (message) => {
    setToastMessage(message);
    setToastActive(true);
  };

  const handleLocationToggle = (location) => {
    setSelectedLocations(prev => 
      prev.includes(location) 
        ? prev.filter(l => l !== location)
        : [...prev, location]
    );
  };

  // 🆕 查询库存（增量查询）
  const handleCheckStock = async () => {
    if (selectedLocations.length === 0) {
      showToast('Please select at least one location');
      return;
    }

    // 找出还没有查询过的 locations
    const uncheckedLocations = selectedLocations.filter(loc => {
      // 检查是否所有 items 都已经有这个 location 的库存数据
      return items.some(item => !inventoryData[item.id]?.[loc]);
    });

    if (uncheckedLocations.length === 0) {
      showToast('Stock already loaded for selected locations');
      return;
    }

    setIsLoadingInventory(true);
    try {
      // 获取所有 SKUs
      const skuList = [...new Set(items.map(item => item.sku).filter(sku => sku))];
      
      // 查询选中的 locations
      const locationNames = uncheckedLocations.map(loc => LOCATION_MAP[loc]);
      
      console.log(`Checking stock for ${skuList.length} SKUs in ${locationNames.length} locations`);
      
      const response = await axios.post('/api/transfer/check-planner-stock', {
        skus: skuList,
        locations: locationNames
      });

      // 更新 inventory data
      const newInventoryData = { ...inventoryData };
      
      response.data.inventory.forEach(result => {
        const sku = result.sku;
        const location = result.location;
        const qoh = result.qoh;
        
        // 找到对应的 items
        items.forEach(item => {
          if (item.sku === sku) {
            if (!newInventoryData[item.id]) {
              newInventoryData[item.id] = {};
            }
            // 从 MTL01 转换为 01
            const shortLocation = location.replace('MTL', '');
            newInventoryData[item.id][shortLocation] = qoh;
          }
        });
      });

      setInventoryData(newInventoryData);
      showToast(`Stock loaded for ${uncheckedLocations.length} locations`);
    } catch (error) {
      console.error('Error checking stock:', error);
      showToast('Failed to load stock');
    } finally {
      setIsLoadingInventory(false);
    }
  };

  // 选择 transfer location
  const handleSelectTransferLocation = (itemId, location) => {
    setSelectedTransfers(prev => ({
      ...prev,
      [itemId]: prev[itemId] === location ? null : location
    }));
  };

  // 提交
  const handleSubmit = async () => {
    const itemsToUpdate = Object.entries(selectedTransfers)
      .filter(([itemId, location]) => location !== null)
      .map(([itemId, location]) => ({
        itemId: parseInt(itemId),
        location
      }));

    if (itemsToUpdate.length === 0) {
      showToast('Please select transfer location for at least one item');
      return;
    }

    if (!estimateDay || estimateDay < 1 || estimateDay > 31) {
      showToast('Please enter a valid estimate day');
      return;
    }

    // 计算 month
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const day = parseInt(estimateDay);
    let month = currentMonth;

    if (day < currentDate.getDate()) {
      month = currentMonth === 12 ? 1 : currentMonth + 1;
    }

    try {
      // 批量更新
      await axios.post('/api/transfer/batch-update-planner', {
        items: itemsToUpdate.map(({ itemId, location }) => ({
          id: itemId,
          transfer_from: location,
          estimate_month: month,
          estimate_day: day,
          status: 'waiting'
        }))
      });

      showToast(`Updated ${itemsToUpdate.length} items`);
      
      // 延迟返回，让用户看到 toast
      setTimeout(() => {
        navigate('/transfer');
      }, 1000);
    } catch (error) {
      console.error('Error submitting:', error);
      showToast('Failed to update items');
    }
  };

  const formatSKU = (sku) => {
    if (!sku) return '';
    return sku.match(/.{1,4}/g)?.join(' ') || sku;
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

  const handleImageClick = (item) => {
    if (item.image_url && item.url_handle) {
      window.open(`https://herabeauty.ca/products/${item.url_handle}`, '_blank');
    }
  };

  const renderItem = (item) => {
    const { 
      id, 
      quantity = 0, 
      image_url = '', 
      order_number = '', 
      sku = '', 
      brand = '', 
      title = '', 
      size = '', 
      variant_title = '', 
      custom_name = '' 
    } = item || {};
    
    const itemInventory = inventoryData[id] || {};
    const selectedLocation = selectedTransfers[id];

    // 获取有库存的 locations (QOH > 0)
    const availableLocations = selectedLocations
      .filter(loc => itemInventory[loc] && itemInventory[loc] > 0)
      .sort((a, b) => a.localeCompare(b));

    const media = image_url ? (
      <div onClick={() => handleImageClick(item)} style={{ cursor: 'pointer' }}>
        <Thumbnail source={image_url} alt={title} size="large" />
      </div>
    ) : (
      <Thumbnail source={ImageIcon} alt="No image" size="large" />
    );

    return (
      <div key={id} style={{
        padding: '22px 16px',
        borderBottom: '1px solid #e1e3e5',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        {/* 左侧：图片 */}
        <div style={{ flexShrink: 0 }}>
          {media}
        </div>

        {/* 数量 */}
        <div style={{ 
          fontSize: '38px', 
          fontWeight: 'bold',
          minWidth: '50px',
          flexShrink: 0
        }}>
          {quantity}
        </div>

        {/* 信息区 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="1">
            <Text variant="bodyLg" fontWeight="bold">
              {String(brand || '')} {String(title || '')} {String(size || '')}
            </Text>
            
            {variant_title && (
              <Text variant="bodyMd">
                {variant_title}
              </Text>
            )}

            {custom_name && (
              <Text variant="bodySm" tone="subdued">
                {custom_name}
              </Text>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text variant="bodySm">
                {formatSKU(sku)}
              </Text>
              <button
                onClick={() => handleCopy(id)}
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

        {/* 右侧：库存按钮 */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          minWidth: '200px'
        }}>
          {availableLocations.map(loc => {
            const qoh = itemInventory[loc];
            const isSelected = selectedLocation === loc;
            
            return (
              <button
                key={loc}
                onClick={() => handleSelectTransferLocation(id, loc)}
                style={{
                  backgroundColor: isSelected ? '#0080FF' : '#E3E3E3',
                  color: isSelected ? 'white' : '#202223',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: '70px',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontWeight: '600' }}>{loc}</span>
                {' '}
                <span style={{ fontWeight: 'bold' }}>{qoh}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
  ) : null;

  const hasSelectedTransfer = Object.values(selectedTransfers).some(loc => loc !== null);

  return (
    <Frame>
      <Page
        title="Transfer Planner"
        backAction={{ content: 'Back', onAction: () => navigate('/transfer') }}
      >
        <Layout>
          {/* 筛选区 */}
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <BlockStack gap="4">
                  <Text variant="headingMd" as="h3">Transfer from</Text>
                  
                  {/* 第一行：Location 复选框 + Estimate 输入框 */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '16px', 
                    alignItems: 'flex-start',
                    justifyContent: 'space-between'
                  }}>
                    {/* 左侧：Location 复选框 */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '16px', 
                      flexWrap: 'wrap',
                      flex: 1
                    }}>
                      {LOCATIONS.map(loc => (
                        <Checkbox
                          key={loc}
                          label={loc}
                          checked={selectedLocations.includes(loc)}
                          onChange={() => handleLocationToggle(loc)}
                        />
                      ))}
                    </div>

                    {/* 右侧：Estimate 输入框 */}
                    <div style={{ minWidth: '150px', flexShrink: 0 }}>
                      <TextField
                        label="Estimate"
                        type="number"
                        value={estimateDay}
                        onChange={setEstimateDay}
                        prefix="Day:"
                        min={1}
                        max={31}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {/* 第二行：按钮区域 */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '12px',
                    justifyContent: 'space-between',
                    marginTop: '8px'
                  }}>
                    <Button
                      onClick={handleCheckStock}
                      disabled={selectedLocations.length === 0 || isLoadingInventory}
                      loading={isLoadingInventory}
                    >
                      {isLoadingInventory ? 'Checking...' : 'Check Stock'}
                    </Button>

                    <Button
                      variant="primary"
                      onClick={handleSubmit}
                      disabled={!hasSelectedTransfer || !estimateDay}
                    >
                      Submit
                    </Button>
                  </div>
                </BlockStack>
              </div>
            </Card>
          </Layout.Section>

          {/* Item 列表 */}
          <Layout.Section>
            <Card>
              <div>
                {items.length === 0 ? (
                  <Banner>No transferring items</Banner>
                ) : (
                  items.map(item => renderItem(item))
                )}
              </div>
            </Card>
          </Layout.Section>
        </Layout>

        {toastMarkup}
      </Page>
    </Frame>
  );
};

export default TransferPlanner;
```

---

## 📄 `export-hera-project.js`

```javascript
/**
 * Hera Fulfiller 项目导出工具
 * 
 * 将整个项目导出为单个 Markdown 文件，用于 Claude Projects
 * 
 * 使用方法:
 * 1. 将此文件放到 Hera Fulfiller 项目根目录
 * 2. 运行: node export-hera-project.js
 * 3. 生成文件: hera-fulfiller-complete.md
 * 4. 上传到 Claude Project Knowledge
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// 配置
// ============================================================================

const CONFIG = {
  // 项目根目录（默认当前目录）
  projectRoot: process.cwd(),
  
  // 输出文件
  outputFile: 'hera-fulfiller-complete.md',
  
  // 要包含的文件扩展名
  includeExtensions: [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.json',
    '.sql',
    '.md',
    '.env.example',
    '.gitignore',
    'Dockerfile',
    'package.json',
    'package-lock.json'
  ],
  
  // 要排除的目录
  excludeDirs: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    'out',
    'logs',
    'tmp',
    'temp',
    '.cache',
    'uploads',
    'public/uploads',
    '.vscode',
    '.idea'
  ],
  
  // 要排除的文件
  excludeFiles: [
    '.DS_Store',
    'package-lock.json',  // 太大，不需要
    'yarn.lock',          // 太大，不需要
    '.env',               // 安全原因，只包含 .env.example
    '.env.local',
    '.env.production'
  ],
  
  // 最大文件大小（字节）- 跳过超过此大小的文件
  maxFileSize: 500 * 1024, // 500KB
  
  // 是否包含文件树
  includeFileTree: true,
  
  // 是否包含统计信息
  includeStats: true
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 检查是否应该排除此目录
 */
function shouldExcludeDir(dirName) {
  return CONFIG.excludeDirs.some(excluded => 
    dirName === excluded || dirName.startsWith('.')
  );
}

/**
 * 检查是否应该包含此文件
 */
function shouldIncludeFile(fileName, filePath) {
  // 排除特定文件
  if (CONFIG.excludeFiles.includes(fileName)) {
    return false;
  }
  
  // 检查扩展名
  const ext = path.extname(fileName);
  const hasValidExt = CONFIG.includeExtensions.some(validExt => {
    if (validExt.startsWith('.')) {
      return ext === validExt;
    } else {
      return fileName === validExt;
    }
  });
  
  if (!hasValidExt) {
    return false;
  }
  
  // 检查文件大小
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > CONFIG.maxFileSize) {
      console.log(`⏭️  Skipping large file: ${filePath} (${(stats.size / 1024).toFixed(2)}KB)`);
      return false;
    }
  } catch (error) {
    return false;
  }
  
  return true;
}

/**
 * 获取文件语言标识（用于 markdown 代码块）
 */
function getLanguageId(fileName) {
  const ext = path.extname(fileName);
  const languageMap = {
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.json': 'json',
    '.sql': 'sql',
    '.md': 'markdown',
    '.env.example': 'bash',
    '.gitignore': 'text',
    'Dockerfile': 'dockerfile'
  };
  
  // 特殊文件名
  if (fileName === 'package.json') return 'json';
  if (fileName === 'Dockerfile') return 'dockerfile';
  
  return languageMap[ext] || 'text';
}

/**
 * 递归扫描目录，构建文件树
 */
function buildFileTree(dir, prefix = '', isLast = true) {
  const items = fs.readdirSync(dir);
  let tree = '';
  
  items.forEach((item, index) => {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    const isLastItem = index === items.length - 1;
    
    const connector = isLastItem ? '└── ' : '├── ';
    const nextPrefix = prefix + (isLastItem ? '    ' : '│   ');
    
    if (stats.isDirectory()) {
      if (!shouldExcludeDir(item)) {
        tree += `${prefix}${connector}📁 ${item}/\n`;
        tree += buildFileTree(itemPath, nextPrefix, isLastItem);
      }
    } else {
      if (shouldIncludeFile(item, itemPath)) {
        tree += `${prefix}${connector}📄 ${item}\n`;
      }
    }
  });
  
  return tree;
}

/**
 * 递归收集所有文件
 */
function collectFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      if (!shouldExcludeDir(item)) {
        collectFiles(itemPath, files);
      }
    } else {
      if (shouldIncludeFile(item, itemPath)) {
        files.push(itemPath);
      }
    }
  });
  
  return files;
}

/**
 * 获取相对路径
 */
function getRelativePath(filePath) {
  return path.relative(CONFIG.projectRoot, filePath);
}

/**
 * 生成文件内容的 Markdown
 */
function generateFileMarkdown(filePath) {
  const relativePath = getRelativePath(filePath);
  const fileName = path.basename(filePath);
  const language = getLanguageId(fileName);
  
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    content = `[Error reading file: ${error.message}]`;
  }
  
  return `
## 📄 \`${relativePath}\`

\`\`\`${language}
${content}
\`\`\`

---
`;
}

/**
 * 生成统计信息
 */
function generateStats(files) {
  const stats = {
    totalFiles: files.length,
    byExtension: {},
    totalLines: 0,
    totalSize: 0
  };
  
  files.forEach(filePath => {
    const ext = path.extname(filePath) || path.basename(filePath);
    stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      stats.totalLines += content.split('\n').length;
      stats.totalSize += fs.statSync(filePath).size;
    } catch (error) {
      // Skip files that can't be read
    }
  });
  
  return stats;
}

// ============================================================================
// 主函数
// ============================================================================

function exportProject() {
  console.log('🚀 Starting Hera Fulfiller project export...\n');
  
  const startTime = Date.now();
  let output = '';
  
  // 1. 生成文件头
  output += `# Hera Fulfiller - Complete Project Export
**Generated:** ${new Date().toISOString()}  
**Purpose:** Claude Project Knowledge Base  
**Branch:** new-Transfer (Development)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [File Structure](#file-structure)
3. [Project Files](#project-files)
4. [Statistics](#statistics)

---

## 📋 Project Overview

**Hera Fulfiller** is the backend/management system for Hera Beauty's fulfillment operations.

**Current Development:**
- Feature: Transfer system redesign
- Integration: Connecteam API for task management
- Branch: new-Transfer

**Tech Stack:**
- Backend: Node.js + Express
- Database: SQL
- Integrations: Shopify, Connecteam

---

`;

  // 2. 生成文件树
  if (CONFIG.includeFileTree) {
    console.log('📁 Building file tree...');
    output += `## 📁 File Structure

\`\`\`
${path.basename(CONFIG.projectRoot)}/
${buildFileTree(CONFIG.projectRoot)}
\`\`\`

---

`;
  }
  
  // 3. 收集所有文件
  console.log('📂 Collecting files...');
  const files = collectFiles(CONFIG.projectRoot);
  console.log(`   Found ${files.length} files to export\n`);
  
  // 4. 生成统计信息
  const stats = generateStats(files);
  
  // 5. 生成所有文件内容
  output += `## 📄 Project Files

Below are all the source files in the Hera Fulfiller project:

---

`;
  
  files.forEach((filePath, index) => {
    const relativePath = getRelativePath(filePath);
    console.log(`   [${index + 1}/${files.length}] ${relativePath}`);
    output += generateFileMarkdown(filePath);
  });
  
  // 6. 添加统计信息
  if (CONFIG.includeStats) {
    output += `
## 📊 Statistics

**Total Files:** ${stats.totalFiles}  
**Total Lines:** ${stats.totalLines.toLocaleString()}  
**Total Size:** ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB

**Files by Type:**
${Object.entries(stats.byExtension)
  .sort((a, b) => b[1] - a[1])
  .map(([ext, count]) => `- \`${ext}\`: ${count} files`)
  .join('\n')}

---

**Export completed:** ${new Date().toISOString()}  
**Time taken:** ${((Date.now() - startTime) / 1000).toFixed(2)}s
`;
  }
  
  // 7. 写入文件
  const outputPath = path.join(CONFIG.projectRoot, CONFIG.outputFile);
  fs.writeFileSync(outputPath, output, 'utf-8');
  
  // 8. 完成
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n✅ Export completed!');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Files: ${stats.totalFiles}`);
  console.log(`   Lines: ${stats.totalLines.toLocaleString()}`);
  console.log(`   Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Time: ${duration}s`);
  console.log(`\n📤 Upload "${CONFIG.outputFile}" to your Claude Project Knowledge!`);
}

// ============================================================================
// 运行
// ============================================================================

try {
  exportProject();
} catch (error) {
  console.error('❌ Export failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
```

---

## 📄 `export.js`

```javascript
const fs = require('fs');
const path = require('path');

const output = 'complete-project.txt';
const ignore = ['node_modules', '.git', 'build', 'dist', 'database.db'];

function walkDir(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      if (ignore.some(i => filePath.includes(i))) return;
      
      if (fs.statSync(filePath).isDirectory()) {
        walkDir(filePath, fileList);
      } else if (file.endsWith('.js') || file === 'package.json') {
        fileList.push(filePath);
      }
    });
  } catch (err) {
    console.error(`Error reading ${dir}:`, err.message);
  }
  return fileList;
}

const files = walkDir('.');
let content = '=== PROJECT STRUCTURE ===\n\n';

files.sort().forEach(file => {
  console.log(`Processing: ${file}`);
  content += `\n\n===================\nFILE: ${file}\n===================\n`;
  try {
    content += fs.readFileSync(file, 'utf8');
  } catch (err) {
    content += `Error reading file: ${err.message}`;
  }
});

fs.writeFileSync(output, content);
console.log(`\n✓ Exported to ${output}`);
console.log(`Total files: ${files.length}`);
```

---

## 📄 `package.json`

```json
{
  "name": "shopify-warehouse-app",
  "version": "1.0.0",
  "description": "Shopify Warehouse Management System with Picker, Transfer, and Packer",
  "main": "server/index.js",
  "engines": {
    "node": "18.x",
    "npm": "9.x"
  },
  "scripts": {
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "nodemon server/index.js",
    "client": "cd client && npm start",
    "build": "cd client && npm install && npm run build",
    "start": "node server/index.js",
    "setup-webhooks": "node server/scripts/setupWebhooks.js",
    "init-db": "node server/database/init-postgres.js"
  },
  "dependencies": {
    "@shopify/shopify-api": "^9.0.0",
    "axios": "^1.13.6",
    "better-sqlite3": "^9.2.2",
    "concurrently": "^8.2.2",
    "cors": "^2.8.5",
    "csv-parser": "^3.0.0",
    "date-fns": "^2.30.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.16.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}

```

---

## 📄 `PROJECT_STRUCTURE.md`

```markdown
# Project Structure

```
shopify-warehouse-app/
│
├── server/                          # 后端服务器
│   ├── database/
│   │   └── init.js                 # 数据库初始化和表结构
│   │
│   ├── middleware/
│   │   └── webhookVerification.js # Shopify webhook HMAC 验证
│   │
│   ├── routes/
│   │   ├── picker.js               # Picker API 路由
│   │   ├── transfer.js             # Transfer API 路由
│   │   ├── packer.js               # Packer API 路由
│   │   ├── settings.js             # Settings API 路由
│   │   └── webhooks.js             # Webhook 处理路由
│   │
│   ├── shopify/
│   │   └── client.js               # Shopify API 客户端
│   │
│   ├── scripts/
│   │   └── setupWebhooks.js        # Webhook 自动配置脚本
│   │
│   ├── webhooks/
│   │   └── orderHandler.js         # 订单 Webhook 业务逻辑
│   │
│   └── index.js                    # Express 服务器主入口
│
├── client/                          # React 前端应用
│   ├── public/
│   │   ├── index.html
│   │   └── favicon.ico
│   │
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.js        # 主页面
│   │   │   ├── Picker.js           # 拣货页面
│   │   │   ├── Transfer.js         # 调货页面
│   │   │   ├── Packer.js           # 打包订单列表
│   │   │   ├── OrderDetail.js      # 订单详情页面
│   │   │   └── Settings.js         # 设置页面
│   │   │
│   │   ├── App.js                  # React 根组件
│   │   ├── App.css                 # 全局样式
│   │   └── index.js                # React 入口
│   │
│   └── package.json                # 前端依赖
│
├── uploads/                         # CSV 上传临时目录
├── database.db                      # SQLite 数据库文件
├── .env                            # 环境变量配置
├── .env.example                    # 环境变量示例
├── .gitignore
├── package.json                    # 后端依赖和脚本
├── README.md                       # 项目说明文档
└── PROJECT_STRUCTURE.md            # 本文件
```

## 核心文件说明

### 后端核心文件

#### `server/index.js`
- Express 服务器主文件
- 配置中间件、路由
- 启动 HTTP 服务器

#### `server/database/init.js`
- 初始化 SQLite 数据库
- 创建所有表结构
- 插入默认数据（box types, settings）

#### `server/webhooks/orderHandler.js`
- 处理 Shopify 订单 webhooks
- 实现 create, update, cancel, fulfilled 逻辑
- 管理 line items 和 transfer items

#### `server/shopify/client.js`
- Shopify Admin API 封装
- 提供产品、订单、webhook 操作方法
- 处理 API 认证

### 前端核心文件

#### `client/src/App.js`
- React 应用根组件
- 配置 Polaris AppProvider
- 配置路由

#### `client/src/pages/Picker.js`
- 拣货功能界面
- 显示待拣货商品列表
- 处理商品状态变更（picking/picked/missing）
- 支持按类型排序和状态筛选

#### `client/src/pages/Transfer.js`
- 调货功能界面
- 显示缺货商品
- 录入调货信息（仓库来源、预计到货时间）
- 复制调货信息文本

#### `client/src/pages/Packer.js`
- 打包订单列表
- 显示所有未完成订单
- 状态管理（packing/waiting/ready/holding）

#### `client/src/pages/OrderDetail.js`
- 订单详情页面
- 显示订单所有商品
- 标记商品打包状态
- 处理重量警告
- 完成订单并设置箱型

#### `client/src/pages/Settings.js`
- 系统设置页面
- CSV 文件上传
- 配置 CSV 列映射
- 管理箱型（box types）

## 数据库表结构

### orders (订单表)
存储 Shopify 订单基本信息
- shopify_order_id (主键)
- order_number, name
- fulfillment_status
- total_quantity, subtotal_price
- shipping 地址信息
- status (packing/waiting/ready/holding)
- box_type, weight

### line_items (商品行表)
存储订单中的商品详情
- shopify_line_item_id (主键)
- quantity, image_url, title, brand, size
- weight, weight_unit, sku
- product_type, url_handle
- picker_status (picking/picked/missing)
- packer_status (packing/ready)

### transfer_items (调货表)
存储需要调货的商品
- line_item_id (外键)
- quantity
- transfer_from, estimate_month, estimate_day
- status (transferring/waiting/received/found)

### settings (设置表)
存储系统配置
- key (唯一键)
- value
- 包括：transfer_csv_column, picker_wig_column, csv_uploaded_at

### csv_data (CSV 数据表)
存储上传的 CSV 数据
- sku (唯一键)
- data (JSON 格式)

### box_types (箱型表)
存储可用的箱型
- code (唯一，如 A, B, C)
- dimensions (如 10x8x4)

## API 端点

### Picker API
- `GET /api/picker/items` - 获取所有待拣货商品
- `PATCH /api/picker/items/:id/status` - 更新商品状态
- `POST /api/picker/items/:id/split` - 拆分商品（部分缺货）

### Transfer API
- `GET /api/transfer/items` - 获取所有调货商品
- `PATCH /api/transfer/items/:id` - 更新调货信息
- `POST /api/transfer/items/:id/split` - 拆分调货数量
- `GET /api/transfer/items/:id/copy-text` - 获取复制文本
- `POST /api/transfer/items/bulk-delete` - 批量删除

### Packer API
- `GET /api/packer/orders` - 获取所有订单
- `GET /api/packer/orders/:shopifyOrderId` - 获取订单详情
- `PATCH /api/packer/orders/:shopifyOrderId/status` - 更新订单状态
- `PATCH /api/packer/items/:id/packer-status` - 更新商品打包状态
- `POST /api/packer/orders/:shopifyOrderId/complete` - 完成订单
- `PATCH /api/packer/items/:id/update-weight` - 更新商品重量

### Settings API
- `GET /api/settings` - 获取所有设置
- `POST /api/settings/update` - 更新设置
- `POST /api/settings/upload-csv` - 上传 CSV
- `GET /api/settings/box-types` - 获取箱型列表
- `POST /api/settings/box-types` - 添加箱型
- `DELETE /api/settings/box-types/:id` - 删除箱型
- `PATCH /api/settings/box-types/:id` - 更新箱型

### Webhook API
- `POST /api/webhooks/orders/create` - 订单创建
- `POST /api/webhooks/orders/updated` - 订单更新
- `POST /api/webhooks/orders/cancelled` - 订单取消
- `POST /api/webhooks/orders/fulfilled` - 订单完成

## 技术栈

### 后端
- **Node.js** - JavaScript 运行环境
- **Express** - Web 框架
- **SQLite (better-sqlite3)** - 轻量级数据库
- **axios** - HTTP 客户端
- **multer** - 文件上传中间件
- **csv-parser** - CSV 解析
- **dotenv** - 环境变量管理

### 前端
- **React 18** - UI 框架
- **React Router** - 路由管理
- **Shopify Polaris** - UI 组件库
- **axios** - HTTP 客户端

## 工作流程

1. **订单创建** (Webhook)
   - Shopify 发送 order/create webhook
   - 服务器接收并存储订单和商品到数据库
   - 商品自动出现在 Picker 列表

2. **拣货流程** (Picker)
   - 用户查看待拣货商品
   - 标记已拣取或缺货
   - 缺货商品自动转到 Transfer

3. **调货流程** (Transfer)
   - 用户查看缺货商品
   - 录入调货信息（来源仓库、到货日期）
   - 生成调货文本用于沟通

4. **打包流程** (Packer)
   - 用户查看订单列表
   - 点击订单进入详情
   - 逐个标记商品为已打包
   - 所有商品打包完成后选择箱型
   - 订单状态变为 Ready

5. **订单完成**
   - Ready 状态的订单可以发货
   - 可选：调用 Shopify API 标记为 fulfilled

## 环境变量说明

```env
# Shopify API 配置
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_access_token

# 服务器配置
PORT=3001
NODE_ENV=development

# 应用 URL（用于 webhook）
APP_URL=https://your-app-url.com

# 数据库路径
DATABASE_PATH=./database.db
```

## 部署注意事项

1. **生产环境**
   - 设置 `NODE_ENV=production`
   - 使用 HTTPS（webhook 要求）
   - 配置反向代理（nginx/Apache）
   - 使用 PM2 或类似工具管理进程

2. **Webhook 配置**
   - 确保 APP_URL 可公网访问
   - 运行 `npm run setup-webhooks` 自动配置
   - 或手动在 Shopify Admin 配置

3. **数据备份**
   - 定期备份 database.db
   - 备份上传的 CSV 文件

4. **安全性**
   - 保护 .env 文件
   - 启用 webhook HMAC 验证
   - 使用 HTTPS
   - 限制 API 访问
```

---

## 📄 `server\database\adapter.js`

```javascript
const sqlite3 = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');

const DB_TYPE = process.env.DATABASE_TYPE || 'sqlite';
const DATABASE_URL = process.env.DATABASE_URL;

class DatabaseAdapter {
  constructor() {
    if (DB_TYPE === 'postgres') {
      this.client = new Client({
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      this.type = 'postgres';
    } else {
      const dbPath = path.resolve(__dirname, '../../database.db');
      this.db = sqlite3(dbPath);
      this.type = 'sqlite';
    }
  }

  async connect() {
    if (this.type === 'postgres') {
      await this.client.connect();
    }
  }

  prepare(sql) {
    if (this.type === 'postgres') {
      return new PostgresStatement(this.client, sql);
    } else {
      return this.db.prepare(sql);
    }
  }

  async close() {
    if (this.type === 'postgres') {
      await this.client.end();
    } else {
      this.db.close();
    }
  }
}

class PostgresStatement {
  constructor(client, sql) {
    this.client = client;
    this.sql = this.convertSQLiteToPostgres(sql);
  }

  convertSQLiteToPostgres(sql) {
    // 转换 SQLite 语法到 PostgreSQL
    let converted = sql
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
      .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/REAL/gi, 'NUMERIC');
    
    // 转换 ? 为 $1, $2, $3...
    let paramCount = 0;
    converted = converted.replace(/\?/g, () => {
      paramCount++;
      return `$${paramCount}`;
    });
    
    return converted;
  }

  async run(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async get(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async all(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return result.rows;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseAdapter;
```

---

## 📄 `server\database\init-postgres.js`

```javascript
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

async function initPostgres() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  await client.connect();

  console.log('Initializing PostgreSQL database...');

  // Orders table
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      shopify_order_id TEXT UNIQUE NOT NULL,
      order_number TEXT NOT NULL,
      name TEXT NOT NULL,
      fulfillment_status TEXT,
      total_quantity INTEGER,
      subtotal_price TEXT,
      created_at TIMESTAMP,
      shipping_code TEXT,
      shipping_title TEXT,
      shipping_name TEXT,
      shipping_address1 TEXT,
      shipping_address2 TEXT,
      shipping_city TEXT,
      shipping_province TEXT,
      shipping_zip TEXT,
      shipping_country TEXT,
      status TEXT DEFAULT 'packing',
      box_type TEXT,
      weight NUMERIC,
      is_edited BOOLEAN DEFAULT FALSE,
      packer_note TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Line items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS line_items (
      id SERIAL PRIMARY KEY,
      shopify_order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      shopify_line_item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      image_url TEXT,
      title TEXT,
      name TEXT,
      brand TEXT,
      size TEXT,
      weight NUMERIC DEFAULT 0,
      weight_unit TEXT DEFAULT 'g',
      sku TEXT,
      url_handle TEXT,
      product_type TEXT,
      wig_number TEXT,
      custom_name TEXT,
      has_weight_warning INTEGER DEFAULT 0,
      variant_title TEXT,
      picker_status TEXT DEFAULT 'picking',
      packer_status TEXT DEFAULT 'packing',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transfer items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS transfer_items (
      id SERIAL PRIMARY KEY,
      line_item_id INTEGER NOT NULL,
      shopify_order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      image_url TEXT,
      title TEXT,
      name TEXT,
      brand TEXT,
      size TEXT,
      weight NUMERIC DEFAULT 0,
      weight_unit TEXT DEFAULT 'g',
      sku TEXT,
      url_handle TEXT,
      product_type TEXT,
      variant_title TEXT,
      custom_name TEXT,
      transfer_from TEXT,
      transfer_date TEXT,
      estimate_month INTEGER,
      estimate_day INTEGER,
      status TEXT DEFAULT 'transferring',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // CSV Data table
  await client.query(`
    CREATE TABLE IF NOT EXISTS csv_data (
      id SERIAL PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      data TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Box Types table
  await client.query(`
    CREATE TABLE IF NOT EXISTS box_types (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      dimensions TEXT,
      usage_count INTEGER DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🆕 Add new columns to existing tables (migrations)
  console.log('Running database migrations...');

  try {
    // Add packer_note to orders
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS packer_note TEXT
    `);
    console.log('✓ Added packer_note column to orders');
  } catch (error) {
    console.log('✓ Column packer_note already exists in orders');
  }

  try {
    // Add wig_number to line_items
    await client.query(`
      ALTER TABLE line_items ADD COLUMN IF NOT EXISTS wig_number TEXT
    `);
    console.log('✓ Added wig_number column to line_items');
  } catch (error) {
    console.log('✓ Column wig_number already exists in line_items');
  }

  try {
    // Add custom_name to line_items
    await client.query(`
      ALTER TABLE line_items ADD COLUMN IF NOT EXISTS custom_name TEXT
    `);
    console.log('✓ Added custom_name column to line_items');
  } catch (error) {
    console.log('✓ Column custom_name already exists in line_items');
  }

  try {
    // Add custom_name to transfer_items
    await client.query(`
      ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS custom_name TEXT
    `);
    console.log('✓ Added custom_name column to transfer_items');
  } catch (error) {
    console.log('✓ Column custom_name already exists in transfer_items');
  }

  try {
    // Add transfer_date to transfer_items
    await client.query(`
      ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS transfer_date TEXT
    `);
    console.log('✓ Added transfer_date column to transfer_items');
  } catch (error) {
    console.log('✓ Column transfer_date already exists in transfer_items');
  }

  try {
    // 🆕 Add usage_count to box_types
    await client.query(`
      ALTER TABLE box_types ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0
    `);
    console.log('✓ Added usage_count column to box_types');
  } catch (error) {
    console.log('✓ Column usage_count already exists in box_types');
  }

  try {
    // 🆕 Add quantity to box_types
    await client.query(`
      ALTER TABLE box_types ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0
    `);
    console.log('✓ Added quantity column to box_types');
  } catch (error) {
    console.log('✓ Column quantity already exists in box_types');
  }

  try {
    // 🆕 Add out_of_stock to transfer_items
    await client.query(`
      ALTER TABLE transfer_items ADD COLUMN IF NOT EXISTS out_of_stock INTEGER DEFAULT 0
    `);
    console.log('✓ Added out_of_stock column to transfer_items');
  } catch (error) {
    console.log('✓ Column out_of_stock already exists in transfer_items');
  }

  console.log('Migrations completed!');

  // Insert default box types ONLY if table is empty
  const boxTypeCountResult = await client.query('SELECT COUNT(*) as count FROM box_types');
  const boxTypeCount = parseInt(boxTypeCountResult.rows[0].count);

  if (boxTypeCount === 0) {
    console.log('Box types table is empty, inserting default values...');
    
    const boxTypes = [
      ['A', '5x20x5'],
      ['B', '18x10x4'],
      ['C', '18x10x5'],
      ['D', '18x12x4'],
      ['E', '18x12x8'],
      ['F', '18x14x5'],
      ['G', '26x8x8'],
      ['H', '12x6x6']
    ];

    for (const [code, dimensions] of boxTypes) {
      await client.query(
        'INSERT INTO box_types (code, dimensions, usage_count, quantity) VALUES ($1, $2, 0, 0)',
        [code, dimensions]
      );
    }
    
    console.log('✓ Default box types inserted');
  } else {
    console.log(`✓ Box types table already has ${boxTypeCount} entries, skipping defaults`);
  }

  // Insert default settings
  const settings = [
    ['transfer_csv_column', 'D'],
    ['picker_wig_column', 'E'],
    ['sku_column', 'A'],
    ['csv_uploaded_at', '']
  ];

  for (const [key, value] of settings) {
    await client.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // Indexes
  await client.query('CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON orders(shopify_order_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_shopify_order_id ON line_items(shopify_order_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_picker_status ON line_items(picker_status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_packer_status ON line_items(packer_status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_transfer_items_status ON transfer_items(status)');

  console.log('PostgreSQL database initialized successfully');

  await client.end();
}

if (require.main === module) {
  initPostgres().catch(console.error);
}

module.exports = initPostgres;
```

---

## 📄 `server\database\init.js`

```javascript
const DatabaseAdapter = require('./adapter');
const path = require('path');

const db = new DatabaseAdapter();

const initDatabase = async () => {
  try {
    if (db.type === 'postgres') {
      // PostgreSQL: 使用异步初始化
      await db.connect();
      const initPostgres = require('./init-postgres');
      await initPostgres();
      console.log('PostgreSQL database initialized successfully');
    } else {
      // SQLite: 同步初始化
      // Orders table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shopify_order_id TEXT UNIQUE NOT NULL,
          order_number TEXT NOT NULL,
          name TEXT NOT NULL,
          fulfillment_status TEXT,
          total_quantity INTEGER,
          subtotal_price TEXT,
          created_at TEXT,
          shipping_code TEXT,
          shipping_name TEXT,
          shipping_address1 TEXT,
          shipping_address2 TEXT,
          shipping_city TEXT,
          shipping_province TEXT,
          shipping_zip TEXT,
          shipping_country TEXT,
          status TEXT DEFAULT 'packing',
          box_type TEXT,
          weight TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Line Items table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS line_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shopify_order_id TEXT NOT NULL,
          order_number TEXT NOT NULL,
          shopify_line_item_id TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          image_url TEXT,
          title TEXT,
          name TEXT,
          brand TEXT,
          size TEXT,
          weight REAL,
          weight_unit TEXT,
          sku TEXT,
          url_handle TEXT,
          product_type TEXT,
          wig_number TEXT,
          has_weight_warning INTEGER DEFAULT 0,
          variant_title TEXT,
          picker_status TEXT DEFAULT 'picking',
          packer_status TEXT DEFAULT 'packing',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Transfer Items table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS transfer_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          line_item_id INTEGER NOT NULL,
          shopify_order_id TEXT NOT NULL,
          order_number TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          image_url TEXT,
          title TEXT,
          name TEXT,
          brand TEXT,
          size TEXT,
          weight REAL DEFAULT 0,
          weight_unit TEXT DEFAULT 'g',
          sku TEXT,
          url_handle TEXT,
          product_type TEXT,
          variant_title TEXT,
          transfer_from TEXT,
          estimate_month INTEGER,
          estimate_day INTEGER,
          transfer_date TEXT,
          out_of_stock INTEGER DEFAULT 0,
          status TEXT DEFAULT 'transferring',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 🆕 添加 out_of_stock 列（如果不存在）
      try {
        db.db.exec(`ALTER TABLE transfer_items ADD COLUMN out_of_stock INTEGER DEFAULT 0`);
        console.log('✓ Added out_of_stock column to transfer_items');
      } catch (error) {
        console.log('✓ Column out_of_stock already exists in transfer_items');
      }

      // Settings table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // CSV Data table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS csv_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT UNIQUE NOT NULL,
          data TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Box Types table
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS box_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          dimensions TEXT,
          usage_count INTEGER DEFAULT 0,
          quantity INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 🆕 添加 usage_count 列（如果表已存在但没有该列）
      try {
        db.db.exec(`ALTER TABLE box_types ADD COLUMN usage_count INTEGER DEFAULT 0`);
        console.log('✓ Added usage_count column to box_types');
      } catch (error) {
        // 列已存在，忽略错误
        console.log('✓ Column usage_count already exists in box_types');
      }

      // 🆕 添加 quantity 列（如果表已存在但没有该列）
      try {
        db.db.exec(`ALTER TABLE box_types ADD COLUMN quantity INTEGER DEFAULT 0`);
        console.log('✓ Added quantity column to box_types');
      } catch (error) {
        // 列已存在，忽略错误
        console.log('✓ Column quantity already exists in box_types');
      }

      // Insert default box types ONLY if table is empty
      const boxTypeCount = db.db.prepare('SELECT COUNT(*) as count FROM box_types').get();

      if (boxTypeCount.count === 0) {
        console.log('Box types table is empty, inserting default values...');
        
        const insertBoxType = db.db.prepare(`
          INSERT INTO box_types (code, dimensions, usage_count, quantity) VALUES (?, ?, 0, 0)
        `);

        insertBoxType.run('A', '5x20x5');
        insertBoxType.run('B', '18x10x4');
        insertBoxType.run('C', '18x10x5');
        insertBoxType.run('D', '18x12x4');
        insertBoxType.run('E', '18x12x8');
        insertBoxType.run('F', '18x14x5');
        insertBoxType.run('G', '26x8x8');
        insertBoxType.run('H', '12x6x6');
        
        console.log('✓ Default box types inserted');
      } else {
        console.log(`✓ Box types table already has ${boxTypeCount.count} entries, skipping defaults`);
      }

      // Insert default settings
      const insertSetting = db.db.prepare(`
        INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
      `);

      insertSetting.run('transfer_csv_column', 'D');
      insertSetting.run('picker_wig_column', 'E');
      insertSetting.run('sku_column', 'A');
      insertSetting.run('csv_uploaded_at', '');

      console.log('SQLite database initialized successfully');
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

initDatabase();

module.exports = db;
```

---

## 📄 `server\database\migrations.js`

```javascript
const db = require('./init');

console.log('Running database migrations...');

// 1. Add has_weight_warning column
try {
  db.prepare(`
    ALTER TABLE line_items ADD COLUMN has_weight_warning INTEGER DEFAULT 0
  `).run();
  console.log('✓ Added has_weight_warning column');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column has_weight_warning already exists');
  } else {
    console.error('✗ Error adding has_weight_warning:', error.message);
  }
}

// 2. Convert existing weights from kg to g if needed
try {
  const items = db.prepare('SELECT id, weight, weight_unit FROM line_items').all();
  
  let converted = 0;
  for (const item of items) {
    if (item.weight && item.weight > 0 && item.weight < 10 && item.weight_unit === 'kg') {
      // Likely stored as kg, convert to g
      const weightInGrams = item.weight * 1000;
      db.prepare('UPDATE line_items SET weight = ?, weight_unit = ? WHERE id = ?')
        .run(weightInGrams, 'g', item.id);
      converted++;
    }
  }
  
  if (converted > 0) {
    console.log(`✓ Converted ${converted} items from kg to g`);
  }
} catch (error) {
  console.error('✗ Error converting weights:', error.message);
}

// 3. Set has_weight_warning for existing records
try {
  const result = db.prepare(`
    UPDATE line_items 
    SET has_weight_warning = 1 
    WHERE weight = 0 OR weight_unit != 'g'
  `).run();
  
  console.log(`✓ Marked ${result.changes} items with weight warnings`);
} catch (error) {
  console.error('✗ Error setting weight warnings:', error.message);
}

// 🆕 4. Add wig_number column to line_items
try {
  db.prepare(`
    ALTER TABLE line_items ADD COLUMN wig_number TEXT
  `).run();
  console.log('✓ Added wig_number column to line_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column wig_number already exists in line_items');
  } else {
    console.error('✗ Error adding wig_number to line_items:', error.message);
  }
}

// 🆕 5. Add custom_name column to line_items
try {
  db.prepare(`
    ALTER TABLE line_items ADD COLUMN custom_name TEXT
  `).run();
  console.log('✓ Added custom_name column to line_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column custom_name already exists in line_items');
  } else {
    console.error('✗ Error adding custom_name to line_items:', error.message);
  }
}

// 🆕 6. Add custom_name column to transfer_items
try {
  db.prepare(`
    ALTER TABLE transfer_items ADD COLUMN custom_name TEXT
  `).run();
  console.log('✓ Added custom_name column to transfer_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column custom_name already exists in transfer_items');
  } else {
    console.error('✗ Error adding custom_name to transfer_items:', error.message);
  }
}

// 🆕 7. Add transfer_date column to transfer_items
try {
  db.prepare(`
    ALTER TABLE transfer_items ADD COLUMN transfer_date TEXT
  `).run();
  console.log('✓ Added transfer_date column to transfer_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column transfer_date already exists in transfer_items');
  } else {
    console.error('✗ Error adding transfer_date to transfer_items:', error.message);
  }
}

// 🆕 8. Add packer_note column to orders
try {
  db.prepare(`
    ALTER TABLE orders ADD COLUMN packer_note TEXT
  `).run();
  console.log('✓ Added packer_note column to orders');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column packer_note already exists in orders');
  } else {
    console.error('✗ Error adding packer_note to orders:', error.message);
  }
}

console.log('Migration completed!');
```

---

## 📄 `server\index.js`

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/init');

// Import routes
const pickerRoutes = require('./routes/picker');
const transferRoutes = require('./routes/transfer');
const packerRoutes = require('./routes/packer');
const settingsRoutes = require('./routes/settings');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/picker', pickerRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/packer', packerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhookRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
```

---

## 📄 `server\middleware\webhookVerification.js`

```javascript
const crypto = require('crypto');

// Verify Shopify webhook HMAC
const verifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  
  if (!hmacHeader) {
    console.warn('No HMAC header found in webhook request');
    return res.status(401).send('Unauthorized');
  }

  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  if (hash !== hmacHeader) {
    console.warn('HMAC verification failed');
    return res.status(401).send('Unauthorized');
  }

  next();
};

module.exports = verifyWebhook;
```

---

## 📄 `server\routes\packer.js`

```javascript
const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Unified function to calculate order status
function calculateOrderStatus(order, lineItems, transferItems) {
  if (order.status === 'holding') {
    return 'holding';
  }

  // 如果有 transferring 或 waiting 状态的 transfer item，订单状态为 waiting
  const waitingOrTransferringItems = transferItems.filter(ti => 
    ti.status === 'waiting' || ti.status === 'transferring'
  );
  if (waitingOrTransferringItems.length > 0) {
    return 'waiting';
  }

  const allReady = lineItems.length > 0 && lineItems.every(item => item.packer_status === 'ready');
  if (allReady) {
    return 'ready';
  }

  return 'packing';
}

// Get all orders for packer
router.get('/orders', async (req, res) => {
  try {
    const orders = await db.prepare(`
      SELECT * FROM orders 
      WHERE fulfillment_status != 'fulfilled'
      ORDER BY created_at DESC
    `).all();

    const ordersWithDetails = await Promise.all(orders.map(async (order) => {
      const lineItems = await db.prepare(`
        SELECT * FROM line_items 
        WHERE shopify_order_id = ?
        ORDER BY id
      `).all(order.shopify_order_id);

      const transferItems = await db.prepare(`
        SELECT ti.*, li.id as line_item_id
        FROM transfer_items ti
        JOIN line_items li ON ti.line_item_id = li.id
        WHERE ti.shopify_order_id = ?
      `).all(order.shopify_order_id);

      // 使用永久标记检查 weight warning
      const hasWeightWarning = lineItems.some(item => item.has_weight_warning === 1);

      // 🆕 检查是否有 out_of_stock items
      const hasOutOfStock = transferItems.some(ti => ti.out_of_stock === 1);

      const orderStatus = calculateOrderStatus(order, lineItems, transferItems);

      let transferInfo = null;
      // 获取所有 waiting 状态的 item
      const waitingItems = transferItems.filter(ti => ti.status === 'waiting');
      
      if (waitingItems.length > 0) {
        const totalQuantity = waitingItems.reduce((sum, item) => sum + item.quantity, 0);
        
        // 获取所有不同的 transfer_from，去重并过滤空值
        const transferFroms = [...new Set(waitingItems.map(item => item.transfer_from))].filter(Boolean);
        
        // 找到最晚的日期
        const latestDate = waitingItems.reduce((latest, item) => {
          if (!item.estimate_month || !item.estimate_day) return latest;
          const itemDate = item.estimate_month * 100 + item.estimate_day;
          return itemDate > latest ? itemDate : latest;
        }, 0);

        transferInfo = {
          quantity: totalQuantity,
          transferFroms: transferFroms, // 所有的 transfer_from
          estimateMonth: Math.floor(latestDate / 100),
          estimateDay: latestDate % 100
        };
      }

      const transferringItems = transferItems.filter(ti => ti.status === 'transferring');

      return {
        ...order,
        lineItems,
        hasWeightWarning,
        hasOutOfStock, // 🆕 添加 out of stock 标记
        orderStatus,
        hasTransferring: transferringItems.length > 0,
        hasWaiting: waitingItems.length > 0,
        transferInfo
      };
    }));

    res.json(ordersWithDetails);
  } catch (error) {
    console.error('Error fetching packer orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders: ' + error.message });
  }
});

// Get single order details
router.get('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    
    const order = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const lineItems = await db.prepare(`
      SELECT * FROM line_items 
      WHERE shopify_order_id = ?
      ORDER BY id
    `).all(shopifyOrderId);

    const lineItemsWithTransfer = await Promise.all(lineItems.map(async (item) => {
      const transferItem = await db.prepare(`
        SELECT * FROM transfer_items 
        WHERE line_item_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(item.id);

      return {
        ...item,
        transferStatus: transferItem?.status || null,
        outOfStock: transferItem?.out_of_stock === 1, // 🆕 添加 out of stock 状态
        transferInfo: transferItem ? {
          transferFrom: transferItem.transfer_from,
          estimateMonth: transferItem.estimate_month,
          estimateDay: transferItem.estimate_day,
          quantity: transferItem.quantity
        } : null
      };
    }));

    res.json({
      ...order,
      lineItems: lineItemsWithTransfer
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details: ' + error.message });
  }
});

// Update order status (holding/packing)
router.patch('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

router.patch('/orders/:shopifyOrderId/status', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

// 🆕 Add or update note
router.patch('/orders/:shopifyOrderId/note', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { note } = req.body;

    // Note 可以为空字符串（删除 note）
    if (note === undefined) {
      return res.status(400).json({ error: 'Note is required' });
    }

    // 限制 50 字符
    if (note.length > 50) {
      return res.status(400).json({ error: 'Note must be 50 characters or less' });
    }

    await db.prepare(`
      UPDATE orders 
      SET packer_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(note, shopifyOrderId);

    res.json({ success: true, note });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note: ' + error.message });
  }
});

// 🆕 Delete order (完全从 APP 中删除订单)
router.delete('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;

    console.log(`Deleting order ${shopifyOrderId} from APP`);

    // ⚠️ 不删除 transfer_items！
    // await db.prepare('DELETE FROM transfer_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 line_items
    await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 order
    await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);

    console.log(`✓ Order ${shopifyOrderId} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order: ' + error.message });
  }
});

router.patch('/items/:id/packer-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE line_items 
      SET packer_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item packer status:', error);
    res.status(500).json({ error: 'Failed to update item status: ' + error.message });
  }
});

// 🆕 Complete 订单时同时减少 box quantity 并更新 Shopify metafield
router.post('/orders/:shopifyOrderId/complete', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { boxType, weight } = req.body;

    console.log('\n========== ORDER COMPLETION START ==========');
    console.log(`Shopify Order ID parameter: ${shopifyOrderId}`);

    if (!boxType) {
      return res.status(400).json({ error: 'Box type is required' });
    }

    // 获取订单信息
    const order = await db.prepare(
      'SELECT * FROM orders WHERE shopify_order_id = ?'
    ).get(shopifyOrderId);

    if (!order) {
      console.log('✗ Order not found in database');
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`Order found: ${order.name}`);
    console.log(`shopify_order_id from DB: ${order.shopify_order_id}`);

    // 更新订单状态
    await db.prepare(`
      UPDATE orders 
      SET box_type = ?, weight = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(boxType, weight || null, shopifyOrderId);

    // 更新 box type 使用统计
    await db.prepare(`
      UPDATE box_types 
      SET usage_count = usage_count + 1,
          quantity = CASE WHEN quantity > 0 THEN quantity - 1 ELSE quantity END
      WHERE code = ?
    `).run(boxType);

    console.log(`✓ Box type ${boxType} usage count updated and quantity decreased`);

    // 🆕 更新 Shopify Order Metafield
    try {
      // 从 shopify_order_id 中提取真正的 Shopify Order ID
      // 格式：gid://shopify/Order/7109941887286 → 7109941887286
      let realShopifyOrderId = shopifyOrderId;
      
      if (shopifyOrderId.includes('gid://shopify/Order/')) {
        realShopifyOrderId = shopifyOrderId.split('gid://shopify/Order/')[1];
        console.log(`Extracted Shopify Order ID from GID: ${realShopifyOrderId}`);
      } else if (shopifyOrderId.includes('/')) {
        // 如果还有其他斜杠格式，取最后一部分
        realShopifyOrderId = shopifyOrderId.split('/').pop();
        console.log(`Extracted Shopify Order ID from path: ${realShopifyOrderId}`);
      }

      console.log(`Using Shopify Order ID for metafield: ${realShopifyOrderId}`);

      const shopifyClient = require('../shopify/client');
      
      // 更新 ready metafield
      const result = await shopifyClient.updateOrderMetafield(
        realShopifyOrderId,
        'custom',
        'ready',
        'true',
        'boolean'
      );
      
      console.log(`✓ Shopify metafield 'ready' updated successfully for Order ${order.name}`);
      console.log(`Metafield ID: ${result.id}`);
      
      // 🆕 更新 packed_time metafield（当前日期和时间）
      const packedTime = new Date().toISOString();
      const packedTimeResult = await shopifyClient.updateOrderMetafield(
        realShopifyOrderId,
        'custom',
        'packed_time',
        packedTime,
        'date_time'
      );
      
      console.log(`✓ Shopify metafield 'packed_time' updated: ${packedTime}`);
      console.log(`Metafield ID: ${packedTimeResult.id}`);
      
      // 🆕 更新 custom.package metafield (box type)
      const packageResult = await shopifyClient.updateOrderMetafield(
        realShopifyOrderId,
        'custom',
        'package',
        boxType,
        'single_line_text_field'
      );
      
      console.log(`✓ Shopify metafield 'package' updated: ${boxType}`);
      console.log(`Metafield ID: ${packageResult.id}`);
      
      // 🆕 更新 custom.weight metafield (如果有输入)
      if (weight) {
        const weightResult = await shopifyClient.updateOrderMetafield(
          realShopifyOrderId,
          'custom',
          'weight',
          JSON.stringify({
            value: parseFloat(weight),
            unit: 'g'
          }),
          'weight'
        );
        
        console.log(`✓ Shopify metafield 'weight' updated: ${weight}g`);
        console.log(`Metafield ID: ${weightResult.id}`);
      } else {
        console.log(`⚠️ No weight provided, skipping weight metafield`);
      }
    } catch (metafieldError) {
      console.error('⚠️ Error updating Shopify metafield (non-critical):', metafieldError.message);
      if (metafieldError.response) {
        console.error('Response status:', metafieldError.response.status);
        console.error('Response data:', JSON.stringify(metafieldError.response.data, null, 2));
      }
      // 不阻止主流程
    }

    console.log('========== ORDER COMPLETION END ==========\n');

    res.json({ success: true });
  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).json({ error: 'Failed to complete order: ' + error.message });
  }
});

router.patch('/items/:id/update-weight', async (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    console.log('\n========== WEIGHT UPDATE REQUEST ==========');
    console.log(`Item ID: ${id}`);
    console.log(`New weight: ${weight}g`);

    if (!weight || weight <= 0) {
      console.log('✗ Invalid weight value');
      return res.status(400).json({ error: 'Valid weight is required' });
    }

    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      console.log('✗ Item not found in database');
      return res.status(404).json({ error: 'Item not found' });
    }

    console.log('Item details:');
    console.log(`  SKU: ${item.sku || 'N/A'}`);
    console.log(`  Brand: ${item.brand || 'N/A'}`);
    console.log(`  Title: ${item.title || 'N/A'}`);
    console.log(`  Current weight: ${item.weight}${item.weight_unit}`);
    console.log(`  Has weight warning: ${item.has_weight_warning}`);

    // 只更新 weight 和 weight_unit，不改变 has_weight_warning
    await db.prepare(`
      UPDATE line_items 
      SET weight = ?, weight_unit = 'g', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(weight, id);

    console.log('✓ Local database updated successfully');

    let shopifyUpdateSuccess = false;
    let shopifyError = null;

    if (item.sku) {
      try {
        console.log(`\nAttempting Shopify update for SKU: ${item.sku}`);
        const shopifyClient = require('../shopify/client');
        const result = await shopifyClient.updateVariantWeightBySku(item.sku, weight);
        shopifyUpdateSuccess = true;
        console.log('✓ Shopify update SUCCESS');
        console.log('Updated variant details:');
        console.log(`  Variant ID: ${result.id}`);
        console.log(`  Weight: ${result.weight}${result.weight_unit}`);
      } catch (shopifyErr) {
        shopifyError = shopifyErr.message;
        console.error('✗ Shopify update FAILED');
        console.error('Error message:', shopifyErr.message);
        if (shopifyErr.response) {
          console.error('Response status:', shopifyErr.response.status);
          console.error('Response data:', JSON.stringify(shopifyErr.response.data, null, 2));
        }
        console.error('Full error stack:', shopifyErr.stack);
      }
    } else {
      console.log('⚠ No SKU found for this item, skipping Shopify update');
    }

    console.log('========================================\n');

    res.json({ 
      success: true,
      shopifyUpdated: shopifyUpdateSuccess,
      shopifyError: shopifyError
    });
  } catch (error) {
    console.error('Error updating weight:', error);
    res.status(500).json({ error: 'Failed to update weight: ' + error.message });
  }
});

module.exports = router;
```

---

## 📄 `server\routes\picker.js`

```javascript
const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

// 🆕 批量查询多个 SKU 在 MTL10 的库存
async function getBatchMTL10Inventory(skus) {
  try {
    if (!skus || skus.length === 0) return {};
    
    // 去重 SKU
    const uniqueSkus = [...new Set(skus.filter(sku => sku))];
    
    if (uniqueSkus.length === 0) return {};
    
    console.log(`📦 Fetching MTL10 inventory for ${uniqueSkus.length} SKUs`);
    
    // 使用 GraphQL 批量查询（每次最多 50 个）
    const results = {};
    const batchSize = 50;
    
    for (let i = 0; i < uniqueSkus.length; i += batchSize) {
      const batch = uniqueSkus.slice(i, i + batchSize);
      
      // 构建查询字符串：(sku:123 OR sku:456 OR sku:789)
      const skuQuery = batch.map(sku => `sku:${sku}`).join(' OR ');
      
      const query = `
        query getInventoryBatch($query: String!) {
          productVariants(first: 50, query: $query) {
            edges {
              node {
                id
                sku
                metafields(first: 10, namespace: "custom") {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
                product {
                  id
                }
                inventoryItem {
                  id
                  inventoryLevels(first: 50) {
                    edges {
                      node {
                        location {
                          name
                        }
                        quantities(names: ["on_hand"]) {
                          name
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await shopifyClient.client.post('/graphql.json', {
        query,
        variables: { query: skuQuery }
      });

      const edges = response.data.data?.productVariants?.edges || [];
      
      // 处理每个 variant
      edges.forEach(edge => {
        const sku = edge.node.sku;
        const inventoryLevels = edge.node.inventoryItem?.inventoryLevels?.edges || [];
        
        // 🆕 从 variant metafields 提取 discontinued（不是 product）
        const metafields = edge.node.metafields?.edges || [];
        
        // 🔍 调试：打印所有 metafields
        console.log(`\n=== SKU ${sku} - All Metafields ===`);
        console.log(`Total metafields: ${metafields.length}`);
        metafields.forEach((mf, index) => {
          console.log(`  [${index}] key: "${mf.node.key}", value: "${mf.node.value}" (type: ${typeof mf.node.value})`);
        });
        
        const discontinuedMetafield = metafields.find(m => m.node.key === 'discontinued');
        
        // 调试：打印 discontinued metafield
        if (discontinuedMetafield) {
          console.log(`✓ Found discontinued metafield:`, discontinuedMetafield.node);
          console.log(`  Raw value: ${discontinuedMetafield.node.value}`);
          console.log(`  Type: ${typeof discontinuedMetafield.node.value}`);
        } else {
          console.log(`✗ No discontinued metafield found`);
        }
        
        // 忽略大小写判断：true, True, TRUE 都算 true
        let isDiscontinued = false;
        if (discontinuedMetafield?.node?.value) {
          const value = discontinuedMetafield.node.value;
          // 布尔值 true 或字符串 "true" (忽略大小写)
          isDiscontinued = value === true || 
                          String(value).toLowerCase() === 'true';
        }
        
        console.log(`Final result - isDiscontinued: ${isDiscontinued}`);
        
        // 查找 MTL10 的库存
        for (const level of inventoryLevels) {
          if (level.node.location.name === 'MTL10') {
            const onHandQty = level.node.quantities?.find(q => q.name === 'on_hand');
            if (onHandQty) {
              results[sku] = {
                quantity: onHandQty.quantity,
                discontinued: isDiscontinued
              };
            }
            break;
          }
        }
        
        // 如果没有 MTL10 库存但有 discontinued 信息，也记录
        if (!results[sku] && isDiscontinued) {
          results[sku] = {
            quantity: 0,
            discontinued: true
          };
        }
      });
      
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: Processed ${batch.length} SKUs`);
    }
    
    console.log(`✓ Fetched MTL10 inventory for ${Object.keys(results).length}/${uniqueSkus.length} SKUs`);
    return results;
  } catch (error) {
    console.error('❌ Error fetching batch MTL10 inventory:', error.message);
    return {};
  }
}

// Get all line items for picker
router.get('/items', async (req, res) => {
  try {
    const items = await db.prepare(`
      SELECT 
        li.*,
        o.name as order_name,
        o.shipping_code
      FROM line_items li
      JOIN orders o ON li.shopify_order_id = o.shopify_order_id
      WHERE o.fulfillment_status != 'fulfilled'
      ORDER BY li.created_at DESC
    `).all();

    // 🆕 处理 WIG 类型的显示
    const processedItems = items.map(item => {
      let displayType = item.product_type;
      
      // 如果是 WIG 类型且有 wig_number，用 wig_number 替换显示
      if (item.product_type && item.product_type.toUpperCase() === 'WIG' && item.wig_number) {
        displayType = item.wig_number;
        console.log(`Replaced WIG with ${displayType} for item ${item.id}`);
      }

      return {
        ...item,
        display_type: displayType,
        sort_type: item.product_type // 排序时仍使用原始的 product_type
      };
    });

    res.json(processedItems);
  } catch (error) {
    console.error('Error fetching picker items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item status
router.patch('/items/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.prepare(`
      UPDATE line_items 
      SET picker_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    // If status is 'missing', create transfer item
    if (status === 'missing') {
      const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
      
      await db.prepare(`
        INSERT INTO transfer_items (
          line_item_id, shopify_order_id, order_number, quantity, sku, 
          image_url, title, name, brand, size, weight, weight_unit,
          url_handle, product_type, variant_title, custom_name, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
      `).run(
        item.id, item.shopify_order_id, item.order_number, item.quantity, item.sku,
        item.image_url, item.title, item.name, item.brand, item.size, item.weight, item.weight_unit,
        item.url_handle, item.product_type, item.variant_title, item.custom_name
      );
    }

    // 🆕 当状态从 'missing' 改为 'picked' 时，不删除 transfer_items
    // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
    // if (status === 'picked') {
    //   await db.prepare('DELETE FROM transfer_items WHERE line_item_id = ?').run(id);
    // }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Split item (when quantity > 1 and partially picked)
router.post('/items/:id/split', async (req, res) => {
  try {
    const { id } = req.params;
    const { pickedQuantity } = req.body;

    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const missingQuantity = item.quantity - pickedQuantity;

    // Update original item to picked quantity
    await db.prepare(`
      UPDATE line_items 
      SET quantity = ?, picker_status = 'picked', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(pickedQuantity, id);

    // Create new item for missing quantity
    const newItem = await db.prepare(`
      INSERT INTO line_items (
        shopify_order_id, order_number, shopify_line_item_id, quantity,
        image_url, title, name, brand, size, weight, weight_unit, sku,
        url_handle, product_type, wig_number, custom_name, has_weight_warning, 
        variant_title, picker_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'missing', CURRENT_TIMESTAMP)
      RETURNING id
    `).get(
      item.shopify_order_id,
      item.order_number,
      item.shopify_line_item_id + '_split_' + Date.now(),
      missingQuantity,
      item.image_url,
      item.title,
      item.name,
      item.brand,
      item.size,
      item.weight,
      item.weight_unit,
      item.sku,
      item.url_handle,
      item.product_type,
      item.wig_number,
      item.custom_name,
      item.has_weight_warning,
      item.variant_title
    );

    // Create transfer item for missing quantity
    await db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku,
        image_url, title, name, brand, size, weight, weight_unit,
        url_handle, product_type, variant_title, custom_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
    `).run(
      newItem.id, item.shopify_order_id, item.order_number, missingQuantity, item.sku,
      item.image_url, item.title, item.name, item.brand, item.size, item.weight, item.weight_unit,
      item.url_handle, item.product_type, item.variant_title, item.custom_name
    );

    res.json({ success: true, newItemId: newItem.id });
  } catch (error) {
    console.error('Error splitting item:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 批量获取 MTL10 库存
router.post('/items/batch-mtl10-inventory', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.json({ inventory: {} });
    }
    
    console.log(`\n📦 Batch MTL10 inventory request for ${itemIds.length} items`);
    
    // 获取所有 items 的 SKU
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT id, sku FROM line_items WHERE id IN (${placeholders})`
    ).all(...itemIds);
    
    console.log(`  Found ${items.length} items in database`);
    
    // 提取所有 SKU
    const skus = items.map(item => item.sku).filter(sku => sku);
    
    if (skus.length === 0) {
      console.log(`  No SKUs to query`);
      return res.json({ inventory: {} });
    }
    
    // 批量查询 MTL10 库存
    const inventoryBySku = await getBatchMTL10Inventory(skus);
    
    // 将结果映射回 item ID
    const inventoryByItemId = {};
    items.forEach(item => {
      if (item.sku && inventoryBySku[item.sku] !== undefined) {
        inventoryByItemId[item.id] = inventoryBySku[item.sku];
      }
    });
    
    console.log(`✓ Returning inventory for ${Object.keys(inventoryByItemId).length} items\n`);
    
    res.json({ inventory: inventoryByItemId });
  } catch (error) {
    console.error('❌ Error in batch MTL10 inventory:', error);
    res.json({ inventory: {} });
  }
});

// 🆕 检查已完成的订单（用于 Clean 功能）
router.get('/check-fulfilled-orders', async (req, res) => {
  try {
    console.log('\n🧹 Checking for fulfilled orders...');
    
    // 获取所有在 Picker 中的 items 及其订单信息
    const items = await db.prepare(`
      SELECT 
        li.id,
        li.shopify_order_id,
        li.quantity,
        li.name,
        o.name as order_name,
        o.fulfillment_status
      FROM line_items li
      JOIN orders o ON li.shopify_order_id = o.shopify_order_id
      WHERE o.fulfillment_status != 'fulfilled'
    `).all();
    
    console.log(`  Found ${items.length} items in picker`);
    
    // 获取所有唯一的订单
    const uniqueOrders = [...new Set(items.map(item => item.shopify_order_id))];
    
    console.log(`  Checking ${uniqueOrders.length} unique orders in Shopify...`);
    
    // 查询 Shopify 获取最新的 fulfillment status
    const ordersToClean = [];
    const itemsToClean = [];
    
    for (const shopifyOrderId of uniqueOrders) {
      try {
        // 使用 REST API 查询订单状态
        const response = await shopifyClient.client.get(`/orders/${shopifyOrderId}.json`);
        const order = response.data.order;
        
        // 如果订单已完成（fulfillment_status 不是 null 且不是 unfulfilled）
        if (order.fulfillment_status && order.fulfillment_status !== 'unfulfilled') {
          console.log(`  ✓ Order ${order.name} is ${order.fulfillment_status}`);
          
          // 找到该订单的所有 items
          const orderItems = items.filter(item => item.shopify_order_id === shopifyOrderId);
          
          ordersToClean.push({
            shopify_order_id: shopifyOrderId,
            order_name: order.name,
            fulfillment_status: order.fulfillment_status,
            item_count: orderItems.length,
            total_quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0)
          });
          
          itemsToClean.push(...orderItems.map(item => item.id));
        }
      } catch (error) {
        console.error(`  ❌ Error checking order ${shopifyOrderId}:`, error.message);
      }
    }
    
    console.log(`✓ Found ${ordersToClean.length} orders to clean with ${itemsToClean.length} items\n`);
    
    res.json({
      orders: ordersToClean,
      item_ids: itemsToClean,
      total_items: itemsToClean.length,
      total_quantity: ordersToClean.reduce((sum, order) => sum + order.total_quantity, 0)
    });
  } catch (error) {
    console.error('❌ Error checking fulfilled orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 清理已完成订单的 items
router.post('/clean-fulfilled-items', async (req, res) => {
  try {
    const { item_ids } = req.body;
    
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.json({ success: true, deleted_count: 0 });
    }
    
    console.log(`\n🗑️ Cleaning ${item_ids.length} items from picker...`);
    
    // 删除 items
    const placeholders = item_ids.map(() => '?').join(',');
    const result = await db.prepare(
      `DELETE FROM line_items WHERE id IN (${placeholders})`
    ).run(...item_ids);
    
    console.log(`✓ Deleted ${result.changes} items\n`);
    
    res.json({
      success: true,
      deleted_count: result.changes
    });
  } catch (error) {
    console.error('❌ Error cleaning fulfilled items:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## 📄 `server\routes\settings.js`

```javascript
const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const db = require('../database/init');

// 使用内存存储而不是磁盘
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settingsRows = await db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key] = row.value;
    });

    const boxTypes = await db.prepare('SELECT * FROM box_types ORDER BY code').all();

    res.json({ settings, boxTypes });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings: ' + error.message });
  }
});

// Test endpoint to check CSV data
router.get('/test-csv/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const csvData = await db.prepare('SELECT * FROM csv_data WHERE sku = ?').get(sku);
    
    if (csvData) {
      res.json({
        found: true,
        sku: csvData.sku,
        data: JSON.parse(csvData.data)
      });
    } else {
      const totalCount = await db.prepare('SELECT COUNT(*) as count FROM csv_data').get();
      res.json({ 
        found: false, 
        sku,
        totalRecordsInDb: totalCount.count
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
router.post('/update', async (req, res) => {
  try {
    const { transferCsvColumn, pickerWigColumn, skuColumn } = req.body;

    if (transferCsvColumn) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('transfer_csv_column', transferCsvColumn.toUpperCase());
    }

    if (pickerWigColumn) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('picker_wig_column', pickerWigColumn.toUpperCase());
    }

    if (skuColumn) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('sku_column', skuColumn.toUpperCase());
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings: ' + error.message });
  }
});

// Upload CSV file
router.post('/upload-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('CSV upload started');
    const results = [];

    // 从内存缓冲区创建可读流
    const bufferStream = Readable.from(req.file.buffer);

    bufferStream
      .pipe(csv({ headers: false }))
      .on('data', (data) => {
        const rowArray = Object.values(data);
        results.push(rowArray);
      })
      .on('end', async () => {
        try {
          console.log(`Total rows in CSV: ${results.length}`);
          
          if (results.length === 0) {
            throw new Error('CSV file is empty');
          }

          const startTime = Date.now();
          
          // Skip first row (headers)
          const dataRows = results.slice(1);
          console.log(`Processing ${dataRows.length} data rows...`);

          // Clear existing CSV data
          await db.prepare('DELETE FROM csv_data').run();

          let importedCount = 0;
          let skippedCount = 0;

          for (const rowArray of dataRows) {
            // Convert array to object with letter keys
            const row = {};
            rowArray.forEach((value, idx) => {
              const letter = String.fromCharCode(65 + idx);
              row[letter] = value || '';
            });
            
            const skuA = row['A']?.trim();
            const skuB = row['B']?.trim();
            
            // Insert with SKU from column A
            if (skuA && skuA !== '') {
              await db.prepare(`
                INSERT INTO csv_data (sku, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (sku) DO NOTHING
              `).run(skuA, JSON.stringify(row));
              importedCount++;
            }
            
            // Insert with SKU from column B (if different)
            if (skuB && skuB !== '' && skuB !== skuA) {
              await db.prepare(`
                INSERT INTO csv_data (sku, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (sku) DO NOTHING
              `).run(skuB, JSON.stringify(row));
              importedCount++;
            }
            
            if ((!skuA || skuA === '') && (!skuB || skuB === '')) {
              skippedCount++;
            }
          }

          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`CSV import complete in ${duration}s: ${importedCount} records imported, ${skippedCount} rows skipped`);

          // Update upload timestamp
          await db.prepare(`
            INSERT INTO settings (key, value, updated_at)
            VALUES ('csv_uploaded_at', ?, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = CURRENT_TIMESTAMP
          `).run(new Date().toISOString());

          res.json({
            success: true,
            rowsImported: importedCount,
            rowsSkipped: skippedCount,
            totalRows: dataRows.length,
            uploadedAt: new Date().toISOString(),
            duration: duration + 's'
          });
        } catch (error) {
          console.error('Error processing CSV data:', error);
          res.status(500).json({ error: 'Error processing CSV data: ' + error.message });
        }
      })
      .on('error', (error) => {
        console.error('Error parsing CSV:', error);
        res.status(500).json({ error: 'Error parsing CSV file: ' + error.message });
      });

  } catch (error) {
    console.error('Error uploading CSV:', error);
    res.status(500).json({ error: 'Failed to upload CSV: ' + error.message });
  }
});

// Get box types
router.get('/box-types', async (req, res) => {
  try {
    const boxTypes = await db.prepare('SELECT * FROM box_types ORDER BY code').all();
    res.json(boxTypes);
  } catch (error) {
    console.error('Error fetching box types:', error);
    res.status(500).json({ error: 'Failed to fetch box types: ' + error.message });
  }
});

// Add box type
router.post('/box-types', async (req, res) => {
  try {
    const { code, dimensions } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    await db.prepare(`
      INSERT INTO box_types (code, dimensions, usage_count, quantity)
      VALUES (?, ?, 0, 0)
    `).run(code.toUpperCase().trim(), dimensions || '');

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error adding box type:', error);
    res.status(500).json({ error: 'Failed to add box type: ' + error.message });
  }
});

// Update box type
router.patch('/box-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, dimensions, quantity } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    // 🆕 quantity 可以为 undefined（不更新），但如果提供了必须是有效数字
    if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
      return res.status(400).json({ error: 'Quantity must be a valid non-negative number' });
    }

    // 🆕 如果提供了 quantity，也更新它
    if (quantity !== undefined) {
      await db.prepare(`
        UPDATE box_types
        SET code = ?, dimensions = ?, quantity = ?
        WHERE id = ?
      `).run(code.toUpperCase().trim(), dimensions || '', quantity, id);
    } else {
      await db.prepare(`
        UPDATE box_types
        SET code = ?, dimensions = ?
        WHERE id = ?
      `).run(code.toUpperCase().trim(), dimensions || '', id);
    }

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error updating box type:', error);
    res.status(500).json({ error: 'Failed to update box type: ' + error.message });
  }
});

// Delete box type
router.delete('/box-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM box_types WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Box type not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting box type:', error);
    res.status(500).json({ error: 'Failed to delete box type: ' + error.message });
  }
});

const { cleanupOldData } = require('../utils/cleanup');

// 手动触发清理
router.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupOldData();
    res.json({
      success: true,
      message: `Cleaned up ${result.deleted} orders`,
      deletedOrders: result.orders
    });
  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看即将被清理的数据
router.get('/cleanup-preview', async (req, res) => {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const oldOrders = await db.prepare(`
      SELECT shopify_order_id, name, created_at, fulfillment_status 
      FROM orders 
      WHERE created_at < ?
      ORDER BY created_at DESC
    `).all(sixtyDaysAgo.toISOString());

    res.json({
      count: oldOrders.length,
      cutoffDate: sixtyDaysAgo.toISOString(),
      orders: oldOrders
    });
  } catch (error) {
    console.error('Cleanup preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看数据库统计
router.get('/database-stats', async (req, res) => {
  try {
    const stats = {
      orders: await db.prepare('SELECT COUNT(*) as count FROM orders').get(),
      lineItems: await db.prepare('SELECT COUNT(*) as count FROM line_items').get(),
      transferItems: await db.prepare('SELECT COUNT(*) as count FROM transfer_items').get(),
      oldestOrder: await db.prepare('SELECT created_at FROM orders ORDER BY created_at ASC LIMIT 1').get(),
      newestOrder: await db.prepare('SELECT created_at FROM orders ORDER BY created_at DESC LIMIT 1').get()
    };
    res.json(stats);
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear all orders and items (for testing purposes)
router.post('/clear-all-data', async (req, res) => {
  try {
    console.log('⚠️  CLEARING ALL DATA - This action cannot be undone!');
    
    // 删除所有数据（按依赖顺序）
    await db.prepare('DELETE FROM transfer_items').run();
    console.log('✓ Cleared transfer_items');
    
    await db.prepare('DELETE FROM line_items').run();
    console.log('✓ Cleared line_items');
    
    await db.prepare('DELETE FROM orders').run();
    console.log('✓ Cleared orders');

    // 🆕 重置 box type 统计
    await db.prepare('UPDATE box_types SET usage_count = 0').run();
    console.log('✓ Reset box type usage counts');
    
    console.log('✓ All order data cleared successfully');
    
    res.json({ 
      success: true, 
      message: 'All orders, line items, and transfer items have been deleted. Box type statistics have been reset. CSV data and settings were preserved.'
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear data: ' + error.message 
    });
  }
});

// 🆕 Reset box usage statistics
router.post('/reset-box-usage', async (req, res) => {
  try {
    console.log('⚠️  RESETTING BOX USAGE STATISTICS');
    
    // 重置所有 box types 的使用统计和剩余数量
    await db.prepare('UPDATE box_types SET usage_count = 0, quantity = 0').run();
    console.log('✓ Reset all box usage counts and quantities');
    
    // 🆕 更新 box_stats_start_date 设置
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('box_stats_start_date', ?, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(now);
    console.log('✓ Updated box stats start date');
    
    res.json({ 
      success: true, 
      message: 'Box usage statistics have been reset.',
      startDate: now
    });
  } catch (error) {
    console.error('Error resetting box usage:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset box usage: ' + error.message 
    });
  }
});

module.exports = router;
```

---

## 📄 `server\routes\transfer.js`

```javascript
const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

// Emoji mapping for transfer from
const EMOJI_MAP = {
  '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
  '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
};

// 🆕 固定的 location 列表
const LOCATIONS = [
  'MTL01',
  'MTL02',
  'MTL03',
  'MTL04',
  'MTL05',
  'MTL06',
  'MTL07',
  'MTL08',
  'MTL09',
  'MTL11'
];

// Get all transfer items
router.get('/items', async (req, res) => {
  try {
    // 🔧 FIX: 直接查询 transfer_items，不依赖 line_items（避免订单删除后 transfer items 查询不到）
    const items = await db.prepare(`
      SELECT * FROM transfer_items
      ORDER BY created_at DESC
    `).all();

    console.log(`Transfer: Found ${items.length} items`);
    res.json(items);
  } catch (error) {
    console.error('Error fetching transfer items:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 Get receiving filter options (transfer_from and transfer_date)
router.get('/receiving-options', async (req, res) => {
  try {
    // 获取所有 waiting 和 received 状态的 items
    const items = await db.prepare(`
      SELECT DISTINCT transfer_from, transfer_date
      FROM transfer_items
      WHERE (status = 'waiting' OR status = 'received') 
        AND transfer_from IS NOT NULL 
        AND transfer_date IS NOT NULL
      ORDER BY transfer_from ASC, transfer_date ASC
    `).all();

    // 提取唯一的 transfer_from 和 transfer_date
    const transferFroms = [...new Set(items.map(item => item.transfer_from))].sort();
    const transferDates = [...new Set(items.map(item => item.transfer_date))].sort();

    res.json({
      transferFroms,
      transferDates
    });
  } catch (error) {
    console.error('Error fetching receiving options:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get copy text for an item
router.get('/items/:id/copy-text', async (req, res) => {
  try {
    const { id } = req.params;
    // 🔧 FIX: 直接查询 transfer_items，不依赖 line_items（避免订单删除后查询失败）
    const item = await db.prepare(`
      SELECT * FROM transfer_items
      WHERE id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // 🆕 变量定义
    // A = emoji + transfer_from + emoji (只在 waiting 状态使用)
    // B = quantity (如果 > 1，用 "pcs"，否则用 "pc")
    // C = custom_name (优先级: custom_name > title)
    // D = SKU
    // E = order_number (只在 waiting 状态使用)

    const B = item.quantity;
    const pcText = B > 1 ? 'pcs' : 'pc';
    const C = item.custom_name || item.title || '';
    const D = item.sku || '';
    const E = item.order_number || '';

    let copyText = '';

    if (item.status === 'transferring') {
      // 格式: B pc(s) ----- C SKU D
      copyText = `${B} ${pcText} ----- ${C} SKU ${D}`;
    } else if (item.status === 'waiting') {
      // 格式: A  B pc(s) ----- C SKU D  #E
      const emoji = EMOJI_MAP[item.transfer_from] || '⬜';
      const A = `${emoji}${item.transfer_from}${emoji}`;
      copyText = `${A}  ${B} ${pcText} ----- ${C} SKU ${D}  #${E}`;
    }

    console.log(`Transfer: Copy text generated:`, copyText);

    res.json({ copyText });
  } catch (error) {
    console.error('Error generating copy text:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 生成库存报表
router.get('/stock-report', async (req, res) => {
  try {
    console.log('\n========== GENERATING STOCK REPORT ==========');

    // 1. 获取所有 transferring 状态的 items
    const transferringItems = await db.prepare(`
      SELECT sku, MAX(title) as title, SUM(quantity) as total_quantity
      FROM transfer_items
      WHERE status = 'transferring'
      GROUP BY sku
      ORDER BY MAX(title)
    `).all();

    console.log(`Found ${transferringItems.length} unique SKUs in transferring status`);

    if (transferringItems.length === 0) {
      console.log('❌ No transferring items found');
      return res.status(404).json({ 
        error: 'No transferring items found',
        message: 'There are no items in transferring status to generate a report for.'
      });
    }

    // 显示前几个 SKU
    console.log('First few SKUs:');
    transferringItems.slice(0, 3).forEach(item => {
      console.log(`  - ${item.sku}: ${item.title} (qty: ${item.total_quantity})`);
    });

    // 2. 为每个 SKU 查询 Shopify 库存
    const reportData = [];
    let successCount = 0;
    let failCount = 0;

    for (const item of transferringItems) {
      const inventoryData = await getInventoryBySku(item.sku);
      
      reportData.push({
        title: item.title,
        sku: item.sku,
        quantityNeeded: item.total_quantity,
        inventory: inventoryData
      });

      const locationCount = Object.keys(inventoryData).length;
      if (locationCount > 0) {
        successCount++;
        console.log(`✓ SKU ${item.sku}: ${locationCount} locations found`);
      } else {
        failCount++;
        console.log(`✗ SKU ${item.sku}: No inventory data`);
      }
    }

    console.log(`\n========== SUMMARY ==========`);
    console.log(`Total SKUs processed: ${transferringItems.length}`);
    console.log(`Successful: ${successCount} (with inventory data)`);
    console.log(`Failed: ${failCount} (no inventory data)`);
    console.log(`============================\n`);

    // 3. 生成 CSV
    const csv = generateCSV(reportData);

    // 4. 返回 CSV 文件
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stock-report-${Date.now()}.csv"`);
    res.send(csv);

    console.log('========== STOCK REPORT GENERATED SUCCESSFULLY ==========\n');
  } catch (error) {
    console.error('\n========== STOCK REPORT ERROR ==========');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('=======================================\n');
    
    res.status(500).json({ 
      error: 'Failed to generate stock report',
      message: error.message 
    });
  }
});

// 🆕 通过 SKU 查询库存（使用 GraphQL）
async function getInventoryBySku(sku) {
  try {
    console.log(`\n--- Querying inventory for SKU: ${sku} ---`);
    
    const query = `
      query getInventoryBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              inventoryItem {
                id
                inventoryLevels(first: 50) {
                  edges {
                    node {
                      location {
                        name
                      }
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const searchQuery = `sku:${sku}`;
    console.log(`GraphQL search query: "${searchQuery}"`);

    const response = await shopifyClient.client.post('/graphql.json', {
      query,
      variables: { query: searchQuery }
    });

    console.log(`Response status: ${response.status}`);
    
    // 检查是否有 GraphQL errors
    if (response.data.errors) {
      console.error('❌ GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
      return {};
    }

    // 检查 data 结构
    if (!response.data.data) {
      console.error('❌ No data in response');
      console.error('Response:', JSON.stringify(response.data, null, 2));
      return {};
    }

    const edges = response.data.data?.productVariants?.edges || [];
    console.log(`Found ${edges.length} variant(s) for SKU: ${sku}`);

    if (edges.length === 0) {
      console.log(`❌ No variant found - returning empty inventory`);
      return {};
    }

    const variant = edges[0].node;
    console.log(`✓ Variant ID: ${variant.id}, SKU: ${variant.sku}`);
    
    if (!variant.inventoryItem) {
      console.log(`❌ No inventoryItem for variant`);
      return {};
    }

    const inventoryLevels = variant.inventoryItem.inventoryLevels?.edges || [];
    console.log(`Found ${inventoryLevels.length} inventory level(s)`);

    if (inventoryLevels.length === 0) {
      console.log(`❌ No inventory levels found`);
      return {};
    }

    // 转换为 location => available 的映射
    const inventory = {};
    inventoryLevels.forEach(level => {
      const locationName = level.node.location.name;
      
      // 从 quantities 数组中获取 available 数量
      const availableQty = level.node.quantities?.find(q => q.name === 'available');
      const available = availableQty ? availableQty.quantity : 0;
      
      inventory[locationName] = available;
      console.log(`  ✓ ${locationName}: ${available}`);
    });

    console.log(`✓ SUCCESS: Retrieved inventory for ${sku}: ${Object.keys(inventory).length} locations`);
    return inventory;
  } catch (error) {
    console.error(`❌ EXCEPTION in getInventoryBySku for ${sku}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return {};  // 返回空对象而不是抛出错误
  }
}

// 🆕 生成 CSV 内容
function generateCSV(reportData) {
  // CSV Header
  const headers = ['Title', 'SKU', 'Quantity needed', ...LOCATIONS];
  let csv = headers.join(',') + '\n';

  // CSV Rows
  reportData.forEach(item => {
    const row = [
      `"${item.title.replace(/"/g, '""')}"`,  // 转义引号
      item.sku,
      item.quantityNeeded
    ];

    // 为每个 location 添加列
    LOCATIONS.forEach(location => {
      const available = item.inventory[location];

      // 只有当库存 >= 需求时，才标记
      if (available !== undefined && available >= item.quantityNeeded) {
        row.push(`[OK] ${available}`);
      } else {
        // 库存不足或无库存，留空
        row.push('');
      }
    });

    csv += row.join(',') + '\n';
  });

  return csv;
}

// Update transfer item status
router.patch('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transfer_from, estimate_month, estimate_day, out_of_stock } = req.body;

    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (transfer_from !== undefined) {
      updates.push('transfer_from = ?');
      values.push(transfer_from);
    }
    if (estimate_month !== undefined) {
      updates.push('estimate_month = ?');
      values.push(estimate_month);
    }
    if (estimate_day !== undefined) {
      updates.push('estimate_day = ?');
      values.push(estimate_day);
    }

    // 🆕 处理 out_of_stock 状态
    if (out_of_stock !== undefined) {
      updates.push('out_of_stock = ?');
      values.push(out_of_stock ? 1 : 0);
    }

    // 🆕 如果状态变为 waiting，记录 transfer_date（格式：MM/DD）
    if (status === 'waiting' || (transfer_from !== undefined && estimate_month !== undefined)) {
      const currentDate = new Date();
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const day = currentDate.getDate().toString().padStart(2, '0');
      const transferDate = `${month}/${day}`;
      
      updates.push('transfer_date = ?');
      values.push(transferDate);
      
      console.log(`Setting transfer_date to: ${transferDate}`);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    await db.prepare(`
      UPDATE transfer_items 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transfer item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Split transfer item (when quantity > 1 and user wants to transfer part)
router.post('/items/:id/split', async (req, res) => {
  try {
    const { id } = req.params;
    const { transferQuantity, transfer_from, estimate_month, estimate_day } = req.body;

    const item = await db.prepare('SELECT * FROM transfer_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Transfer item not found' });
    }

    const qty = parseInt(transferQuantity);
    const remainingQty = item.quantity - qty;

    if (qty >= item.quantity || qty < 1) {
      return res.status(400).json({ error: 'Invalid transfer quantity' });
    }

    // 🆕 记录 transfer_date
    const currentDate = new Date();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    const transferDate = `${month}/${day}`;

    // Update original item to transferring quantity
    await db.prepare(`
      UPDATE transfer_items 
      SET 
        quantity = ?,
        transfer_from = ?,
        estimate_month = ?,
        estimate_day = ?,
        transfer_date = ?,
        status = 'waiting',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(qty, transfer_from, estimate_month, estimate_day, transferDate, id);

    // Create new item for remaining quantity
    await db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku,
        image_url, title, name, brand, size, weight, weight_unit,
        url_handle, product_type, variant_title, custom_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
    `).run(
      item.line_item_id,
      item.shopify_order_id,
      item.order_number,
      remainingQty,
      item.sku,
      item.image_url,
      item.title,
      item.name,
      item.brand,
      item.size,
      item.weight,
      item.weight_unit,
      item.url_handle,
      item.product_type,
      item.variant_title,
      item.custom_name
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error splitting transfer item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete transfer items
router.post('/items/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }

    console.log(`Bulk delete request: ${ids.length} items`);

    // 🆕 先检查哪些 ID 实际存在
    const placeholdersCheck = ids.map(() => '?').join(',');
    const existingItems = await db.prepare(
      `SELECT id FROM transfer_items WHERE id IN (${placeholdersCheck})`
    ).all(...ids);

    const existingIds = existingItems.map(item => item.id);
    const notFoundIds = ids.filter(id => !existingIds.includes(id));

    if (notFoundIds.length > 0) {
      console.log(`Warning: ${notFoundIds.length} items not found (already deleted):`, notFoundIds);
    }

    if (existingIds.length === 0) {
      console.log('No items to delete (all already deleted)');
      return res.json({ 
        success: true, 
        deleted: 0,
        message: 'No items found to delete (may have been already deleted)'
      });
    }

    // 🆕 只删除实际存在的 items
    const placeholders = existingIds.map(() => '?').join(',');
    const result = await db.prepare(
      `DELETE FROM transfer_items WHERE id IN (${placeholders})`
    ).run(...existingIds);

    console.log(`Successfully deleted ${existingIds.length} items`);

    res.json({ 
      success: true, 
      deleted: existingIds.length,
      notFound: notFoundIds.length
    });
  } catch (error) {
    console.error('Error bulk deleting transfer items:', error);
    
    // 🆕 返回更详细的错误信息
    res.status(500).json({ 
      error: 'Failed to delete items',
      message: error.message,
      code: error.code
    });
  }
});
// 在 server/routes/transfer.js 中添加以下两个 endpoints

// 🆕 Transfer Planner: 批量查询库存
router.post('/check-planner-stock', async (req, res) => {
  try {
    const { skus, locations } = req.body;
    
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.json({ inventory: [] });
    }
    
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.json({ inventory: [] });
    }

    console.log(`\n📦 Transfer Planner: Checking stock`);
    console.log(`  SKUs: ${skus.length}`);
    console.log(`  Locations: ${locations.join(', ')}`);

    // 使用现有的批量查询函数
    const results = [];
    
    for (const sku of skus) {
      try {
        const query = `
          query getInventoryBySku($query: String!) {
            productVariants(first: 1, query: $query) {
              edges {
                node {
                  id
                  sku
                  inventoryItem {
                    id
                    inventoryLevels(first: 50) {
                      edges {
                        node {
                          location {
                            name
                          }
                          quantities(names: ["available"]) {
                            name
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const response = await shopifyClient.client.post('/graphql.json', {
          query,
          variables: { query: `sku:${sku}` }
        });

        const edges = response.data.data?.productVariants?.edges || [];
        
        if (edges.length > 0) {
          const inventoryLevels = edges[0].node.inventoryItem?.inventoryLevels?.edges || [];
          
          // 只返回请求的 locations
          inventoryLevels.forEach(level => {
            const locationName = level.node.location.name;
            
            if (locations.includes(locationName)) {
              const availableQty = level.node.quantities?.find(q => q.name === 'available');
              const qoh = availableQty ? availableQty.quantity : 0;
              
              results.push({
                sku,
                location: locationName,
                qoh
              });
            }
          });
        }
      } catch (error) {
        console.error(`Error fetching inventory for SKU ${sku}:`, error.message);
      }
    }

    console.log(`  ✓ Fetched inventory for ${results.length} SKU-location pairs`);
    
    res.json({ inventory: results });
  } catch (error) {
    console.error('Error in check-planner-stock:', error);
    res.status(500).json({ error: 'Failed to check stock' });
  }
});

// 🆕 Transfer Planner: 批量更新 items
router.post('/batch-update-planner', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items to update' });
    }

    console.log(`\n📦 Transfer Planner: Batch update ${items.length} items`);

    // 批量更新
    for (const item of items) {
      const { id, transfer_from, estimate_month, estimate_day, status } = item;
      
      // 生成 transfer_date (MM/DD 格式)
      const transfer_date = `${estimate_month.toString().padStart(2, '0')}/${estimate_day.toString().padStart(2, '0')}`;
      
      await db.prepare(`
        UPDATE transfer_items
        SET transfer_from = ?,
            estimate_month = ?,
            estimate_day = ?,
            transfer_date = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(transfer_from, estimate_month, estimate_day, transfer_date, status, id);

      console.log(`  ✓ Updated item ${id}: ${transfer_from}, ${transfer_date}`);
    }

    console.log(`✓ Batch update complete\n`);
    
    res.json({ success: true, updated: items.length });
  } catch (error) {
    console.error('Error in batch-update-planner:', error);
    res.status(500).json({ error: 'Failed to update items' });
  }
});

module.exports = router;
```

---

## 📄 `server\routes\webhooks.js`

```javascript
const express = require('express');
const router = express.Router();
const OrderWebhookHandler = require('../webhooks/orderHandler');

// 🔒 POS 订单过滤函数
function isPosOrder(orderData) {
  const sourceName = orderData.source_name?.toLowerCase() || '';
  return sourceName === 'pos' || 
         sourceName === 'shopify_pos' || 
         sourceName.includes('pos');
}

// Order Created - 过滤 POS 订单
router.post('/orders/create', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      console.log(`✗ Skipping POS order: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('✓ Webhook received: Order Created', orderData.id);
    console.log(`  Order: ${orderData.name}, Source: ${orderData.source_name}`);
    const result = await OrderWebhookHandler.handleOrderCreated(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order created webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Updated - 过滤 POS 订单
router.post('/orders/updated', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      console.log(`✗ Skipping POS order update: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Updated', orderData.id);
    const result = await OrderWebhookHandler.handleOrderUpdated(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order updated webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Edits Complete - 过滤 POS 订单
router.post('/order-edits/complete', async (req, res) => {
  try {
    const editData = req.body;
    
    // 对于 order edits，需要检查 order_edit.order 中的 source_name
    const orderData = editData.order_edit?.order || editData.order || {};
    
    if (isPosOrder(orderData)) {
      console.log(`✗ Skipping POS order edit`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Edits Complete');
    const result = await OrderWebhookHandler.handleOrderEditsComplete(editData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order edits complete webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Cancelled - 过滤 POS 订单
router.post('/orders/cancelled', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      console.log(`✗ Skipping POS order cancellation: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Cancelled', orderData.id);
    const result = await OrderWebhookHandler.handleOrderCancelled(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order cancelled webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Order Fulfilled - 过滤 POS 订单
router.post('/orders/fulfilled', async (req, res) => {
  try {
    const orderData = req.body;
    
    // 🆕 过滤 POS 订单
    if (isPosOrder(orderData)) {
      console.log(`✗ Skipping POS order fulfillment: ${orderData.name} (source: ${orderData.source_name})`);
      return res.status(200).json({ message: 'POS order ignored' });
    }
    
    console.log('Webhook received: Order Fulfilled', orderData.id);
    const result = await OrderWebhookHandler.handleOrderFulfilled(orderData);
    res.json(result);
  } catch (error) {
    console.error('Error processing order fulfilled webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Refund Created - 过滤 POS 订单
router.post('/refunds/create', async (req, res) => {
  try {
    const refundData = req.body;
    
    // Refund webhook 中没有直接的 order 信息，需要通过 order_id 查询
    // 或者检查是否订单已经在数据库中（如果不在，说明是 POS）
    // 为了简单起见，先正常处理，如果订单不存在会自然失败
    
    console.log('Webhook received: Refund Created', refundData.order_id);
    const result = await OrderWebhookHandler.handleRefundCreated(refundData);
    res.json(result);
  } catch (error) {
    console.error('Error processing refund created webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;
```

---

## 📄 `server\scripts\setupWebhooks.js`

```javascript
require('dotenv').config();
const shopifyClient = require('../shopify/client');

async function setupWebhooks() {
  const appUrl = process.env.APP_URL;
  
  if (!appUrl) {
    console.error('Error: APP_URL not set in environment variables');
    process.exit(1);
  }

  const webhooks = [
    {
      topic: 'orders/create',
      address: `${appUrl}/api/webhooks/orders/create`
    },
    {
      topic: 'orders/updated',
      address: `${appUrl}/api/webhooks/orders/updated`
    },
    {
      topic: 'orders/edited',
      address: `${appUrl}/api/webhooks/orders/edited`
    },
    {
      topic: 'orders/cancelled',
      address: `${appUrl}/api/webhooks/orders/cancelled`
    },
    {
      topic: 'orders/fulfilled',
      address: `${appUrl}/api/webhooks/orders/fulfilled`
    }
  ];

  try {
    // Get existing webhooks
    const existingWebhooks = await shopifyClient.listWebhooks();
    console.log(`Found ${existingWebhooks.length} existing webhooks`);

    // Delete old webhooks for these topics
    for (const webhook of existingWebhooks) {
      const shouldDelete = webhooks.some(w => w.topic === webhook.topic);
      if (shouldDelete) {
        console.log(`Deleting old webhook: ${webhook.topic} -> ${webhook.address}`);
        await shopifyClient.deleteWebhook(webhook.id);
      }
    }

    // Create new webhooks
    for (const webhook of webhooks) {
      console.log(`Creating webhook: ${webhook.topic} -> ${webhook.address}`);
      await shopifyClient.createWebhook(webhook.topic, webhook.address);
      console.log(`✓ Created webhook: ${webhook.topic}`);
    }

    console.log('\n✓ All webhooks configured successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up webhooks:', error.message);
    process.exit(1);
  }
}

setupWebhooks();
```

---

## 📄 `server\shopify\client.js`

```javascript
require('dotenv').config();
const axios = require('axios');

class ShopifyClient {
  constructor() {
    // 修复：使用正确的环境变量名
    this.shopUrl = process.env.SHOPIFY_SHOP_NAME || process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2024-01';
    
    // 添加验证
    if (!this.shopUrl) {
      console.error('ERROR: SHOPIFY_SHOP_NAME is not set!');
      throw new Error('SHOPIFY_SHOP_NAME environment variable is required');
    }
    
    if (!this.accessToken) {
      console.error('ERROR: SHOPIFY_ACCESS_TOKEN is not set!');
      throw new Error('SHOPIFY_ACCESS_TOKEN environment variable is required');
    }
    
    console.log(`Shopify Client initialized for: ${this.shopUrl}`);
    
    this.client = axios.create({
      baseURL: `https://${this.shopUrl}/admin/api/${this.apiVersion}`,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get product variant
  async getProductVariant(variantId) {
    try {
      const response = await this.client.get(`/variants/${variantId}.json`);
      return response.data.variant;
    } catch (error) {
      console.error('Error fetching product variant:', error.response?.data || error.message);
      throw error;
    }
  }

  // 🆕 Get product metafield (product level)
  async getProductMetafield(productId, namespace, key) {
    try {
      console.log(`Fetching product metafield: product=${productId}, namespace=${namespace}, key=${key}`);
      
      const response = await this.client.get(`/products/${productId}/metafields.json`);
      const metafields = response.data.metafields || [];
      
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      
      if (metafield) {
        console.log(`✓ Found metafield value: ${metafield.value}`);
        return metafield.value;
      }
      
      console.log(`✗ Metafield not found`);
      return '';
    } catch (error) {
      console.error(`Error fetching product metafield:`, error.message);
      return ''; // 失败时返回空字符串，不抛出错误
    }
  }

  // 🆕 Get variant metafield (variant level)
  async getVariantMetafield(variantId, namespace, key) {
    try {
      console.log(`Fetching variant metafield: variant=${variantId}, namespace=${namespace}, key=${key}`);
      
      const response = await this.client.get(`/variants/${variantId}/metafields.json`);
      const metafields = response.data.metafields || [];
      
      const metafield = metafields.find(m => m.namespace === namespace && m.key === key);
      
      if (metafield) {
        console.log(`✓ Found metafield value: ${metafield.value}`);
        return metafield.value;
      }
      
      console.log(`✗ Metafield not found`);
      return '';
    } catch (error) {
      console.error(`Error fetching variant metafield:`, error.message);
      return ''; // 失败时返回空字符串，不抛出错误
    }
  }

  // Update product variant weight
  async updateVariantWeight(variantId, weightInGrams) {
    try {
      const response = await this.client.put(`/variants/${variantId}.json`, {
        variant: {
          id: variantId,
          weight: weightInGrams,
          weight_unit: 'g'
        }
      });
      return response.data.variant;
    } catch (error) {
      console.error('Error updating variant weight:', error.response?.data || error.message);
      throw error;
    }
  }

  // Update variant weight by SKU using GraphQL (fast method)
  async updateVariantWeightBySku(sku, weightInGrams) {
    try {
      console.log(`Searching for variant by SKU using GraphQL: ${sku}`);
      
      // GraphQL query to find variant by SKU
      const query = `
        query getVariantBySku($query: String!) {
          productVariants(first: 1, query: $query) {
            edges {
              node {
                id
                legacyResourceId
                sku
              }
            }
          }
        }
      `;
      
      const response = await this.client.post('/graphql.json', {
        query,
        variables: { query: `sku:${sku}` }
      });

      console.log('GraphQL response:', JSON.stringify(response.data, null, 2));

      const edges = response.data.data?.productVariants?.edges || [];
      
      if (edges.length === 0) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      const variantId = edges[0].node.legacyResourceId;
      console.log(`Found variant ID ${variantId} for SKU: ${sku} via GraphQL`);

      // Update using REST API
      return await this.updateVariantWeight(variantId, weightInGrams);
    } catch (error) {
      console.error('Error updating variant weight by SKU (GraphQL):', error.message);
      
      // Fallback to REST API search if GraphQL fails
      console.log('Falling back to REST API search...');
      return await this.updateVariantWeightBySkuREST(sku, weightInGrams);
    }
  }

  // Fallback: Update variant weight by SKU using REST API (slow method)
  async updateVariantWeightBySkuREST(sku, weightInGrams) {
    try {
      console.log(`Searching for variant with SKU using REST: ${sku}`);
      
      // Get all products (paginated)
      let allProducts = [];
      let hasNextPage = true;
      let pageInfo = null;

      while (hasNextPage && allProducts.length < 20000) {
        const params = {
          limit: 250,
          fields: 'id,variants'
        };
        
        if (pageInfo) {
          params.page_info = pageInfo;
        }

        const response = await this.client.get('/products.json', { params });
        allProducts = allProducts.concat(response.data.products);

        // Check for pagination
        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
          pageInfo = match ? match[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      }

      console.log(`Searched ${allProducts.length} products for SKU: ${sku}`);

      // Find variant with matching SKU
      let variantId = null;
      for (const product of allProducts) {
        const variant = product.variants.find(v => v.sku === sku);
        if (variant) {
          variantId = variant.id;
          console.log(`Found variant ID ${variantId} for SKU: ${sku}`);
          break;
        }
      }

      if (!variantId) {
        throw new Error(`Variant with SKU "${sku}" not found in Shopify`);
      }

      // Update the variant weight
      return await this.updateVariantWeight(variantId, weightInGrams);
    } catch (error) {
      console.error('Error updating variant weight by SKU (REST):', error.message);
      throw error;
    }
  }

  // Get order
  async getOrder(orderId) {
    try {
      const response = await this.client.get(`/orders/${orderId}.json`);
      return response.data.order;
    } catch (error) {
      console.error('Error fetching order:', error.response?.data || error.message);
      throw error;
    }
  }

  // Update order fulfillment
  async fulfillOrder(orderId, lineItems) {
    try {
      const response = await this.client.post(`/orders/${orderId}/fulfillments.json`, {
        fulfillment: {
          line_items: lineItems.map(item => ({
            id: item.id,
            quantity: item.quantity
          })),
          notify_customer: true
        }
      });
      return response.data.fulfillment;
    } catch (error) {
      console.error('Error fulfilling order:', error.response?.data || error.message);
      throw error;
    }
  }

  // Create webhook
  async createWebhook(topic, address) {
    try {
      const response = await this.client.post('/webhooks.json', {
        webhook: {
          topic,
          address,
          format: 'json'
        }
      });
      return response.data.webhook;
    } catch (error) {
      console.error('Error creating webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  // List all webhooks
  async listWebhooks() {
    try {
      const response = await this.client.get('/webhooks.json');
      return response.data.webhooks;
    } catch (error) {
      console.error('Error listing webhooks:', error.response?.data || error.message);
      throw error;
    }
  }

  // Delete webhook
  async deleteWebhook(webhookId) {
    try {
      await this.client.delete(`/webhooks/${webhookId}.json`);
      return true;
    } catch (error) {
      console.error('Error deleting webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  // 🆕 Update order metafield
  async updateOrderMetafield(orderId, namespace, key, value, type = 'boolean') {
    try {
      console.log(`\n========== UPDATING ORDER METAFIELD ==========`);
      console.log(`Order ID: ${orderId}`);
      console.log(`Namespace: ${namespace}`);
      console.log(`Key: ${key}`);
      console.log(`Value: ${value}`);
      console.log(`Type: ${type}`);

      // 先获取现有的 metafields 来检查是否已存在
      const existingMetafieldsResponse = await this.client.get(`/orders/${orderId}/metafields.json`);
      const existingMetafields = existingMetafieldsResponse.data.metafields || [];
      
      const existingMetafield = existingMetafields.find(
        m => m.namespace === namespace && m.key === key
      );

      let response;
      
      if (existingMetafield) {
        // 更新现有 metafield
        console.log(`Updating existing metafield ID: ${existingMetafield.id}`);
        response = await this.client.put(`/orders/${orderId}/metafields/${existingMetafield.id}.json`, {
          metafield: {
            id: existingMetafield.id,
            value: String(value),
            type: type
          }
        });
      } else {
        // 创建新 metafield
        console.log(`Creating new metafield`);
        response = await this.client.post(`/orders/${orderId}/metafields.json`, {
          metafield: {
            namespace: namespace,
            key: key,
            value: String(value),
            type: type
          }
        });
      }

      console.log(`✓ Order metafield updated successfully`);
      console.log(`Response:`, JSON.stringify(response.data.metafield, null, 2));
      console.log(`=============================================\n`);
      
      return response.data.metafield;
    } catch (error) {
      console.error('✗ Error updating order metafield:', error.response?.data || error.message);
      console.log(`=============================================\n`);
      throw error;
    }
  }
}

module.exports = new ShopifyClient();
```

---

## 📄 `server\utils\cleanup.js`

```javascript
const db = require('../database/init');

// 清理 60 天前的所有订单和相关数据
async function cleanupOldData() {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  
  console.log(`Starting cleanup for data older than ${sixtyDaysAgo.toISOString()}`);

  try {
    if (db.type === 'postgres') {
      // PostgreSQL 版本
      // 1. 获取要删除的订单
      const oldOrders = await db.prepare(`
        SELECT shopify_order_id, name FROM orders 
        WHERE created_at < $1
      `).all(sixtyDaysAgo.toISOString());

      if (oldOrders.length === 0) {
        console.log('No old data to clean up');
        return { deleted: 0 };
      }

      console.log(`Found ${oldOrders.length} orders to delete`);

      // 2. 删除 transfer_items（先删除，因为引用 line_items）
      const transferDeleted = await db.prepare(`
        DELETE FROM transfer_items 
        WHERE shopify_order_id IN (
          SELECT shopify_order_id FROM orders WHERE created_at < $1
        )
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${transferDeleted.changes} transfer items`);

      // 3. 删除 line_items
      const lineItemsDeleted = await db.prepare(`
        DELETE FROM line_items 
        WHERE shopify_order_id IN (
          SELECT shopify_order_id FROM orders WHERE created_at < $1
        )
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${lineItemsDeleted.changes} line items`);

      // 4. 删除 orders
      const ordersDeleted = await db.prepare(`
        DELETE FROM orders WHERE created_at < $1
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${ordersDeleted.changes} orders`);

      return {
        deleted: oldOrders.length,
        orders: oldOrders.map(o => o.name)
      };

    } else {
      // SQLite 版本
      // 1. 获取要删除的订单
      const oldOrders = db.db.prepare(`
        SELECT shopify_order_id, name FROM orders 
        WHERE created_at < ?
      `).all(sixtyDaysAgo.toISOString());

      if (oldOrders.length === 0) {
        console.log('No old data to clean up');
        return { deleted: 0 };
      }

      console.log(`Found ${oldOrders.length} orders to delete`);

      const orderIds = oldOrders.map(o => o.shopify_order_id);
      const placeholders = orderIds.map(() => '?').join(',');

      // 2. 删除 transfer_items
      const transferDeleted = db.db.prepare(`
        DELETE FROM transfer_items 
        WHERE shopify_order_id IN (${placeholders})
      `).run(...orderIds);

      console.log(`Deleted ${transferDeleted.changes} transfer items`);

      // 3. 删除 line_items
      const lineItemsDeleted = db.db.prepare(`
        DELETE FROM line_items 
        WHERE shopify_order_id IN (${placeholders})
      `).run(...orderIds);

      console.log(`Deleted ${lineItemsDeleted.changes} line items`);

      // 4. 删除 orders
      const ordersDeleted = db.db.prepare(`
        DELETE FROM orders WHERE created_at < ?
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${ordersDeleted.changes} orders`);

      return {
        deleted: oldOrders.length,
        orders: oldOrders.map(o => o.name)
      };
    }
  } catch (error) {
    console.error('Cleanup error:', error);
    throw error;
  }
}

// 定时任务：每天凌晨 2 点运行
function scheduleCleanup() {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // 明天
    2, 0, 0 // 凌晨 2 点
  );
  const msToMidnight = night.getTime() - now.getTime();

  // 首次延迟到凌晨 2 点
  setTimeout(() => {
    cleanupOldData().catch(console.error);
    // 之后每 24 小时运行一次
    setInterval(() => {
      cleanupOldData().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msToMidnight);

  console.log(`Cleanup scheduled for ${night.toISOString()}`);
}

module.exports = { cleanupOldData, scheduleCleanup };
```

---

## 📄 `server\utils\logger.js`

```javascript
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, context = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    }) + '\n';
  }

  writeLog(filename, message) {
    const logPath = path.join(this.logDir, filename);
    fs.appendFileSync(logPath, message);
  }

  info(message, context) {
    const formatted = this.formatMessage('INFO', message, context);
    console.log(`[INFO] ${message}`, context);
    this.writeLog('app.log', formatted);
  }

  error(message, context) {
    const formatted = this.formatMessage('ERROR', message, context);
    console.error(`[ERROR] ${message}`, context);
    this.writeLog('error.log', formatted);
  }

  webhook(message, context) {
    const formatted = this.formatMessage('WEBHOOK', message, context);
    console.log(`[WEBHOOK] ${message}`, context);
    this.writeLog('webhook.log', formatted);
  }
}

module.exports = new Logger();
```

---

## 📄 `server\webhooks\orderHandler.js`

```javascript
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

class OrderWebhookHandler {
  // Helper function to fetch product details
  static async fetchProductDetails(productId) {
    try {
      const response = await shopifyClient.client.get(`/products/${productId}.json`);
      return response.data.product;
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error.message);
      return null;
    }
  }

  // Handle order created
  static async handleOrderCreated(orderData) {
    try {
      const order = {
        shopify_order_id: orderData.id.toString(),
        order_number: orderData.order_number.toString(),
        name: orderData.name,
        fulfillment_status: orderData.fulfillment_status || 'unfulfilled',
        total_quantity: orderData.line_items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal_price: orderData.subtotal_price,
        created_at: orderData.created_at,
        shipping_code: orderData.shipping_lines[0]?.code || '',
        shipping_title: orderData.shipping_lines[0]?.title || '',
        shipping_name: orderData.shipping_address?.name || '',
        shipping_address1: orderData.shipping_address?.address1 || '',
        shipping_address2: orderData.shipping_address?.address2 || '',
        shipping_city: orderData.shipping_address?.city || '',
        shipping_province: orderData.shipping_address?.province || '',
        shipping_zip: orderData.shipping_address?.zip || '',
        shipping_country: orderData.shipping_address?.country || ''
      };

      // Insert order
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          shopify_order_id, order_number, name, fulfillment_status, 
          total_quantity, subtotal_price, created_at, shipping_code, shipping_title,
          shipping_name, shipping_address1, shipping_address2, 
          shipping_city, shipping_province, shipping_zip, shipping_country
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (shopify_order_id) DO UPDATE SET
          order_number = EXCLUDED.order_number,
          name = EXCLUDED.name,
          fulfillment_status = EXCLUDED.fulfillment_status,
          total_quantity = EXCLUDED.total_quantity,
          subtotal_price = EXCLUDED.subtotal_price,
          shipping_title = EXCLUDED.shipping_title,
          updated_at = CURRENT_TIMESTAMP
      `);

      await insertOrder.run(
        order.shopify_order_id, order.order_number, order.name,
        order.fulfillment_status, order.total_quantity, order.subtotal_price,
        order.created_at, order.shipping_code, order.shipping_title,
        order.shipping_name,
        order.shipping_address1, order.shipping_address2, order.shipping_city,
        order.shipping_province, order.shipping_zip, order.shipping_country
      );

      // Insert line items with full product details
      for (const item of orderData.line_items) {
        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        let imageUrl = '';
        let urlHandle = '';
        let productType = item.product_type || '';
        let wigNumber = '';
        let customName = '';
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        // 获取 variant 信息（weight + custom_name）
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
              console.log(`Variant ${item.variant_id}: weight=${weight}${weightUnit}`);
            }
            
            // 获取 custom.name metafield（variant 层级）
            try {
              customName = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'name');
              if (customName) {
                console.log(`Variant ${item.variant_id}: custom.name=${customName}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.name for variant ${item.variant_id}:`, err.message);
            }
          } catch (err) {
            console.error(`Failed to fetch variant ${item.variant_id}:`, err.message);
          }
        }
        
        const hasWeightWarning = (weight === 0 || weightUnit !== 'g') ? 1 : 0;

        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
            
            // 如果是 WIG 类型，获取 custom.wig_number metafield（product 层级）
            if (productType.toUpperCase() === 'WIG') {
              try {
                wigNumber = await shopifyClient.getProductMetafield(item.product_id, 'custom', 'wig_number');
                if (wigNumber) {
                  console.log(`Product ${item.product_id}: wig_number=${wigNumber}`);
                }
              } catch (err) {
                console.error(`Failed to fetch wig_number for product ${item.product_id}:`, err.message);
              }
            }
          }
        }
        
        const insertLineItem = db.prepare(`
          INSERT INTO line_items (
            shopify_order_id, order_number, shopify_line_item_id, quantity,
            image_url, title, name, brand, size, weight, weight_unit, sku,
            url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
            picker_status, packer_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (shopify_line_item_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            updated_at = CURRENT_TIMESTAMP
        `);

        await insertLineItem.run(
          order.shopify_order_id,
          order.order_number,
          item.id.toString(),
          item.quantity,
          imageUrl,
          item.title,
          item.name,
          item.vendor,
          size,
          weight,
          weightUnit,
          item.sku,
          urlHandle,
          productType,
          wigNumber,
          customName,
          hasWeightWarning,
          item.variant_title || '',
          'picking',
          'packing'
        );
      }

      console.log(`Order ${order.name} created successfully`);
      return { success: true, order_number: order.name };
    } catch (error) {
      console.error('Error handling order created:', error);
      throw error;
    }
  }

  // Handle order updated
  static async handleOrderUpdated(orderData) {
    try {
      if (orderData.cancelled_at) {
        console.log(`Order ${orderData.name} is cancelled, deleting from APP`);
        return await this.handleOrderCancelled(orderData);
      }
      
      if (orderData.fulfillment_status === 'fulfilled') {
        console.log(`Order ${orderData.name} is fulfilled, deleting from APP`);
        return await this.handleOrderFulfilled(orderData);
      }
      
      const existingOrder = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?')
        .get(orderData.id.toString());

      if (!existingOrder) {
        return await this.handleOrderCreated(orderData);
      }

      // 获取所有退款记录，构建已退款 items 的 Map
      const refundedItems = new Map();
      
      if (orderData.refunds && Array.isArray(orderData.refunds)) {
        console.log(`\n📋 Checking refunds: ${orderData.refunds.length} refund records`);
        
        orderData.refunds.forEach(refund => {
          if (refund.refund_line_items) {
            refund.refund_line_items.forEach(refundItem => {
              const itemId = refundItem.line_item_id.toString();
              const refundedQty = refundItem.quantity;
              const currentRefunded = refundedItems.get(itemId) || 0;
              refundedItems.set(itemId, currentRefunded + refundedQty);
              console.log(`  💰 Item ${itemId} refunded: ${refundedQty} (total refunded: ${currentRefunded + refundedQty})`);
            });
          }
        });
      }

      // 过滤掉完全退款的 items，调整部分退款的数量
      const activeLineItems = [];
      orderData.line_items.forEach(item => {
        const itemId = item.id.toString();
        const refundedQty = refundedItems.get(itemId) || 0;
        const activeQty = item.quantity - refundedQty;
        
        if (activeQty > 0) {
          activeLineItems.push({
            ...item,
            quantity: activeQty,
            original_quantity: item.quantity,
            refunded_quantity: refundedQty
          });
          if (refundedQty > 0) {
            console.log(`  ✓ Item ${itemId}: original=${item.quantity}, refunded=${refundedQty}, active=${activeQty}`);
          }
        } else if (refundedQty > 0) {
          console.log(`  ✗ Item ${itemId}: fully refunded (original=${item.quantity}, refunded=${refundedQty})`);
        }
      });

      // Get existing line items
      const existingLineItems = await db.prepare(
        'SELECT * FROM line_items WHERE shopify_order_id = ?'
      ).all(orderData.id.toString());

      const itemGroups = new Map();
      existingLineItems.forEach(item => {
        const baseId = item.shopify_line_item_id.split('_')[0];
        if (!itemGroups.has(baseId)) {
          itemGroups.set(baseId, []);
        }
        itemGroups.get(baseId).push(item);
      });

      const currentItemIds = new Set();

      console.log('\n=== Processing Updated Order ===');
      console.log('Incoming items from Shopify (after refunds):', activeLineItems.length);
      activeLineItems.forEach(item => {
        console.log(`  - ${item.id}: qty=${item.quantity}, title=${item.title}`);
      });

      console.log('\nExisting items in DB:', existingLineItems.length);
      existingLineItems.forEach(item => {
        console.log(`  - ${item.shopify_line_item_id}: qty=${item.quantity}, title=${item.title}`);
      });

      console.log('\nItem groups:', itemGroups.size);
      itemGroups.forEach((group, baseId) => {
        const total = group.reduce((sum, i) => sum + i.quantity, 0);
        console.log(`  - ${baseId}: ${group.length} entries, total qty=${total}`);
      });

      for (const item of activeLineItems) {
        const itemId = item.id.toString();
        currentItemIds.add(itemId);
        
        const existingGroup = itemGroups.get(itemId) || [];
        const totalExistingQty = existingGroup.reduce((sum, i) => sum + i.quantity, 0);

        console.log(`\nProcessing item ${itemId}:`);
        console.log(`  Shopify qty: ${item.quantity}`);
        console.log(`  DB qty: ${totalExistingQty}`);
        console.log(`  Condition: ${item.quantity < totalExistingQty ? 'DECREASE' : item.quantity > totalExistingQty ? 'INCREASE' : 'SAME'}`);

        const size = item.properties?.find(p => p.name === 'Size')?.value || '';
        let imageUrl = '';
        let urlHandle = '';
        let productType = item.product_type || '';
        let wigNumber = '';
        let customName = '';
        
        let weight = item.grams || 0;
        let weightUnit = 'g';
        
        // 获取 variant 信息（weight + custom_name）
        if (item.variant_id) {
          try {
            const variant = await shopifyClient.getProductVariant(item.variant_id);
            if (variant) {
              weight = variant.weight || 0;
              weightUnit = variant.weight_unit || 'g';
            }
            
            // 获取 custom.name metafield（variant 层级）
            try {
              customName = await shopifyClient.getVariantMetafield(item.variant_id, 'custom', 'name');
              if (customName) {
                console.log(`Variant ${item.variant_id}: custom.name=${customName}`);
              }
            } catch (err) {
              console.error(`Failed to fetch custom.name for variant ${item.variant_id}:`, err.message);
            }
          } catch (err) {
            console.error(`Failed to fetch variant ${item.variant_id}:`, err.message);
          }
        }
        
        const hasWeightWarning = (weight === 0 || weightUnit !== 'g') ? 1 : 0;

        if (item.product_id) {
          const product = await this.fetchProductDetails(item.product_id);
          if (product) {
            imageUrl = product.images?.[0]?.src || '';
            urlHandle = product.handle || '';
            productType = product.product_type || productType;
            
            // 如果是 WIG 类型，获取 custom.wig_number metafield
            if (productType.toUpperCase() === 'WIG') {
              try {
                wigNumber = await shopifyClient.getProductMetafield(item.product_id, 'custom', 'wig_number');
                if (wigNumber) {
                  console.log(`Product ${item.product_id}: wig_number=${wigNumber}`);
                }
              } catch (err) {
                console.error(`Failed to fetch wig_number for product ${item.product_id}:`, err.message);
              }
            }
          }
        }

        if (existingGroup.length === 0) {
          console.log(`  Action: NEW ITEM`);
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
              picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);

          await insertLineItem.run(
            orderData.id.toString(),
            orderData.order_number.toString(),
            itemId,
            item.quantity,
            imageUrl,
            item.title,
            item.name,
            item.vendor,
            size,
            weight,
            weightUnit,
            item.sku,
            urlHandle,
            productType,
            wigNumber,
            customName,
            hasWeightWarning,
            item.variant_title || '',
            'picking',
            'packing'
          );
        } else if (item.quantity > totalExistingQty) {
          const diff = item.quantity - totalExistingQty;
          console.log(`  Action: INCREASE (diff: ${diff})`);
          
          const insertLineItem = db.prepare(`
            INSERT INTO line_items (
              shopify_order_id, order_number, shopify_line_item_id, quantity,
              image_url, title, name, brand, size, weight, weight_unit, sku,
              url_handle, product_type, wig_number, custom_name, has_weight_warning, variant_title,
              picker_status, packer_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);

          await insertLineItem.run(
            orderData.id.toString(),
            orderData.order_number.toString(),
            itemId + '_' + Date.now(),
            diff,
            imageUrl,
            item.title,
            item.name,
            item.vendor,
            size,
            weight,
            weightUnit,
            item.sku,
            urlHandle,
            productType,
            wigNumber,
            customName,
            hasWeightWarning,
            item.variant_title || '',
            'picking',
            'packing'
          );
        } else if (item.quantity < totalExistingQty) {
          console.log(`  Action: DECREASE`);
          
          let remaining = totalExistingQty - item.quantity;
          existingGroup.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          
          for (const existingItem of existingGroup) {
            if (remaining <= 0) break;
            
            if (existingItem.quantity <= remaining) {
              console.log(`    Deleting line_item ${existingItem.id} (qty: ${existingItem.quantity})`);
              await db.prepare('DELETE FROM line_items WHERE id = ?').run(existingItem.id);
              
              // 🆕 完全不删除 transfer_items，无论任何状态
              // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
              
              remaining -= existingItem.quantity;
            } else {
              const newQty = existingItem.quantity - remaining;
              console.log(`    Updating line_item ${existingItem.id}: ${existingItem.quantity} -> ${newQty}`);
              await db.prepare('UPDATE line_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(newQty, existingItem.id);
              remaining = 0;
            }
          }
        } else {
          console.log(`  Action: NO CHANGE`);
        }
      }

      console.log('\nChecking for removed items:');
      console.log('Current item IDs from Shopify:', Array.from(currentItemIds));
      console.log('Item groups base IDs:', Array.from(itemGroups.keys()));

      for (const [baseId, group] of itemGroups.entries()) {
        console.log(`Checking ${baseId}: in currentItemIds? ${currentItemIds.has(baseId)}`);
        if (!currentItemIds.has(baseId)) {
          console.log(`  Action: ITEM REMOVED - ${baseId}`);
          for (const item of group) {
            console.log(`    Deleting line_item ${item.id}`);
            
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(item.id);
            
            // 🆕 完全不删除 transfer_items，无论任何状态
            // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
          }
        }
      }

      // 更新订单信息
      await db.prepare(`
        UPDATE orders SET 
          total_quantity = ?,
          fulfillment_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(
        activeLineItems.reduce((sum, item) => sum + item.quantity, 0),
        orderData.fulfillment_status || 'unfulfilled',
        orderData.id.toString()
      );

      console.log(`\nOrder ${orderData.name} updated successfully`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order updated:', error);
      throw error;
    }
  }

  // Handle refund created
  static async handleRefundCreated(refundData) {
    try {
      console.log('\n=== Refund Created Webhook ===');
      console.log('Refund ID:', refundData.id);
      console.log('Order ID:', refundData.order_id);
      
      const orderId = refundData.order_id.toString();
      
      const refundLineItems = refundData.refund_line_items || [];
      console.log(`Refunded items: ${refundLineItems.length}`);
      
      for (const refundItem of refundLineItems) {
        const lineItemId = refundItem.line_item_id.toString();
        const quantity = refundItem.quantity;
        
        console.log(`  💰 Refunding line_item ${lineItemId}, qty: ${quantity}`);
        
        const dbItems = await db.prepare(
          `SELECT * FROM line_items 
           WHERE shopify_order_id = ? 
           AND (shopify_line_item_id = ? OR shopify_line_item_id LIKE ?)
           ORDER BY created_at ASC`
        ).all(orderId, lineItemId, `${lineItemId}_%`);
        
        console.log(`    Found ${dbItems.length} matching items in DB`);
        
        let remainingToDelete = quantity;
        
        for (const dbItem of dbItems.reverse()) {
          if (remainingToDelete <= 0) break;
          
          if (dbItem.quantity <= remainingToDelete) {
            console.log(`    ✗ Deleting item ${dbItem.id} (qty: ${dbItem.quantity})`);
            await db.prepare('DELETE FROM line_items WHERE id = ?').run(dbItem.id);
            
            // 🆕 完全不删除 transfer_items，无论任何状态
            // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
            
            remainingToDelete -= dbItem.quantity;
          } else {
            const newQty = dbItem.quantity - remainingToDelete;
            console.log(`    ↓ Reducing item ${dbItem.id} qty: ${dbItem.quantity} -> ${newQty}`);
            await db.prepare(
              'UPDATE line_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(newQty, dbItem.id);
            remainingToDelete = 0;
          }
        }
      }
      
      const remainingItems = await db.prepare(
        'SELECT SUM(quantity) as total FROM line_items WHERE shopify_order_id = ?'
      ).get(orderId);
      
      await db.prepare(
        'UPDATE orders SET total_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE shopify_order_id = ?'
      ).run(remainingItems.total || 0, orderId);
      
      console.log(`✓ Refund processed successfully`);
      return { success: true };
    } catch (error) {
      console.error('Error handling refund created:', error);
      return { success: false, error: error.message };
    }
  }

  // Handle order edits complete
  static async handleOrderEditsComplete(editData) {
    try {
      console.log(`\n=== Order Edits Complete Webhook ===`);
      console.log('Full webhook data:', JSON.stringify(editData, null, 2));
      
      const orderId = editData.order_edit?.order_id || editData.order_id || editData.admin_graphql_api_order_id;
      
      if (!orderId) {
        console.error('No order_id found in Order Edits webhook data');
        console.error('Available keys:', Object.keys(editData));
        return { success: false, error: 'No order_id in webhook data' };
      }
      
      const committed = editData.order_edit?.committed_at;
      
      if (!committed) {
        console.log('⚠️  Order edit was not committed, skipping');
        return { success: true, message: 'Edit not committed' };
      }
      
      console.log(`Edit ID: ${editData.order_edit?.id || editData.id || editData.admin_graphql_api_id}`);
      console.log(`Order ID: ${orderId}`);
      console.log(`✓ Order edit committed at: ${committed}`);
      
      console.log('Fetching latest order data from Shopify API...');
      const orderData = await shopifyClient.getOrder(orderId);
      
      console.log(`✓ Got fresh data for order ${orderData.name}`);
      console.log(`Line items count: ${orderData.line_items.length}`);
      
      await db.prepare(`
        UPDATE orders SET 
          is_edited = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_id = ?
      `).run(orderData.id.toString());
      
      console.log(`✓ Marked order ${orderData.name} as edited`);
      
      return await this.handleOrderUpdated(orderData);
    } catch (error) {
      console.error('Error handling order edits complete:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Handle order cancelled (🆕 完全不删除 transfer_items)
  static async handleOrderCancelled(orderData) {
    try {
      const shopifyOrderId = orderData.id.toString();
      
      // 🆕 完全不删除 transfer_items，只能手动清理
      // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
      
      // 删除 line_items
      await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?')
        .run(shopifyOrderId);
      
      // 删除 order
      await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?')
        .run(shopifyOrderId);
      
      console.log(`Order ${orderData.name} cancelled - order and line_items removed, transfer_items preserved`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order cancelled:', error);
      throw error;
    }
  }

  // Handle order fulfilled (🆕 完全不删除 transfer_items)
  static async handleOrderFulfilled(orderData) {
    try {
      const shopifyOrderId = orderData.id.toString();
      
      // 🆕 完全不删除 transfer_items，只能手动清理
      // Transfer items 只能通过 Transfer 页面的 Clear Mode 手动删除
      
      // 删除 line_items
      await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?')
        .run(shopifyOrderId);
      
      // 删除 order
      await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?')
        .run(shopifyOrderId);

      console.log(`Order ${orderData.name} fulfilled - order and line_items removed, transfer_items preserved`);
      return { success: true, order_number: orderData.name };
    } catch (error) {
      console.error('Error handling order fulfilled:', error);
      throw error;
    }
  }
}

module.exports = OrderWebhookHandler;
```

---

## 📄 `setup-order-edits-wbhook.js`

```javascript
const shopifyClient = require('./server/shopify/client');

async function setupOrderEditsWebhook() {
  const webhookUrl = process.env.WEBHOOK_BASE_URL || 'https://your-domain.com';
  
  try {
    // 创建 order_edits/complete webhook
    const webhook = await shopifyClient.createWebhook(
      'order_edits/complete',
      `${webhookUrl}/api/webhooks/order-edits/complete`
    );
    
    console.log('✓ Created order_edits/complete webhook:');
    console.log(`  ID: ${webhook.id}`);
    console.log(`  Address: ${webhook.address}`);
  } catch (error) {
    console.error('Error creating webhook:', error.message);
  }
}

setupOrderEditsWebhook();
```

---

## 📊 Statistics

**Total Files:** 38  
**Total Lines:** 10,087  
**Total Size:** 0.32 MB

**Files by Type:**
- `.js`: 35 files
- `.json`: 2 files
- `.md`: 1 files

---

**Export completed:** 2026-03-19T15:10:25.852Z  
**Time taken:** 0.34s
