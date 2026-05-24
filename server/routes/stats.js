import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const total     = db.prepare('SELECT COUNT(*) as n FROM guests').get().n;
  const checkedIn = db.prepare('SELECT COUNT(*) as n FROM guests WHERE checked_in = 1').get().n;
  const rescans   = db.prepare("SELECT COUNT(*) as n FROM checkin_log WHERE type = 'RESCAN'").get().n;
  const unknown   = db.prepare("SELECT COUNT(*) as n FROM checkin_log WHERE type = 'UNKNOWN'").get().n;

  res.json({ total, checkedIn, pending: total - checkedIn, rescans, unknown });
});

export default router;
