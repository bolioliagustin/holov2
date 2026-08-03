import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initWS } from './ws.js';
import { startNFC, handleTag, setAssignMode } from './nfc.js';
import { startBackupScheduler } from './backup.js';
import { createLogger } from './logger.js';

const log = createLogger('server');
import guestsRouter  from './routes/guests.js';
import configRouter  from './routes/config.js';
import logsRouter    from './routes/logs.js';
import statsRouter   from './routes/stats.js';
import videosRouter  from './routes/videos.js';
import healthRouter  from './routes/health.js';
import eventsRouter  from './routes/events.js';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Static files (built frontend + uploaded videos)
app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
app.use('/videos',  express.static(join(__dirname, '..', 'public', 'videos')));

// API routes
app.use('/api/guests',  guestsRouter);
app.use('/api/config',  configRouter);
app.use('/api/logs',    logsRouter);
app.use('/api/stats',   statsRouter);
app.use('/api/videos',  videosRouter);
app.use('/api/health',  healthRouter);
app.use('/api/events',  eventsRouter);

// NFC assign mode toggle
app.post('/api/nfc/assign-mode', (req, res) => {
  const { active } = req.body;
  setAssignMode(!!active);
  res.json({ ok: true, active: !!active });
});

// Manual UID trigger (simulation or manual assignment)
app.post('/api/nfc/trigger', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  handleTag(uid);
  res.json({ ok: true });
});

// Proyector: siempre desde public/ (fuente de verdad) + sin caché del browser
const PROJECTOR = join(__dirname, '..', 'public', 'projector.html');
app.get(['/projector.html', '/projector'], (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  });
  res.sendFile(PROJECTOR);
});

// Serve built frontend in production
const DIST = join(__dirname, '..', 'dist');
app.use(express.static(DIST));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return;
  res.sendFile(join(DIST, 'index.html'));
});

const server = createServer(app);
initWS(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log.info(`HoloNFC server running on http://localhost:${PORT}`);
  startNFC();
  startBackupScheduler();
});

// Global error catchers — log uncaught exceptions so the operator sees them
process.on('uncaughtException',  (err) => log.error('uncaughtException', { error: String(err), stack: err.stack }));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', { error: String(err) }));
