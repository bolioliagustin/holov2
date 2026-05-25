import { broadcast } from './ws.js';
import db from './db.js';
import { getCurrentEventId, getCurrentEvent } from './eventCtx.js';

let assignMode = false;
const lastTagTime = {};
const TAG_DEBOUNCE_MS = 2000;

// Track real connected readers — visible to the readiness endpoint
const activeReaders = new Set();

function normalizeUID(raw) {
  return String(raw || '').replace(/[:\s-]/g, '').toUpperCase();
}

// True if the connected reader is actually an NFC reader (not a Windows
// virtual / smartcard reader like "Windows Hello for Business").
function isRealNFCReader(name) {
  const n = (name || '').toLowerCase();
  return n.includes('acr122') || n.includes('acr1252') || n.includes('pn533');
}

function broadcastReaderStatus() {
  const real = [...activeReaders].filter(isRealNFCReader);
  broadcast({
    type: 'NFC_STATUS',
    connected: real.length > 0,
    readers: real,
  });
}

export function getNFCStatus() {
  const real = [...activeReaders].filter(isRealNFCReader);
  return { connected: real.length > 0, readers: real };
}

export async function startNFC() {
  let NFC;
  try {
    const mod = await import('nfc-pcsc');
    NFC = mod.NFC;
  } catch {
    console.warn('[NFC] nfc-pcsc not available — running without hardware reader');
    broadcastReaderStatus();
    return;
  }

  const nfc = new NFC();

  nfc.on('reader', (reader) => {
    console.log(`[NFC] Reader connected: ${reader.name}`);
    activeReaders.add(reader.name);
    broadcastReaderStatus();

    reader.on('card', (card) => {
      const uid = normalizeUID(card.uid);
      handleTag(uid);
    });

    reader.on('card.off', () => {});

    reader.on('end', () => {
      console.warn(`[NFC] Reader disconnected: ${reader.name}`);
      activeReaders.delete(reader.name);
      broadcastReaderStatus();
    });

    reader.on('error', (err) => {
      const msg = err.message || '';
      if (msg.includes('ISO 14443-4')) return;
      if (msg.includes('transmitting')) return;
      if (msg.includes('SCardTransmit')) return;
      console.error('[NFC] Reader error:', msg);
    });
  });

  nfc.on('error', (err) => {
    console.error('[NFC] Error:', err.message);
    broadcast({ type: 'NFC_ERROR', message: err.message });
  });

  console.log('[NFC] Listening for ACR122U…');
  broadcastReaderStatus();
}

export function handleTag(uid) {
  const normalized = normalizeUID(uid);
  const now = Date.now();

  if (lastTagTime[normalized] && now - lastTagTime[normalized] < TAG_DEBOUNCE_MS) {
    console.log(`[NFC] Debounced duplicate: ${normalized}`);
    return;
  }
  lastTagTime[normalized] = now;

  const ts = new Date().toISOString();
  const eventId = getCurrentEventId();
  const event   = getCurrentEvent();

  if (assignMode) {
    broadcast({ type: 'NFC_ASSIGN', uid: normalized, ts });
    return;
  }

  // Block check-ins if the current event is not active (draft or archived)
  if (!event || event.status !== 'active') {
    console.log(`[NFC] check-in blocked — event ${eventId} status: ${event?.status || 'missing'}`);
    broadcast({
      type: 'TAG_READ', uid: normalized, guest: null,
      checkinType: 'BLOCKED', reason: `Evento "${event?.name || ''}" no está activo`, ts,
    });
    return;
  }

  const guest = db.prepare(
    `SELECT * FROM guests WHERE uid = ? AND event_id = ? LIMIT 1`
  ).get(normalized, eventId);

  if (!guest) {
    db.prepare(`INSERT INTO checkin_log (event_id, uid, type) VALUES (?, ?, 'UNKNOWN')`).run(eventId, normalized);
    broadcast({ type: 'TAG_READ', uid: normalized, guest: null, checkinType: 'UNKNOWN', ts });
    return;
  }

  const checkinType = guest.checked_in ? 'RESCAN' : 'IN';

  db.prepare(`UPDATE guests SET checked_in = 1, checkin_at = ? WHERE id = ?`).run(ts, guest.id);
  db.prepare(
    `INSERT INTO checkin_log (event_id, uid, guest_id, guest_name, type) VALUES (?, ?, ?, ?, ?)`
  ).run(eventId, normalized, guest.id, guest.name, checkinType);

  broadcast({
    type: 'TAG_READ',
    uid: normalized,
    guest: {
      id: guest.id,
      name: guest.name,
      table_num: guest.table_num,
      video: guest.video,
      message: guest.message,
    },
    checkinType,
    ts,
  });
}

export function setAssignMode(active) {
  assignMode = active;
  broadcast({ type: 'ASSIGN_MODE', active });
  console.log(`[NFC] Assign mode: ${active}`);
}
