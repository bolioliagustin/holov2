import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare('SELECT COUNT(*) as n FROM checkin_log').get().n;
  const rows = db.prepare(
    'SELECT * FROM checkin_log ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(Number(limit), offset);

  res.json({ total, rows });
});

router.delete('/clear', (req, res) => {
  db.prepare('DELETE FROM checkin_log').run();
  res.json({ ok: true });
});

export default router;
