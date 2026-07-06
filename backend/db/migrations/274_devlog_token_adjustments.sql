INSERT INTO dev_logs (version, title, description, type, status, priority, created_at, updated_at)
VALUES (
  'v1.8.2',
  '手動代幣調整記錄：token_adjustments 表 + 對帳公式修正',
  '═══════════════════════════════
【v1.8.2 — 代幣帳本補齊手動調整紀錄】
2026-07-06
═══════════════════════════════

問題根源：
GB哥幫用戶手動增減 G幣後，users.tokens 數字正確，
但代幣帳本（token_ledger）查不到紀錄，且 CFO 對帳時
把手動調整當作「帳務差異」誤報警告。

─────────────────────────────
一、token_adjustments 表（migration 273）
─────────────────────────────

新增 token_adjustments 表：
  id         bigserial PK
  user_id    uuid FK → users
  delta      bigint（正=增加，負=扣除）
  reason     text NOT NULL
  created_by text（''GB哥'' 或 ''admin#<id>''）
  created_at timestamptz

設計原則：
  不寫入 recharge_records，避免污染綠界 ECPay 對帳數字。
  透過 UNION ALL 加入 token_ledger VIEW，type = ''manual''。
  description 格式：「手動調整：<reason>（by <created_by>）」

─────────────────────────────
二、GB哥 adjustUserTokens 修正
─────────────────────────────

調整前：只寫 user_event_logs（用於行為審計）
調整後：同時寫 token_adjustments（用於帳本展示 + 對帳）

寫入欄位：
  user_id    = 目標用戶 ID
  delta      = 增減量（正負值）
  reason     = GB哥收到的原因說明
  created_by = ''GB哥'' 或 ''admin#<actorId>''

─────────────────────────────
三、CFO 對帳公式修正
─────────────────────────────

修正前：
  expected = recharge_total - draw_total - refund_deducted

修正後（全平台）：
  expected = recharge_total + manual_total - draw_total - refund_deducted
  manual_total = SUM(token_adjustments.delta) WHERE 非機器人用戶

修正後（逐用戶週查）：
  expected = recharge_in + manual_adj - draw_out - refund_out
  manual_adj = SUM(token_adjustments.delta) WHERE user_id = u.id

效果：
  GB哥幫用戶加 6 萬代幣後，CFO 週查不再誤報差異 60000 G

─────────────────────────────
四、代幣帳本頁面更新
─────────────────────────────

token-ledger/page.tsx 新增 ''manual'' 類型：
  LedgerRow.type: ''recharge'' | ''draw'' | ''dismantle'' | ''manual''
  TYPE_LABEL: manual = 手動調整（紫色標籤）

用戶查看帳本時，手動調整的每筆紀錄都會顯示
「手動調整」紫色 badge + reason 說明文字。

═══════════════════════════════
重要設計邊界
═══════════════════════════════

recharge_records = 僅 ECPay / 藍新付款，供財務對帳
token_adjustments = 僅人工補償 / 客服調整，不走金流
兩者均 UNION 進 token_ledger VIEW 供用戶查閱流水帳',
  'fix',
  'released',
  'high',
  '2026-07-06 00:00:00+08',
  now()
);
