import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Page, Layout, Card, Badge, Button, Checkbox, TextField, Select,
  Modal, Collapsible, Text, Divider, Thumbnail, InlineStack, BlockStack, Banner, Spinner, RadioButton
} from '@shopify/polaris';
import { ExternalIcon } from '@shopify/polaris-icons';
import api from '../../api/axios';
import { ACTION_LABEL } from './ruleSummary';

// ── 展示用的静态映射 ──────────────────────────────────────────────────────

const STATUS_META = {
  awaiting_approval: { label: 'Awaiting approval', tone: 'attention' },
  awaiting_return: { label: 'Awaiting return', tone: 'info' },
  received: { label: 'Received', tone: 'success' },
  refunded: { label: 'Refunded', tone: undefined },
  rejected: { label: 'Rejected', tone: 'critical' },
  resolved: { label: 'Resolved', tone: 'magic' },
  archived: { label: 'Archived', tone: undefined }
};

const REFUND_OPTION_LABEL = {
  original_payment: 'Refund to original',
  store_credit: 'Refund to store credit',
  replacement: 'Replacement'
};

function formatDateTime(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString(); } catch (e) { return value; }
}
function formatDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString(); } catch (e) { return value; }
}
function money(value) {
  const n = Number(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

// ── 一个不依赖额外库的简易数量步进控件（"A/B"格式，A 可编辑，B 固定）─────────

function QuantityStepper({ value, max, onChange }) {
  const setClamped = (v) => onChange(Math.max(0, Math.min(max, v)));
  return (
    <InlineStack gap="100" blockAlign="center">
      <Button size="slim" onClick={() => setClamped(value - 1)} disabled={value <= 0}>−</Button>
      <div style={{ width: '48px' }}>
        <TextField
          label="quantity"
          labelHidden
          type="number"
          value={String(value)}
          onChange={(v) => setClamped(parseInt(v || '0', 10))}
          autoComplete="off"
        />
      </div>
      <Button size="slim" onClick={() => setClamped(value + 1)} disabled={value >= max}>+</Button>
      <Text as="span" tone="subdued">/ {max}</Text>
    </InlineStack>
  );
}

function ReturnDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [qtyDraft, setQtyDraft] = useState({});
  const [rulesOpen, setRulesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const [approveNoteModal, setApproveNoteModal] = useState(null); // { itemIds } | null
  const [approveNoteText, setApproveNoteText] = useState('');

  const [refundView, setRefundView] = useState(false);
  const [dedCustomerShipping, setDedCustomerShipping] = useState(false);
  const [dedActualShipping, setDedActualShipping] = useState(false);
  const [dedReturningShipping, setDedReturningShipping] = useState(false);
  const [manualDeduction, setManualDeduction] = useState('0');
  const [refundMethod, setRefundMethod] = useState('original');
  const [splitAmount, setSplitAmount] = useState('0');
  const [subtotalOverride, setSubtotalOverride] = useState(null);
  const [sendNotification, setSendNotification] = useState(true);

  const [locations, setLocations] = useState([]);
  const [restockLocationId, setRestockLocationId] = useState('');
  const [restockBanner, setRestockBanner] = useState(null); // { tone, message } | null

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/api/returns/${id}`);
      setData(res.data);
      setError(null);
    } catch (e) {
      console.error('Failed to load return:', e);
      setError('Failed to load this return.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (data && data.status === 'refunded' && locations.length === 0) {
      api.get('/api/return-settings/shopify-locations').then(r => setLocations(r.data || [])).catch(() => {});
    }
  }, [data, locations.length]);

  // 每次状态/子视图切换时重置左侧交互态，避免带着上一个视图的残留选中项
  useEffect(() => {
    setSelectedIds([]);
    setQtyDraft({});
    setRestockBanner(null);
  }, [data?.status, refundView]);

  // 🔧 修复：这个 effect 原来写在 loading/error 的提前 return 之后，违反了 React Hooks
  // 的调用顺序规则（"Hook 不能被条件性调用"，webpack 编译报错阻塞了整个前端）。
  // 挪到所有提前 return 之前，改成直接从 data 里取 items（这时候 data 可能还是 null，
  // 所以要挡一下），而不是依赖后面才解构出来的 items 变量。
  useEffect(() => {
    if (!refundView || !data) return;
    const currentItems = data.items || [];
    const selected = currentItems.filter(i => selectedIds.includes(i.id));
    const hasStoreCredit = selected.some(i => i.refund_option === 'store_credit');
    if (hasStoreCredit) {
      setRefundMethod('split');
      const storeCreditTotal = selected
        .filter(i => i.refund_option === 'store_credit')
        .reduce((sum, i) => {
          const q = qtyDraft[i.id] !== undefined ? qtyDraft[i.id] : (i.received_quantity - i.refunded_quantity);
          return sum + (i.price || 0) * q;
        }, 0);
      setSplitAmount(storeCreditTotal.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundView, data, JSON.stringify(selectedIds), JSON.stringify(qtyDraft)]);

  const runAction = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await fetchData();
    } catch (e) {
      console.error(e);
      window.alert(e.response?.data?.error || e.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Page title="Loading…"><Card><div style={{ padding: '2rem', textAlign: 'center' }}><Spinner size="large" /></div></Card></Page>;
  }
  if (error || !data) {
    return <Page title="Return not found" backAction={{ content: 'Returns', onAction: () => navigate('/return') }}>
      <Banner tone="critical">{error || 'This return could not be loaded.'}</Banner>
    </Page>;
  }

  const {
    items = [], history = [], customerStats = {}, shopDomain, matched_rules = [],
    status, pre_archive_status
  } = data;

  const statusMeta = STATUS_META[status] || { label: status, tone: undefined };
  const approveTypeBadge = data.approved_at
    ? <Badge>{data.auto_approved ? 'Automatically approved' : 'Manually approved'}</Badge>
    : null;

  const orderAdminUrl = shopDomain ? `https://${shopDomain}/admin/orders/${data.shopify_order_id}` : null;
  const customerAdminUrl = shopDomain && data.customer_id ? `https://${shopDomain}/admin/customers/${data.customer_id}` : null;

  // ── 决定当前 Items 卡片该显示哪批 item + 是否需要 checkbox/stepper ──────────
  // renderMode: 'approval' | 'awaiting_return' | 'received' | 'refund_view' | 'refunded' | 'static'
  let renderMode = 'static';
  if (status === 'awaiting_approval') renderMode = 'approval';
  else if (status === 'awaiting_return') renderMode = 'awaiting_return';
  else if (status === 'received') renderMode = refundView ? 'refund_view' : 'received';
  else if (status === 'refunded') renderMode = 'refunded';
  else if (status === 'resolved') renderMode = 'received'; // Items 卡片与 received 状态一致（见 6.8.7）

  const effectiveDisplayStatus = status === 'archived' ? (pre_archive_status || 'rejected') : status;
  if (status === 'archived') {
    if (effectiveDisplayStatus === 'refunded') renderMode = 'refunded_static';
    else renderMode = 'static';
  }

  const mainItems = items; // Items 卡片本身始终显示全部 item（approved/rejected 用状态区分展示），备忘卡片单独过滤

  const toggleSelected = (itemId) => {
    setSelectedIds(prev => prev.includes(itemId) ? prev.filter(i => i !== itemId) : [...prev, itemId]);
  };

  // ── Items 行渲染 ──────────────────────────────────────────────────────────

  function renderItemRow(item) {
    const showCheckbox = ['approval', 'awaiting_return', 'refund_view', 'refunded'].includes(renderMode);
    const isChecked = selectedIds.includes(item.id);

    let stepperMax = 0;
    let stepperDefault = 0;
    let showStepper = false;
    if (renderMode === 'awaiting_return') {
      stepperMax = item.approved_quantity;
      stepperDefault = item.approved_quantity;
      showStepper = isChecked && item.approved_quantity > 1;
    } else if (renderMode === 'refund_view') {
      stepperMax = item.received_quantity - item.refunded_quantity;
      stepperDefault = stepperMax;
      showStepper = isChecked && stepperMax > 1;
    }

    const qty = qtyDraft[item.id] !== undefined ? qtyDraft[item.id] : stepperDefault;

    const productUrl = shopDomain && item.product_id ? `https://${shopDomain}/admin/products/${item.product_id}` : null;
    const variantUrl = shopDomain && item.product_id && item.variant_id
      ? `https://${shopDomain}/admin/products/${item.product_id}/variants/${item.variant_id}` : null;

    let quantityDisplay = null;
    if (renderMode === 'refunded' || renderMode === 'refunded_static') {
      quantityDisplay = <Text as="span">{item.refunded_quantity} refunded</Text>;
    } else {
      quantityDisplay = <Text as="span">{money(item.price)} × {item.requested_quantity}</Text>;
    }

    let statusPill = null;
    if (renderMode === 'received' && item.approve_status === 'approved') {
      const rec = item.received_quantity;
      const app = item.approved_quantity;
      if (rec >= app && app > 0) statusPill = <Badge tone="success">{rec} received</Badge>;
      else if (rec > 0) statusPill = <Badge tone="warning">{rec}/{app} received</Badge>;
      else statusPill = <Badge tone="critical">0 received</Badge>;
    }
    if (item.approve_status === 'rejected' && renderMode === 'approval') {
      // awaiting_approval 阶段还没决定，不显示 Rejected（那是最终 rejected 状态才显示）
    }
    if (status === 'rejected') {
      statusPill = <Text as="span" tone="critical">Rejected</Text>;
    }

    let replacementPill = null;
    if (renderMode === 'received' && item.refund_option === 'replacement' && data.return_method === 'in_store') {
      replacementPill = item.replacement_provided_quantity > 0
        ? <Badge tone="success">{item.requested_quantity === 1 ? 'Replacement gave' : `${item.replacement_provided_quantity} replacement gave`}</Badge>
        : <Badge tone="attention">Replacement pending</Badge>;
    }

    return (
      <div key={item.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid #e1e3e5' }}>
        <InlineStack gap="300" blockAlign="start" wrap={false}>
          {showCheckbox && (
            <Checkbox label="select item" labelHidden checked={isChecked} onChange={() => toggleSelected(item.id)} />
          )}
          <Thumbnail source={item.image_url || ''} alt={item.product_title || ''} size="small" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">
                {productUrl ? <a href={productUrl} target="_blank" rel="noreferrer">{item.product_title}</a> : item.product_title}
                {item.variant_title ? (
                  <>
                    {' — '}
                    {variantUrl ? <a href={variantUrl} target="_blank" rel="noreferrer">{item.variant_title}</a> : item.variant_title}
                  </>
                ) : null}
              </Text>
              <Text as="span" tone="subdued">{item.reason_display_name || '—'}</Text>
              {(item.customer_note || (item.questionAnswers && item.questionAnswers.length > 0)) && (
                <details>
                  <summary style={{ cursor: 'pointer' }}>Note{item.photos && item.photos.length > 0 ? ' & photos' : ''}</summary>
                  {item.customer_note && <Text as="p">{item.customer_note}</Text>}
                  {item.photos && item.photos.length > 0 && (
                    <InlineStack gap="200">
                      {item.photos.map((p, i) => (
                        <Thumbnail key={i} source={p} alt={`photo ${i + 1}`} size="small" />
                      ))}
                    </InlineStack>
                  )}
                  {item.questionAnswers && item.questionAnswers.map((qa) => (
                    <Text as="p" key={qa.id} tone="subdued">{qa.question_body_snapshot}: {qa.answer}</Text>
                  ))}
                  {item.pos_rejection_reason && (
                    <Text as="p" tone="critical">POS rejection reason: {item.pos_rejection_reason}</Text>
                  )}
                </details>
              )}
            </BlockStack>
          </div>
          <div style={{ textAlign: 'right', minWidth: '110px' }}>
            <BlockStack gap="100" inlineAlign="end">
              {quantityDisplay}
              <Badge tone={
                item.refund_option === 'store_credit' ? 'info' : item.refund_option === 'replacement' ? 'attention' : undefined
              }>{REFUND_OPTION_LABEL[item.refund_option] || item.refund_option}</Badge>
              {statusPill}
              {replacementPill}
            </BlockStack>
          </div>
        </InlineStack>
        {showStepper && (
          <div style={{ marginTop: '0.5rem', marginLeft: '2rem' }}>
            <QuantityStepper value={qty} max={stepperMax} onChange={(v) => setQtyDraft(prev => ({ ...prev, [item.id]: v }))} />
          </div>
        )}
      </div>
    );
  }

  // ── 备忘卡片（Not approved / Not received / Not refunded）────────────────

  const notApprovedItems = items
    .filter(i => i.approve_status !== 'approved')
    .map(i => ({ ...i, missingQty: i.requested_quantity }));
  const notReceivedItems = items
    .filter(i => i.approve_status === 'approved' && i.received_quantity < i.approved_quantity)
    .map(i => ({ ...i, missingQty: i.approved_quantity - i.received_quantity }));
  const notRefundedItems = items
    .filter(i => i.received_quantity > i.refunded_quantity)
    .map(i => ({ ...i, missingQty: i.received_quantity - i.refunded_quantity }));
  // 🆕 restock 追踪备忘：只在 refunded（还未 archive）状态下显示 —— manual archive 之后
  // 就不再展示了（那种情况本来就是"这一步不用 app 管"，不算欠账）
  const notRestockedItems = items
    .filter(i => (i.received_quantity || 0) > (i.restocked_quantity || 0))
    .map(i => ({ ...i, missingQty: i.received_quantity - (i.restocked_quantity || 0) }));

  function renderMemoCard(title, list) {
    if (list.length === 0) return null;
    return (
      <Card>
        <Text as="h3" variant="headingSm">{title}</Text>
        <BlockStack gap="200">
          {list.map(item => (
            <InlineStack key={item.id} gap="300" blockAlign="center">
              <Thumbnail source={item.image_url || ''} alt={item.product_title || ''} size="small" />
              <Text as="span">{item.product_title} {item.variant_title ? `— ${item.variant_title}` : ''}</Text>
              <Text as="span" tone="subdued">× {item.missingQty}</Text>
            </InlineStack>
          ))}
        </BlockStack>
      </Card>
    );
  }

  // ── 各种操作 handler ──────────────────────────────────────────────────────

  const handleApprove = (mode) => {
    const itemIds = mode === 'all' ? [] : selectedIds;
    if (mode === 'selected' && itemIds.length === 0) {
      window.alert('Select at least one item to approve.');
      return;
    }
    if (data.return_method === 'in_store') {
      setApproveNoteModal({ mode, itemIds });
      setApproveNoteText('');
      return;
    }
    runAction(() => api.patch(`/api/returns/${id}/approve`, { itemIds }));
  };

  const submitApproveWithNote = async (skipNote) => {
    const { mode, itemIds } = approveNoteModal;
    setApproveNoteModal(null);
    const noteText = !skipNote ? approveNoteText.trim() : '';
    await runAction(async () => {
      if (noteText) {
        // 存进 History timeline（给 admin 看）
        await api.post(`/api/returns/${id}/internal-note`, { note: noteText });
      }
      // 同时传给 approve 接口，写进 returns.internal_return_note（给 POS Extension 7.3 看）
      await api.patch(`/api/returns/${id}/approve`, { itemIds: mode === 'all' ? [] : itemIds, internalReturnNote: noteText || undefined });
    });
  };

  const handleRejectAll = () => {
    if (!window.confirm('Reject all items in this return?')) return;
    runAction(() => api.patch(`/api/returns/${id}/reject-all`));
  };

  const handleMarkReceived = (mode) => {
    if (mode === 'all') {
      runAction(() => api.patch(`/api/returns/${id}/mark-received`, {}));
      return;
    }
    if (selectedIds.length === 0) {
      window.alert('Select at least one item.');
      return;
    }
    const itemReceipts = selectedIds.map(itemId => {
      const item = items.find(i => i.id === itemId);
      const q = qtyDraft[itemId] !== undefined ? qtyDraft[itemId] : item.approved_quantity;
      return { itemId, receivedQuantity: q };
    });
    runAction(() => api.patch(`/api/returns/${id}/mark-received`, { itemReceipts }));
  };

  const handleRefreshTracking = () => {
    runAction(() => api.patch(`/api/returns/${id}/refresh-tracking`));
  };

  const handlePostNote = () => {
    if (!noteText.trim()) return;
    runAction(async () => {
      await api.post(`/api/returns/${id}/internal-note`, { note: noteText.trim() });
      setNoteText('');
    });
  };

  const handleArchive = () => {
    if (!window.confirm('Archive this return?')) return;
    runAction(() => api.patch('/api/returns/archive', { returnIds: [Number(id)] }));
  };

  const handleDelete = () => {
    if (!window.confirm('Permanently delete this return? This cannot be undone.')) return;
    runAction(async () => {
      await api.delete(`/api/returns/${id}`);
      navigate('/return');
    });
  };

  const handleMarkResolved = () => {
    runAction(() => api.patch(`/api/returns/${id}/mark-resolved`));
  };

  const handleRestock = (mode) => {
    if ((mode === 'all' || mode === 'selected') && !restockLocationId) {
      window.alert('Choose a location first.');
      return;
    }
    if (mode === 'selected' && selectedIds.length === 0) {
      window.alert('Select at least one item.');
      return;
    }
    setBusy(true);
    api.patch(`/api/returns/${id}/restock`, {
      mode, itemIds: mode === 'selected' ? selectedIds : undefined, locationId: restockLocationId || undefined
    }).then((res) => {
      // 🆕 新的返回结构：{success, status: 'refunded'|'archived', restockedAny, restockFailures, remainingItems}
      // "Restock all/selected" 可能只清掉一部分（比如某个 item 库存 API 调用失败），
      // 这时候 return 还留在 refunded 状态，按钮保持可用，可以再点一次
      const { status: newStatus, restockFailures = [], remainingItems = [] } = res.data || {};
      if (restockFailures.length > 0) {
        setRestockBanner({
          tone: 'warning',
          message: `${restockFailures.length} item(s) failed to restock — you can try again: ${restockFailures.map(f => f.error).join('; ')}`
        });
      } else if (newStatus === 'archived') {
        setRestockBanner({ tone: 'success', message: 'All received items have been restocked — this return is now archived.' });
      } else if (remainingItems.length > 0) {
        setRestockBanner({
          tone: 'info',
          message: `Restocked. Still remaining: ${remainingItems.map(i => `${i.productTitle}${i.variantTitle ? ' — ' + i.variantTitle : ''} × ${i.remaining}`).join(', ')}`
        });
      } else {
        setRestockBanner(null);
      }
      setSelectedIds([]);
      return fetchData();
    }).catch((e) => {
      console.error(e);
      window.alert(e.response?.data?.error || e.message || 'Action failed');
    }).finally(() => setBusy(false));
  };

  // ── Issue refund 子视图的计算 ─────────────────────────────────────────────

  const refundSelectedItems = items.filter(i => selectedIds.includes(i.id));
  const refundableItemsTotal = refundSelectedItems.reduce((sum, i) => {
    const q = qtyDraft[i.id] !== undefined ? qtyDraft[i.id] : (i.received_quantity - i.refunded_quantity);
    return sum + (i.price || 0) * q;
  }, 0);

  const hasStoreCreditItem = refundSelectedItems.some(i => i.refund_option === 'store_credit');

  const totalDeduction =
    (dedCustomerShipping ? (data.customer_paid_shipping || 0) : 0) +
    (dedActualShipping ? (data.actual_shipping_charge || 0) : 0) +
    (dedReturningShipping ? (data.actual_shipping_charge || 0) : 0) +
    (parseFloat(manualDeduction) || 0);

  const computedSubtotal = Math.max(0, refundableItemsTotal - totalDeduction);
  const finalRefundAmount = subtotalOverride !== null ? subtotalOverride : computedSubtotal;

  const handleIssueRefund = () => {
    if (selectedIds.length === 0) {
      window.alert('Select at least one item to refund.');
      return;
    }
    const storeCreditAmount = refundMethod === 'split' ? (parseFloat(splitAmount) || 0) : (refundMethod === 'store_credit' ? finalRefundAmount : 0);
    runAction(async () => {
      await api.patch(`/api/returns/${id}/issue-refund`, {
        itemIds: selectedIds,
        refundAmount: finalRefundAmount,
        storeCreditAmount,
        sendShopifyNotification: sendNotification
      });
      setRefundView(false);
    });
  };

  // ── 右栏卡片内容（Return method / 操作按钮） ─────────────────────────────

  function renderReturnMethodCard() {
    let title = 'Return method selected';
    let body = null;

    if (data.return_method === 'in_store') {
      if (status === 'awaiting_return') title = 'Returning to';
      else if (['received', 'resolved', 'refunded', 'archived'].includes(status)) title = 'Return received at';
      body = <Text as="span">{data.return_location_name || '—'}</Text>;
    } else {
      if (status === 'awaiting_approval') {
        body = <Text as="span">Shipping</Text>;
      } else {
        title = status === 'received' || status === 'resolved' || status === 'refunded' || status === 'archived'
          ? 'Return shipping received' : 'Return shipping';
        body = (
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text as="span">
                {data.tracking_number ? (
                  <a
                    href={`https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${data.tracking_number}`}
                    target="_blank" rel="noreferrer"
                  >{data.tracking_number}</a>
                ) : 'No tracking number yet'}
              </Text>
              <Text as="span" tone="subdued">Fee: billed on scan (not queryable)</Text>
            </InlineStack>
            {data.last_tracking_event && (
              <Text as="span" tone="subdued">{data.last_tracking_event} ({formatDateTime(data.last_tracking_date)})</Text>
            )}
            {data.tracking_number && status !== 'awaiting_approval' && (
              <Button size="slim" onClick={handleRefreshTracking} loading={busy}>Refresh tracking</Button>
            )}
          </BlockStack>
        );
      }
    }

    return (
      <Card>
        <Text as="h3" variant="headingSm">{title}</Text>
        <div style={{ marginTop: '0.5rem' }}>{body}</div>
      </Card>
    );
  }

  function renderActionCard() {
    if (status === 'awaiting_approval') {
      return (
        <Card>
          <BlockStack gap="200">
            <Button variant="primary" fullWidth onClick={() => handleApprove('all')} loading={busy}>Approve all</Button>
            <Button fullWidth onClick={() => handleApprove('selected')} loading={busy}>Approve selected</Button>
            <Text as="p" tone="subdued">The rest will be rejected</Text>
            <Button tone="critical" fullWidth onClick={handleRejectAll} loading={busy}>Reject all</Button>
          </BlockStack>
        </Card>
      );
    }

    if (status === 'awaiting_return') {
      return (
        <Card>
          <BlockStack gap="200">
            <Button variant="primary" fullWidth onClick={() => handleMarkReceived('all')} loading={busy}>Mark all received</Button>
            <Button fullWidth onClick={() => handleMarkReceived('selected')} loading={busy}>Mark selected received</Button>
          </BlockStack>
        </Card>
      );
    }

    if (status === 'received' && !refundView) {
      return (
        <Card>
          <BlockStack gap="200">
            <Button variant="primary" fullWidth onClick={() => setRefundView(true)}>Issue refund</Button>
            <Button fullWidth onClick={handleMarkResolved} loading={busy}>Mark as resolved</Button>
          </BlockStack>
        </Card>
      );
    }

    if (status === 'received' && refundView) {
      return (
        <Card>
          <Text as="h3" variant="headingSm">Issue refund</Text>
          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text as="h4" fontWeight="semibold">Refundable</Text>
              <InlineStack align="space-between"><Text as="span">Items</Text><Text as="span">{money(refundableItemsTotal)}</Text></InlineStack>
              <Text as="span" tone="subdued">Taxes / discount are not tracked per line item — use Manual deduction below to adjust.</Text>
            </BlockStack>
            <Divider />
            <BlockStack gap="100">
              <Text as="h4" fontWeight="semibold">Deduction</Text>
              <Checkbox
                label={`Original shipping paid by customer (${money(data.customer_paid_shipping)})`}
                checked={dedCustomerShipping} onChange={setDedCustomerShipping}
              />
              <Checkbox
                label={`Actual original shipping paid (${money(data.actual_shipping_charge)})`}
                checked={dedActualShipping} onChange={setDedActualShipping}
              />
              <Checkbox
                label={`Returning shipping — reuses actual shipping charge (${money(data.actual_shipping_charge)})`}
                checked={dedReturningShipping} onChange={setDedReturningShipping}
              />
              <TextField
                label="Manual deduction"
                type="number"
                value={manualDeduction}
                onChange={setManualDeduction}
                autoComplete="off"
                prefix="$"
              />
            </BlockStack>
            <Divider />
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text as="h4" fontWeight="semibold">Total refund</Text>
                <Badge>{`Customer paid for order ${money(data.order_subtotal)}`}</Badge>
              </InlineStack>
              <TextField
                label="Subtotal"
                type="number"
                prefix="$"
                value={String(subtotalOverride !== null ? subtotalOverride : computedSubtotal.toFixed(2))}
                onChange={(v) => setSubtotalOverride(parseFloat(v) || 0)}
                autoComplete="off"
              />
              <RadioButton label="To original payment method" checked={refundMethod === 'original'} onChange={() => setRefundMethod('original')} />
              <RadioButton label="To store credit" checked={refundMethod === 'store_credit'} onChange={() => setRefundMethod('store_credit')} />
              <InlineStack gap="200" blockAlign="center">
                <RadioButton label="Split" checked={refundMethod === 'split'} onChange={() => setRefundMethod('split')} />
                <div style={{ width: '110px' }}>
                  <TextField label="split amount" labelHidden type="number" prefix="$" value={splitAmount} onChange={setSplitAmount} autoComplete="off" />
                </div>
                <Text as="span" tone="subdued">to store credit, rest to original</Text>
              </InlineStack>
            </BlockStack>
            <Checkbox label="Send Shopify refund notification" checked={sendNotification} onChange={setSendNotification} />
            <Text as="p" tone="critical">Restocking will be processed in next page</Text>
            <Button variant="primary" fullWidth onClick={handleIssueRefund} loading={busy}>
              Issue refund for {money(finalRefundAmount)}
            </Button>
            <Button fullWidth onClick={() => setRefundView(false)}>Cancel</Button>
          </BlockStack>
        </Card>
      );
    }

    if (status === 'resolved') {
      return null; // Archive 已经在 header 里，不重复放
    }

    if (status === 'refunded') {
      return (
        <Card>
          <BlockStack gap="200">
            {restockBanner && (
              <Banner tone={restockBanner.tone}>{restockBanner.message}</Banner>
            )}
            <Select
              label="Restock location"
              options={[{ label: 'Choose a location', value: '' }, ...locations.map(l => ({ label: l.name, value: String(l.id) }))]}
              value={restockLocationId}
              onChange={setRestockLocationId}
            />
            <Button fullWidth onClick={() => handleRestock('all')} loading={busy}>Restock all to</Button>
            <Button fullWidth onClick={() => handleRestock('selected')} loading={busy}>Restock selected to</Button>
            <Text as="p" tone="subdued">
              Can be clicked more than once — each click restocks whatever remains. This return archives automatically once every received item has been restocked.
            </Text>
            <Divider />
            <Button fullWidth onClick={() => handleRestock('manual')} loading={busy}>Manually restock</Button>
            <Text as="p" tone="subdued">Archives this return immediately without calling Shopify's inventory API — use this when restocking is handled outside the app.</Text>
          </BlockStack>
        </Card>
      );
    }

    if (status === 'archived') {
      return (
        <Card>
          <Button tone="critical" fullWidth onClick={handleDelete} loading={busy}>Delete</Button>
        </Card>
      );
    }

    return null;
  }

  return (
    <Page
      title={data.order_name}
      titleMetadata={<InlineStack gap="100"><Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>{approveTypeBadge}</InlineStack>}
      subtitle={`Submitted ${formatDateTime(data.submitted_at)}`}
      backAction={{ content: 'Returns', onAction: () => navigate('/return') }}
      secondaryActions={[
        ...(status !== 'archived' ? [{ content: 'Archive', onAction: handleArchive }] : []),
        ...(orderAdminUrl ? [{ content: 'View order in Shopify', icon: ExternalIcon, url: orderAdminUrl, external: true }] : [])
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <Text as="h2" variant="headingMd">Items</Text>
              <div style={{ marginTop: '0.5rem' }}>
                {mainItems.map(renderItemRow)}
              </div>
            </Card>

            {renderMode !== 'refund_view' && renderMemoCard('Not approved', notApprovedItems)}
            {['received', 'refunded', 'refunded_static', 'static'].includes(renderMode) && status !== 'awaiting_approval' && status !== 'awaiting_return' && renderMemoCard('Not received', notReceivedItems)}
            {(status === 'refunded' || (status === 'archived' && pre_archive_status === 'refunded')) && renderMemoCard('Not refunded', notRefundedItems)}
            {status === 'refunded' && renderMemoCard('Not restocked', notRestockedItems)}

            <Card>
              <Text as="h2" variant="headingMd">Internal note</Text>
              <BlockStack gap="200">
                <TextField
                  label="Internal note" labelHidden multiline={2}
                  placeholder="Enter internal note"
                  value={noteText} onChange={setNoteText} autoComplete="off"
                />
                <Button onClick={handlePostNote} disabled={!noteText.trim()} loading={busy}>Post</Button>
                <Divider />
                <Text as="h3" variant="headingSm">History</Text>
                <BlockStack gap="150">
                  {history.length === 0 && <Text as="span" tone="subdued">No history yet.</Text>}
                  {history.map(h => (
                    <div key={h.id}>
                      <Text as="span" fontWeight="semibold">{h.event_type}</Text>
                      {h.note ? <Text as="span"> — {h.note}</Text> : null}
                      <Text as="span" tone="subdued"> ({formatDateTime(h.created_at)})</Text>
                    </div>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {renderReturnMethodCard()}
            {renderActionCard()}

            <Card>
              <Text as="h3" variant="headingSm">Order</Text>
              <BlockStack gap="100">
                <InlineStack align="space-between"><Text as="span">Fulfilled date</Text><Text as="span">{formatDate(data.order_fulfilled_date)}</Text></InlineStack>
                <InlineStack align="space-between"><Text as="span">Order subtotal</Text><Text as="span">{money(data.order_subtotal)}</Text></InlineStack>
                <InlineStack align="space-between"><Text as="span">Customer paid shipping</Text><Text as="span">{money(data.customer_paid_shipping)}</Text></InlineStack>
                <InlineStack align="space-between"><Text as="span">Actual shipping charge</Text><Text as="span">{money(data.actual_shipping_charge)}</Text></InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <Text as="h3" variant="headingSm">Customer</Text>
              <BlockStack gap="100">
                <Text as="span">
                  {customerAdminUrl
                    ? <a href={customerAdminUrl} target="_blank" rel="noreferrer">{data.customer_first_name} {data.customer_last_name}</a>
                    : `${data.customer_first_name || ''} ${data.customer_last_name || ''}`}
                </Text>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span">{data.customer_email}</Text>
                  <Button
                    size="slim"
                    onClick={() => { navigator.clipboard?.writeText(data.customer_email || ''); }}
                  >Copy</Button>
                </InlineStack>
                {customerStats.customerTags && customerStats.customerTags.length > 0 && (
                  <InlineStack gap="100">
                    {customerStats.customerTags.map(t => <Badge key={t}>{t}</Badge>)}
                  </InlineStack>
                )}
                <InlineStack align="space-between"><Text as="span">Total orders</Text><Text as="span">{customerStats.totalOrders ?? '—'}</Text></InlineStack>
                <InlineStack align="space-between"><Text as="span">Return orders submitted</Text><Text as="span">{customerStats.totalReturnsSubmitted ?? 0}</Text></InlineStack>
                <InlineStack align="space-between"><Text as="span">Return orders approved</Text><Text as="span">{customerStats.totalReturnsApproved ?? 0}</Text></InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <Button variant="plain" onClick={() => setRulesOpen(!rulesOpen)}>
                {rulesOpen ? 'Hide rules subjected' : `Rules subjected (${matched_rules.length})`}
              </Button>
              <Collapsible open={rulesOpen} id="rules-subjected">
                <BlockStack gap="150">
                  {matched_rules.length === 0 && <Text as="span" tone="subdued">No rules matched this return.</Text>}
                  {matched_rules.map((r, idx) => (
                    <div key={idx}>
                      <Text as="span" fontWeight="semibold">{r.ruleName}</Text>
                      <Text as="span" tone={r.status === 'applied' ? 'success' : 'subdued'}> — {r.status === 'applied' ? 'Applied' : 'Skipped'}</Text>
                      {r.appliedActions && r.appliedActions.length > 0 && (
                        <Text as="p" tone="subdued">
                          {r.appliedActions.map(a => (a.value ? `${ACTION_LABEL[a.type] || a.type}: ${a.value}` : (ACTION_LABEL[a.type] || a.type))).join('; ')}
                        </Text>
                      )}
                      {r.skippedActions && r.skippedActions.map((s, i) => (
                        <Text as="p" tone="subdued" key={i}>
                          {(ACTION_LABEL[s.action.type] || s.action.type)} skipped — overridden by "{s.conflictWithRuleName}" (higher priority)
                        </Text>
                      ))}
                    </div>
                  ))}
                </BlockStack>
              </Collapsible>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={!!approveNoteModal}
        onClose={() => setApproveNoteModal(null)}
        title="Internal return note"
        primaryAction={{ content: 'Submit', onAction: () => submitApproveWithNote(false) }}
        secondaryActions={[{ content: 'Without note', onAction: () => submitApproveWithNote(true) }]}
      >
        <Modal.Section>
          <TextField
            label="Note for the store location handling this in-store return"
            multiline={3}
            value={approveNoteText}
            onChange={setApproveNoteText}
            autoComplete="off"
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export default ReturnDetail;
