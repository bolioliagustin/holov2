import { Router } from 'express';
import multer from 'multer';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, unlinkSync, copyFileSync, mkdirSync, statSync } from 'fs';
import { spawn, spawnSync, execSync } from 'child_process';
import db from '../db.js';
import { broadcast } from '../ws.js';
import { getCurrentEventId } from '../eventCtx.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = resolve(__dirname, '../../uploads');
const VIDEOS_DIR  = resolve(__dirname, '../../public/videos');

// Hard limit per video (10 minutes) — kills runaway Python processes
const PROCESS_TIMEOUT_MS = 10 * 60 * 1000;
// Allow at most 1 automatic retry on crash before giving up
const MAX_AUTO_RETRIES = 1;
// Cleanup raw upload after successful processing
const CLEANUP_RAW_AFTER_DONE = true;

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

function probeVideoMeta(filePath) {
  const file_size = existsSync(filePath) ? statSync(filePath).size : 0;
  try {
    const r = spawnSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], { encoding: 'utf8', timeout: 15000 });
    if (r.status !== 0 || !r.stdout) throw new Error(r.stderr || 'ffprobe failed');
    const j = JSON.parse(r.stdout);
    const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
    return {
      duration:  parseFloat(j.format?.duration || v.duration || 0) || 0,
      width:     parseInt(v.width  || 0, 10) || 0,
      height:    parseInt(v.height || 0, 10) || 0,
      file_size: parseInt(j.format?.size || 0, 10) || file_size,
    };
  } catch {
    return { duration: 0, width: 0, height: 0, file_size };
  }
}

function finalizePassthrough(id, uploadedFilename, originalName) {
  if (!existsSync(VIDEOS_DIR)) mkdirSync(VIDEOS_DIR, { recursive: true });
  const ext = (extname(originalName) || extname(uploadedFilename) || '.mp4').toLowerCase();
  const outputName = `ready_${id}_${Date.now()}${ext}`;
  const src  = join(UPLOADS_DIR, uploadedFilename);
  const dest = join(VIDEOS_DIR, outputName);
  if (!existsSync(src)) throw new Error(`Archivo no encontrado: ${uploadedFilename}`);
  copyFileSync(src, dest);
  const meta = probeVideoMeta(dest);
  db.prepare(
    `UPDATE video_queue
     SET status='done', progress=100, output=?,
         duration=?, width=?, height=?, file_size=?, passthrough=1
     WHERE id=?`
  ).run(outputName, meta.duration, meta.width, meta.height, meta.file_size, id);
  if (CLEANUP_RAW_AFTER_DONE && existsSync(src)) {
    try { unlinkSync(src); } catch (e) {
      console.warn(`[videos] passthrough cleanup failed for ${uploadedFilename}:`, e.message);
    }
  }
  broadcast({
    type: 'VIDEO_STATUS', id, status: 'done', progress: 100,
    output: outputName, passthrough: 1,
    duration: meta.duration, width: meta.width, height: meta.height, file_size: meta.file_size,
  });
  return { outputName, ...meta };
}

// ── Read endpoints (scoped to current event) ─────────────────────────────
router.get('/queue', (req, res) => {
  const eventId = getCurrentEventId();
  const rows = db.prepare('SELECT * FROM video_queue WHERE event_id = ? ORDER BY id DESC LIMIT 100').all(eventId);
  res.json(rows);
});

router.get('/library', (req, res) => {
  const eventId = getCurrentEventId();
  const rows = db.prepare(
    "SELECT * FROM video_queue WHERE event_id = ? AND status = 'done' ORDER BY id DESC"
  ).all(eventId);
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
  const eventId = getCurrentEventId();
  const isPassthrough = req.body.mode === 'passthrough';

  const info = db.prepare(
    `INSERT INTO video_queue (event_id, filename, original, status, bg_color, feather, model, holo_boost, passthrough)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    eventId,
    req.file.filename,
    req.file.originalname,
    isPassthrough ? 'done' : 'queued',
    req.body.bg_color || '#000000',
    Number(req.body.feather ?? 5),
    req.body.model || 'selfie',
    req.body.holo_boost ? 1 : 0,
    isPassthrough ? 1 : 0,
  );

  const id = Number(info.lastInsertRowid);

  if (isPassthrough) {
    try {
      const result = finalizePassthrough(id, req.file.filename, req.file.originalname);
      return res.json({ id, filename: req.file.filename, output: result.outputName, mode: 'passthrough' });
    } catch (e) {
      console.error('[videos] passthrough failed:', e);
      db.prepare("UPDATE video_queue SET status='error', error_msg=?, progress=0 WHERE id=?")
        .run(String(e.message || e), id);
      broadcast({ type: 'VIDEO_STATUS', id, status: 'error', progress: 0, error: String(e.message || e) });
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  res.json({ id, filename: req.file.filename, mode: 'ai' });
  processNext();
});

// ── Reprocess with new settings (no need to re-upload) ──────────────────
router.post('/reprocess/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM video_queue WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.passthrough) {
    return res.status(400).json({
      error: 'Video subido sin IA (ya editado). Volvé a subirlo en modo Procesar con IA.',
    });
  }
  if (running.has(item.id)) return res.status(409).json({ error: 'already processing' });

  const updates = {
    bg_color:   req.body.bg_color   ?? item.bg_color,
    feather:    req.body.feather    !== undefined ? Number(req.body.feather) : item.feather,
    model:      req.body.model      ?? item.model,
    holo_boost: req.body.holo_boost !== undefined ? (req.body.holo_boost ? 1 : 0) : item.holo_boost,
  };

  db.prepare(
    `UPDATE video_queue SET status='queued', progress=0, error_msg='', retry_count=0,
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
  if (item.passthrough) {
    return res.status(400).json({
      error: 'Video subido sin IA (ya editado). Volvé a subirlo en modo Procesar con IA.',
    });
  }
  db.prepare("UPDATE video_queue SET status='queued', progress=0, error_msg='', retry_count=0 WHERE id = ?").run(item.id);
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
      "SELECT * FROM video_queue WHERE status='queued' AND COALESCE(passthrough,0)=0 ORDER BY id LIMIT 1"
    ).get();
    if (!item) return;
    runProcessor(item);
  }
}

