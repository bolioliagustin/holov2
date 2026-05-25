import { Router } from 'express';
import db from '../db.js';
import { broadcast } from '../ws.js';
import { getCurrentEventId, getCurrentEvent } from '../eventCtx.js';

const router = Router();

// Event-scoped settings live in the `events` table; everything else stays in `config`.
const EVENT_KEYS = new Set(['event_name', 'event_venue', 'event_date', 'event_capacity', 'idle_video']);

router.get('/', (req, res) => {
  const cfgRows = db.prepare('SELECT key, value FROM config').all();
  const cfg = Object.fromEntries(cfgRows.map((r) => [r.key, r.value]));

  // Overlay event-scoped values from the current event
  const ev = getCurrentEvent();
  if (ev) {
    cfg.event_name     = ev.name     || '';
    cfg.event_venue    = ev.venue    || '';
    cfg.event_date     = ev.date     || '';
    cfg.event_capacity = String(ev.capacity || 0);
    cfg.idle_video     = ev.idle_video || '';
    cfg.event_id       = ev.id;
    cfg.event_status   = ev.status;
  }
  res.json(cfg);
});

router.post('/', (req, res) => {
  const updates = req.body || {};
  const eventId = getCurrentEventId();
  const eventUpdates = {};
  const configUpdates = {};

  for (const [k, v] of Object.entries(updates)) {
    if (EVENT_KEYS.has(k)) {
      eventUpdates[k] = v;
    } else {
      configUpdates[k] = v;
    }
  }

  const tx = db.transaction(() => {
    if (Object.keys(configUpdates).length) {
      const upsert = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?,?)');
      for (const [k, v] of Object.entries(configUpdates)) upsert.run(k, String(v));
    }
    if (Object.keys(eventUpdates).length) {
      const map = {
        event_name: 'name', event_venue: 'venue', event_date: 'date',
        event_capacity: 'capacity', idle_video: 'idle_video',
      };
      const fields = [];
      const params = [];
      for (const [k, v] of Object.entries(eventUpdates)) {
        const col = map[k];
        fields.push(`${col} = ?`);
        params.push(col === 'capacity' ? (Number(v) || 0) : v);
      }
      params.push(eventId);
      db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }
  });
  tx();

  broadcast({ type: 'CONFIG_UPDATED' });
  res.json({ ok: true });
});

export default router;
