-- 521: mode5 參數補「音量」（原型 v2 加入整套合成音效，總音量要能調）
UPDATE public.machine_theme_params
SET params = params || jsonb_build_object('volume', 0.8),
    updated_at = now()
WHERE theme = 'blindbox_mode5' AND NOT (params ? 'volume');
