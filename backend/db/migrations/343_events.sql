-- 活動 LP 系統：events + event_sections
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  bg_color TEXT NOT NULL DEFAULT '#0a0610',
  accent_color TEXT NOT NULL DEFAULT '#ffd24a',
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('hero','text','steps','cards','highlight','cta','product_ref')),
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active events" ON events FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "service role full access events" ON events FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE event_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read event sections" ON event_sections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service role full access event_sections" ON event_sections FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at_trigger
  BEFORE UPDATE ON events FOR EACH ROW
  EXECUTE FUNCTION update_events_updated_at();
