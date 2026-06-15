const { WebSocketServer } = require('ws');

let wss = null;
const connectedAgents = new Set();
const pendingLabels = []; // 待推送队列：agent 不在线时暂存，连上后自动补发

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws/print-agent' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WebSocket] Print agent connected from ${ip}`);
    connectedAgents.add(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.type === 'print_done') {
          console.log(`[WebSocket] Print agent confirmed print for order: ${msg.orderName}`);
        }
      } catch (e) {
        console.error('[WebSocket] Invalid message from agent:', e.message);
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Print agent disconnected from ${ip}`);
      connectedAgents.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Agent error:', err.message);
      connectedAgents.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', message: 'Hera Fulfiller print agent connected' }));

    // Agent 刚连上 → 检查有没有漏掉的 label，自动补发
    flushPendingLabels();
  });

  console.log('[WebSocket] Print agent server initialized at /ws/print-agent');
}

// 补发队列中所有待推送的 label
function flushPendingLabels() {
  if (pendingLabels.length === 0 || connectedAgents.size === 0) return;

  console.log(`[WebSocket] Flushing ${pendingLabels.length} pending label(s) to agent...`);

  const toSend = [...pendingLabels];
  pendingLabels.length = 0;

  toSend.forEach(label => {
    sendToAgents(label);
  });
}

// 内部方法：真正发送给所有在线 agent
function sendToAgents({ orderName, trackingNumber, pdfBase64 }) {
  const message = JSON.stringify({
    type: 'print_label',
    orderName,
    trackingNumber,
    pdfBase64
  });

  let sent = 0;
  connectedAgents.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
      sent++;
    }
  });

  if (sent > 0) {
    console.log(`[WebSocket] Label print sent to ${sent} agent(s) for order ${orderName}`);
  } else {
    console.warn(`[WebSocket] Failed to send label for ${orderName} — no OPEN agents`);
  }

  return sent;
}

// 推送 label：有 agent 在线就立即发，没有就存队列等 agent 连上再发
function broadcastLabelPrint({ orderName, trackingNumber, pdfBase64 }) {
  if (connectedAgents.size === 0) {
    pendingLabels.push({ orderName, trackingNumber, pdfBase64 });
    console.warn(`[WebSocket] No print agents connected — label for ${orderName} queued (${pendingLabels.length} pending)`);
    return;
  }

  const sent = sendToAgents({ orderName, trackingNumber, pdfBase64 });

  if (sent === 0) {
    // 所有 agent 的 readyState 都不是 OPEN（僵尸连接）→ 也入队列
    pendingLabels.push({ orderName, trackingNumber, pdfBase64 });
    console.warn(`[WebSocket] All agents stale — label for ${orderName} queued (${pendingLabels.length} pending)`);
  }
}

function getConnectedAgentCount() {
  return connectedAgents.size;
}

module.exports = { initWebSocket, broadcastLabelPrint, getConnectedAgentCount };