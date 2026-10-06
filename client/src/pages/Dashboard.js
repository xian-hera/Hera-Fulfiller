import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Layout, Card, Button } from '@shopify/polaris';
import { PackageIcon, TransferIcon, OrderIcon, SettingsIcon, PlusIcon } from '@shopify/polaris-icons';
import AddOrderModal from '../components/AddOrderModal';

const Dashboard = () => {
  const navigate = useNavigate();
  const [addOrderOpen, setAddOrderOpen] = useState(false);

  return (
    <Page
      title="Hera Beauté Fulfiller"
      primaryAction={{ content: 'Add Order', icon: PlusIcon, onAction: () => setAddOrderOpen(true) }}
    >
      <AddOrderModal
        open={addOrderOpen}
        onClose={() => setAddOrderOpen(false)}
        onGoToPicker={() => { setAddOrderOpen(false); navigate('/picker'); }}
      />
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