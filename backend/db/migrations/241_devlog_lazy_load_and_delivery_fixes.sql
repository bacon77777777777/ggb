INSERT INTO dev_logs (version, title, description, type, status, priority, created_at, updated_at)
VALUES (
  'v1.7.5',
  '前台手機版 Lazy Load + 配送管理 Bug 修復',
  '後台 Bug 修復：
• Bug 2：map-callback redirect fallback 改用 NEXT_PUBLIC_FRONTEND_URL，修正誤用 backend domain 問題
• Bug 5：移除配送管理「合併生成配送單」假功能 modal 及統計卡
• Bug 11：生成配送單按鈕現對 processing/picked_up（無追蹤號）訂單也顯示

Migration Runner：manual_migrate.js 改用 psql CLI（pg 套件會截斷 Supabase project ref 導致認證失敗），支援 --from/--to/--only 參數

前台手機版 Lazy Load：
• 我的倉庫：修復 Safari IntersectionObserver 相容性問題，改用 React onScroll 事件
• 新增 lazy load：配送管理、抽獎紀錄、首頁（預設 10 筆，下滑自動載入 10 筆）
• 首頁使用 window scroll，tab 切換時重置計數

倉庫 UI：
• 按鈕文字「確認支付並配送」→「配送」
• 運費顯示改為代幣（G 幣圖示 + 數字）
• Modal 底部按鈕：取消縮窄，確認 flex-1',
  'feature',
  'released',
  'medium',
  now(),
  now()
)
ON CONFLICT DO NOTHING;
