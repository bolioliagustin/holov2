import { WebSocketServer } from 'ws';

let wss = null;

// Track every connected client with role + last activity timestamp
// role: 'admin' | 'projector' | 'unknown'
const clients = new Map(); // socket → { role, lastPing, ip }

const STALE_THRESHOLD_MS = 15_000;   // 15 s without ping → considered offline
const RELOAD_AFTER_MS    = 30_000;   // 30 s offline → send RELOAD to all projectors

let lastProjectorStatus = 'unknown'; // 'online' | 'offline' | 'unknown'
let projectorOfflineSince = null;
let reloadSentAt = null;

export function initWS(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const ip = req.socket.remoteAddress;
    clients.set(socket, { role: 'unknown', lastPing: Date.now(), ip });

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const meta = clients.get(socket);
      if (!meta) return;

      if (msg.type === 'HELLO' && msg.role) {
        meta.role = msg.role;
        meta.lastPing = Date.now();
        console.log(`[ws] hello from ${msg.role} @ ${ip}`);
        // Send current projector status to admins immediately
        if (msg.role === 'admin') sendProjectorStatusTo(socket);
        if (msg.role === 'projector') updateProjectorStatus();
        return;
      }

      if (msg.type === 'PING') {
        meta.lastPing = Date.now();
        return;
      }

      if (msg.type === 'PROJECTOR_ERROR') {
        console.error(`[ws] projector reported error:`, msg.error);
        broadcast({ type: 'PROJECTOR_ERROR_REPORTED', error: msg.error, ts: Date.now() });
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      updateProjectorStatus();
    });

    socket.on('error', () => {});
  });

  // Watchdog tick — check for stale projector connections every 3 s
  setInterval(watchdogTick, 3_000);

  return wss;
}

function watchdogTick() {
  const now = Date.now();
  let projectorOnline = false;

  for (const [sock, meta] of clients.entries()) {
    if (sock.readyState !== 1) continue;
    if (meta.role !== 'projector') continue;
    if (now - meta.lastPing < STALE_THRESHOLD_MS) {
      projectorOnline = true;
    }
  }

  const newStatus = projectorOnline ? 'online' : 'offline';
  if (newStatus !== lastProjectorStatus) {
    lastProjectorStatus = newStatus;
    if (newStatus === 'offline') projectorOfflineSince = now;
    else { projectorOfflineSince = null; reloadSentAt = null; }
    console.log(`[ws] projector status: ${newStatus}`);
    broadcastToRole('admin', {
      type: 'PROJECTOR_STATUS',
      status: newStatus,
      since: projectorOfflineSince,
    });
  }

  // Auto-recovery: if projector has been offline > 30 s and we haven't tried a reload
  // recently, send RELOAD to all projector sockets (some may still be open but stuck).
  if (newStatus === 'offline' && projectorOfflineSince) {
    const offlineFor = now - projectorOfflineSince;
    if (offlineFor > RELOAD_AFTER_MS && (!reloadSentAt || now - reloadSentAt > 60_000)) {
      reloadSentAt = now;
      console.log('[ws] sending RELOAD to projectors after 30 s offline');
      broadcastToRole('projector', { type: 'RELOAD' });
    }
  }
}

function updateProjectorStatus() {
  // Force an immediate tick when something significant happens
  setImmediate(watchdogTick);
}

function sendProjectorStatusTo(socket) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify({
    type: 'PROJECTOR_STATUS',
    status: lastProjectorStatus,
    since: projectorOfflineSince,
  }));
}

export function getProjectorStatus() {
  return { status: lastProjectorStatus, since: projectorOfflineSince };
}

export function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

export function broadcastToRole(role, data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  for (const [sock, meta] of clients.entries()) {
    if (meta.role === role && sock.readyState === 1) sock.send(msg);
  }
}
