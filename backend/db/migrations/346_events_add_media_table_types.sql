-- Add table, gallery, features, countdown, sticky_cta section types
ALTER TABLE event_sections DROP CONSTRAINT IF EXISTS event_sections_type_check;
ALTER TABLE event_sections ADD CONSTRAINT event_sections_type_check
  CHECK (type IN (
    'hero','text','steps','cards','highlight','cta','product_ref','stats','fukuro','rel','rule',
    'table','gallery','features','countdown','sticky_cta'
  ));
