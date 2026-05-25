import { Router } from 'express';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { broadcast } from '../ws.js';
import { getCurrentEventId, setCurrentEventId } from '../eventCtx.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVES_DIR = resolve(__dirname, '../../data/archives');

const router = Router();

// ── List + read ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM guests       WHERE event_id = e.id) AS guests_count,
      (SELECT COUNT(*) FROM guests       WHERE event_id = e.id AND checked_in = 1) AS checked_in_count,
      (SELECT COUNT(*) FROM checkin_log  WHERE event_id = e.id) AS log_count,
      (SELECT COUNT(*) FROM video_queue  WHERE event_id = e.id) AS videos_count
    FROM events e
    ORDER BY e.id DESC
  `).all();
  res.json({ rows, currentId: getCurrentEventId() });
});

router.get('/current', (req, res) => {
  const id = getCurrentEventId();
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.json(row || null);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// ── Create ──────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, venue = '', date = '', capacity = 0, notes = '' } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const info = db.prepare(`
    INSERT INTO events (name, venue, date, capacity, status, notes)
    VALUES (?, ?, ?, ?, 'draft', ?)
  `).run(name.trim(), venue, date, Number(capacity) || 0, notes);

  res.json({ id: info.lastInsertRowid });
  broadcast({ type: 'EVENTS_CHANGED' });
});

// ── Update (only allowed if not archived) ───────────────────────────────
router.put('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.status === 'archived') return res.status(409).json({ error: 'cannot edit archived event' });

  const fields = ['name', 'venue', 'date', 'capacity', 'notes', 'idle_video'];
  const updates = [];
  const params  = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(f === 'capacity' ? (Number(req.body[f]) || 0) : req.body[f]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);

  db.prepare(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
  broadcast({ type: 'EVENTS_CHANGED' });
  broadcast({ type: 'CONFIG_UPDATED' });
});

// ── Activate (becomes the current event, demote others to draft) ────────
router.post('/:id/activate', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.status === 'archived') return res.status(409).json({ error: 'cannot activate an archived event' });

  const tx = db.transaction(() => {
    // Demote any currently active event to draft (unless archived)
    db.prepare(`UPDATE events SET status = 'draft' WHERE status = 'active' AND id != ?`).run(id);
    db.prepare(`UPDATE events SET status = 'active' WHERE id = ?`).run(id);
    setCurrentEventId(id);
  });
  tx();

  res.json({ ok: true });
  broadcast({ type: 'EVENTS_CHANGED' });
  broadcast({ type: 'CURRENT_EVENT_CHANGED', id });
  broadcast({ type: 'CONFIG_UPDATED' });
});

// ── Switch focus (view only, doesn't change active status) ──────────────
router.post('/:id/select', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'not found' });
  setCurrentEventId(id);
  res.json({ ok: true });
  broadcast({ type: 'CURRENT_EVENT_CHANGED', id });
});

// ── Archive (snapshot + read-only) ──────────────────────────────────────
router.post('/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event) return res.status(404).json({ error: 'not found' });
  if (event.status === 'archived') return res.status(409).json({ error: 'already archived' });

  // Snapshot to disk
  const guests   = db.prepare('SELECT * FROM guests       WHERE event_id = ?').all(id);
  const log      = db.prepare('SELECT * FROM checkin_log  WHERE event_id = ? ORDER BY id').all(id);
  const videos   = db.prepare('SELECT * FROM video_queue  WHERE event_id = ?').all(id);
  const archived_at = new Date().toISOString();

  try {
    mkdirSync(ARCHIVES_DIR, { recursive: true });
    const dir = join(ARCHIVES_DIR, `event-${id}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
      ...event, archived_at,
      counts: { guests: guests.length, checkins: log.length, videos: videos.length },
    }, null, 2));
    writeFileSync(join(dir, 'guests.json'),  JSON.stringify(guests, null, 2));
    writeFileSync(join(dir, 'checkin_log.json'), JSON.stringify(log, null, 2));
    writeFileSync(join(dir, 'videos.json'),  JSON.stringify(videos, null, 2));
    writeFileSync(join(dir, 'guests.csv'),       toCSV(guests));
    writeFileSync(join(dir, 'checkin_log.csv'),  toCSV(log));
  } catch (e) {
    console.error('[events] archive snapshot failed:', e.message);
    return res.status(500).json({ error: 'snapshot failed: ' + e.message });
  }

  db.prepare(`UPDATE events SET status = 'archived', archived_at = ? WHERE id = ?`).run(archived_at, id);
  res.json({ ok: true, archived_at, path: `data/archives/event-${id}/` });
  broadcast({ type: 'EVENTS_CHANGED' });
});

// ── Export (CSV download, available anytime) ────────────────────────────
router.get('/:id/export/guests.csv', (req, res) => {
  const rows = db.prepare('SELECT id, name, email, table_num, uid, video, message, checked_in, checkin_at FROM guests WHERE event_id = ? ORDER BY id').all(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${req.params.id}-guests.csv"`);
  res.send(toCSV(rows));
});

router.get('/:id/export/checkins.csv', (req, res) => {
  const rows = db.prepare('SELECT id, uid, guest_id, guest_name, type, ts FROM checkin_log WHERE event_id = ? ORDER BY id').all(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${req.params.id}-checkins.csv"`);
  res.send(toCSV(rows));
});

// ── Delete (only drafts or archived can be deleted) ─────────────────────
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === 1) return res.status(403).json({ error: 'cannot delete the initial event' });

  const item = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.status === 'active') return res.status(409).json({ error: 'cannot delete an active event' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM guests       WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM checkin_log  WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM video_queue  WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM events       WHERE id = ?').run(id);
    if (getCurrentEventId() === id) setCurrentEventId(1);
  });
  tx();

  res.json({ ok: true });
  broadcast({ type: 'EVENTS_CHANGED' });
});

// ── CSV helper ──────────────────────────────────────────────────────────
function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return lines.join('\n');
}

export default router;
