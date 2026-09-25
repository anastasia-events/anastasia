import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { runMigrations } from "./migrations";

export function openDatabase(databasePath: string): Database.Database {
  const dir = dirname(databasePath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}
