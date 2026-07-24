CREATE TABLE IF NOT EXISTS promotion_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  source_store_hash TEXT NOT NULL,
  target_branch TEXT,
  pull_request_url TEXT,
  pull_request_number INTEGER,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_run_items (
  id TEXT PRIMARY KEY,
  promotion_run_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  candidate_type TEXT NOT NULL,
  target_file TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (promotion_run_id) REFERENCES promotion_runs(id)
);

-- Not present in the original instruction's table list. Added because the
-- two-step "plan then confirm" API flow (POST /promotion-plan returns a
-- promotionPlanId, POST /promotion-pr later takes only that id) needs a
-- durable, server-side record of what a plan actually contains. Without it,
-- /promotion-pr would have to trust client-resubmitted candidateIds instead
-- of the plan the operator actually reviewed.
CREATE TABLE IF NOT EXISTS promotion_plans (
  id TEXT PRIMARY KEY,
  candidate_ids TEXT NOT NULL,
  source_store_hash TEXT NOT NULL,
  plan TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_promotion_run_items_run_id
ON promotion_run_items(promotion_run_id);

CREATE INDEX IF NOT EXISTS idx_promotion_run_items_candidate_id
ON promotion_run_items(candidate_id);

CREATE INDEX IF NOT EXISTS idx_promotion_runs_created_at
ON promotion_runs(created_at);
