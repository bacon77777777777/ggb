-- Insert per-CVS shipping fee settings (default values)
INSERT INTO platform_settings (key, value) VALUES
  ('shipping_fee_cvs_711',    '65'),
  ('shipping_fee_cvs_family', '65'),
  ('shipping_fee_cvs_hilife', '60'),
  ('shipping_fee_cvs_ok',     '60')
ON CONFLICT (key) DO NOTHING;
