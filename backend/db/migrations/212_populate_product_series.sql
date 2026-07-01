-- 補充 series_keywords 並自動填入 products.series

-- ── 1. 補充缺少的 IP 關鍵字 ─────────────────────────────────────────────────

INSERT INTO series_keywords (keyword, series_name) VALUES
  ('葬送的芙莉蓮', '葬送的芙莉蓮'),
  ('芙莉蓮', '葬送的芙莉蓮'),
  ('frieren', '葬送的芙莉蓮'),
  ('小小兵', '小小兵'),
  ('minion', '小小兵'),
  ('minions', '小小兵'),
  ('bello', '小小兵'),
  ('転生したらスライム', '轉生史萊姆'),
  ('轉生史萊姆', '轉生史萊姆'),
  ('tensura', '轉生史萊姆'),
  ('搖曳露營', '搖曳露營'),
  ('ゆるキャン', '搖曳露營'),
  ('yuru camp', '搖曳露營'),
  ('米飛兔', '米飛兔'),
  ('miffy', '米飛兔'),
  ('ミッフィー', '米飛兔'),
  ('神椿市', '神椿市'),
  ('防風少年', '防風少年'),
  ('wind breaker', '防風少年'),
  ('windbreaker', '防風少年'),
  ('ウィンドブレイカー', '防風少年'),
  ('sandman', 'Sandman'),
  ('cassette', 'Cassette'),
  ('chokorin', '一番賞'),
  ('柴犬', '柴犬')
ON CONFLICT (keyword) DO NOTHING;

-- ── 2. 用 series_keywords 自動更新 products.series ──────────────────────────

UPDATE products p
SET series = (
  SELECT sk.series_name
  FROM series_keywords sk
  WHERE p.name ILIKE '%' || sk.keyword || '%'
  ORDER BY LENGTH(sk.keyword) DESC  -- 優先匹配最長關鍵字
  LIMIT 1
)
WHERE series IS NULL OR series = '';

-- ── 3. 手動補無法自動偵測的商品 ──────────────────────────────────────────────

-- 剩下還是空的就設為通用分類
UPDATE products
SET series = '盒玩'
WHERE (series IS NULL OR series = '')
  AND (name ILIKE '%公仔%' OR name ILIKE '%吊飾%' OR name ILIKE '%玩偶%');

UPDATE products
SET series = '模型'
WHERE (series IS NULL OR series = '')
  AND (name ILIKE '%模型%' OR name ILIKE '%迴力車%');

-- 其餘雜項
UPDATE products
SET series = '雜貨'
WHERE series IS NULL OR series = '';
