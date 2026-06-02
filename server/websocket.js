const { WebSocketServer } = require('ws');

let wss = null;
const connectedAgents = new Set();

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
  });

  console.log('[WebSocket] Print agent server initialized at /ws/print-agent');
}

// Broadcast label PDF to all connected print agents
function broadcastLabelPrint({ orderName, trackingNumber, pdfBase64 }) {
  if (connectedAgents.size === 0) {
    console.warn('[WebSocket] No print agents connected — label will not be printed');
    return;
  }

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

  console.log(`[WebSocket] Label print broadcast sent to ${sent} agent(s) for order ${orderName}`);
}

function getConnectedAgentCount() {
  return connectedAgents.size;
}

module.exports = { initWebSocket, broadcastLabelPrint, getConnectedAgentCount };