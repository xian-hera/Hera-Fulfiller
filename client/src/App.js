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

function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <Router>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/picker" element={<Picker />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/packer" element={<Packer />} />
          <Route path="/packer/order/:shopifyOrderId" element={<OrderDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}

export default App;