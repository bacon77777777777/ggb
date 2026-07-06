INSERT INTO dev_logs (version, title, description, type, status, priority, created_at, updated_at)
VALUES (
  'v1.8.1',
  'GB哥全平台操作能力 + 多輪對話記憶',
  '═══════════════════════════════
【v1.8.1 — GB哥升級：LINE 直接操控後台】
2026-07-06
═══════════════════════════════

問題根源：
GB哥原本只有「查詢」工具，遇到「幫我增加庫存5個」這類指令，
他會如實說「我沒辦法直接修改」然後把問題丟回給老闆。
同時每則 LINE 訊息都是獨立對話，沒有上下文記憶。

本版本修復兩個根本問題。

─────────────────────────────
一、全平台寫入工具（共 9 個）
─────────────────────────────

之前 GB哥只有讀取能力，現在補齊所有後台操作：

商品管理
  update_product_stock    調整庫存數量（批次、正/負 delta）
  update_product_status   上架/下架/標記售完（批次）
  update_product_price    修改每抽價格

用戶管理
  adjust_user_tokens      手動增減 G幣（記錄 reason + 寫 user_event_logs）

訂單管理
  update_order_tracking   填寫追蹤號碼、同步更新物流狀態
  cancel_order            取消訂單（已送達的不可取消）

折扣碼
  create_coupon           建立折扣碼（fixed 固定金額 / percentage 折數）
  toggle_coupon           啟用或停用折扣碼

文案草稿
  update_content_draft    核准/標記已發布/棄用草稿（批次）

─────────────────────────────
二、執行原則強化
─────────────────────────────

系統 prompt 明確規定：
  收到老闆指令 → 立即執行 → 回報結果
  絕不把問題丟回給老闆，絕不問確認

實際效果：
  「把龍種下架」        → 查 ID → update_product_status → 回報
  「給用戶A補100代幣」  → lookup_user → adjust_user_tokens → 回報前後數值
  「把今天草稿全部核准」→ 查 pending 草稿 → update_content_draft → 回報
  「發個100元折扣碼」   → create_coupon → 回報折扣碼

─────────────────────────────
三、多輪對話記憶（line_conversations 表）
─────────────────────────────

Migration 271: line_conversations 表

問題：每則 LINE 訊息都是無狀態的，GB哥說完「找到2個商品」，
      下一則訊息進來他完全不記得說了什麼。

修法：
  每次 GB哥 回覆後，將 (user_message, assistant_response) 存入 DB
  下次同一個 LINE user 傳訊息時，自動載入近 30 分鐘的對話歷史
  超過 30 分鐘視為新對話，清除舊 context（避免不相關的歷史干擾）
  每人最多保留 20 則訊息，自動刪除更舊的紀錄

─────────────────────────────
工具總數：27 個（查詢 18 + 寫入 9）
─────────────────────────────',
  'feature',
  'released',
  'high',
  '2026-07-06 00:00:00+08',
  now()
);
