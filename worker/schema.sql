-- Mail the Worker accepted (status new → collected) or refused (rejected, no body kept).
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  message_id TEXT UNIQUE,
  received_at INTEGER NOT NULL,
  sender TEXT,
  subject TEXT,
  raw TEXT,
  parsed TEXT,
  parser_version INTEGER,
  status TEXT NOT NULL,
  reason TEXT,
  auth TEXT,
  collected_at INTEGER
);
CREATE INDEX IF NOT EXISTS messages_status_idx ON messages (status, received_at);
