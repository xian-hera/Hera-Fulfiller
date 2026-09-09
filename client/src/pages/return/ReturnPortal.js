import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Tabs, TextField, Select, Checkbox, Button, ButtonGroup, BlockStack, InlineStack, Text,
  Modal, Spinner, EmptyState
} from '@shopify/polaris';
import { ChevronUpIcon, ChevronDownIcon } from '@shopify/polaris-icons';
import api from '../../api/axios';
import ReturnNav from '../../components/ReturnNav';

// 五个板块（方案文档第十一节）。跟 ReturnSettings 一样，每个板块自己管自己的数据/保存，
// 不做全局 unsaved-changes save bar —— 功能优先。
const BOARDS = [
  { id: 'locations', content: 'Location mapping' },
  { id: 'branding', content: 'Branding color' },
  { id: 'policy', content: 'Return policy' },
  { id: 'messages', content: 'Messages before submitting' },
  { id: 'wording', content: 'Wording and translation' }
];

// 🆕 改成 Polaris 自带的 segmented ButtonGroup —— 两个按钮会渲染成一个整体的方形控件
// （中间一条分割线，外边框合在一起），比之前两个各自独立、带间距的方形按钮紧凑很多，
// 纯 Polaris 组件，不需要额外的拖拽库或者自定义 CSS。
function ButtonGroupUpDown({ onUp, onDown, disabledUp, disabledDown }) {
  return (
    <ButtonGroup variant="segmented">
      <Button icon={ChevronUpIcon} size="slim" onClick={onUp} disabled={disabledUp} accessibilityLabel="Move up" />
      <Button icon={ChevronDownIcon} size="slim" onClick={onDown} disabled={disabledDown} accessibilityLabel="Move down" />
    </ButtonGroup>
  );
}

// ── Location mapping ─────────────────────────────────────────────────────
// 每个 Shopify location 对应一个门店，展示地址/营业时间给顾客选"到店退货"时用（方案文档 11.1）

