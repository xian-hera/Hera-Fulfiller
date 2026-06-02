import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { Page, Layout, Card, Button, Text, BlockStack, Banner } from '@shopify/polaris';

const Manifest = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/packer/manifest/pending');
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('Error fetching pending manifests:', error);
      showMessage('Error loading pending shipments', 'critical');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateManifest = async () => {
    if (groups.length === 0) return;

    if (!window.confirm(
      `This will transmit all ${totalShipments} pending shipment(s) across ${groups.length} day(s) to Canada Post and generate a manifest. Continue?`
    )) return;

    setGenerating(true);
    try {
      const response = await axios.post('/api/packer/manifest/generate');

      // Download the manifest PDF
      const pdfBlob = base64ToBlob(response.data.manifestPdfBase64, 'application/pdf');
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manifest-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage(
        `Manifest generated successfully. ${response.data.shipmentCount} shipment(s) transmitted across ${response.data.groupCount} day(s). PDF download started.`,
        'success'
      );

      // Refresh the list
      await fetchPending();
    } catch (error) {
      console.error('Error generating manifest:', error);
      const errMsg = error.response?.data?.error || error.message;
      showMessage(`Failed to generate manifest: ${errMsg}`, 'critical');
    } finally {
      setGenerating(false);
    }
  };

  const base64ToBlob = (base64, mimeType) => {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
  };

  const showMessage = (msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
    if (type !== 'critical') {
      setTimeout(() => setMessage(''), 6000);
    }
  };

  const totalShipments = groups.reduce((sum, g) => sum + g.orders.length, 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <Page
      title="Manifest Manager"
      backAction={{ content: 'Packer', onAction: () => navigate('/packer') }}
    >
      <Layout>
        {message && (
          <Layout.Section>
            <Banner tone={messageType} onDismiss={() => setMessage('')}>
              {message}
            </Banner>
          </Layout.Section>
        )}

        {/* Summary + Generate button */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text variant="headingMd" as="h2">Pending Shipments</Text>
                  <div style={{ marginTop: '8px' }}>
                    {loading ? (
                      <Text variant="bodySm" tone="subdued">Loading...</Text>
                    ) : groups.length === 0 ? (
                      <Text variant="bodySm" tone="subdued">No pending shipments. All shipments have been transmitted.</Text>
                    ) : (
                      <Text variant="bodySm" tone="subdued">
                        {totalShipments} shipment(s) across {groups.length} day(s) waiting to be transmitted.
                      </Text>
                    )}
                  </div>
                </div>
                <Button
                  variant="primary"
                  loading={generating}
                  disabled={groups.length === 0 || loading}
                  onClick={handleGenerateManifest}
                >
                  Generate Manifest
                </Button>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Groups list */}
        {!loading && groups.length > 0 && (
          <Layout.Section>
            <BlockStack gap="3">
              {groups.map(group => (
                <Card key={group.groupId}>
                  <div style={{ padding: '16px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <Text variant="headingSm" as="h3">{formatDate(group.date)}</Text>
                      <Text variant="bodySm" tone="subdued">
                        Group: {group.groupId} · {group.orders.length} shipment(s)
                      </Text>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {group.orders.map((order, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 12px',
                            backgroundColor: '#f6f6f7',
                            borderRadius: '6px'
                          }}
                        >
                          <div>
                            <Text variant="bodyMd" fontWeight="semibold">{order.name}</Text>
                            <div style={{ marginTop: '2px' }}>
                              <Text variant="bodySm" tone="subdued">
                                Tracking: {order.label_tracking_number || '—'}
                              </Text>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {order.box_type && (
                              <Text variant="bodySm" tone="subdued">Box: {order.box_type}</Text>
                            )}
                            {order.weight && (
                              <Text variant="bodySm" tone="subdued">{order.weight}g</Text>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </BlockStack>
          </Layout.Section>
        )}

        {!loading && groups.length === 0 && (
          <Layout.Section>
            <Card>
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <Text variant="bodyMd" tone="subdued">
                  All shipments have been transmitted. Nothing pending.
                </Text>
              </div>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
};

export default Manifest;