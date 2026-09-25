CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_chat_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);

-- El backfill de subscriptions.user_id (antes un string suelto = chatId, o
-- "test-user" desde el script de seed) hacia una fila real de `users` vive
-- en código (../sqlite/migrations.ts, versión 2), no en SQL puro, porque
-- necesita generar un id por chatId distinto.
