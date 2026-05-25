import { Router } from 'express';
import db from '../db.js';
import { getCurrentEventId } from '../eventCtx.js';

const router = Router();

router.get('/', (req, res) => {
  const eventId = getCurrentEventId();
  const { page = 1, limit = 100 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare('SELECT COUNT(*) as n FROM checkin_log WHERE event_id = ?').get(eventId).n;
  const rows = db.prepare(
    'SELECT * FROM checkin_log WHERE event_id = ? ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(eventId, Number(limit), offset);

  res.json({ total, rows });
});

router.delete('/clear', (req, res) => {
  const eventId = getCurrentEventId();
  db.prepare('DELETE FROM checkin_log WHERE event_id = ?').run(eventId);
  res.json({ ok: true });
});

export default router;
