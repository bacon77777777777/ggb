-- 將原本硬編碼在 market-intel/route.ts 的 8 家競品移入資料庫
INSERT INTO competitor_watchlist (name, url, status, discovered_by) VALUES
  ('91toy',         'https://www.91toy.com.tw/',          'active', 'manual'),
  ('SlimeToy',      'https://slimetoy.com.tw/',           'active', 'manual'),
  ('KujiFlip',      'https://kujiflip.tw/',               'active', 'manual'),
  ('Dopamine Kuji', 'https://dopaminekuji.com/',          'active', 'manual'),
  ('混線一番',      'https://h5.hunxianyifan.com/',       'active', 'manual'),
  ('CityDAO',       'https://citydao.world/',             'active', 'manual'),
  ('EggBox Kuji',   'https://eggboxkuji.com/lottery',    'active', 'manual'),
  ('Wonder Kuji',   'https://wonderkuji.com.tw/',         'active', 'manual')
ON CONFLICT (name) DO UPDATE SET
  url        = EXCLUDED.url,
  updated_at = NOW();
