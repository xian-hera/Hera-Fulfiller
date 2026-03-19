import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import {
  Page,
  Layout,
  Card,
  Thumbnail,
  Text,
  Button,
  Modal,
  TextField,
  BlockStack,
  Banner,
  Toast,
  Frame,
} from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';

// ── Drag-and-drop location order selector ────────────────────────────────────

const LOCATIONS = ['01','02','03','04','05','06','07','08','09','11'];

const LocationOrderSelector = ({ selectedLocations, onLocationsChange }) => {
  const [dragIndex, setDragIndex] = useState(null);

  const handleToggle = (loc) => {
    if (selectedLocations.includes(loc)) {
      onLocationsChange(selectedLocations.filter(l => l !== loc));
    } else {
      onLocationsChange([...selectedLocations, loc]);
    }
  };

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newOrder = [...selectedLocations];
    const dragged = newOrder.splice(dragIndex, 1)[0];
    newOrder.splice(index, 0, dragged);
    setDragIndex(index);
    onLocationsChange(newOrder);
  };

  const handleDragEnd = () => setDragIndex(null);

  // Unselected locations (in original order)
  const unselected = LOCATIONS.filter(l => !selectedLocations.includes(l));

  return (
    <div>
      <Text variant="bodyMd" fontWeight="semibold">Location Order</Text>
      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {/* Selected locations (draggable) */}
        {selectedLocations.map((loc, index) => (
          <div
            key={loc}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => handleToggle(loc)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              backgroundColor: '#0080FF',
              color: 'white',
              fontWeight: '600',
              fontSize: '14px',
              cursor: 'grab',
              userSelect: 'none',
              border: '2px solid #0080FF',
            }}
          >
            {loc}
          </div>
        ))}

        {/* Divider */}
        {selectedLocations.length > 0 && unselected.length > 0 && (
          <div style={{ width: '1px', height: '28px', backgroundColor: '#c9cccf', margin: '0 4px' }} />
        )}

        {/* Unselected locations */}
        {unselected.map(loc => (
          <div
            key={loc}
            onClick={() => handleToggle(loc)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              backgroundColor: 'white',
              color: '#202223',
              fontWeight: '500',
              fontSize: '14px',
              cursor: 'pointer',
              userSelect: 'none',
              border: '2px solid #c9cccf',
            }}
          >
            {loc}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '6px' }}>
        <Text variant="bodySm" tone="subdued">
          Click to select/deselect · Drag selected buttons to reorder
        </Text>
      </div>
    </div>
  );
};

// ── Date selector ─────────────────────────────────────────────────────────────

