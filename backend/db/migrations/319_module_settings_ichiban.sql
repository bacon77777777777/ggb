-- 新增 ichiban 到 module_settings，預設使用 classic（現有票券網格撕紙）
INSERT INTO module_settings (product_type, machine_theme)
VALUES ('ichiban', 'classic')
ON CONFLICT (product_type) DO NOTHING;
