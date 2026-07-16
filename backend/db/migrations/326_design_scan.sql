-- Design System 違規掃描記錄表

CREATE TABLE IF NOT EXISTS design_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz DEFAULT now(),
  files_scanned int NOT NULL DEFAULT 0,
  total_violations int NOT NULL DEFAULT 0,
  files_with_violations int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS design_scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES design_scan_runs(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  line_number int NOT NULL,
  violation_type text NOT NULL,
  violation_class text NOT NULL,
  line_content text,
  fix_hint text
);

CREATE INDEX IF NOT EXISTS design_scan_results_run_id_idx ON design_scan_results (run_id);
CREATE INDEX IF NOT EXISTS design_scan_results_type_idx ON design_scan_results (violation_type);
CREATE INDEX IF NOT EXISTS design_scan_results_file_idx ON design_scan_results (file_path);
