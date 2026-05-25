import db from './db.js';

export function getCurrentEventId() {
  const row = db.prepare("SELECT value FROM config WHERE key = 'current_event_id'").get();
  return Number(row?.value) || 1;
}

export function getCurrentEvent() {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(getCurrentEventId());
}

export function setCurrentEventId(id) {
  db.prepare(`INSERT INTO config (key, value) VALUES ('current_event_id', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(id));
}
