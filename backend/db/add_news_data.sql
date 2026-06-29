
-- Insert sample news articles
INSERT INTO news (id, title, content, category, is_published, published_at, created_at)
VALUES
  (
    uuid_generate_v4(),
    '系統維護公告',
    '為了提供更優質的服務，我們將於 2026-02-15 02:00 進行系統維護，預計耗時 2 小時。造成不便敬請見諒。',
    '維護',
    true,
    NOW(),
    NOW()
  ),
  (
    uuid_generate_v4(),
    '新春特別活動開啟！',
    '新春佳節，好運連連！參與一番賞抽獎有機會獲得限定隱藏款獎品。活動期間：2026-02-10 至 2026-02-20。快來試試手氣，把大獎帶回家！',
    '活動',
    true,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
  ),
  (
    uuid_generate_v4(),
    '人氣動漫系列新品上架',
    '本週新品：熱門動漫系列公仔強勢登陸！S賞限量 10 體，精緻塗裝不容錯過。點擊查看詳情，立即參與抽獎！',
    '新品',
    true,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    uuid_generate_v4(),
    '防詐騙提醒',
    '近期有不法分子冒充官方人員進行詐騙，請各位用戶提高警覺。官方不會透過私訊要求您提供密碼或進行轉帳。如有疑問請聯繫客服。',
    '公告',
    true,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
  );
