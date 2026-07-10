-- 統一 machine_theme 命名為 {type}_{variant} 格式

-- module_settings（每列有 product_type，可直接對應）
UPDATE module_settings SET machine_theme = 'gacha_classic'    WHERE product_type = 'gacha'    AND machine_theme = 'classic_machine';
UPDATE module_settings SET machine_theme = 'gacha_modern'     WHERE product_type = 'gacha'    AND machine_theme = 'modern_machine';
UPDATE module_settings SET machine_theme = 'gacha_retro'      WHERE product_type = 'gacha'    AND machine_theme = 'retro_machine';
UPDATE module_settings SET machine_theme = 'ichiban_grid'     WHERE product_type = 'ichiban'  AND machine_theme = 'classic_capsule';
UPDATE module_settings SET machine_theme = 'ichiban_tear'     WHERE product_type = 'ichiban'  AND machine_theme = 'figma_tear';
UPDATE module_settings SET machine_theme = 'custom_grid'      WHERE product_type = 'custom'   AND machine_theme = 'classic_capsule';
UPDATE module_settings SET machine_theme = 'custom_tear'      WHERE product_type = 'custom'   AND machine_theme = 'figma_tear';
UPDATE module_settings SET machine_theme = 'blindbox_classic' WHERE product_type = 'blindbox' AND machine_theme = 'classic_machine';
UPDATE module_settings SET machine_theme = 'blindbox_claw'    WHERE product_type = 'blindbox' AND machine_theme = 'claw_machine';

-- products.machine_theme（需依 type 分別對應舊值）
UPDATE products SET machine_theme = 'gacha_classic'    WHERE type = 'gacha'    AND machine_theme = 'classic_machine';
UPDATE products SET machine_theme = 'gacha_modern'     WHERE type = 'gacha'    AND machine_theme = 'modern_machine';
UPDATE products SET machine_theme = 'gacha_retro'      WHERE type = 'gacha'    AND machine_theme = 'retro_machine';
UPDATE products SET machine_theme = 'ichiban_grid'     WHERE type = 'ichiban'  AND machine_theme = 'classic_capsule';
UPDATE products SET machine_theme = 'ichiban_tear'     WHERE type = 'ichiban'  AND machine_theme = 'figma_tear';
UPDATE products SET machine_theme = 'custom_grid'      WHERE type = 'custom'   AND machine_theme = 'classic_capsule';
UPDATE products SET machine_theme = 'custom_tear'      WHERE type = 'custom'   AND machine_theme = 'figma_tear';
UPDATE products SET machine_theme = 'blindbox_classic' WHERE type = 'blindbox' AND machine_theme = 'classic_machine';
UPDATE products SET machine_theme = 'blindbox_claw'    WHERE type = 'blindbox' AND machine_theme = 'claw_machine';
