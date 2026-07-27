-- Add new section types: stats, fukuro
ALTER TABLE event_sections DROP CONSTRAINT IF EXISTS event_sections_type_check;
ALTER TABLE event_sections ADD CONSTRAINT event_sections_type_check
  CHECK (type IN ('hero','text','steps','cards','highlight','cta','product_ref','stats','fukuro'));
