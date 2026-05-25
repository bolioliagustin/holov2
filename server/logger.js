/**
 * Logger estructurado con rotación por día.
 *
 * Escribe a stdout (preservando los logs en la consola del operador) y a
 * data/logs/server-YYYY-MM-DD.log para auditoría post-evento. Mantiene los
 * últimos MAX_DAYS días.
 */
import { mkdirSync, createWriteStream, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR  = resolve(__dirname, '..', 'data', 'logs');
const MAX_DAYS  = 14;

mkdirSync(LOGS_DIR, { recursive: true });

let currentDate   = null;
let currentStream = null;

function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function ensureStream() {
  const today = dateKey();
  if (today !== currentDate) {
    if (currentStream) { try { currentStream.end(); } catch {} }
    currentDate = today;
    currentStream = createWriteStream(join(LOGS_DIR, `server-${today}.log`), { flags: 'a' });
    rotateOld();
  }
  return currentStream;
}

function rotateOld() {
  try {
    const files = readdirSync(LOGS_DIR)
      .filter((f) => f.startsWith('server-') && f.endsWith('.log'))
      .map((f) => ({ name: f, mtime: statSync(join(LOGS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(MAX_DAYS)) {
      try { unlinkSync(join(LOGS_DIR, old.name)); } catch {}
    }
  } catch {}
}

function write(level, scope, msg, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ' ' + safeJSON(meta) : '';
  const line = `${ts} ${level.padEnd(5)} [${scope}] ${msg}${metaStr}\n`;
  try { ensureStream().write(line); } catch {}
  // also keep on stdout so the operator sees it
  if (level === 'ERROR')      process.stderr.write(line);
  else if (level === 'WARN')  process.stderr.write(line);
  else                        process.stdout.write(line);
}

function safeJSON(o) {
  try { return JSON.stringify(o); } catch { return String(o); }
}

export function createLogger(scope) {
  return {
    info:  (msg, meta) => write('INFO',  scope, msg, meta),
    warn:  (msg, meta) => write('WARN',  scope, msg, meta),
    error: (msg, meta) => write('ERROR', scope, msg, meta),
  };
}

export function listLogFiles() {
  try {
    return readdirSync(LOGS_DIR)
      .filter((f) => f.endsWith('.log'))
      .map((f) => {
        const s = statSync(join(LOGS_DIR, f));
        return { name: f, size: s.size, mtime: s.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
}
