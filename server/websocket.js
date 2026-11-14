import { WebSocketServer, WebSocket } from 'ws';

let wss = null;

export function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // console.log(`[WS] Client connected. Total active: ${wss.clients.size}`);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (e) {
        // ignore non-json
      }
    });

    ws.on('close', () => {
      // client disconnected
    });

    // Send initial greeting
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'CareBridge real-time event pipeline connected',
      clients: wss.clients.size,
      timestamp: new Date().toISOString(),
    }));
  });

  // Keep-alive heartbeat interval
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

export function broadcast(type, payload = {}) {
  if (!wss) return;
  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
