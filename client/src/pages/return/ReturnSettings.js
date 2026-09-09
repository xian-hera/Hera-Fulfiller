import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Tabs, TextField, Select, Checkbox, Button, ButtonGroup, BlockStack, InlineStack, Text,
  Modal, Divider, Banner, Spinner
} from '@shopify/polaris';
import { ChevronUpIcon, ChevronDownIcon } from '@shopify/polaris-icons';
import api from '../../api/axios';
import ReturnNav from '../../components/ReturnNav';

// 六个板块（方案文档第九节）。用一个次级 Tabs 切换，每个板块自己管自己的数据/保存，
// 不做全局 unsaved-changes save bar —— 功能优先，简单可靠比照抄 Shopify 原生交互更重要。
const BOARDS = [
  { id: 'policy', content: 'Policy' },
  { id: 'reasons', content: 'Reasons' },
  { id: 'photo', content: 'Photo upload' },
  { id: 'questions', content: 'Questions' },
  { id: 'klaviyo', content: 'Klaviyo Integration' },
  { id: 'canadapost', content: 'Canada Post Integration' }
];

const REQUIREMENT_OPTIONS = [
  { label: 'Disable', value: 'disabled' },
  { label: 'Optional', value: 'optional' },
  { label: 'Required', value: 'required' }
];

// ── Policy ────────────────────────────────────────────────────────────────

function PolicyBoard() {
  const [windowDays, setWindowDays] = useState('30');
  const [windowBasis, setWindowBasis] = useState('placed');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/return-settings/policy').then(res => {
      setWindowDays(String(res.data.windowDays));
      setWindowBasis(res.data.windowBasis);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/return-settings/policy', { windowDays: parseInt(windowDays, 10), windowBasis });
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Policy</Text>
      <Text as="p" tone="subdued">time window.</Text>
      <InlineStack gap="200" blockAlign="center">
        <Text as="span">Allow customers to initiate a return up to</Text>
        <div style={{ width: '80px' }}>
          <TextField label="days" labelHidden type="number" value={windowDays} onChange={setWindowDays} autoComplete="off" />
        </div>
        <Text as="span">days after order</Text>
        <div style={{ width: '140px' }}>
          <Select
            label="basis" labelHidden
            options={[{ label: 'Placed', value: 'placed' }, { label: 'Fulfilled', value: 'fulfilled' }]}
            value={windowBasis} onChange={setWindowBasis}
          />
        </div>
      </InlineStack>
      <div style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </div>
    </Card>
  );
}

// ── Reasons ───────────────────────────────────────────────────────────────

