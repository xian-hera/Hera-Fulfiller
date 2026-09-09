import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndexTable, Card, Text, Button, useIndexResourceState, Spinner, EmptyState } from '@shopify/polaris';
import api from '../../api/axios';
import ReturnNav from '../../components/ReturnNav';
import { summarizeConditions, summarizeActions } from './ruleSummary';

function ReturnRules() {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/return-rules').then(res => setRules(res.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const { selectedResources } = useIndexResourceState(rules);

  const toggle = async (rule) => {
    setTogglingId(rule.id);
    try {
      await api.patch(`/api/return-rules/${rule.id}/toggle`, { isActive: !rule.is_active });
      load();
    } catch (e) {
      window.alert(e.response?.data?.error || e.message);
    } finally {
      setTogglingId(null);
    }
  };

  const rowMarkup = rules.map((rule, index) => (
    <IndexTable.Row id={String(rule.id)} key={rule.id} position={index} selected={selectedResources.includes(String(rule.id))}>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          <span style={{ cursor: 'pointer', color: '#005bd3' }} onClick={() => navigate(`/return/rules/${rule.id}`)}>{rule.name}</span>
        </Text>
        <div><Text as="span" tone="subdued">{summarizeConditions(rule)}</Text></div>
      </IndexTable.Cell>
      <IndexTable.Cell>{summarizeActions(rule)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Button size="slim" onClick={() => toggle(rule)} loading={togglingId === rule.id}>
          {rule.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}
        </Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <ReturnNav
      activeTabId="rules"
      title="Rules"
      primaryAction={{ content: 'Create rule', onAction: () => navigate('/return/rules/new') }}
    >
      <Card padding="0">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}><Spinner size="large" /></div>
        ) : rules.length === 0 ? (
          <EmptyState heading="No rules yet" image="">
            <p>Create a rule to automate return approvals and restrictions.</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: 'rule', plural: 'rules' }}
            itemCount={rules.length}
            selectable={false}
            headings={[{ title: 'Rule' }, { title: 'Action' }, { title: 'Status' }]}
          >
            {rowMarkup}
          </IndexTable>
        )}
      </Card>
    </ReturnNav>
  );
}

export default ReturnRules;
