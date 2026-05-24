import { Router } from 'express';
import db from '../db.js';
import { broadcast } from '../ws.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json(cfg);
});

router.post('/', (req, res) => {
  const updates = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?,?)');
  const tx = db.transaction((obj) => {
    for (const [k, v] of Object.entries(obj)) {
      upsert.run(k, String(v));
    }
  });
  tx(updates);
  broadcast({ type: 'CONFIG_UPDATED' });
  res.json({ ok: true });
});

export default router;
