/**
 * Auto-backup de la DB.
 *
 * Cada N minutos hace un snapshot atómico de holonfc.db usando la API .backup()
 * de SQLite (segura mientras la DB está en uso). Rota: mantiene los últimos
 * MAX_BACKUPS archivos en data/backups/.
 */
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR  = resolve(__dirname, '..', 'data', 'backups');
const INTERVAL_MIN = 5;     // cada cuántos minutos se hace un backup
const MAX_BACKUPS  = 24;    // últimos 2 h aproximadamente (5 min × 24)

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function runBackup() {
  mkdirSync(BACKUPS_DIR, { recursive: true });
  const file = join(BACKUPS_DIR, `holonfc-${ts()}.db`);
  try {
    await db.backup(file);
    rotate();
    return { ok: true, file };
  } catch (e) {
    console.error('[backup] failed:', e.message);
    return { ok: false, error: e.message };
  }
}

function rotate() {
  const files = readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('holonfc-') && f.endsWith('.db'))
    .map((f) => ({ name: f, mtime: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const old of files.slice(MAX_BACKUPS)) {
    try {
      unlinkSync(join(BACKUPS_DIR, old.name));
    } catch {}
  }
}

export function listBackups() {
  try {
    mkdirSync(BACKUPS_DIR, { recursive: true });
    return readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('holonfc-') && f.endsWith('.db'))
      .map((f) => {
        const p = join(BACKUPS_DIR, f);
        const s = statSync(p);
        return { name: f, size: s.size, mtime: s.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

let timer = null;

export function startBackupScheduler() {
  if (timer) return;
  console.log(`[backup] scheduler enabled — every ${INTERVAL_MIN} min, keep last ${MAX_BACKUPS}`);
  // Run once on boot (after a 30 s grace period) then on interval
  setTimeout(() => runBackup().then((r) => {
    if (r.ok) console.log(`[backup] initial snapshot: ${r.file}`);
  }), 30_000);
  timer = setInterval(() => runBackup().then((r) => {
    if (r.ok) console.log(`[backup] snapshot: ${r.file}`);
  }), INTERVAL_MIN * 60 * 1000);
}

export function stopBackupScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