function runProcessor(item) {
  const attemptLabel = item.retry_count > 0 ? ` (retry ${item.retry_count}/${MAX_AUTO_RETRIES})` : '';
  console.log(`[videos] starting #${item.id} (${item.original})${attemptLabel}`);
  db.prepare("UPDATE video_queue SET status='processing', progress=0, started_at=datetime('now') WHERE id=?").run(item.id);
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

  let pythonCmd = 'python';
  if (process.platform === 'win32') {
    try {
      execSync('py --version', { stdio: 'ignore' });
      pythonCmd = 'py';
    } catch (e) {
      pythonCmd = 'python';
    }
  }

  let proc;
  try {
    proc = spawn(pythonCmd, args);
  } catch (e) {
    console.error('[videos] spawn failed:', e.message);
    db.prepare("UPDATE video_queue SET status='error', error_msg=? WHERE id=?").run(`No se pudo iniciar Python: ${e.message}`, item.id);
    broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'error', progress: 0, error: 'Python no disponible' });
    setImmediate(processNext);
    return;
  }
  running.set(item.id, proc);

  // Hard timeout — kill the Python process if it runs longer than allowed
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    console.warn(`[videos] #${item.id} timeout reached (${PROCESS_TIMEOUT_MS/1000}s) — SIGTERM`);
    try { proc.kill('SIGTERM'); } catch {}
    // Give it 5 s to terminate, then SIGKILL
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
  }, PROCESS_TIMEOUT_MS);

  proc.on('error', (err) => {
    console.error(`[videos] proc #${item.id} error:`, err.message);
    clearTimeout(timeoutHandle);
    running.delete(item.id);
    handleFailure(item, err.message);
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
    clearTimeout(timeoutHandle);
    running.delete(item.id);

    if (code === 0 && existsSync(outputPath)) {
      // ✅ Success — persist metadata, cleanup raw upload
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

      // Cleanup raw upload to free disk space
      if (CLEANUP_RAW_AFTER_DONE && existsSync(inputPath)) {
        try {
          unlinkSync(inputPath);
          console.log(`[videos] #${item.id} cleaned up raw: ${item.filename}`);
        } catch (e) {
          console.warn(`[videos] cleanup failed for ${item.filename}:`, e.message);
        }
      }
      processNext();
    } else if (code === null) {
      // SIGTERM — either user-cancelled or timeout
      if (timedOut) {
        const msg = `Timeout (${PROCESS_TIMEOUT_MS / 60000} min)`;
        handleFailure(item, msg);
      }
      // (else: already handled by /cancel endpoint)
      processNext();
    } else {
      // Exit code != 0 — extract real error or fallback
      const errLine = stderrBuf.split('\n').find((l) => l.startsWith('ERROR:')) || `exit code ${code}`;
      handleFailure(item, errLine);
      processNext();
    }
  });
}

// Auto-retry once on failure, then mark as error
function handleFailure(item, errMsg) {
  const currentRetries = item.retry_count || 0;

  if (currentRetries < MAX_AUTO_RETRIES) {
    const next = currentRetries + 1;
    console.warn(`[videos] #${item.id} failed: ${errMsg} — auto-retry ${next}/${MAX_AUTO_RETRIES}`);
    db.prepare(
      "UPDATE video_queue SET status='queued', progress=0, error_msg=?, retry_count=? WHERE id=?"
    ).run(`Reintento autom. tras: ${errMsg}`, next, item.id);
    broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'queued', progress: 0, error: null });
  } else {
    console.error(`[videos] #${item.id} failed permanently: ${errMsg}`);
    db.prepare("UPDATE video_queue SET status='error', error_msg=? WHERE id=?").run(errMsg, item.id);
    broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'error', progress: 0, error: errMsg });
  }
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

// 3) Periodic watchdog — every 60 s, kill any "processing" item that has been
// stuck for over PROCESS_TIMEOUT_MS but whose timeout handler never fired
// (defensive: in practice the per-spawn setTimeout handles it).
setInterval(() => {
  const cutoffSec = (PROCESS_TIMEOUT_MS / 1000) + 30;
  const stale = db.prepare(
    `SELECT id, original FROM video_queue
     WHERE status='processing'
       AND started_at IS NOT NULL
       AND (julianday('now') - julianday(started_at)) * 86400 > ?`
  ).all(cutoffSec);
  for (const item of stale) {
    const child = running.get(item.id);
    if (child) {
      console.warn(`[videos] watchdog: killing stale #${item.id} (${item.original})`);
      try { child.kill('SIGKILL'); } catch {}
      running.delete(item.id);
    }
    db.prepare("UPDATE video_queue SET status='error', error_msg='Timeout (watchdog)' WHERE id=?").run(item.id);
    broadcast({ type: 'VIDEO_STATUS', id: item.id, status: 'error', progress: 0, error: 'Timeout (watchdog)' });
  }
  if (stale.length) setImmediate(processNext);
}, 60_000);

export default router;
