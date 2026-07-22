-- 前台 Design System 合規掃描用表
CREATE TABLE IF NOT EXISTS frontend_design_scan_runs (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at               TIMESTAMPTZ DEFAULT NOW(),
  files_scanned        INTEGER DEFAULT 0,
  total_violations     INTEGER DEFAULT 0,
  files_with_violations INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS frontend_design_scan_results (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id           UUID REFERENCES frontend_design_scan_runs(id) ON DELETE CASCADE,
  file_path        TEXT NOT NULL,
  line_number      INTEGER NOT NULL,
  violation_type   TEXT NOT NULL,
  violation_class  TEXT,
  line_content     TEXT,
  fix_hint         TEXT
);

CREATE INDEX IF NOT EXISTS idx_fe_scan_results_run_id ON frontend_design_scan_results(run_id);
