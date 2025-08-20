export const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS audits (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  event TEXT NOT NULL,
  payload JSONB
);

CREATE TYPE job_status AS ENUM ('queued','in_progress','done','error')
  -- create type if not exists workaround
;`;

export const TABLES_SQL = `
DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued','in_progress','done','error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  args JSONB,
  status job_status NOT NULL DEFAULT 'queued',
  progress INT NOT NULL DEFAULT 0,
  result JSONB,
  worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS slack_tasks (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  thread_ts TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
