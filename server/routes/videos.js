import { Router } from 'express';
import multer from 'multer';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import db from '../db.js';
import { broadcast } from '../ws.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = resolve(__dirname, '../../uploads');
const VIDEOS_DIR  = resolve(__dirname, '../../public/videos');

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `raw_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const router = Router();

// ── Worker pool ─────────────────────────────────────────────────────────
const MAX_CONCURRENT = 1; // single-stream by default; bump to 2 if CPU permits
const running = new Map(); // id → ChildProcess

// ── Read endpoints ───────────────────────────────────────────────────────
router.get('/queue', (req, res) => {
  const rows = db.prepare('SELECT * FROM video_queue ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

router.get('/library', (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM video_queue WHERE status = 'done' ORDER BY id DESC"
  ).all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM video_queue WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// ── Upload ──────────────────────────────────────────────────────────────
router.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const info = db.prepare(
    `INSERT INTO video_queue (filename, original, status, bg_color, feather, model, holo_boost)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    req.file.filename,
    req.file.originalname,
    'queued',
    req.body.bg_color || '#000000',
    Number(req.body.feather ?? 5),
    req.body.model || 'selfie',
    req.body.holo_boost ? 1 : 0,
  );

  res.json({ id: info.lastInsertRowid, filename: req.file.filename });
  processNext();
});

// ── Reprocess with new settings (no need to re-upload) ──────────────────
router.post('/reprocess/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM video_queue WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (running.has(item.id)) return res.status(409).json({ error: 'already processing' });

  const updates = {
    bg_color:   req.body.bg_color   ?? item.bg_color,
    feather:    req.body.feather    !== undefined ? Number(req.body.feather) : item.feather,
    model:      req.body.model      ?? item.model,
    holo_boost: req.body.holo_boost !== undefined ? (req.body.holo_boost ? 1 : 0) : item.holo_boost,
  };

  db.prepare(
    `UPDATE video_queue SET status='queued', progress=0, error_msg='',
     bg_color=?, feather=?, model=?, holo_boost=? WHERE id = ?`
  ).run(updates.bg_color, updates.feather, updates.model, updates.holo_boost, item.id);

  broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'queued', progress: 0 });
  res.json({ ok: true });
  processNext();
});

// ── Cancel running job ──────────────────────────────────────────────────
router.post('/cancel/:id', (req, res) => {
  const id = Number(req.params.id);
  const child = running.get(id);
  if (child) {
    try { child.kill('SIGTERM'); } catch {}
    running.delete(id);
    db.prepare("UPDATE video_queue SET status='error', error_msg='Cancelado por usuario' WHERE id = ?").run(id);
    broadcast({ type: 'VIDEO_STATUS', id, status: 'error', progress: 0, error: 'Cancelado por usuario' });
    res.json({ ok: true, killed: true });
  } else {
    const item = db.prepare('SELECT status FROM video_queue WHERE id = ?').get(id);
    if (item && item.status === 'queued') {
      db.prepare("UPDATE video_queue SET status='error', error_msg='Cancelado' WHERE id = ?").run(id);
      broadcast({ type: 'VIDEO_STATUS', id, status: 'error', progress: 0, error: 'Cancelado' });
    }
    res.json({ ok: true, killed: false });
  }
});

// ── Assign processed video directly to a guest ──────────────────────────
router.post('/assign/:id', (req, res) => {
  const item = db.prepare('SELECT output, status FROM video_queue WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'video not found' });
  if (item.status !== 'done' || !item.output) return res.status(400).json({ error: 'video not processed yet' });

  const { guest_id } = req.body;
  if (!guest_id) return res.status(400).json({ error: 'guest_id required' });

  const g = db.prepare('SELECT id FROM guests WHERE id = ?').get(guest_id);
  if (!g) return res.status(404).json({ error: 'guest not found' });

  db.prepare('UPDATE guests SET video = ? WHERE id = ?').run(item.output, guest_id);
  res.json({ ok: true });
});

// ── Force re-run on existing item ────────────────────────────────────────
router.post('/retry/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM video_queue WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  db.prepare("UPDATE video_queue SET status='queued', progress=0, error_msg='' WHERE id = ?").run(item.id);
  broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'queued', progress: 0 });
  res.json({ ok: true });
  processNext();
});

