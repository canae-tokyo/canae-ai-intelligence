CREATE TABLE IF NOT EXISTS review_candidate_actions (
  candidate_id TEXT PRIMARY KEY,
  candidate_type TEXT NOT NULL,
  review_decision TEXT NOT NULL,
  review_status TEXT NOT NULL,
  previous_review_decision TEXT,
  previous_review_status TEXT,
  reason TEXT,
  actor_email TEXT NOT NULL,
  source_store_hash TEXT NOT NULL,
  action_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_candidate_action_logs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  candidate_type TEXT NOT NULL,
  action TEXT NOT NULL,
  review_decision TEXT NOT NULL,
  review_status TEXT NOT NULL,
  previous_review_decision TEXT,
  previous_review_status TEXT,
  reason TEXT,
  actor_email TEXT NOT NULL,
  source_store_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_candidate_action_logs_candidate_id
ON review_candidate_action_logs(candidate_id);

CREATE INDEX IF NOT EXISTS idx_review_candidate_action_logs_created_at
ON review_candidate_action_logs(created_at);
