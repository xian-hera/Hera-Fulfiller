import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Page, Layout, Card, TextField, Select, Checkbox, Button, BlockStack, InlineStack,
  Text, Divider, Banner, Spinner
} from '@shopify/polaris';
import api from '../../api/axios';

const PROPERTY_DEFS = [
  { value: 'customer.tags', label: 'Customer: Tags', operators: ['contains', 'does_not_contain'], valueType: 'text' },
  { value: 'order.date', label: 'Order: Date', operators: ['is', 'after', 'before'], valueType: 'date' },
  { value: 'order.days_since_ordered', label: 'Order: Days since ordered', operators: ['is', 'less_than', 'more_than'], valueType: 'number' },
  { value: 'order.fulfillment_location_id', label: 'Order: Line item fulfillment location ID', operators: ['is', 'is_not'], valueType: 'text' },
  { value: 'order.tags', label: 'Order: Tags', operators: ['contains', 'does_not_contain'], valueType: 'text' },
  { value: 'order.total', label: 'Order: Total', operators: ['is', 'less_than', 'larger_than'], valueType: 'number' },
  { value: 'order.remaining_value_after_returns', label: 'Order: Remaining value after returns', operators: ['is', 'less_than', 'larger_than'], valueType: 'number' },
  { value: 'order.sales_channel_name', label: 'Order: Shopify sales channel name', operators: ['is', 'is_not'], valueType: 'text' },
  { value: 'product.tags', label: 'Product: Tags', operators: ['contains', 'does_not_contain'], valueType: 'text' },
  { value: 'product.collections', label: 'Product: Collections', operators: ['contains', 'does_not_contain'], valueType: 'text' },
  { value: 'product.type', label: 'Product: Type', operators: ['is', 'is_not'], valueType: 'text' },
  { value: 'product.variant_sku', label: 'Product: Variant SKU', operators: ['is', 'is_not'], valueType: 'text' },
  { value: 'product.vendor', label: 'Product: Vendor', operators: ['is', 'is_not'], valueType: 'text' },
  { value: 'return.reason', label: 'Return: Reason', operators: ['is', 'is_not'], valueType: 'reason' },
  { value: 'return.total_value', label: 'Return: Total value', operators: ['is', 'less_than', 'larger_than'], valueType: 'number' },
  { value: 'return.total_weight', label: 'Return: Total weight in grams', operators: ['is', 'less_than', 'larger_than'], valueType: 'number' },
  { value: 'return.total_quantity', label: 'Return: Total quantity', operators: ['is', 'less_than', 'larger_than'], valueType: 'number' }
];

const OPERATOR_LABEL = {
  is: 'is', is_not: 'is not', contains: 'contains', does_not_contain: 'does not contain',
  less_than: 'less than', more_than: 'more than', larger_than: 'larger than', before: 'before', after: 'after'
};

const ACTION_OPTIONS = [
  { label: 'Do not allow return method', value: 'disallow_return_method' },
  { label: 'Require return approval', value: 'require_approval' },
  { label: 'Do not require return approval', value: 'skip_approval' },
  { label: 'Do not allow return reason', value: 'disallow_reason' },
  { label: 'Reject the return', value: 'reject_return' },
  { label: 'Allow replacement', value: 'allow_replacement' }
];

function propertyDef(property) { return PROPERTY_DEFS.find(p => p.value === property) || PROPERTY_DEFS[0]; }

function emptyCondition() { return { property: 'customer.tags', operator: 'contains', value: '' }; }
function emptyGroup() { return { conditions: [emptyCondition()], conditionsMatch: 'AND', matchAllItems: false }; }
function emptyAction() { return { type: 'require_approval', value: '', customerMessage: '', customerMessageFr: '' }; }

function ReturnRuleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [name, setName] = useState('');
  const [priority, setPriority] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [conditionGroups, setConditionGroups] = useState([emptyGroup()]);
  const [groupLogic, setGroupLogic] = useState('AND');
  const [actions, setActions] = useState([emptyAction()]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/return-settings/reasons').then(res => setReasons(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    api.get(`/api/return-rules/${id}`).then(res => {
      const r = res.data;
      setName(r.name);
      setPriority(String(r.priority));
      setIsActive(r.is_active);
      setConditionGroups(r.condition_groups && r.condition_groups.length > 0 ? r.condition_groups : [emptyGroup()]);
      setGroupLogic(r.group_logic || 'AND');
      setActions(r.actions && r.actions.length > 0 ? r.actions : [emptyAction()]);
    }).finally(() => setLoading(false));
  }, [id, isNew]);

  const updateGroup = (gi, field, value) => {
    setConditionGroups(prev => prev.map((g, i) => (i === gi ? { ...g, [field]: value } : g)));
  };
  const updateCondition = (gi, ci, field, value) => {
    setConditionGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g;
      const conditions = g.conditions.map((c, j) => {
        if (j !== ci) return c;
        const updated = { ...c, [field]: value };
        if (field === 'property') {
          updated.operator = propertyDef(value).operators[0];
          updated.value = '';
        }
        return updated;
      });
      return { ...g, conditions };
    }));
  };
  const addCondition = (gi) => {
    setConditionGroups(prev => prev.map((g, i) => (i === gi ? { ...g, conditions: [...g.conditions, emptyCondition()] } : g)));
  };
  const removeCondition = (gi, ci) => {
    setConditionGroups(prev => prev.map((g, i) => (i === gi ? { ...g, conditions: g.conditions.filter((_, j) => j !== ci) } : g)));
  };
  const addGroup = () => setConditionGroups(prev => [...prev, emptyGroup()]);
  const removeGroup = (gi) => setConditionGroups(prev => prev.filter((_, i) => i !== gi));

  const updateAction = (ai, field, value) => {
    setActions(prev => prev.map((a, i) => (i === ai ? { ...a, [field]: value } : a)));
  };
  const addAction = () => setActions(prev => [...prev, emptyAction()]);
  const removeAction = (ai) => setActions(prev => prev.filter((_, i) => i !== ai));

  const save = async () => {
    if (!name.trim()) { window.alert('Rule name is required.'); return; }
    const p = parseInt(priority, 10);
    if (!p || p < 1 || p > 30) { window.alert('Priority must be an integer between 1 and 30.'); return; }

    const payload = { name: name.trim(), conditionGroups, groupLogic, actions, priority: p };

    setSaving(true);
    try {
      if (isNew) {
        await api.post('/api/return-rules', payload);
      } else {
        await api.patch(`/api/return-rules/${id}`, payload);
      }
      navigate('/return/rules');
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this rule?')) return;
    await api.delete(`/api/return-rules/${id}`);
    navigate('/return/rules');
  };

  const toggleActive = async () => {
    const next = !isActive;
    setIsActive(next);
    if (!isNew) {
      await api.patch(`/api/return-rules/${id}/toggle`, { isActive: next });
    }
  };

  if (loading) return <Page title="Loading…"><Card><Spinner /></Card></Page>;

  return (
    <Page
      title={isNew ? 'Create rule' : 'Edit rule'}
      backAction={{ content: 'Rules', onAction: () => navigate('/return/rules') }}
      secondaryActions={[{ content: isActive ? 'Status: Active (click to disable)' : 'Status: Inactive (click to enable)', onAction: toggleActive }]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <Text as="h2" variant="headingMd">Name this rule</Text>
              <TextField label="Rule name" labelHidden placeholder="Enter a descriptive name" value={name} onChange={setName} autoComplete="off" />
            </Card>

            <Card>
              <Text as="h2" variant="headingMd">When</Text>
              <BlockStack gap="400">
                {conditionGroups.map((group, gi) => (
                  <React.Fragment key={gi}>
                    {gi > 0 && (
                      <InlineStack align="center" gap="200">
                        <Divider />
                        <Select
                          label="group logic" labelHidden
                          options={[{ label: 'AND', value: 'AND' }, { label: 'OR', value: 'OR' }]}
                          value={groupLogic} onChange={setGroupLogic}
                        />
                        <Divider />
                      </InlineStack>
                    )}
                    <Card>
                      <BlockStack gap="200">
                        {conditionGroups.length > 1 && (
                          <InlineStack align="end">
                            <Button variant="plain" tone="critical" onClick={() => removeGroup(gi)}>Remove group</Button>
                          </InlineStack>
                        )}
                        {group.conditions.map((c, ci) => {
                          const def = propertyDef(c.property);
                          return (
                            <InlineStack key={ci} gap="200" blockAlign="center">
                              <div style={{ width: '260px' }}>
                                <Select label="property" labelHidden options={PROPERTY_DEFS.map(p => ({ label: p.label, value: p.value }))} value={c.property} onChange={(v) => updateCondition(gi, ci, 'property', v)} />
                              </div>
                              <div style={{ width: '150px' }}>
                                <Select label="operator" labelHidden options={def.operators.map(o => ({ label: OPERATOR_LABEL[o], value: o }))} value={c.operator} onChange={(v) => updateCondition(gi, ci, 'operator', v)} />
                              </div>
                              <div style={{ flex: 1 }}>
                                {def.valueType === 'reason' ? (
                                  <Select
                                    label="value" labelHidden
                                    options={[{ label: 'Select a reason', value: '' }, ...reasons.map(r => ({ label: r.name, value: r.name }))]}
                                    value={c.value} onChange={(v) => updateCondition(gi, ci, 'value', v)}
                                  />
                                ) : (
                                  <TextField
                                    label="value" labelHidden autoComplete="off"
                                    type={def.valueType === 'number' ? 'number' : def.valueType === 'date' ? 'date' : 'text'}
                                    value={c.value} onChange={(v) => updateCondition(gi, ci, 'value', v)}
                                  />
                                )}
                              </div>
                              {group.conditions.length > 1 && (
                                <Button tone="critical" size="slim" onClick={() => removeCondition(gi, ci)}>×</Button>
                              )}
                            </InlineStack>
                          );
                        })}
                        <InlineStack align="space-between">
                          <Button variant="plain" onClick={() => addCondition(gi)}>+ Add condition</Button>
                          {group.conditions.length > 1 && (
                            <Select
                              label="conditionsMatch" labelHidden
                              options={[{ label: 'Match ALL conditions (AND)', value: 'AND' }, { label: 'Match ANY condition (OR)', value: 'OR' }]}
                              value={group.conditionsMatch} onChange={(v) => updateGroup(gi, 'conditionsMatch', v)}
                            />
                          )}
                        </InlineStack>
                        <Checkbox
                          label="Only apply this rule if all items in the return match these conditions"
                          checked={group.matchAllItems}
                          onChange={(v) => updateGroup(gi, 'matchAllItems', v)}
                        />
                      </BlockStack>
                    </Card>
                  </React.Fragment>
                ))}
                <Button variant="plain" onClick={addGroup}>+ Add condition group</Button>
              </BlockStack>
            </Card>

            <Card>
              <Text as="h2" variant="headingMd">Then</Text>
              <BlockStack gap="400">
                {actions.map((a, ai) => (
                  <React.Fragment key={ai}>
                    {ai > 0 && <Divider />}
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: '260px' }}>
                          <Select label="action" labelHidden options={ACTION_OPTIONS} value={a.type} onChange={(v) => updateAction(ai, 'type', v)} />
                        </div>
                        {a.type === 'disallow_return_method' && (
                          <div style={{ width: '180px' }}>
                            <Select
                              label="method" labelHidden
                              options={[{ label: 'Shipping', value: 'shipping' }, { label: 'In-store', value: 'in_store' }]}
                              value={a.value} onChange={(v) => updateAction(ai, 'value', v)}
                            />
                          </div>
                        )}
                        {a.type === 'disallow_reason' && (
                          <div style={{ width: '220px' }}>
                            <Select
                              label="reason" labelHidden
                              options={[{ label: 'Select a reason', value: '' }, ...reasons.map(r => ({ label: r.name, value: r.name }))]}
                              value={a.value} onChange={(v) => updateAction(ai, 'value', v)}
                            />
                          </div>
                        )}
                        {actions.length > 1 && (
                          <Button tone="critical" size="slim" onClick={() => removeAction(ai)}>×</Button>
                        )}
                      </InlineStack>
                      <TextField
                        label="Message displayed to the customer (optional)"
                        value={a.customerMessage} onChange={(v) => updateAction(ai, 'customerMessage', v)} autoComplete="off"
                      />
                      <TextField
                        label="Message in French (optional)"
                        value={a.customerMessageFr} onChange={(v) => updateAction(ai, 'customerMessageFr', v)} autoComplete="off"
                      />
                    </BlockStack>
                  </React.Fragment>
                ))}
                <Button variant="plain" onClick={addAction}>+ Add another action</Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <TextField
              label="Priority (1 = highest, 30 = lowest, must be unique)"
              type="number" value={priority} onChange={setPriority} autoComplete="off"
            />
            <Banner tone="info">Default is that every matched rule's actions all apply. Only truly conflicting actions (e.g. reject vs. skip approval) fall back to whichever matched rule has the smaller priority number.</Banner>
            <div style={{ marginTop: '1rem' }}>
              <Button variant="primary" fullWidth onClick={save} loading={saving}>Save</Button>
            </div>
          </Card>
          {!isNew && (
            <div style={{ marginTop: '1rem' }}>
              <Button tone="critical" fullWidth onClick={remove}>Delete rule</Button>
            </div>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default ReturnRuleDetail;
