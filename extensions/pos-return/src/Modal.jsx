// POS Extension 主体：第二~四屏全部在这一个 Modal target 里完成，靠内部 state 切换"屏幕"，
// 不用 Shopify 的多页 Navigator（方案文档只描述了页面结构和交互，没有强制要求用哪套导航机制；
// 用内部 state 实现更简单可靠，符合"轻便和稳定性优先"的要求）。
//
// 四个 screen：
//   'list'        — 7.2 Returns 列表
//   'detail'      — 7.3 订单详情（Accept all / Accept selected / Reject all）
//   'reject'      — 7.4 选择 Rejection reason（只有存在"未被足额 accept"的部分才会进入）
//   'replacement' — 7.5 Replacement 确认（只有涉及 replacement 时才会出现）
//
// ✅ 已跟 Shopify Tech Support 确认（2026-04 POS UI Extensions）：
//   - session token：shopify.session.getSessionToken() / shopify.session.currentSession（方案文档 7.6）
//   - 关闭 modal：没有 shopify.close()，用 Navigation API 的 navigation.back() 回到 tile/上一屏
//   - 数量输入：用内置的 <s-number-field min/max/step/value/onChange> web component，不用手搓 +/- 按钮

import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';

const API_BASE = 'https://hera-fulfiller.onrender.com';

const REJECTION_REASONS = [
  { value: 'item_not_intact', label: 'Item not intact : opened, used, unsealed, damaged' }
];

export default async () => {
  render(<ReturnModal />, document.body);
};

