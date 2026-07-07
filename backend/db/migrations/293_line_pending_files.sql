-- Store last xlsx file per LINE source (group/user) for GB哥 智能上架
CREATE TABLE IF NOT EXISTS line_pending_files (
  source_id   TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL,
  file_name   TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on upsert
CREATE OR REPLACE FUNCTION update_line_pending_files_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_line_pending_files_updated_at ON line_pending_files;
CREATE TRIGGER trg_line_pending_files_updated_at
  BEFORE UPDATE ON line_pending_files
  FOR EACH ROW EXECUTE FUNCTION update_line_pending_files_updated_at();
