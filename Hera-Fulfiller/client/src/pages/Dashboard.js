import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Layout, Card, Button } from '@shopify/polaris';
import { PackageIcon, TransferIcon, OrderIcon, SettingsIcon } from '@shopify/polaris-icons';

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <Page title="Warehouse Management">
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