function ReasonsBoard() {
  const [tab, setTab] = useState(0);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/return-settings/reasons').then(res => setReasons(res.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateLocal = (id, field, value) => {
    setReasons(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addReason = () => {
    // 本地占位行，id 为负数临时 key，还没落库；填了 name 点 Save 才真的 POST
    setReasons(prev => [...prev, { id: -Date.now(), name: '', name_fr: '', note_requirement: 'disabled', photo_requirement: 'disabled', _isNew: true }]);
  };

  const saveReason = async (reason) => {
    if (!reason.name || !reason.name.trim()) {
      window.alert('Reason name is required.');
      return;
    }
    setSavingId(reason.id);
    try {
      if (reason._isNew) {
        await api.post('/api/return-settings/reasons', {
          name: reason.name, nameFr: reason.name_fr,
          noteRequirement: reason.note_requirement, photoRequirement: reason.photo_requirement
        });
      } else {
        await api.patch(`/api/return-settings/reasons/${reason.id}`, {
          name: reason.name, nameFr: reason.name_fr,
          noteRequirement: reason.note_requirement, photoRequirement: reason.photo_requirement
        });
      }
      await load();
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSavingId(null);
    }
  };

  const archiveReason = async (id) => {
    if (id < 0) { setReasons(prev => prev.filter(r => r.id !== id)); return; }
    if (!window.confirm('Archive this reason? It will disappear from this list but stay visible on past returns.')) return;
    await api.patch(`/api/return-settings/reasons/${id}/archive`);
    load();
  };

  const move = async (index, direction) => {
    const newOrder = [...reasons];
    const target = index + direction;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setReasons(newOrder);
    const orderedIds = newOrder.filter(r => r.id > 0).map(r => r.id);
    await api.patch('/api/return-settings/reasons/reorder', { orderedIds });
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Reasons</Text>
      <Tabs tabs={[{ id: 'r', content: 'Reasons' }, { id: 't', content: 'Translations' }]} selected={tab} onSelect={setTab} />
      <div style={{ marginTop: '1rem' }}>
        {tab === 0 ? (
          <BlockStack gap="300">
            {reasons.map((r, index) => (
              <InlineStack key={r.id} gap="200" blockAlign="center" wrap={false}>
                <ButtonGroupUpDown onUp={() => move(index, -1)} onDown={() => move(index, 1)} disabledUp={index === 0} disabledDown={index === reasons.length - 1} />
                <div style={{ flex: 1 }}>
                  <TextField label="name" labelHidden placeholder="Input reason" value={r.name} onChange={(v) => updateLocal(r.id, 'name', v)} autoComplete="off" />
                </div>
                <div style={{ width: '150px' }}>
                  <Select label="note" labelHidden options={REQUIREMENT_OPTIONS} value={r.note_requirement} onChange={(v) => updateLocal(r.id, 'note_requirement', v)} />
                </div>
                <div style={{ width: '150px' }}>
                  <Select label="photo" labelHidden options={REQUIREMENT_OPTIONS} value={r.photo_requirement} onChange={(v) => updateLocal(r.id, 'photo_requirement', v)} />
                </div>
                <Button onClick={() => saveReason(r)} loading={savingId === r.id}>Save</Button>
                <Button tone="critical" onClick={() => archiveReason(r.id)}>Archive</Button>
              </InlineStack>
            ))}
            <Button onClick={addReason}>+ Add reason</Button>
          </BlockStack>
        ) : (
          <BlockStack gap="300">
            <Text as="span" fontWeight="semibold">French</Text>
            {reasons.map(r => (
              <div key={r.id}>
                <Text as="p" tone="subdued">{r.name || '(unnamed)'}</Text>
                <InlineStack gap="200">
                  <div style={{ flex: 1 }}>
                    <TextField label="fr" labelHidden value={r.name_fr || ''} onChange={(v) => updateLocal(r.id, 'name_fr', v)} autoComplete="off" />
                  </div>
                  <Button onClick={() => saveReason(r)} loading={savingId === r.id} disabled={r._isNew}>Save</Button>
                </InlineStack>
              </div>
            ))}
          </BlockStack>
        )}
      </div>
    </Card>
  );
}

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

// ── Photo upload ──────────────────────────────────────────────────────────

function PhotoUploadBoard() {
  const [minPhotos, setMinPhotos] = useState('1');
  const [maxPhotos, setMaxPhotos] = useState('3');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/return-settings/photo-upload').then(res => {
      setMinPhotos(String(res.data.minPhotos));
      setMaxPhotos(String(res.data.maxPhotos));
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/return-settings/photo-upload', { minPhotos: parseInt(minPhotos, 10), maxPhotos: parseInt(maxPhotos, 10) });
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Photo upload</Text>
      <Text as="p" tone="subdued">Configure how portal users can attach files to their returns</Text>
      <InlineStack gap="200" blockAlign="center">
        <Text as="span">When photo is required, minimum photo</Text>
        <div style={{ width: '70px' }}>
          <TextField label="min" labelHidden type="number" value={minPhotos} onChange={setMinPhotos} autoComplete="off" />
        </div>
        <Text as="span">maximum</Text>
        <div style={{ width: '70px' }}>
          <TextField label="max" labelHidden type="number" value={maxPhotos} onChange={setMaxPhotos} autoComplete="off" />
        </div>
      </InlineStack>
      <div style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </div>
    </Card>
  );
}

// ── Questions ─────────────────────────────────────────────────────────────

const CONDITION_PROPERTIES = [
  { label: 'Product tag', value: 'product_tag' },
  { label: 'Product collection', value: 'product_collection' },
  { label: 'Reason', value: 'reason' }
];

function emptyCondition() { return { property: 'product_tag', operator: 'contains', value: '' }; }

