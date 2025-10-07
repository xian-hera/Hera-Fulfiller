import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  BlockStack,
  DataTable,
  Banner,
  DropZone,
  Text,
  Frame,
  Toast
} from '@shopify/polaris';

const Settings = () => {
  const navigate = useNavigate();
  const [transferColumn, setTransferColumn] = useState('E');
  const [pickerColumn, setPickerColumn] = useState('E');
  const [boxTypes, setBoxTypes] = useState([]);
  const [lastUpload, setLastUpload] = useState('');
  const [newBoxCode, setNewBoxCode] = useState('');
  const [newBoxDimensions, setNewBoxDimensions] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setTransferColumn(response.data.settings.transfer_csv_column || 'E');
      setPickerColumn(response.data.settings.picker_wig_column || 'E');
      setBoxTypes(response.data.boxTypes || []);
      setLastUpload(response.data.settings.csv_uploaded_at || '');
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      await axios.post('/api/settings/update', {
        transferCsvColumn: transferColumn,
        pickerWigColumn: pickerColumn
      });
      showToast('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Error saving settings');
    }
  };

  const handleFileUpload = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/settings/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setLastUpload(response.data.uploadedAt);
      setUploadedFiles([]);
      showToast(`CSV uploaded successfully! ${response.data.rowsImported} rows imported.`);
    } catch (error) {
      console.error('Error uploading CSV:', error);
      showToast('Error uploading CSV');
    }
  };

  const handleAddBox = async () => {
    if (!newBoxCode) {
      showToast('Please enter a box code');
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
      showToast('Box type added successfully!');
    } catch (error) {
      console.error('Error adding box type:', error);
      showToast('Error adding box type');
    }
  };

  const handleDeleteBox = async (id) => {
    try {
      await axios.delete(`/api/settings/box-types/${id}`);
      await fetchSettings();
      showToast('Box type deleted successfully!');
    } catch (error) {
      console.error('Error deleting box type:', error);
      showToast('Error deleting box type');
    }
  };

  const handleBoxUpdate = async (id, code, dimensions) => {
    try {
      await axios.patch(`/api/settings/box-types/${id}`, {
        code: code.toUpperCase(),
        dimensions
      });
      await fetchSettings();
      showToast('Box type updated successfully!');
    } catch (error) {
      console.error('Error updating box type:', error);
      showToast('Error updating box type');
    }
  };

  const showToast = (message) => {
    setToastMessage(message);
    setToastActive(true);
  };

  const boxTypeRows = boxTypes.map(box => [
    <TextField
      value={box.code}
      onChange={(value) => {
        const updated = boxTypes.map(b => 
          b.id === box.id ? { ...b, code: value } : b
        );
        setBoxTypes(updated);
      }}
      onBlur={() => handleBoxUpdate(box.id, box.code, box.dimensions)}
      autoComplete="off"
    />,
    <TextField
      value={box.dimensions}
      onChange={(value) => {
        const updated = boxTypes.map(b => 
          b.id === box.id ? { ...b, dimensions: value } : b
        );
        setBoxTypes(updated);
      }}
      onBlur={() => handleBoxUpdate(box.id, box.code, box.dimensions)}
      autoComplete="off"
    />,
    <Button tone="critical" onClick={() => handleDeleteBox(box.id)}>
      Delete
    </Button>
  ]);

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
  ) : null;

  return (
    <Frame>
      <Page
        title="Settings"
        backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
        primaryAction={{
          content: 'Save',
          onAction: handleSave
        }}
      >
        <Layout>
          <Layout.Section>
            <Card title="CSV Upload" sectioned>
              <BlockStack gap="4">
                <DropZone
                  accept=".csv"
                  type="file"
                  onDrop={handleFileUpload}
                  allowMultiple={false}
                >
                  <DropZone.FileUpload />
                </DropZone>
                {lastUpload && (
                  <Text variant="bodySm" as="p" tone="subdued">
                    Last upload: {new Date(lastUpload).toLocaleString()}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card title="Transfer CSV Column" sectioned>
              <BlockStack gap="4">
                <TextField
                  label="Column for Transfer copy text (C content)"
                  value={transferColumn}
                  onChange={setTransferColumn}
                  maxLength={1}
                  autoComplete="off"
                  helpText="Enter a single column letter (e.g., E)"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card title="Picker WIG Column" sectioned>
              <BlockStack gap="4">
                <TextField
                  label="Column for WIG product number"
                  value={pickerColumn}
                  onChange={setPickerColumn}
                  maxLength={1}
                  autoComplete="off"
                  helpText="Enter a single column letter (e.g., E)"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card title="Box Types">
              <Card.Section>
                <BlockStack gap="4">
                  <BlockStack gap="2">
                    <TextField
                      label="Code"
                      value={newBoxCode}
                      onChange={setNewBoxCode}
                      placeholder="A"
                      maxLength={2}
                      autoComplete="off"
                    />
                    <TextField
                      label="Dimensions"
                      value={newBoxDimensions}
                      onChange={setNewBoxDimensions}
                      placeholder="10x8x4"
                      autoComplete="off"
                    />
                    <Button onClick={handleAddBox}>Add</Button>
                  </BlockStack>
                </BlockStack>
              </Card.Section>

              {boxTypes.length > 0 && (
                <Card.Section>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text']}
                    headings={['Code', 'Dimensions', 'Action']}
                    rows={boxTypeRows}
                  />
                </Card.Section>
              )}
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Banner tone="info">
              <p>Settings should be configured on a desktop/PC for best experience.</p>
              <p>After making changes, remember to click the Save button at the top.</p>
            </Banner>
          </Layout.Section>
        </Layout>

        {toastMarkup}
      </Page>
    </Frame>
  );
};

export default Settings;