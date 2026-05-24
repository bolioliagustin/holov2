import { broadcast } from './ws.js';
import db from './db.js';

let assignMode = false;
const lastTagTime = {};
const TAG_DEBOUNCE_MS = 2000;

function normalizeUID(raw) {
  return String(raw || '').replace(/[:\s-]/g, '').toUpperCase();
}

export async function startNFC() {
  let NFC;
  try {
    const mod = await import('nfc-pcsc');
    NFC = mod.NFC;
  } catch {
    console.warn('[NFC] nfc-pcsc not available — running without hardware reader');
    return;
  }

  const nfc = new NFC();

  nfc.on('reader', (reader) => {
    console.log(`[NFC] Reader connected: ${reader.name}`);
    broadcast({ type: 'NFC_READER_CONNECTED', reader: reader.name });

    reader.on('card', (card) => {
      const uid = normalizeUID(card.uid);
      handleTag(uid);
    });

    reader.on('card.off', () => {});
    reader.on('error', (err) => {
      const msg = err.message || '';
      // Ignore Windows Hello / common transient transmission noise
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
}

export function handleTag(uid) {
  const normalized = normalizeUID(uid);
  const now = Date.now();

  // Debounce: ignore same UID fired within 2 s (ACR122U double-fire)
  if (lastTagTime[normalized] && now - lastTagTime[normalized] < TAG_DEBOUNCE_MS) {
    console.log(`[NFC] Debounced duplicate: ${normalized}`);
    return;
  }
  lastTagTime[normalized] = now;

  const ts = new Date().toISOString();

  if (assignMode) {
    broadcast({ type: 'NFC_ASSIGN', uid: normalized, ts });
    return;
  }

  const guest = db.prepare(
    `SELECT * FROM guests WHERE uid = ? LIMIT 1`
  ).get(normalized);

  if (!guest) {
    db.prepare(`INSERT INTO checkin_log (uid, type) VALUES (?, 'UNKNOWN')`).run(normalized);
    broadcast({ type: 'TAG_READ', uid: normalized, guest: null, checkinType: 'UNKNOWN', ts });
    return;
  }

  const checkinType = guest.checked_in ? 'RESCAN' : 'IN';

  db.prepare(`UPDATE guests SET checked_in = 1, checkin_at = ? WHERE id = ?`).run(ts, guest.id);
  db.prepare(
    `INSERT INTO checkin_log (uid, guest_id, guest_name, type) VALUES (?, ?, ?, ?)`
  ).run(normalized, guest.id, guest.name, checkinType);

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
