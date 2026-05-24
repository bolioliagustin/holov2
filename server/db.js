import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'holonfc.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT 'Evento HoloNFC',
    venue      TEXT DEFAULT '',
    date       TEXT DEFAULT '',
    capacity   INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO events (id, name) VALUES (1, 'Evento HoloNFC');

  CREATE TABLE IF NOT EXISTS guests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER DEFAULT 1,
    name       TEXT NOT NULL,
    email      TEXT DEFAULT '',
    table_num  TEXT DEFAULT '',
    uid        TEXT DEFAULT '',
    video      TEXT DEFAULT '',
    message    TEXT DEFAULT '',
    checked_in INTEGER DEFAULT 0,
    checkin_at TEXT DEFAULT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS checkin_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        TEXT NOT NULL,
    guest_id   INTEGER,
    guest_name TEXT DEFAULT '',
    type       TEXT DEFAULT 'IN',
    ts         TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO config VALUES ('holo_screen', '');
  INSERT OR IGNORE INTO config VALUES ('idle_video', '');
  INSERT OR IGNORE INTO config VALUES ('sim_mode', '0');
  INSERT OR IGNORE INTO config VALUES ('event_name', 'Evento HoloNFC');
  INSERT OR IGNORE INTO config VALUES ('event_venue', '');
  INSERT OR IGNORE INTO config VALUES ('event_date', '');
  INSERT OR IGNORE INTO config VALUES ('event_capacity', '0');

  CREATE TABLE IF NOT EXISTS video_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT NOT NULL,
    original    TEXT NOT NULL,
    status      TEXT DEFAULT 'queued',
    progress    INTEGER DEFAULT 0,
    bg_color    TEXT DEFAULT '#000000',
    output      TEXT DEFAULT '',
    error_msg   TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ── Migration: add new columns to video_queue if missing ─────────────────
const existingCols = new Set(
  db.prepare("PRAGMA table_info(video_queue)").all().map((c) => c.name)
);
const migrations = [
  ['duration',     "REAL DEFAULT 0"],
  ['width',        "INTEGER DEFAULT 0"],
  ['height',       "INTEGER DEFAULT 0"],
  ['file_size',    "INTEGER DEFAULT 0"],
  ['feather',      "INTEGER DEFAULT 5"],
  ['model',        "TEXT DEFAULT 'selfie'"],
  ['holo_boost',   "INTEGER DEFAULT 0"],
];
for (const [col, def] of migrations) {
  if (!existingCols.has(col)) {
    db.exec(`ALTER TABLE video_queue ADD COLUMN ${col} ${def}`);
    console.log(`[db] migrated: added video_queue.${col}`);
  }
}

export default db;
