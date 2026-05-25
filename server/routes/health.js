import { Router } from 'express';
import { existsSync, statSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { getNFCStatus } from '../nfc.js';
import { getProjectorStatus } from '../ws.js';
import { getCurrentEventId, getCurrentEvent } from '../eventCtx.js';
import { listBackups, runBackup } from '../backup.js';
import { listLogFiles } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEOS_DIR  = resolve(__dirname, '../../public/videos');
const UPLOADS_DIR = resolve(__dirname, '../../uploads');

const router = Router();

router.get('/event-readiness', (req, res) => {
  const eventId = getCurrentEventId();
  const event   = getCurrentEvent();

  // ── Guests metrics (scoped to current event) ──────────────────────────
  const totalGuests = db.prepare('SELECT COUNT(*) AS n FROM guests WHERE event_id = ?').get(eventId).n;
  const noUID       = db.prepare("SELECT COUNT(*) AS n FROM guests WHERE event_id = ? AND uid = ''").get(eventId).n;
  const noVideo     = db.prepare("SELECT COUNT(*) AS n FROM guests WHERE event_id = ? AND video = ''").get(eventId).n;
  const checkedIn   = db.prepare('SELECT COUNT(*) AS n FROM guests WHERE event_id = ? AND checked_in = 1').get(eventId).n;

  // ── Guests whose assigned video does NOT exist on disk ────────────────
  const guestsWithVideo = db.prepare("SELECT id, name, video FROM guests WHERE event_id = ? AND video != ''").all(eventId);
  const missingVideos = guestsWithVideo.filter((g) => !existsSync(join(VIDEOS_DIR, g.video)));

  // ── Video queue (scoped) ──────────────────────────────────────────────
  const processingCount = db.prepare("SELECT COUNT(*) AS n FROM video_queue WHERE event_id = ? AND status = 'processing'").get(eventId).n;
  const queuedCount     = db.prepare("SELECT COUNT(*) AS n FROM video_queue WHERE event_id = ? AND status = 'queued'").get(eventId).n;
  const errorCount      = db.prepare("SELECT COUNT(*) AS n FROM video_queue WHERE event_id = ? AND status = 'error'").get(eventId).n;

  // ── Hardware status (live) ─────────────────────────────────────────────
  const nfc       = getNFCStatus();
  const projector = getProjectorStatus();

  // ── Disk space (rough check) ───────────────────────────────────────────
  let videosDiskMB = 0;
  let uploadsDiskMB = 0;
  try {
    for (const f of readdirSync(VIDEOS_DIR)) {
      try { videosDiskMB += statSync(join(VIDEOS_DIR, f)).size; } catch {}
    }
    for (const f of readdirSync(UPLOADS_DIR)) {
      try { uploadsDiskMB += statSync(join(UPLOADS_DIR, f)).size; } catch {}
    }
  } catch {}
  videosDiskMB  = Math.round(videosDiskMB  / 1024 / 1024);
  uploadsDiskMB = Math.round(uploadsDiskMB / 1024 / 1024);

  // ── Idle video sanity (from current event) ────────────────────────────
  const idleVideo   = event?.idle_video || '';
  const idleVideoOK = idleVideo && existsSync(join(VIDEOS_DIR, idleVideo));

  // ── Build checks array ─────────────────────────────────────────────────
  const checks = [
    {
      key: 'guests',
      label: 'Invitados cargados',
      ok: totalGuests > 0,
      value: `${totalGuests}`,
      hint: totalGuests === 0 ? 'Cargá un CSV o agregá invitados manualmente' : null,
    },
    {
      key: 'uids',
      label: 'UIDs asignados',
      ok: totalGuests > 0 && noUID === 0,
      value: totalGuests > 0 ? `${totalGuests - noUID}/${totalGuests}` : '—',
      hint: noUID > 0 ? `${noUID} invitados sin UID — ir a Asignar pulseras` : null,
    },
    {
      key: 'videos',
      label: 'Videos asignados',
      ok: totalGuests > 0 && noVideo === 0,
      value: totalGuests > 0 ? `${totalGuests - noVideo}/${totalGuests}` : '—',
      hint: noVideo > 0 ? `${noVideo} invitados sin video — los va a recibir el fallback` : null,
      warn: true,  // soft check — fallback handles this
    },
    {
      key: 'missing_files',
      label: 'Archivos de video presentes',
      ok: missingVideos.length === 0,
      value: missingVideos.length === 0 ? 'OK' : `${missingVideos.length} faltan`,
      hint: missingVideos.length > 0 ? `Faltan en disco: ${missingVideos.slice(0, 3).map((g) => g.name).join(', ')}${missingVideos.length > 3 ? '…' : ''}` : null,
    },
    {
      key: 'video_queue',
      label: 'Cola de procesamiento',
      ok: processingCount === 0 && queuedCount === 0,
      value: (processingCount === 0 && queuedCount === 0) ? 'libre' : `${processingCount + queuedCount} pendientes`,
      hint: errorCount > 0 ? `${errorCount} videos en error` : null,
      warn: true,
    },
    {
      key: 'nfc',
      label: 'Lector NFC',
      ok: nfc.connected,
      value: nfc.connected ? (nfc.readers[0] || 'OK') : 'desconectado',
      hint: !nfc.connected ? 'Verificá USB del ACR122U o activá modo simulación' : null,
    },
    {
      key: 'projector',
      label: 'Proyector (holograma)',
      ok: projector.status === 'online',
      value: projector.status,
      hint: projector.status !== 'online' ? 'Abrí localhost:3000/projector.html en la pantalla del holograma' : null,
    },
    {
      key: 'idle_video',
      label: 'Video idle configurado',
      ok: !!idleVideoOK,
      value: idleVideoOK ? 'OK' : (idleVideo ? 'archivo no existe' : 'no asignado'),
      hint: !idleVideoOK ? 'Ir a Configuración → Loop idle' : null,
      warn: true,
    },
    {
      key: 'event_active',
      label: 'Evento activo',
      ok: event?.status === 'active',
      value: event?.status || '—',
      hint: event?.status !== 'active'
        ? 'El evento debe estar en estado "activo" para recibir check-ins. Ir a Eventos.'
        : null,
    },
  ];

  const blocking = checks.filter((c) => !c.ok && !c.warn);
  const warnings = checks.filter((c) => !c.ok && c.warn);
  const ready    = blocking.length === 0;

  res.json({
    ready,
    summary: {
      blocking: blocking.length,
      warnings: warnings.length,
      totalGuests, noUID, noVideo, checkedIn,
      processingCount, queuedCount, errorCount,
      missingVideosCount: missingVideos.length,
      videosDiskMB, uploadsDiskMB,
    },
    nfc,
    projector,
    checks,
  });
});

// ── Backups ──────────────────────────────────────────────────────────────
router.get('/backups', (req, res) => {
  res.json({ rows: listBackups() });
});

router.post('/backups/run', async (req, res) => {
  const r = await runBackup();
  if (!r.ok) return res.status(500).json(r);
  res.json(r);
});

// ── Server log files ─────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  res.json({ rows: listLogFiles() });
});

export default router;
