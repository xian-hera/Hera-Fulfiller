import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Page, Layout, Card, TextField, Button } from '@shopify/polaris';

const Settings = () => {
  const navigate = useNavigate();
  const [transferColumn, setTransferColumn] = useState('E');
  const [pickerColumn, setPickerColumn] = useState('E');
  const [skuColumn, setSkuColumn] = useState('A');
  const [boxTypes, setBoxTypes] = useState([]);
  const [lastUpload, setLastUpload] = useState('');
  const [newBoxCode, setNewBoxCode] = useState('');
  const [newBoxDimensions, setNewBoxDimensions] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setTransferColumn(response.data.settings.transfer_csv_column || 'E');
      setPickerColumn(response.data.settings.picker_wig_column || 'E');
      setSkuColumn(response.data.settings.sku_column || 'A');
      setBoxTypes(response.data.boxTypes || []);
      setLastUpload(response.data.settings.csv_uploaded_at || '');
    } catch (error) {
      console.error('Error:', error);
      showMessage('Error loading settings');
    }
  };

  const handleSave = async () => {
    try {
      await axios.post('/api/settings/update', {
        transferCsvColumn: transferColumn,
        pickerWigColumn: pickerColumn,
        skuColumn: skuColumn
      });
      showMessage('Settings saved successfully!');
    } catch (error) {
      showMessage('Error saving settings');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/settings/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setLastUpload(res.data.uploadedAt);
      showMessage(`CSV uploaded! ${res.data.rowsImported} rows imported`);
      e.target.value = '';
    } catch (err) {
      showMessage('Upload failed');
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
      showMessage('Box type deleted!');
    } catch (error) {
      showMessage('Error deleting box type');
    }
  };

  const handleBoxUpdate = async (id, code, dimensions) => {
    try {
      await axios.patch(`/api/settings/box-types/${id}`, {
        code: code.toUpperCase(),
        dimensions
      });
      showMessage('Box type updated!');
    } catch (error) {
      showMessage(error.response?.data?.error || 'Error updating box type');
    }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <Page
      title="Settings"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
      primaryAction={{ content: 'Save', onAction: handleSave }}
    >
      {message && (
        <div style={{ 
          padding: '12px', 
          marginBottom: '16px', 
          backgroundColor: '#d4edda', 
          borderRadius: '4px',
          border: '1px solid #c3e6cb'
        }}>
          {message}
        </div>
      )}

      <Layout>
        <Layout.Section>
          <Card title="CSV Upload" sectioned>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{
                padding: '8px',
                border: '1px solid #c9cccf',
                borderRadius: '4px',
                width: '100%',
                marginBottom: '8px'
              }}
            />
            {lastUpload && (
              <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
                Last upload: {new Date(lastUpload).toLocaleString()}
              </p>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="CSV SKU Column" sectioned>
            <TextField
              label="SKU Column"
              value={skuColumn}
              onChange={setSkuColumn}
              maxLength={2}
              autoComplete="off"
              helpText="Column letter where SKU is located (e.g., A)"
            />
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Transfer CSV Column" sectioned>
            <TextField
              label="Transfer Column"
              value={transferColumn}
              onChange={setTransferColumn}
              maxLength={2}
              autoComplete="off"
              helpText="Column for transfer copy text (e.g., H)"
            />
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Picker WIG Column" sectioned>
            <TextField
              label="WIG Column"
              value={pickerColumn}
              onChange={setPickerColumn}
              maxLength={2}
              autoComplete="off"
              helpText="Column for WIG product number (e.g., E)"
            />
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
                {boxTypes.map((box) => (
                  <div 
                    key={box.id} 
                    style={{ 
                      padding: '16px', 
                      border: '1px solid #e1e3e5',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      backgroundColor: '#fafbfb'
                    }}
                  >
                    <div style={{ marginBottom: '8px' }}>
                      <TextField
                        label="Code"
                        value={box.code}
                        onChange={(value) => {
                          const updated = boxTypes.map(b => 
                            b.id === box.id ? { ...b, code: value } : b
                          );
                          setBoxTypes(updated);
                        }}
                        onBlur={() => handleBoxUpdate(box.id, box.code, box.dimensions)}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <TextField
                        label="Dimensions"
                        value={box.dimensions}
                        onChange={(value) => {
                          const updated = boxTypes.map(b => 
                            b.id === box.id ? { ...b, dimensions: value } : b
                          );
                          setBoxTypes(updated);
                        }}
                        onBlur={() => handleBoxUpdate(box.id, box.code, box.dimensions)}
                        autoComplete="off"
                      />
                    </div>
                    <Button onClick={() => handleDeleteBox(box.id)}>Delete</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <p style={{ padding: '16px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
            Settings should be configured on desktop/PC. Click Save after making changes.
          </p>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Settings;