function QuestionModal({ question, allQuestions, reasons, onClose, onSaved }) {
  const [body, setBody] = useState(question?.body || '');
  const [bodyFr, setBodyFr] = useState(question?.body_fr || '');
  const [triggerMode, setTriggerMode] = useState(question?.trigger_mode || 'always');
  const [conditionLogic, setConditionLogic] = useState(question?.condition_logic || 'AND');
  const [conditions, setConditions] = useState(question?.conditions && question.conditions.length > 0 ? question.conditions : [emptyCondition()]);
  const [answerType, setAnswerType] = useState(question?.answer_type || 'text');
  const [options, setOptions] = useState(question?.options && question.options.length > 0 ? question.options : [{ text: '', textFr: '' }, { text: '', textFr: '' }]);
  const [saving, setSaving] = useState(false);

  const parent = question?.parent_question_id ? allQuestions.find(q => q.id === question.parent_question_id) : null;

  const updateCondition = (index, field, value) => {
    setConditions(prev => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const save = async () => {
    if (!body.trim()) { window.alert('Question body is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        body: body.trim(), bodyFr,
        triggerMode, conditionLogic,
        conditions: triggerMode === 'only_when' ? conditions : [],
        answerType,
        options: answerType === 'options' ? options : []
      };
      if (question?.id) {
        await api.patch(`/api/return-settings/questions/${question.id}`, payload);
      } else {
        await api.post('/api/return-settings/questions', { ...payload, parentQuestionId: question?.parent_question_id || null });
      }
      onSaved();
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!question?.id) { onClose(); return; }
    if (!window.confirm('Delete this question? Its follow-up chain will be deleted too.')) return;
    setSaving(true);
    try {
      await api.delete(`/api/return-settings/questions/${question.id}`);
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
      title={question?.id ? 'Edit question' : 'New question'}
      primaryAction={{ content: 'Save', onAction: save, loading: saving }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          {parent && <Text as="p" tone="caution">follow-up of "{parent.body}"</Text>}
          <TextField
            label="Question body" placeholder="Type in the question"
            value={body} onChange={setBody} autoComplete="off"
            helpText="Variables you can type in manually: {lineitem product title}, {lineitem quantity}, {lineitem variant name}"
          />
          <TextField label="Question body in French" value={bodyFr} onChange={setBodyFr} autoComplete="off" />

          <Divider />

          <Select
            label="Ask this question"
            options={[{ label: 'always', value: 'always' }, { label: 'only when', value: 'only_when' }]}
            value={triggerMode} onChange={setTriggerMode}
          />
          {triggerMode === 'only_when' && (
            <BlockStack gap="200">
              <Select
                label="Match" options={[{ label: 'AND — all conditions', value: 'AND' }, { label: 'OR — any condition', value: 'OR' }]}
                value={conditionLogic} onChange={setConditionLogic}
              />
              {conditions.map((c, i) => (
                <InlineStack key={i} gap="200" blockAlign="center">
                  <div style={{ width: '180px' }}>
                    <Select label="property" labelHidden options={CONDITION_PROPERTIES} value={c.property} onChange={(v) => updateCondition(i, 'property', v)} />
                  </div>
                  {c.property === 'reason' ? (
                    <>
                      <div style={{ width: '110px' }}>
                        <Select label="op" labelHidden options={[{ label: 'is', value: 'is' }, { label: 'is not', value: 'is_not' }]} value={c.operator} onChange={(v) => updateCondition(i, 'operator', v)} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Select
                          label="value" labelHidden
                          options={[{ label: 'Select a reason', value: '' }, ...reasons.map(r => ({ label: r.name, value: r.name }))]}
                          value={c.value} onChange={(v) => updateCondition(i, 'value', v)}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: '160px' }}>
                        <Select label="op" labelHidden options={[{ label: 'contains', value: 'contains' }, { label: 'does not contain', value: 'does_not_contain' }]} value={c.operator} onChange={(v) => updateCondition(i, 'operator', v)} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <TextField label="value" labelHidden value={c.value} onChange={(v) => updateCondition(i, 'value', v)} autoComplete="off" />
                      </div>
                    </>
                  )}
                  {conditions.length > 1 && (
                    <Button tone="critical" size="slim" onClick={() => setConditions(prev => prev.filter((_, idx) => idx !== i))}>×</Button>
                  )}
                </InlineStack>
              ))}
              <Button onClick={() => setConditions(prev => [...prev, emptyCondition()])}>+ add condition</Button>
            </BlockStack>
          )}

          <Divider />

          <Select
            label="Answer type"
            options={[{ label: 'Boolean', value: 'boolean' }, { label: 'Options', value: 'options' }, { label: 'Text', value: 'text' }]}
            value={answerType} onChange={setAnswerType}
          />
          {answerType === 'options' && (
            <BlockStack gap="200">
              {options.map((opt, i) => (
                <InlineStack key={i} gap="200" blockAlign="center">
                  <div style={{ flex: 1 }}>
                    <TextField label="option" labelHidden value={opt.text} onChange={(v) => setOptions(prev => prev.map((o, idx) => (idx === i ? { ...o, text: v } : o)))} autoComplete="off" />
                  </div>
                  <Button tone="critical" onClick={() => setOptions(prev => prev.filter((_, idx) => idx !== i))}>Delete</Button>
                </InlineStack>
              ))}
              <Button onClick={() => setOptions(prev => [...prev, { text: '', textFr: '' }])}>+ add option</Button>
            </BlockStack>
          )}

          <Divider />
          {question?.id && (question.depth || 0) < 2 && !allQuestions.some(q => q.parent_question_id === question.id) && (
            <Button onClick={async () => {
              try {
                await api.post('/api/return-settings/questions', {
                  parentQuestionId: question.id, body: 'New follow-up question', answerType: 'text'
                });
                window.alert('A follow-up question has been added, close this modal to edit it.');
                onSaved();
              } catch (e) {
                window.alert(e.response?.data?.error || e.message);
              }
            }}>+ add a follow up question</Button>
          )}

          {question?.id && <Button tone="critical" onClick={remove} loading={saving}>Delete question</Button>}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function QuestionsBoard() {
  const [tab, setTab] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // question object | { parent_question_id } | 'new' | null

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/return-settings/questions'),
      api.get('/api/return-settings/reasons')
    ]).then(([qRes, rRes]) => {
      setQuestions(qRes.data);
      setReasons(rRes.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveTranslation = async (q, field, value) => {
    await api.patch(`/api/return-settings/questions/${q.id}`, { [field]: value });
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Questions</Text>
      <Text as="p" tone="subdued">Configure the questions will be asked during initial return request</Text>
      <Tabs tabs={[{ id: 'q', content: 'Questions' }, { id: 't', content: 'Translations' }]} selected={tab} onSelect={setTab} />
      <div style={{ marginTop: '1rem' }}>
        {tab === 0 ? (
          <BlockStack gap="200">
            {questions.map(q => (
              <InlineStack key={q.id} gap="200" blockAlign="center">
                <div style={{ marginLeft: `${(q.depth || 0) * 24}px` }}>
                  <Text as="span">{q.depth > 0 ? '↳ ' : ''}{q.body}</Text>
                </div>
                <Button onClick={() => setEditing(q)}>Edit</Button>
              </InlineStack>
            ))}
            <Button onClick={() => setEditing({})}>+ Add new question</Button>
          </BlockStack>
        ) : (
          <BlockStack gap="300">
            <Text as="span" fontWeight="semibold">French</Text>
            {questions.map(q => (
              <div key={q.id} style={{ marginLeft: `${(q.depth || 0) * 24}px` }}>
                <Text as="p" tone="subdued">{q.body}</Text>
                <TextField
                  label="fr" labelHidden defaultValue={q.body_fr || ''}
                  onBlur={(e) => saveTranslation(q, 'bodyFr', e.target.value)}
                  autoComplete="off"
                />
              </div>
            ))}
          </BlockStack>
        )}
      </div>
      {editing !== null && (
        <QuestionModal
          question={editing.id ? editing : (editing.parent_question_id ? editing : null)}
          allQuestions={questions}
          reasons={reasons}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </Card>
  );
}

// ── Klaviyo Integration ───────────────────────────────────────────────────

const KLAVIYO_EVENTS = [
  { key: 'request_submitted', label: 'Return request submitted' },
  { key: 'approved', label: 'Return request approved' },
  { key: 'rejected', label: 'Return request rejected' },
  { key: 'received', label: 'Return received' },
  { key: 'refund_issued', label: 'Refund issued' }
];

function KlaviyoBoard() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/return-settings/klaviyo').then(res => {
      setConnected(res.data.connected);
      setEvents(res.data.events);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/return-settings/klaviyo/events', events);
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Klaviyo Integration</Text>
      <Banner tone={connected ? 'success' : 'warning'}>
        {connected
          ? 'Connected — KLAVIYO_API_KEY is configured on the server.'
          : 'Not connected — set KLAVIYO_API_KEY in the server environment (Render) to enable Klaviyo notifications.'}
      </Banner>
      <div style={{ marginTop: '1rem' }}>
        <Text as="p">Turn events on/off (default all on):</Text>
        <BlockStack gap="150">
          {KLAVIYO_EVENTS.map(e => (
            <Checkbox
              key={e.key} label={e.label}
              checked={!!events[e.key]}
              onChange={(v) => setEvents(prev => ({ ...prev, [e.key]: v }))}
            />
          ))}
        </BlockStack>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </div>
    </Card>
  );
}

// ── Canada Post Integration ───────────────────────────────────────────────

const SERVICE_CODE_OPTIONS = [
  { label: 'Regular Parcel (DOM.RP)', value: 'DOM.RP' },
  { label: 'Expedited Parcel (DOM.EP)', value: 'DOM.EP' },
  { label: 'Xpresspost (DOM.XP)', value: 'DOM.XP' },
  { label: 'Priority (DOM.PC)', value: 'DOM.PC' }
];

function CanadaPostBoard() {
  const [address, setAddress] = useState({ name: '', company: '', address1: '', address2: '', city: '', province: '', postalCode: '' });
  const [labelType, setLabelType] = useState('label_free');
  const [boxFree, setBoxFree] = useState(false);
  const [serviceCode, setServiceCode] = useState('DOM.EP');
  const [notifyEmails, setNotifyEmails] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/return-settings/canada-post').then(res => {
      const d = res.data;
      if (d.returnAddress) setAddress(d.returnAddress);
      setLabelType(d.labelType);
      setBoxFree(d.boxFree);
      setServiceCode(d.serviceCode);
      setNotifyEmails((d.notifyEmails || []).join(', '));
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const emails = notifyEmails.split(',').map(e => e.trim()).filter(Boolean);
      if (emails.length > 4) {
        window.alert('Up to 4 notification emails.');
        setSaving(false);
        return;
      }
      await api.patch('/api/return-settings/canada-post', {
        returnAddress: address, labelType, boxFree, serviceCode, notifyEmails: emails
      });
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><Spinner /></Card>;

  return (
    <Card>
      <Text as="h2" variant="headingMd">Canada Post Integration</Text>
      <Text as="p" tone="subdued">API key is shared with the outbound-shipping integration — only Return-specific settings live here.</Text>
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Return address</Text>
        <TextField label="Name" value={address.name} onChange={(v) => setAddress(a => ({ ...a, name: v }))} autoComplete="off" />
        <TextField label="Company (optional)" value={address.company || ''} onChange={(v) => setAddress(a => ({ ...a, company: v }))} autoComplete="off" />
        <TextField label="Address line 1" value={address.address1} onChange={(v) => setAddress(a => ({ ...a, address1: v }))} autoComplete="off" />
        <TextField label="Address line 2 (optional)" value={address.address2 || ''} onChange={(v) => setAddress(a => ({ ...a, address2: v }))} autoComplete="off" />
        <TextField label="City" value={address.city} onChange={(v) => setAddress(a => ({ ...a, city: v }))} autoComplete="off" />
        <TextField label="Province" value={address.province} onChange={(v) => setAddress(a => ({ ...a, province: v }))} autoComplete="off" />
        <TextField label="Postal code" value={address.postalCode} onChange={(v) => setAddress(a => ({ ...a, postalCode: v }))} autoComplete="off" />

        <Divider />

        <Select
          label="Label type"
          options={[{ label: 'Label Free (QR code, scan at store)', value: 'label_free' }, { label: 'Printing at home (PDF)', value: 'printing_at_home' }]}
          value={labelType} onChange={setLabelType}
        />
        <Checkbox
          label="Box-free (combined parcel must fit in a 47cm × 61cm × 5cm envelope and weigh under 22kg)"
          checked={boxFree} onChange={setBoxFree}
        />
        <Select label="Default service type" options={SERVICE_CODE_OPTIONS} value={serviceCode} onChange={setServiceCode} />
        <TextField
          label="Additional notification emails (comma separated, up to 4)"
          value={notifyEmails} onChange={setNotifyEmails} autoComplete="off"
          helpText="Canada Post shipment-status emails (shipped / exception / delivered) — the initial QR code email is sent by us via Klaviyo, not this."
        />
      </BlockStack>
      <div style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </div>
    </Card>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────

function ReturnSettings() {
  const [selectedBoard, setSelectedBoard] = useState(0);

  return (
    <ReturnNav activeTabId="settings" title="Settings">
      <Tabs tabs={BOARDS} selected={selectedBoard} onSelect={setSelectedBoard} />
      <div style={{ marginTop: '1rem' }}>
        {BOARDS[selectedBoard].id === 'policy' && <PolicyBoard />}
        {BOARDS[selectedBoard].id === 'reasons' && <ReasonsBoard />}
        {BOARDS[selectedBoard].id === 'photo' && <PhotoUploadBoard />}
        {BOARDS[selectedBoard].id === 'questions' && <QuestionsBoard />}
        {BOARDS[selectedBoard].id === 'klaviyo' && <KlaviyoBoard />}
        {BOARDS[selectedBoard].id === 'canadapost' && <CanadaPostBoard />}
      </div>
    </ReturnNav>
  );
}

export default ReturnSettings;
