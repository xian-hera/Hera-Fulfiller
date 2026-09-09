import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IndexTable, useIndexResourceState, Badge, Tabs, Card, EmptyState, Spinner, Text
} from '@shopify/polaris';
import api from '../../api/axios';
import ReturnNav from '../../components/ReturnNav';

// Filter tab -> 后端 GET /api/returns?filter= 的 query 值（方案文档 6.1）
const FILTER_TABS = [
  { id: 'all', content: 'All', filter: 'all' },
  { id: 'pending', content: 'Pending', filter: 'pending' },
  { id: 'auto_approved', content: 'Auto approved', filter: 'auto_approved' },
  { id: 'to_be_received', content: 'To be received', filter: 'to_be_received' },
  { id: 'archived', content: 'Archived', filter: 'archived' }
];

const STATUS_BADGE = {
  awaiting_approval: { tone: 'attention', label: 'Awaiting approval' },
  awaiting_return: { tone: 'info', label: 'Awaiting return' },
  received: { tone: 'success', label: 'Received' },
  refunded: { tone: 'new', label: 'Refunded' },
  rejected: { tone: 'critical', label: 'Rejected' },
  resolved: { tone: 'magic', label: 'Resolved' },
  archived: { tone: undefined, label: 'Archived' }
};

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString();
  } catch (e) {
    return value;
  }
}

function ReturnsList() {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  const fetchReturns = useCallback(async (filter) => {
    setLoading(true);
    try {
      const response = await api.get('/api/returns', { params: { filter } });
      setReturns(response.data || []);
    } catch (error) {
      console.error('Failed to fetch returns:', error);
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReturns(FILTER_TABS[selectedTab].filter);
  }, [selectedTab, fetchReturns]);

  const resourceName = { singular: 'return', plural: 'returns' };
  const {
    selectedResources, allResourcesSelected, handleSelectionChange, clearSelection
  } = useIndexResourceState(returns);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await api.patch('/api/returns/archive', { returnIds: selectedResources.map(id => Number(id)) });
      clearSelection();
      await fetchReturns(FILTER_TABS[selectedTab].filter);
    } catch (error) {
      console.error('Failed to archive returns:', error);
      window.alert('Failed to archive selected returns: ' + (error.response?.data?.error || error.message));
    } finally {
      setArchiving(false);
    }
  };

  const rowMarkup = returns.map((ret, index) => {
    const badge = STATUS_BADGE[ret.status] || { tone: undefined, label: ret.status };
    return (
      <IndexTable.Row
        id={String(ret.id)}
        key={ret.id}
        selected={selectedResources.includes(String(ret.id))}
        position={index}
      >
        <IndexTable.Cell>
          <Text
            as="span"
            variant="bodyMd"
            fontWeight="semibold"
            tone="interactive"
          >
            <span
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); navigate(`/return/${ret.id}`); }}
            >
              {ret.order_name}
            </span>
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {ret.auto_approved ? <span style={{ marginLeft: '6px' }}><Badge>Auto approved</Badge></span> : null}
        </IndexTable.Cell>
        <IndexTable.Cell>{formatDate(ret.order_fulfilled_date)}</IndexTable.Cell>
        <IndexTable.Cell>{formatDate(ret.submitted_at)}</IndexTable.Cell>
        <IndexTable.Cell>{ret.customer_email || '—'}</IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <ReturnNav activeTabId="returns" title="Returns">
      <Card padding="0">
        <Tabs
          tabs={FILTER_TABS}
          selected={selectedTab}
          onSelect={(index) => { clearSelection(); setSelectedTab(index); }}
        />
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Spinner accessibilityLabel="Loading returns" size="large" />
          </div>
        ) : returns.length === 0 ? (
          <EmptyState heading="No returns found" image="">
            <p>There are no returns matching this filter.</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={resourceName}
            itemCount={returns.length}
            selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            promotedBulkActions={[
              { content: 'Archive', onAction: handleArchive, disabled: archiving }
            ]}
            headings={[
              { title: 'Order number' },
              { title: 'Status' },
              { title: 'Fulfilled date' },
              { title: 'Return request date' },
              { title: 'Customer email' }
            ]}
          >
            {rowMarkup}
          </IndexTable>
        )}
      </Card>
    </ReturnNav>
  );
}

export default ReturnsList;