function LocationsBoard() {
  const [locations, setLocations] = useState([]);
  const [shopifyLocations, setShopifyLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/return-portal/locations'),
      api.get('/api/return-settings/shopify-locations')
    ]).then(([lRes, sRes]) => {
      setLocations(lRes.data);
      setShopifyLocations(sRes.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateLocal = (id, field, value) => {
    setLocations(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const addLocation = () => {
    setLocations(prev => [...prev, {
      id: -Date.now(), shopify_location_id: '', store_name: '', store_address: '', store_city: '', opening_hours: '', _isNew: true
    }]);
  };

  const saveLocation = async (loc) => {
    if (!loc.shopify_location_id) {
      window.alert('Please select a Shopify location.');
      return;
    }
    setSavingId(loc.id);
    try {
      const payload = {
        shopifyLocationId: loc.shopify_location_id,
        storeName: loc.store_name, storeAddress: loc.store_address,
        storeCity: loc.store_city, openingHours: loc.opening_hours
      };
      if (loc._isNew) {
        await api.post('/api/return-portal/locations', payload);
      } else {
        await api.patch(`/api/return-portal/locations/${loc.id}`, payload);
      }
      await load();
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSavingId(null);
    }
  };

  const removeLocation = async (id) => {
    if (id < 0) { setLocations(prev => prev.filter(l => l.id !== id)); return; }
    if (!window.confirm('Remove this store from the return portal?')) return;
    await api.delete(`/api/return-portal/locations/${id}`);
    load();
  };

  const move = async (index, direction) => {
    const newOrder = [...locations];
    const target = index + direction;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setLocations(newOrder);
    const orderedIds = newOrder.filter(l => l.id > 0).map(l => l.id);
    await api.patch('/api/return-portal/locations/reorder', { orderedIds });
  };

  if (loading) return <Card><Spinner /></Card>;

  const locationOptions = [
    { label: 'Select a Shopify location', value: '' },
    ...shopifyLocations.map(l => ({ label: l.name, value: String(l.id) }))
  ];

  return (
    <Card>
      <Text as="h2" variant="headingMd">Location mapping</Text>
      <Text as="p" tone="subdued">Stores customers can choose to drop off a return in-person. Order matters for how they're listed in the portal.</Text>
      <div style={{ marginTop: '1rem' }}>
        <BlockStack gap="400">
          {locations.map((l, index) => (
            <Card key={l.id} background="bg-surface-secondary">
              <InlineStack gap="200" blockAlign="center" wrap={false}>
                <ButtonGroupUpDown onUp={() => move(index, -1)} onDown={() => move(index, 1)} disabledUp={index === 0} disabledDown={index === locations.length - 1} />
                <div style={{ flex: 1 }}>
                  <Select label="Shopify location" options={locationOptions} value={String(l.shopify_location_id || '')} onChange={(v) => updateLocal(l.id, 'shopify_location_id', v)} />
                </div>
              </InlineStack>
              <div style={{ marginTop: '0.75rem' }}>
                <BlockStack gap="200">
                  <TextField label="Store name (shown to customer)" value={l.store_name || ''} onChange={(v) => updateLocal(l.id, 'store_name', v)} autoComplete="off" />
                  <TextField label="Address" value={l.store_address || ''} onChange={(v) => updateLocal(l.id, 'store_address', v)} autoComplete="off" />
                  <TextField label="City" value={l.store_city || ''} onChange={(v) => updateLocal(l.id, 'store_city', v)} autoComplete="off" />
                  <TextField label="Opening hours" value={l.opening_hours || ''} onChange={(v) => updateLocal(l.id, 'opening_hours', v)} autoComplete="off" multiline={2} />
                  <InlineStack gap="200">
                    <Button onClick={() => saveLocation(l)} loading={savingId === l.id}>Save</Button>
                    <Button tone="critical" onClick={() => removeLocation(l.id)}>Remove</Button>
                  </InlineStack>
                </BlockStack>
              </div>
            </Card>
          ))}
          <Button onClick={addLocation}>+ Add store</Button>
        </BlockStack>
      </div>
    </Card>
  );
}

// ── Branding color ───────────────────────────────────────────────────────

function BrandingBoard() {
  const [color, setColor] = useState('#E32A69');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/return-portal/branding').then(res => setColor(res.data.color)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      window.alert('Please enter a valid hex color, e.g. #E32A69');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/return-portal/branding', { color });
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Branding color</Text>
      <Text as="p" tone="subdued">Used for buttons and accents on the customer-facing return portal.</Text>
      <div style={{ marginTop: '1rem' }}>
        <InlineStack gap="300" blockAlign="center">
          <div style={{ width: '200px' }}>
            <TextField label="Hex color" labelHidden value={color} onChange={setColor} autoComplete="off" placeholder="#E32A69" />
          </div>
          <div style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : 'transparent' }} />
        </InlineStack>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </div>
    </Card>
  );
}

// ── Return policy ─────────────────────────────────────────────────────────

function ReturnPolicyBoard() {
  const [showLink, setShowLink] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/return-portal/return-policy').then(res => {
      setShowLink(res.data.showLink);
      setUrl(res.data.url || '');
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (showLink && !url.trim()) {
      window.alert('Please enter a URL, or turn the link off.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/return-portal/return-policy', { showLink, url: url.trim() });
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Return policy</Text>
      <Text as="p" tone="subdued">Show a link to your store's return policy on the portal.</Text>
      <div style={{ marginTop: '1rem' }}>
        <BlockStack gap="300">
          <Checkbox label="Show a return policy link on the portal" checked={showLink} onChange={setShowLink} />
          {showLink && (
            <TextField label="Return policy URL" value={url} onChange={setUrl} autoComplete="off" placeholder="https://" />
          )}
        </BlockStack>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </div>
    </Card>
  );
}

// ── Messages before submitting ───────────────────────────────────────────

const MESSAGE_CONDITION_OPTIONS = [
  { label: 'Always', value: 'always' },
  { label: 'Free shipping', value: 'free_shipping' },
  { label: 'Return to store', value: 'return_to_store' },
  { label: 'Return by shipping', value: 'return_by_shipping' },
  { label: 'Auto approved', value: 'auto_approved' },
  { label: 'Not auto approved', value: 'not_auto_approved' }
];

function MessageModal({ message, onClose, onSaved }) {
  const [title, setTitle] = useState(message.title || '');
  const [titleFr, setTitleFr] = useState(message.title_fr || '');
  const [body, setBody] = useState(message.body || '');
  const [bodyFr, setBodyFr] = useState(message.body_fr || '');
  const [conditionType, setConditionType] = useState(message.condition_type || 'always');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { window.alert('Message title is required.'); return; }
    setSaving(true);
    try {
      await api.patch(`/api/return-portal/messages/${message.id}`, { title: title.trim(), titleFr, body, bodyFr, conditionType });
      onSaved();
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={message._isNew ? 'New message' : 'Edit message'}
      primaryAction={{ content: 'Save', onAction: save, loading: saving }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <TextField label="Title" value={title} onChange={setTitle} autoComplete="off" />
          <TextField label="Title in French" value={titleFr} onChange={setTitleFr} autoComplete="off" />
          <TextField label="Body" value={body} onChange={setBody} autoComplete="off" multiline={3} />
          <TextField label="Body in French" value={bodyFr} onChange={setBodyFr} autoComplete="off" multiline={3} />
          <Select label="Show this message when" options={MESSAGE_CONDITION_OPTIONS} value={conditionType} onChange={setConditionType} />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function MessagesBoard() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/return-portal/messages').then(res => setMessages(res.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const addMessage = async () => {
    try {
      const res = await api.post('/api/return-portal/messages');
      await load();
      setEditing({ ...res.data, _isNew: true });
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    }
  };

  const removeMessage = async (id) => {
    if (!window.confirm('Delete this message?')) return;
    await api.delete(`/api/return-portal/messages/${id}`);
    load();
  };

  const move = async (index, direction) => {
    const newOrder = [...messages];
    const target = index + direction;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setMessages(newOrder);
    await api.patch('/api/return-portal/messages/reorder', { orderedIds: newOrder.map(m => m.id) });
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Messages before submitting</Text>
      <Text as="p" tone="subdued">Banners shown to the customer on the review step, based on how their return will be handled.</Text>
      <div style={{ marginTop: '1rem' }}>
        {messages.length === 0 ? (
          <EmptyState heading="No messages yet" image="">
            <p>Add a message to show customers before they submit a return.</p>
          </EmptyState>
        ) : (
          <BlockStack gap="200">
            {messages.map((m, index) => (
              <InlineStack key={m.id} gap="200" blockAlign="center" wrap={false}>
                <ButtonGroupUpDown onUp={() => move(index, -1)} onDown={() => move(index, 1)} disabledUp={index === 0} disabledDown={index === messages.length - 1} />
                <div style={{ flex: 1 }}>
                  <Text as="span" fontWeight="semibold">{m.title || '(untitled)'}</Text>
                  <div><Text as="span" tone="subdued">{MESSAGE_CONDITION_OPTIONS.find(o => o.value === m.condition_type)?.label || m.condition_type}</Text></div>
                </div>
                <Button onClick={() => setEditing(m)}>Edit</Button>
                <Button tone="critical" onClick={() => removeMessage(m.id)}>Delete</Button>
              </InlineStack>
            ))}
          </BlockStack>
        )}
        <div style={{ marginTop: '1rem' }}>
          <Button onClick={addMessage}>+ Add message</Button>
        </div>
      </div>
      {editing && (
        <MessageModal message={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </Card>
  );
}

// ── Wording and translation ──────────────────────────────────────────────
// Default 列由 Liquid portal 页面上线时 seed 进来（见 return-portal.js 的 upsertWordingDefault）。
// 建好之前这里会是空的——这是预期行为，不是 bug。

function WordingBoard() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback((term) => {
    setLoading(true);
    api.get('/api/return-portal/wording', { params: term ? { search: term } : {} })
      .then(res => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(''); }, [load]);

  const updateLocal = (key, field, value) => {
    setRows(prev => prev.map(r => (r.wording_key === key ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row) => {
    setSavingKey(row.wording_key);
    try {
      await api.patch(`/api/return-portal/wording/${row.wording_key}`, {
        modifiedText: row.modified_text || '', frenchText: row.french_text || ''
      });
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <Text as="h2" variant="headingMd">Wording and translation</Text>
      <Text as="p" tone="subdued">Override the default text shown on the portal, and provide French translations. Clear "Modified" to restore the default.</Text>
      <div style={{ marginTop: '1rem' }}>
        <TextField
          label="Search" labelHidden placeholder="Search wording..."
          value={search}
          onChange={(v) => { setSearch(v); load(v); }}
          autoComplete="off"
        />
      </div>
      <div style={{ marginTop: '1rem' }}>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState heading="No wording entries yet" image="">
            <p>Wording entries are created automatically once the customer-facing portal pages are built.</p>
          </EmptyState>
        ) : (
          <BlockStack gap="400">
            {rows.map(r => (
              <Card key={r.wording_key} background="bg-surface-secondary">
                <Text as="p" tone="subdued">{r.default_text}</Text>
                <div style={{ marginTop: '0.5rem' }}>
                  <BlockStack gap="200">
                    <TextField label="Modified" value={r.modified_text || ''} onChange={(v) => updateLocal(r.wording_key, 'modified_text', v)} autoComplete="off" placeholder={r.default_text} />
                    <TextField label="French" value={r.french_text || ''} onChange={(v) => updateLocal(r.wording_key, 'french_text', v)} autoComplete="off" />
                    <div>
                      <Button onClick={() => saveRow(r)} loading={savingKey === r.wording_key}>Save</Button>
                    </div>
                  </BlockStack>
                </div>
              </Card>
            ))}
          </BlockStack>
        )}
      </div>
    </Card>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────

function ReturnPortal() {
  const [selectedBoard, setSelectedBoard] = useState(0);

  return (
    <ReturnNav activeTabId="portal" title="Portal">
      <Tabs tabs={BOARDS} selected={selectedBoard} onSelect={setSelectedBoard} />
      <div style={{ marginTop: '1rem' }}>
        {BOARDS[selectedBoard].id === 'locations' && <LocationsBoard />}
        {BOARDS[selectedBoard].id === 'branding' && <BrandingBoard />}
        {BOARDS[selectedBoard].id === 'policy' && <ReturnPolicyBoard />}
        {BOARDS[selectedBoard].id === 'messages' && <MessagesBoard />}
        {BOARDS[selectedBoard].id === 'wording' && <WordingBoard />}
      </div>
    </ReturnNav>
  );
}

export default ReturnPortal;
