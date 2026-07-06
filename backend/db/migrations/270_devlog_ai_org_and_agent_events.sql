-- 2026-07-06 開發日誌：AI 組織架構 + 跨部門事件匯流排

INSERT INTO dev_logs (version, title, description, type, status, priority, created_at, updated_at)
VALUES (
  'v1.8.0',
  'AI 組織架構：多單位自動運作 + 跨部門事件匯流排',
  '═══════════════════════════════
【v1.8.0 — AI 組織架構全面上線】
2026-07-06
═══════════════════════════════

本版本建立完整的 AI 組織架構，7 個 AI 單位各司其職，
自動偵測、分析、推播，並透過 agent_events 事件匯流排跨部門協作。

─────────────────────────────
一、AI 單位一覽（全部以 cron 自動排程運行）
─────────────────────────────

1. 供應鏈協調員（migration 264）
   排程：TW 10:30 / 22:30 每日兩次
   職責：
   • 偵測超時未出貨訂單（依廠商分組）
   • 庫存低於 20% 警示
   • 庫存歸零但仍上架 → 緊急推播 + 寫入 agent_events
   • 廠商月結久未確認警示
   • 週一廠商績效快照（30 天出貨率）

2. 財務長 CFO Agent（migration 265）
   排程：TW 08:30 每日
   職責：
   • 平台代幣總量對帳（recharge_in - draw_out - refund_out vs SUM(users.tokens)）
   • 週一：逐用戶代幣差異檢查（差距 > 50 代幣標記）
   • 近 7 天財務健康摘要（儲值 / 提領 / 退款 / 利潤率）
   • 廠商月結到期提醒

3. 行銷長 CMO Agent（migration 266）
   排程：TW 09:00 每日
   職責：
   • 用戶成長週趨勢（4 週）
   • 近 7 天轉換漏斗：瀏覽 → 抽獎 → 儲值
   • 熱門商品排行（含庫存剩餘 %）
   • 跨部門行動建議：熱門商品 × 庫存天數 × 競品動態 → 具體今日建議
   • 日報 80 字 / 週報 150 字 AI 行銷洞察

4. 市場情報官（migration 267）
   排程：週一 TW 11:00
   競品列表（8 家）：91toy, SlimeToy, KujiFlip, Dopamine Kuji,
                     混線一番, CityDAO, EggBox Kuji, Wonder Kuji
   職責：
   • 自動爬取競品網站（User-Agent 偽裝、擷取 title/meta/body/NEXT_DATA）
   • Claude Haiku 三段式分析（定價策略 / 熱門品項 / 行銷手法）
   • 結果存入 competitor_reports + competitor_posts

5. GB哥（即時查詢 + 風控行動）
   工具數量：18 個
   新增工具：freeze_user / unfreeze_user / flag_user / unflag_user
   後台操作：/api/admin/users/[id]/risk-action
            凍結 / 解凍 / 標記可疑 / 解除可疑，均記錄 admin_logs + LINE 推播
   GB哥強化：
   • 系統 prompt 內建完整推播時間表知識
   • 不主動問澄清問題，直接查多角度資料回答
   • 遇到跨部門問題知道哪個單位負責

6. 平台健康監控員（migration 268 alter cron）
   排程：每 10 分鐘（從 */30 改為 */10）
   檢查項目：
   • DB 連線速度（> 3s 警告）
   • Supabase 服務狀態（status.supabase.com API）
   • ECPay callback 錯誤率（近 1 小時 ≥ 50% 緊急）
   • 尖峰時段零儲值 / 零抽獎偵測
   • pending 儲值積壓（> 3 小時且 > 5 筆）
   • Sentry 錯誤整合（選用）
   Alert deduplication：platform_settings 記錄上次推播時間，同 key 2 小時內不重複推

7. 用戶風控欄位（migration 268）
   users 表新增：is_suspicious, suspicious_reason, frozen_at, frozen_by, frozen_reason
   status CHECK 增加 ''frozen'' 值
   後台用戶頁面：新增凍結 / 標記可疑 / 解除按鈕

─────────────────────────────
二、agent_events 跨部門事件匯流排（migration 269）
─────────────────────────────

架構：
  任何 AI 單位偵測到跨部門信號
    → INSERT INTO agent_events
    → 同步推 LINE 通知
    → 後台「事件中心」集中顯示，人工確認後標記已處理

event_type 清單：
  category_suggestion    行銷長：文案偵測到節慶/活動關鍵字，建議新增商品分類標籤
  restock_needed         供應鏈：零庫存商品仍上架（24h dedup）
  freeze_pending_payment 風控長：凍結帳號有 pending 儲值，請財務確認
  competitor_trending    市場情報官：競品新動態（預留）
  revenue_anomaly        財務長：營收異常（預留）
  platform_incident      健康監控員：平台嚴重問題（預留）

後台「事件中心」頁面（/agent-events）：
  • 待處理 / 已處理 / 已略過 三個分頁
  • 側邊欄 badge 顯示待處理數量（紅點）
  • 逐一確認或批次略過
  • 每筆事件顯示來源單位、詳情、建議行動

─────────────────────────────
三、行銷長 × 供應鏈 × 競品三合一推播
─────────────────────────────

行銷長每日報告新增「跨部門行動建議」區塊：
  主力商品：鬼滅之刃（80 抽，庫存剩 18%，約 3.2 天售完）
  競品動態：KujiFlip、SlimeToy 本週有 5 則新動態
  → 今日建議
    🚨 聯絡廠商補貨（庫存緊急）
    📣 加快文案出稿速度（競品本週活躍）
    ⛔ 停止推廣零庫存：進擊的巨人

─────────────────────────────
四、AI 文案草稿優化
─────────────────────────────

• 移除 AI 自動生成圖片（品質差，改人工配圖）
• 選品邏輯：優先選有庫存的熱門商品（零庫存商品不出稿）
• 競品情報注入 prompt：Claude 生成文案時參考競品本週動態趨勢
• campaign 關鍵字偵測：
  「1111、聖誕、聯名、限量、特賣…」等 12 組關鍵字
  偵測到 → 自動建立 category_suggestion 事件 + LINE 通知

─────────────────────────────
五、其他
─────────────────────────────

• AI 文案草稿頁面：移除 CRON_SECRET 彈窗，改用管理員身份 proxy API
• Nav 重構：其他黑科技 = 事件中心 / 競品情報 / AI文案草稿 / 工具 / 殺率調整
• GB哥 schema：新增 orders/order_items/suppliers/token_ledger 資料結構知識
• 風控凍結：自動查 pending 儲值 → LINE 通知財務 + 寫入 agent_events

═══════════════════════════════
【推播時間表（LINE 群）】
═══════════════════════════════

  08:30  財務長日報
  09:00  行銷長日報（含跨部門建議）
  10:30  供應鏈協調員早班
  10:00  平台健康（每 10 分鐘，異常才推）
  22:30  供應鏈協調員晚班
  週一 11:00  市場情報官週報（競品爬取分析）',
  'feature',
  'released',
  'high',
  '2026-07-06 00:00:00+08',
  now()
);
