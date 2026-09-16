import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// Mantenida en sync con migrations/001_init.sql (esa versión .sql queda como
// referencia legible; se embebe aquí para no depender de copiar assets no-.ts
// al compilar con tsc).
const INIT_MIGRATION = `
CREATE TABLE IF NOT EXISTS event_state (
  event_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  channel_target TEXT NOT NULL,
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_event_id ON subscriptions (event_id);
`;

export function openDatabase(databasePath: string): Database.Database {
  const dir = dirname(databasePath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(INIT_MIGRATION);
  return db;
}