const DateSelector = ({ value, onChange }) => {
  const options = ['today', 'tomorrow', 'monday'];
  const labels = { today: 'Today', tomorrow: 'Tomorrow', monday: 'Monday' };

  return (
    <div>
      <Text variant="bodyMd" fontWeight="semibold">Due Date</Text>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: value === opt ? '2px solid #0080FF' : '2px solid #c9cccf',
              backgroundColor: value === opt ? '#e8f0ff' : 'white',
              color: value === opt ? '#0080FF' : '#202223',
              fontWeight: value === opt ? '600' : '400',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Settings modal ────────────────────────────────────────────────────────────

const SettingsModal = ({ open, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [defaultSearch, setDefaultSearch] = useState('');
  const [defaultSearchResults, setDefaultSearchResults] = useState([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState([]);
  const [activeLocationTab, setActiveLocationTab] = useState('01');

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Search for default assignees
  const handleDefaultSearch = async (query) => {
    setDefaultSearch(query);
    if (query.length < 2) { setDefaultSearchResults([]); return; }
    try {
      const res = await axios.get('/api/connecteam/search-user', { params: { name: query } });
      setDefaultSearchResults(res.data);
    } catch {
      setDefaultSearchResults([]);
    }
  };

  // Search for location members
  const handleLocationSearch = async (query) => {
    setLocationSearch(query);
    if (query.length < 2) { setLocationSearchResults([]); return; }
    try {
      const res = await axios.get('/api/connecteam/search-user', { params: { name: query } });
      setLocationSearchResults(res.data);
    } catch {
      setLocationSearchResults([]);
    }
  };

  const handleAddDefaultAssignee = (user) => {
    const ids = localSettings.default_assignee_ids || [];
    if (!ids.includes(user.user_id)) {
      setLocalSettings({ ...localSettings, default_assignee_ids: [...ids, user.user_id] });
    }
    setDefaultSearch('');
    setDefaultSearchResults([]);
  };

  const handleRemoveDefaultAssignee = (userId) => {
    const ids = (localSettings.default_assignee_ids || []).filter(id => id !== userId);
    setLocalSettings({ ...localSettings, default_assignee_ids: ids });
  };

  const handleAddLocationMember = (user) => {
    const members = localSettings.location_members || {};
    const locMembers = members[activeLocationTab] || [];
    if (!locMembers.includes(user.user_id)) {
      setLocalSettings({
        ...localSettings,
        location_members: { ...members, [activeLocationTab]: [...locMembers, user.user_id] }
      });
    }
    setLocationSearch('');
    setLocationSearchResults([]);
  };

  const handleRemoveLocationMember = (userId) => {
    const members = localSettings.location_members || {};
    const locMembers = (members[activeLocationTab] || []).filter(id => id !== userId);
    setLocalSettings({
      ...localSettings,
      location_members: { ...members, [activeLocationTab]: locMembers }
    });
  };

  const handleSyncUsers = async () => {
    try {
      await axios.post('/api/connecteam/sync-users');
      alert('Users synced successfully! You can now search by name.');
    } catch {
      alert('Failed to sync users. Please try again.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connecteam Settings" large
      primaryAction={{ content: 'Save', onAction: () => onSave(localSettings) }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="5">

          {/* Default Description */}
          <TextField
            label="Default Description"
            value={localSettings.default_description || ''}
            onChange={(v) => setLocalSettings({ ...localSettings, default_description: v })}
            multiline={2}
            autoComplete="off"
          />

          {/* Default Assignees */}
          <div>
            <Text variant="bodyMd" fontWeight="semibold">Default Assignees</Text>
            <Text variant="bodySm" tone="subdued">These people are assigned to every task by default.</Text>
            <AssigneeList
              userIds={localSettings.default_assignee_ids || []}
              onRemove={handleRemoveDefaultAssignee}
            />
            <div style={{ marginTop: '10px' }}>
              <TextField
                label=""
                placeholder="Search by name to add..."
                value={defaultSearch}
                onChange={handleDefaultSearch}
                autoComplete="off"
              />
              {defaultSearchResults.length > 0 && (
                <div style={{ border: '1px solid #c9cccf', borderRadius: '6px', marginTop: '4px', backgroundColor: 'white' }}>
                  {defaultSearchResults.map(u => (
                    <div
                      key={u.user_id}
                      onClick={() => handleAddDefaultAssignee(u)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #e1e3e5' }}
                    >
                      {u.first_name} {u.last_name}
                      {u.email && <span style={{ color: '#6d7175', fontSize: '12px', marginLeft: '8px' }}>{u.email}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Location Members */}
          <div>
            <Text variant="bodyMd" fontWeight="semibold">Location Members</Text>
            <Text variant="bodySm" tone="subdued">When a task involves a location, its members are also assigned and notified.</Text>

            {/* Location tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              {LOCATIONS.map(loc => (
                <button
                  key={loc}
                  onClick={() => { setActiveLocationTab(loc); setLocationSearch(''); setLocationSearchResults([]); }}
                  style={{
                    padding: '4px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
                    border: activeLocationTab === loc ? '2px solid #0080FF' : '2px solid #c9cccf',
                    backgroundColor: activeLocationTab === loc ? '#e8f0ff' : 'white',
                    color: activeLocationTab === loc ? '#0080FF' : '#202223',
                    fontWeight: activeLocationTab === loc ? '600' : '400',
                  }}
                >
                  {loc}
                </button>
              ))}
            </div>

            <div style={{ marginTop: '10px' }}>
              <AssigneeList
                userIds={(localSettings.location_members || {})[activeLocationTab] || []}
                onRemove={handleRemoveLocationMember}
              />
              <div style={{ marginTop: '10px' }}>
                <TextField
                  label=""
                  placeholder={`Search by name to add to location ${activeLocationTab}...`}
                  value={locationSearch}
                  onChange={handleLocationSearch}
                  autoComplete="off"
                />
                {locationSearchResults.length > 0 && (
                  <div style={{ border: '1px solid #c9cccf', borderRadius: '6px', marginTop: '4px', backgroundColor: 'white' }}>
                    {locationSearchResults.map(u => (
                      <div
                        key={u.user_id}
                        onClick={() => handleAddLocationMember(u)}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #e1e3e5' }}
                      >
                        {u.first_name} {u.last_name}
                        {u.email && <span style={{ color: '#6d7175', fontSize: '12px', marginLeft: '8px' }}>{u.email}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sync users */}
          <div style={{ paddingTop: '8px', borderTop: '1px solid #e1e3e5' }}>
            <Text variant="bodySm" tone="subdued">
              Before searching by name, sync the latest user list from Connecteam first.
            </Text>
            <div style={{ marginTop: '10px' }}>
              <Button onClick={handleSyncUsers}>Sync Users from Connecteam</Button>
            </div>
          </div>

        </BlockStack>
      </Modal.Section>
    </Modal>
  );
};

// Small component to show list of assignees by user ID
const AssigneeList = ({ userIds, onRemove }) => {
  const [users, setUsers] = useState({});

  useEffect(() => {
    if (userIds.length === 0) return;
    axios.get('/api/connecteam/users').then(res => {
      const map = {};
      res.data.forEach(u => { map[u.user_id] = u; });
      setUsers(map);
    }).catch(() => {});
  }, [userIds]);

  if (userIds.length === 0) return <Text variant="bodySm" tone="subdued">None</Text>;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
      {userIds.map(id => {
        const u = users[id];
        const name = u ? `${u.first_name} ${u.last_name}`.trim() : `ID: ${id}`;
        return (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#f1f1f1', borderRadius: '12px', padding: '3px 8px', fontSize: '13px' }}>
            {name}
            <button onClick={() => onRemove(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6d7175', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}>×</button>
          </span>
        );
      })}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ConnecteamTask = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [locationOrder, setLocationOrder] = useState([]);
  const [dateChoice, setDateChoice] = useState('today');
  const [settings, setSettings] = useState({
    default_assignee_ids: [],
    default_description: 'Please double check the SKU and quantity, Thank you.',
    location_members: {},
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [latestTask, setLatestTask] = useState(null);

  const showToast = (msg) => { setToastMessage(msg); setToastActive(true); };

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get('/api/connecteam/not-tasked');
      setItems(res.data);
    } catch {
      showToast('Error loading items');
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get('/api/connecteam/settings');
      setSettings(res.data);
    } catch {
      showToast('Error loading settings');
    }
  }, []);

  const fetchLatestTask = useCallback(async () => {
    try {
      const res = await axios.get('/api/connecteam/latest-task');
      setLatestTask(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchItems();
    fetchSettings();
    fetchLatestTask();
  }, [fetchItems, fetchSettings, fetchLatestTask]);

  // Auto-select all locations present in items
  useEffect(() => {
    const locs = [...new Set(items.map(i => i.transfer_from).filter(Boolean))].sort();
    setLocationOrder(prev => {
      // Keep existing order, add new ones at end
      const existing = prev.filter(l => locs.includes(l));
      const newOnes = locs.filter(l => !prev.includes(l));
      return [...existing, ...newOnes];
    });
  }, [items]);

  const handleSelectItem = (id) => {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedItemIds(items.map(i => i.id));
  };

  const handleDeselectAll = () => {
    setSelectedItemIds([]);
  };

  const handleSaveSettings = async (newSettings) => {
    try {
      for (const [key, value] of Object.entries(newSettings)) {
        await axios.post('/api/connecteam/settings', { key, value });
      }
      setSettings(newSettings);
      setSettingsOpen(false);
      showToast('Settings saved');
    } catch {
      showToast('Failed to save settings');
    }
  };

  const handlePublish = async (idsToPublish) => {
    if (idsToPublish.length === 0) { showToast('No items selected'); return; }
    setIsPublishing(true);
    try {
      const res = await axios.post('/api/connecteam/publish-task', {
        itemIds: idsToPublish,
        locationOrder: locationOrder.filter(l =>
          items.filter(i => idsToPublish.includes(i.id)).some(i => i.transfer_from === l)
        ),
        dateChoice,
      });
      showToast(`Task published: ${res.data.title}`);
      await fetchItems();
      await fetchLatestTask();
      setSelectedItemIds([]);
    } catch (err) {
      showToast(`Failed to publish task: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleAddToTask = async (idsToAdd) => {
    if (idsToAdd.length === 0) { showToast('No items selected'); return; }
    if (!latestTask) { showToast('No previous task found. Please publish a new task first.'); return; }
    setIsAdding(true);
    try {
      const res = await axios.post('/api/connecteam/add-to-task', {
        itemIds: idsToAdd,
        locationOrder: locationOrder.filter(l =>
          items.filter(i => idsToAdd.includes(i.id)).some(i => i.transfer_from === l)
        ),
      });
      showToast(`Task updated: ${res.data.newTitle}`);
      await fetchItems();
      await fetchLatestTask();
      setSelectedItemIds([]);
    } catch (err) {
      showToast(`Failed to update task: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const formatSKU = (sku) => sku ? (sku.match(/.{1,4}/g)?.join(' ') || sku) : '';
  const formatDate = (month, day) => {
    if (month == null || day == null) return '';
    return `${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
  };

  const renderItem = (item) => {
    const isSelected = selectedItemIds.includes(item.id);
    return (
      <div
        key={item.id}
        style={{
          padding: '16px',
          borderBottom: '1px solid #e1e3e5',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: isSelected ? '#f0f7ff' : 'white',
          cursor: 'pointer',
        }}
        onClick={() => handleSelectItem(item.id)}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => handleSelectItem(item.id)}
          onClick={e => e.stopPropagation()}
          style={{ width: '18px', height: '18px', flexShrink: 0 }}
        />

        {/* Image */}
        <div style={{ flexShrink: 0 }}>
          {item.image_url
            ? <Thumbnail source={item.image_url} alt={item.title} size="medium" />
            : <Thumbnail source={ImageIcon} alt="No image" size="medium" />
          }
        </div>

        {/* Quantity */}
        <div style={{ fontSize: '28px', fontWeight: 'bold', minWidth: '40px', flexShrink: 0 }}>
          {item.quantity}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ wordWrap: 'break-word', maxWidth: '60ch' }}>
            <Text variant="bodyMd" fontWeight="bold">
              {item.brand} {item.title} {item.size}
            </Text>
          </div>
          {item.variant_title && <Text variant="bodySm">{item.variant_title}</Text>}
          <Text variant="bodySm" tone="subdued">{formatSKU(item.sku)}</Text>
          <Text variant="bodySm" tone="subdued">#{item.order_number}</Text>
        </div>

        {/* From + date */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {item.transfer_from && (
            <Text variant="bodyMd" fontWeight="bold" tone="info">
              MTL{item.transfer_from}
            </Text>
          )}
          {item.estimate_month != null && (
            <Text variant="bodySm" tone="subdued">
              Est. {formatDate(item.estimate_month, item.estimate_day)}
            </Text>
          )}
        </div>
      </div>
    );
  };

  const toastMarkup = toastActive ? <Toast content={toastMessage} onDismiss={() => setToastActive(false)} /> : null;

  return (
    <Frame>
      <Page
        title="Connecteam Task"
        backAction={{ content: 'Transfer', onAction: () => navigate('/transfer') }}
      >
        <Layout>
          {/* Controls card */}
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <BlockStack gap="5">

                  {/* Location order */}
                  <LocationOrderSelector
                    selectedLocations={locationOrder}
                    onLocationsChange={setLocationOrder}
                  />

                  {/* Date selector */}
                  <DateSelector value={dateChoice} onChange={setDateChoice} />

                  {/* Latest task info */}
                  {latestTask && (
                    <div style={{ padding: '10px 12px', backgroundColor: '#f6f6f7', borderRadius: '6px' }}>
                      <Text variant="bodySm" tone="subdued">
                        Last published task: <strong>{latestTask.title}</strong>
                      </Text>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '8px', borderTop: '1px solid #e1e3e5' }}>
                    <Button onClick={() => navigate('/transfer')}>Cancel</Button>

                    <Button
                      variant="primary"
                      onClick={() => handlePublish(selectedItemIds)}
                      disabled={selectedItemIds.length === 0 || isPublishing}
                      loading={isPublishing}
                    >
                      Publish Selected ({selectedItemIds.length})
                    </Button>

                    <Button
                      variant="primary"
                      onClick={() => handlePublish(items.map(i => i.id))}
                      disabled={items.length === 0 || isPublishing}
                      loading={isPublishing}
                    >
                      Publish All ({items.length})
                    </Button>

                    <Button
                      onClick={() => handleAddToTask(selectedItemIds)}
                      disabled={selectedItemIds.length === 0 || isAdding || !latestTask}
                      loading={isAdding}
                    >
                      Add Selected to Task
                    </Button>

                    <Button
                      onClick={() => handleAddToTask(items.map(i => i.id))}
                      disabled={items.length === 0 || isAdding || !latestTask}
                      loading={isAdding}
                    >
                      Add All to Task
                    </Button>

                    <Button onClick={() => setSettingsOpen(true)}>Settings</Button>
                  </div>

                  {/* Select all / deselect all */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleSelectAll}
                      style={{ background: 'none', border: 'none', color: '#005bd3', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                    >
                      Select all ({items.length})
                    </button>
                    {selectedItemIds.length > 0 && (
                      <button
                        onClick={handleDeselectAll}
                        style={{ background: 'none', border: 'none', color: '#6d7175', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                      >
                        Deselect all
                      </button>
                    )}
                  </div>

                </BlockStack>
              </div>
            </Card>
          </Layout.Section>

          {/* Item list */}
          <Layout.Section>
            <Card>
              {items.length === 0 ? (
                <div style={{ padding: '24px' }}>
                  <Banner>No waiting items without a Connecteam task.</Banner>
                </div>
              ) : (
                items.map(item => renderItem(item))
              )}
            </Card>
          </Layout.Section>
        </Layout>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSave={handleSaveSettings}
        />

        {toastMarkup}
      </Page>
    </Frame>
  );
};

export default ConnecteamTask;