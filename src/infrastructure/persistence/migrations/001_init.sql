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
