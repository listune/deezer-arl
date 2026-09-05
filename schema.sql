-- Schema for Deezer ARL Database (Universal SQLite & Cloudflare D1)

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  arl TEXT,
  user_id TEXT,
  user_name TEXT,
  avatar_url TEXT,
  country TEXT,
  tier TEXT DEFAULT 'FREE',
  status TEXT CHECK(status IN ('ACTIVE', 'EXPIRED', 'BLOCKED', 'INVALID_CREDENTIALS', 'PENDING')) DEFAULT 'PENDING',
  last_checked_at INTEGER,
  last_refreshed_at INTEGER,
  created_at INTEGER NOT NULL,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Index for fast status & label lookup
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
