CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '查看员' CHECK (role IN ('老板','操作员','查看员')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  id BIGSERIAL PRIMARY KEY,
  month TEXT,
  country TEXT,
  customer_name TEXT,
  customer_no TEXT,
  pieces TEXT,
  mode TEXT,
  ship_date TEXT,
  tracking TEXT,
  est_weight TEXT,
  actual_weight TEXT,
  lastmile TEXT,
  goods TEXT,
  status TEXT,
  address TEXT,
  cost TEXT,
  remark TEXT,
  signed TEXT,
  created_by BIGINT REFERENCES users(id),
  updated_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id BIGINT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
