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
import ConnecteamTask from './pages/ConnecteamTask';
import ShopifyTransfer from './pages/ShopifyTransfer';
import ReturnsList from './pages/return/ReturnsList';
import ReturnDetail from './pages/return/ReturnDetail';
import ReturnSettings from './pages/return/ReturnSettings';
import ReturnRules from './pages/return/ReturnRules';
import ReturnRuleDetail from './pages/return/ReturnRuleDetail';
import ReturnPortal from './pages/return/ReturnPortal';

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
            <Route path="/connecteam-task" element={<ConnecteamTask />} />
            <Route path="/shopify-transfer" element={<ShopifyTransfer />} />
            <Route path="/return" element={<ReturnsList />} />
            <Route path="/return/settings" element={<ReturnSettings />} />
            <Route path="/return/rules" element={<ReturnRules />} />
            <Route path="/return/rules/:id" element={<ReturnRuleDetail />} />
            <Route path="/return/portal" element={<ReturnPortal />} />
            <Route path="/return/:id" element={<ReturnDetail />} />
          </Routes>
        </Router>
      </ErrorBoundary>
    </AppProvider>
  );
}

export default App;