router.delete('/:id', (req, res) => {
  if (running.has(Number(req.params.id))) {
    return res.status(409).json({ error: 'video is processing — cancel it first' });
  }
  db.prepare('DELETE FROM video_queue WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Processor ───────────────────────────────────────────────────────────
function processNext() {
  while (running.size < MAX_CONCURRENT) {
    const item = db.prepare(
      "SELECT * FROM video_queue WHERE status='queued' ORDER BY id LIMIT 1"
    ).get();
    if (!item) return;
    runProcessor(item);
  }
}

function runProcessor(item) {
  console.log(`[videos] starting #${item.id} (${item.original})`);
  db.prepare("UPDATE video_queue SET status='processing', progress=0 WHERE id=?").run(item.id);
  broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'processing', progress: 0 });

  const inputPath  = join(UPLOADS_DIR, item.filename);
  const outputName = `processed_${item.id}_${basename(item.filename, extname(item.filename))}.mp4`;
  const outputPath = join(VIDEOS_DIR, outputName);

  if (!existsSync(inputPath)) {
    console.error(`[videos] input missing: ${inputPath}`);
    db.prepare("UPDATE video_queue SET status='error', error_msg=? WHERE id=?").run(`Archivo no encontrado: ${item.filename}`, item.id);
    broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'error', progress: 0, error: 'Archivo no encontrado' });
    setImmediate(processNext);
    return;
  }

  const pythonScript = resolve(__dirname, '../../processor/process_video.py');

  const args = [
    pythonScript,
    '--input',    inputPath,
    '--output',   outputPath,
    '--bg_color', item.bg_color || '#000000',
    '--feather',  String(item.feather ?? 5),
    '--model',    item.model     || 'selfie',
  ];
  if (item.holo_boost) args.push('--holo-boost');

  let proc;
  try {
    proc = spawn('python', args);
  } catch (e) {
    console.error('[videos] spawn failed:', e.message);
    db.prepare("UPDATE video_queue SET status='error', error_msg=? WHERE id=?").run(`No se pudo iniciar Python: ${e.message}`, item.id);
    broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'error', progress: 0, error: 'Python no disponible' });
    setImmediate(processNext);
    return;
  }
  running.set(item.id, proc);

  proc.on('error', (err) => {
    console.error(`[videos] proc #${item.id} error:`, err.message);
    running.delete(item.id);
    db.prepare("UPDATE video_queue SET status='error', error_msg=? WHERE id=?").run(err.message, item.id);
    broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'error', progress: 0, error: err.message });
    setImmediate(processNext);
  });

  const meta = {};

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    text.split('\n').forEach((line) => {
      const lineTrim = line.trim();
      const mProg = lineTrim.match(/^PROGRESS:(\d+)/);
      if (mProg) {
        const pct = parseInt(mProg[1], 10);
        db.prepare('UPDATE video_queue SET progress=? WHERE id=?').run(pct, item.id);
        broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'processing', progress: pct });
        return;
      }
      const mMeta = lineTrim.match(/^METADATA:(.+)/);
      if (mMeta) {
        mMeta[1].split(';').forEach((pair) => {
          const [k, v] = pair.split('=');
          if (k && v !== undefined) meta[k.trim()] = v.trim();
        });
      }
    });
  });

  let stderrBuf = '';
  proc.stderr.on('data', (data) => {
    const line = data.toString();
    stderrBuf += line;
    if (!line.includes('INFO:') && !line.includes('W0000')) {
      console.error('[processor]', line.trim());
    }
  });

  proc.on('close', (code) => {
    running.delete(item.id);
    if (code === 0 && existsSync(outputPath)) {
      const duration  = parseFloat(meta.duration) || 0;
      const width     = parseInt(meta.width)      || 0;
      const height    = parseInt(meta.height)     || 0;
      const file_size = parseInt(meta.size)       || 0;
      db.prepare(
        `UPDATE video_queue
         SET status='done', progress=100, output=?,
             duration=?, width=?, height=?, file_size=?
         WHERE id=?`
      ).run(outputName, duration, width, height, file_size, item.id);
      broadcast({
        type: 'VIDEO_STATUS', id: item.id, status: 'done', progress: 100,
        output: outputName, duration, width, height, file_size,
      });
    } else if (code === null) {
      // SIGTERM (cancelled) — already handled by /cancel endpoint
    } else {
      const errLine = stderrBuf.split('\n').find((l) => l.startsWith('ERROR:')) || `exit code ${code}`;
      db.prepare("UPDATE video_queue SET status='error', error_msg=? WHERE id=?").run(errLine, item.id);
      broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'error', progress: 0, error: errLine });
    }
    processNext();
  });
}

// ── Boot recovery ───────────────────────────────────────────────────────
// 1) Items left "processing" from a crash → mark as error
const stuck = db.prepare("UPDATE video_queue SET status='error', error_msg='Servidor reiniciado' WHERE status='processing'").run();
if (stuck.changes) console.log(`[videos] boot: marked ${stuck.changes} stuck item(s) as error`);

// 2) Auto-resume any queued items
const pending = db.prepare("SELECT COUNT(*) AS n FROM video_queue WHERE status='queued'").get().n;
if (pending > 0) {
  console.log(`[videos] boot: ${pending} queued item(s) — starting worker`);
  setImmediate(processNext);
}

export default router;
