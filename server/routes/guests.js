import { Router } from 'express';
import db from '../db.js';
import { handleTag } from '../nfc.js';

const router = Router();

function normalizeUID(raw) {
  if (!raw) return '';
  return String(raw).replace(/[:\s-]/g, '').toUpperCase();
}

router.get('/', (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params = [];

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
  const { name, email = '', table_num = '', uid = '', video = '', message = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const normalized = normalizeUID(uid);
  if (normalized) {
    const clash = db.prepare('SELECT id, name FROM guests WHERE uid = ? LIMIT 1').get(normalized);
    if (clash) return res.status(409).json({ error: `UID ya asignado a: ${clash.name}` });
  }

  const info = db.prepare(
    `INSERT INTO guests (name, email, table_num, uid, video, message) VALUES (?,?,?,?,?,?)`
  ).run(name, email, table_num, normalized, video, message);

  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, email, table_num, uid, video, message } = req.body;
  const g = db.prepare('SELECT id FROM guests WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });

  const normalized = normalizeUID(uid);
  if (normalized) {
    const clash = db.prepare('SELECT id, name FROM guests WHERE uid = ? AND id != ? LIMIT 1').get(normalized, req.params.id);
    if (clash) return res.status(409).json({ error: `UID ya asignado a: ${clash.name}` });
  }

  db.prepare(
    `UPDATE guests SET name=?, email=?, table_num=?, uid=?, video=?, message=? WHERE id=?`
  ).run(name, email, table_num, normalized, video, message, req.params.id);

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM guests WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/reset', (req, res) => {
  db.prepare('UPDATE guests SET checked_in = 0, checkin_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/reset-all', (req, res) => {
  db.prepare('UPDATE guests SET checked_in = 0, checkin_at = NULL').run();
  res.json({ ok: true });
});

router.post('/clear-uids', (req, res) => {
  db.prepare("UPDATE guests SET uid = ''").run();
  res.json({ ok: true });
});

router.post('/assign-uid', (req, res) => {
  const { id, uid } = req.body;
  if (!id || !uid) return res.status(400).json({ error: 'id and uid required' });
  const normalized = normalizeUID(uid);
  const clash = db.prepare('SELECT id, name FROM guests WHERE uid = ? AND id != ? LIMIT 1').get(normalized, id);
  if (clash) return res.status(409).json({ error: `UID ya asignado a: ${clash.name}` });
  db.prepare('UPDATE guests SET uid = ? WHERE id = ?').run(normalized, id);
  res.json({ ok: true, uid: normalized });
});

router.post('/simulate-checkin/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (!g.uid) return res.status(400).json({ error: 'no UID assigned' });
  handleTag(g.uid);
  res.json({ ok: true });
});

router.post('/import-csv', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });

  const insert = db.prepare(
    `INSERT INTO guests (name, email, table_num, uid, video, message) VALUES (?,?,?,?,?,?)`
  );
  const insertMany = db.transaction((items) => {
    for (const r of items) {
      insert.run(
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