function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ReturnModal() {
  const [screen, setScreen] = useState('list');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [locationId, setLocationId] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [staffInfo, setStaffInfo] = useState({});

  const [returnsList, setReturnsList] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [checkedIds, setCheckedIds] = useState({});
  const [acceptedQty, setAcceptedQty] = useState({});
  const [noteText, setNoteText] = useState('');

  const [pendingInspection, setPendingInspection] = useState([]);
  const [rejectionReasons, setRejectionReasons] = useState({});

  const [replacementItems, setReplacementItems] = useState([]);
  const [replacementQty, setReplacementQty] = useState({});

  const authedFetch = useCallback(async (path, options = {}) => {
    const token = await shopify.session.getSessionToken();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }, []);

  const closeExtension = useCallback(() => {
    try {
      // eslint-disable-next-line no-undef
      navigation.back();
    } catch (e) {
      // 忽略 —— 万一 navigation 在某个上下文里不可用，下面的 'done' 屏是兜底，员工可以手动划走
    }
    setScreen('done');
  }, []);

  const loadList = useCallback(async (locId) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authedFetch(`/api/pos-return/returns?locationId=${encodeURIComponent(locId)}`);
      setLocationName(data.locationName || '');
      setReturnsList(data.returns || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    (async () => {
      try {
        const session = shopify.session.currentSession;
        const locId = session?.locationId;
        setStaffInfo({ staffMemberId: session?.staffMemberId, staffUserId: session?.userId });
        if (!locId) {
          setError('Could not determine current location.');
          setLoading(false);
          return;
        }
        setLocationId(locId);
        await loadList(locId);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authedFetch(`/api/pos-return/returns/${id}`);
      const initialChecked = {};
      const initialQty = {};
      (data.items || []).forEach(item => {
        initialChecked[item.id] = false;
        initialQty[item.id] = item.approvedQuantity;
      });
      setDetail(data);
      setCheckedIds(initialChecked);
      setAcceptedQty(initialQty);
      setSelectedId(id);
      setNoteText('');
      setScreen('detail');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  const postNote = useCallback(async () => {
    if (!noteText.trim() || !selectedId) return;
    try {
      await authedFetch(`/api/pos-return/returns/${selectedId}/note`, {
        method: 'POST',
        body: JSON.stringify({ note: noteText.trim(), ...staffInfo })
      });
      setNoteText('');
    } catch (e) {
      setError(e.message);
    }
  }, [authedFetch, selectedId, noteText, staffInfo]);

  const toggleCheck = (itemId) => {
    setCheckedIds(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const submitInspection = useCallback(async (built, reasons) => {
    setBusy(true);
    setError(null);
    try {
      const items = built.map(i => ({
        itemId: i.itemId,
        acceptedQuantity: i.acceptedQuantity,
        rejectionReason: i.acceptedQuantity < i.approvedQuantity ? reasons[i.itemId] : undefined
      }));
      const result = await authedFetch(`/api/pos-return/returns/${selectedId}/complete-inspection`, {
        method: 'PATCH',
        body: JSON.stringify({ locationId, items, ...staffInfo })
      });
      if (result.hasReplacementEligible) {
        const repItems = await authedFetch(`/api/pos-return/returns/${selectedId}/replacement-items`);
        const initQty = {};
        repItems.forEach(i => { initQty[i.id] = i.receivedQuantity; });
        setReplacementItems(repItems);
        setReplacementQty(initQty);
        setScreen('replacement');
      } else {
        closeExtension();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [authedFetch, selectedId, locationId, staffInfo, closeExtension]);

  // mode: 'accept_all' | 'accept_selected' | 'reject_all'
  const goAccept = async (mode) => {
    if (!detail) return;
    if (mode === 'accept_selected' && !Object.values(checkedIds).some(Boolean)) {
      setError('Select at least one item.');
      return;
    }

    const built = detail.items.map(item => {
      let accepted;
      if (mode === 'accept_all') {
        accepted = item.approvedQuantity;
      } else if (mode === 'reject_all') {
        accepted = 0;
      } else {
        accepted = checkedIds[item.id] ? clamp(acceptedQty[item.id] ?? item.approvedQuantity, 0, item.approvedQuantity) : 0;
      }
      return { itemId: item.id, acceptedQuantity: accepted, approvedQuantity: item.approvedQuantity };
    });

    const shortfall = built.some(i => i.acceptedQuantity < i.approvedQuantity);
    if (shortfall) {
      setPendingInspection(built);
      setRejectionReasons({});
      setError(null);
      setScreen('reject');
      return;
    }
    await submitInspection(built, {});
  };

  const submitRejectionScreen = async () => {
    const missing = pendingInspection.some(i => i.acceptedQuantity < i.approvedQuantity && !rejectionReasons[i.itemId]);
    if (missing) {
      setError('Choose a rejection reason for every rejected item.');
      return;
    }
    await submitInspection(pendingInspection, rejectionReasons);
  };

  const submitReplacement = async () => {
    setBusy(true);
    setError(null);
    try {
      const items = replacementItems.map(i => ({ itemId: i.id, providedQuantity: clamp(replacementQty[i.id] ?? 0, 0, i.receivedQuantity) }));
      await authedFetch(`/api/pos-return/returns/${selectedId}/replacement`, {
        method: 'PATCH',
        body: JSON.stringify({ items, ...staffInfo })
      });
      closeExtension();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── 通用 Header：返回箭头 + 标题 + × 关闭 ────────────────────────────────
  function Header({ title, subtitle, onBack }) {
    return (
      <s-box padding="base">
        <s-stack direction="horizontal" gap="base" alignment="space-between">
          <s-stack direction="horizontal" gap="small">
            {onBack && <s-button onClick={onBack}>{'< Back'}</s-button>}
            <s-stack direction="vertical" gap="none">
              <s-text emphasis="bold">{title}</s-text>
              {subtitle && <s-text tone="subdued">{subtitle}</s-text>}
            </s-stack>
          </s-stack>
          <s-button onClick={closeExtension}>{'x'}</s-button>
        </s-stack>
      </s-box>
    );
  }

  function ErrorBanner() {
    if (!error) return null;
    return (
      <s-box padding="base">
        <s-banner tone="critical">
          <s-text>{error}</s-text>
        </s-banner>
      </s-box>
    );
  }

  function NoteBar() {
    return (
      <s-box padding="base">
        <s-stack direction="horizontal" gap="small">
          <s-text-field
            label="Internal note"
            labelHidden
            placeholder="Enter internal note"
            value={noteText}
            onInput={(e) => setNoteText(e.target.value)}
          />
          <s-button onClick={postNote} disabled={!noteText.trim()}>Post</s-button>
        </s-stack>
      </s-box>
    );
  }

  // 数量输入：用官方确认的 s-number-field，显示成 "A/B" 的地方改成 "输入框 + /B 上限提示"
  function QuantityField({ id, value, max, onChange }) {
    const handleChange = (event) => {
      onChange(clamp(event.target.value, 0, max));
    };
    return (
      <s-stack direction="horizontal" gap="small-300" alignment="center">
        <s-number-field
          id={id}
          label="Qty"
          min={0}
          max={max}
          step={1}
          value={String(value)}
          onChange={handleChange}
        />
        <s-text tone="subdued">{`/ ${max}`}</s-text>
      </s-stack>
    );
  }

  // ── Screen: list（7.2）────────────────────────────────────────────────────
  function ListScreen() {
    return (
      <s-stack direction="vertical" gap="none">
        <Header
          title={`Returns to be received in ${locationName || 'current location'}`}
          subtitle="Online orders that customer chose to return in-store"
        />
        <ErrorBanner />
        {loading ? (
          <s-box padding="base"><s-spinner /></s-box>
        ) : returnsList.length === 0 ? (
          <s-box padding="base"><s-text tone="subdued">No returns waiting to be received right now.</s-text></s-box>
        ) : (
          <s-stack direction="vertical" gap="none">
            {returnsList.map(r => (
              <s-clickable key={r.id} onClick={() => openDetail(r.id)}>
                <s-box padding="base" borderBlockEnd="base">
                  <s-stack direction="horizontal" gap="base" alignment="space-between">
                    <s-stack direction="vertical" gap="none">
                      <s-text emphasis="bold">{r.orderName}</s-text>
                      <s-text tone="subdued">{r.customerName}</s-text>
                    </s-stack>
                    <s-text>{`${r.returningQuantity} item(s)`}</s-text>
                  </s-stack>
                </s-box>
              </s-clickable>
            ))}
          </s-stack>
        )}
      </s-stack>
    );
  }

  // ── Screen: detail（7.3）──────────────────────────────────────────────────
  function DetailScreen() {
    if (!detail) return null;
    return (
      <s-stack direction="vertical" gap="none">
        <Header title={detail.orderName} subtitle={detail.customerName} onBack={() => setScreen('list')} />
        {detail.internalReturnNote && (
          <s-box padding="base">
            <s-banner tone="info"><s-text>{detail.internalReturnNote}</s-text></s-banner>
          </s-box>
        )}
        <ErrorBanner />
        <s-stack direction="vertical" gap="none">
          {detail.items.map(item => (
            <s-box key={item.id} padding="base" borderBlockEnd="base">
              <s-stack direction="horizontal" gap="base" alignment="space-between">
                <s-checkbox checked={!!checkedIds[item.id]} onChange={() => toggleCheck(item.id)} />
                {item.imageUrl && <s-image src={item.imageUrl} alt="" />}
                <s-stack direction="vertical" gap="none" inlineSize="fill">
                  <s-text emphasis="bold">{item.productTitle}</s-text>
                  {item.variantTitle && <s-text tone="subdued">{item.variantTitle}</s-text>}
                  <s-text tone="subdued">{item.reasonName}</s-text>
                </s-stack>
                {item.approvedQuantity > 1 && checkedIds[item.id] ? (
                  <QuantityField
                    id={`accept-qty-${item.id}`}
                    value={acceptedQty[item.id] ?? item.approvedQuantity}
                    max={item.approvedQuantity}
                    onChange={(v) => setAcceptedQty(prev => ({ ...prev, [item.id]: v }))}
                  />
                ) : (
                  <s-text>{item.approvedQuantity}</s-text>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
        <NoteBar />
        <s-box padding="base">
          <s-stack direction="vertical" gap="small">
            <s-button variant="primary" onClick={() => goAccept('accept_all')} disabled={busy}>Accept all</s-button>
            <s-button onClick={() => goAccept('accept_selected')} disabled={busy}>Accept selected</s-button>
            <s-button onClick={() => goAccept('reject_all')} disabled={busy}>Reject all</s-button>
            <s-text tone="subdued">You will be asked to choose the reason for rejected items.</s-text>
          </s-stack>
        </s-box>
      </s-stack>
    );
  }

  // ── Screen: reject（7.4）──────────────────────────────────────────────────
  function RejectScreen() {
    const rejectedEntries = pendingInspection.filter(i => i.acceptedQuantity < i.approvedQuantity);
    const itemsById = {};
    (detail?.items || []).forEach(i => { itemsById[i.id] = i; });

    return (
      <s-stack direction="vertical" gap="none">
        <Header title={detail?.orderName} subtitle={detail?.customerName} onBack={() => setScreen('detail')} />
        <ErrorBanner />
        <s-stack direction="vertical" gap="none">
          {rejectedEntries.map(entry => {
            const item = itemsById[entry.itemId];
            if (!item) return null;
            const rejectedQty = entry.approvedQuantity - entry.acceptedQuantity;
            return (
              <s-box key={item.id} padding="base" borderBlockEnd="base">
                <s-stack direction="vertical" gap="small">
                  <s-stack direction="horizontal" gap="base" alignment="space-between">
                    {item.imageUrl && <s-image src={item.imageUrl} alt="" />}
                    <s-stack direction="vertical" gap="none" inlineSize="fill">
                      <s-text emphasis="bold">{item.productTitle}</s-text>
                      {item.variantTitle && <s-text tone="subdued">{item.variantTitle}</s-text>}
                      <s-text tone="subdued">{item.reasonName}</s-text>
                    </s-stack>
                    <s-text>{rejectedQty}</s-text>
                  </s-stack>
                  <s-select
                    label="Reason of rejection"
                    value={rejectionReasons[item.id] || ''}
                    onChange={(e) => setRejectionReasons(prev => ({ ...prev, [item.id]: e.target.value }))}
                  >
                    <s-option value="">Select a reason</s-option>
                    {REJECTION_REASONS.map(r => (
                      <s-option key={r.value} value={r.value}>{r.label}</s-option>
                    ))}
                  </s-select>
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
        <NoteBar />
        <s-box padding="base">
          <s-stack direction="vertical" gap="small">
            <s-button variant="primary" onClick={submitRejectionScreen} disabled={busy}>Submit and finish</s-button>
            <s-text tone="subdued">Choose reject reason or input note.</s-text>
          </s-stack>
        </s-box>
      </s-stack>
    );
  }

  // ── Screen: replacement（7.5）─────────────────────────────────────────────
  function ReplacementScreen() {
    return (
      <s-stack direction="vertical" gap="none">
        <Header title={detail?.orderName} subtitle={detail?.customerName} />
        <ErrorBanner />
        <s-stack direction="vertical" gap="none">
          {replacementItems.map(item => (
            <s-box key={item.id} padding="base" borderBlockEnd="base">
              <s-stack direction="horizontal" gap="base" alignment="space-between">
                {item.imageUrl && <s-image src={item.imageUrl} alt="" />}
                <s-stack direction="vertical" gap="none" inlineSize="fill">
                  <s-text emphasis="bold">{item.productTitle}</s-text>
                  {item.variantTitle && <s-text tone="subdued">{item.variantTitle}</s-text>}
                </s-stack>
                {item.receivedQuantity > 1 ? (
                  <QuantityField
                    id={`replacement-qty-${item.id}`}
                    value={replacementQty[item.id] ?? item.receivedQuantity}
                    max={item.receivedQuantity}
                    onChange={(v) => setReplacementQty(prev => ({ ...prev, [item.id]: v }))}
                  />
                ) : (
                  <s-text>{item.receivedQuantity}</s-text>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
        <s-box padding="base">
          <s-stack direction="vertical" gap="small">
            <s-text tone="critical">Provide items of certain quantity above to the customer as replacement.</s-text>
            <s-text>If item is out of stock, please tell the customer that the replacement will be handled later</s-text>
          </s-stack>
        </s-box>
        <NoteBar />
        <s-box padding="base">
          <s-stack direction="vertical" gap="small">
            <s-text tone="critical">
              Check each replacement item you gave to the customer. If the quantity is more than 1, select the quantity you actually gave. Then confirm.
            </s-text>
            <s-button variant="primary" onClick={submitReplacement} disabled={busy}>Confirm</s-button>
          </s-stack>
        </s-box>
      </s-stack>
    );
  }

  function DoneScreen() {
    return (
      <s-box padding="base">
        <s-stack direction="vertical" gap="base">
          <s-text emphasis="bold">Done — you can close this window now.</s-text>
        </s-stack>
      </s-box>
    );
  }

  if (screen === 'detail') return <DetailScreen />;
  if (screen === 'reject') return <RejectScreen />;
  if (screen === 'replacement') return <ReplacementScreen />;
  if (screen === 'done') return <DoneScreen />;
  return <ListScreen />;
}
