import { Router } from 'express';
import db from '../db.js';
import { handleTag } from '../nfc.js';
import { getCurrentEventId } from '../eventCtx.js';

const router = Router();

function normalizeUID(raw) {
  if (!raw) return '';
  return String(raw).replace(/[:\s-]/g, '').toUpperCase();
}

router.get('/', (req, res) => {
  const eventId = getCurrentEventId();
  const { search, status, page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE event_id = ?';
  const params = [eventId];

  if (search) {
    where += ' AND (name LIKE ? OR email LIKE ? OR UPPER(uid) LIKE ? OR table_num LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q.toUpperCase(), q);
  }
  if (status === 'in')   { where += ' AND checked_in = 1'; }
  if (status === 'pend') { where += ' AND checked_in = 0'; }

  const total = db.prepare(`SELECT COUNT(*) as n FROM guests ${where}`).get(...params).n;
  const rows  = db.prepare(`SELECT * FROM guests ${where} ORDER BY id LIMIT ? OFFSET ?`).all(...params, Number(limit), offset);

  res.json({ total, page: Number(page), limit: Number(limit), rows });
});

router.post('/', (req, res) => {
  const eventId = getCurrentEventId();
  const { name, email = '', table_num = '', uid = '', video = '', message = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const normalized = normalizeUID(uid);
  if (normalized) {
    const clash = db.prepare('SELECT id, name FROM guests WHERE uid = ? AND event_id = ? LIMIT 1').get(normalized, eventId);
    if (clash) return res.status(409).json({ error: `UID ya asignado a: ${clash.name}` });
  }

  const info = db.prepare(
    `INSERT INTO guests (event_id, name, email, table_num, uid, video, message) VALUES (?,?,?,?,?,?,?)`
  ).run(eventId, name, email, table_num, normalized, video, message);

  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const eventId = getCurrentEventId();
  const { name, email, table_num, uid, video, message } = req.body;
  const g = db.prepare('SELECT id FROM guests WHERE id = ? AND event_id = ?').get(req.params.id, eventId);
  if (!g) return res.status(404).json({ error: 'not found' });

  const normalized = normalizeUID(uid);
  if (normalized) {
    const clash = db.prepare('SELECT id, name FROM guests WHERE uid = ? AND id != ? AND event_id = ? LIMIT 1').get(normalized, req.params.id, eventId);
    if (clash) return res.status(409).json({ error: `UID ya asignado a: ${clash.name}` });
  }

  db.prepare(
    `UPDATE guests SET name=?, email=?, table_num=?, uid=?, video=?, message=? WHERE id=? AND event_id=?`
  ).run(name, email, table_num, normalized, video, message, req.params.id, eventId);

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const eventId = getCurrentEventId();
  db.prepare('DELETE FROM guests WHERE id = ? AND event_id = ?').run(req.params.id, eventId);
  res.json({ ok: true });
});

router.post('/:id/reset', (req, res) => {
  const eventId = getCurrentEventId();
  db.prepare('UPDATE guests SET checked_in = 0, checkin_at = NULL WHERE id = ? AND event_id = ?').run(req.params.id, eventId);
  res.json({ ok: true });
});

router.post('/reset-all', (req, res) => {
  const eventId = getCurrentEventId();
  db.prepare('UPDATE guests SET checked_in = 0, checkin_at = NULL WHERE event_id = ?').run(eventId);
  res.json({ ok: true });
});

router.post('/clear-uids', (req, res) => {
  const eventId = getCurrentEventId();
  db.prepare("UPDATE guests SET uid = '' WHERE event_id = ?").run(eventId);
  res.json({ ok: true });
});

router.post('/assign-uid', (req, res) => {
  const eventId = getCurrentEventId();
  const { id, uid } = req.body;
  if (!id || !uid) return res.status(400).json({ error: 'id and uid required' });
  const normalized = normalizeUID(uid);
  const clash = db.prepare('SELECT id, name FROM guests WHERE uid = ? AND id != ? AND event_id = ? LIMIT 1').get(normalized, id, eventId);
  if (clash) return res.status(409).json({ error: `UID ya asignado a: ${clash.name}` });
  db.prepare('UPDATE guests SET uid = ? WHERE id = ? AND event_id = ?').run(normalized, id, eventId);
  res.json({ ok: true, uid: normalized });
});

router.post('/simulate-checkin/:id', (req, res) => {
  const eventId = getCurrentEventId();
  const g = db.prepare('SELECT * FROM guests WHERE id = ? AND event_id = ?').get(req.params.id, eventId);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (!g.uid) return res.status(400).json({ error: 'no UID assigned' });
  handleTag(g.uid);
  res.json({ ok: true });
});

router.post('/import-csv', (req, res) => {
  const eventId = getCurrentEventId();
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });

  const insert = db.prepare(
    `INSERT INTO guests (event_id, name, email, table_num, uid, video, message) VALUES (?,?,?,?,?,?,?)`
  );
  const insertMany = db.transaction((items) => {
    for (const r of items) {
      insert.run(
        eventId,
        r.name || '',
        r.email || '',
        r.table_num || r.table || '',
        normalizeUID(r.uid || ''),
        r.video || '',
        r.message || ''
      );
    }
  });

  insertMany(rows);
  res.json({ ok: true, imported: rows.length });
});

export default router;
