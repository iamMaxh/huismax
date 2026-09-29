-- Song requests for the next live set, from the form on /dj (src/lib/requests.ts).
-- Hidden until published in /admin; the published ones show on /dj. Additive only, like 0001.

CREATE TABLE IF NOT EXISTS dj_requests (
  id TEXT PRIMARY KEY,
  request TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dj_requests_created ON dj_requests (created_at);
