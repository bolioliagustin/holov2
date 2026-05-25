import { Router } from 'express';
import db from '../db.js';
import { getCurrentEventId } from '../eventCtx.js';

const router = Router();

router.get('/', (req, res) => {
  const eventId = getCurrentEventId();
  const total     = db.prepare('SELECT COUNT(*) as n FROM guests WHERE event_id = ?').get(eventId).n;
  const checkedIn = db.prepare('SELECT COUNT(*) as n FROM guests WHERE event_id = ? AND checked_in = 1').get(eventId).n;
  const rescans   = db.prepare("SELECT COUNT(*) as n FROM checkin_log WHERE event_id = ? AND type = 'RESCAN'").get(eventId).n;
  const unknown   = db.prepare("SELECT COUNT(*) as n FROM checkin_log WHERE event_id = ? AND type = 'UNKNOWN'").get(eventId).n;

  res.json({ total, checkedIn, pending: total - checkedIn, rescans, unknown });
});

export default router;
