-- 646_point_ledger.sql
--
-- 積分帳本（老闆 2026-08-31：抽籤販售要用積分當入場券，先把帳本補起來）
--
-- ## 為什麼要有這張表
--
-- 代幣有 `token_ledger`（VIEW，UNION recharge_records / draw_records / token_adjustments），
-- 每一筆進出都查得到。積分什麼都沒有 —— `users.points` 是 users 表上一個裸欄位，
-- 七條路徑各自 `UPDATE users SET points = points ± n`：
--
--   加點  daily_check_in｜claim_task_reward｜claim_referral_cycle_reward
--         apply_line_perks｜worship_player｜後台 /api/admin/users/[id] 白名單直改
--   扣點  play_gacha｜play_ichiban（積分抽獎，4 積分 = 1 G）
--
-- 而積分可以折抵代幣、代幣是真錢買的 —— 等於帳上有一筆能折算成錢的準負債，
-- 卻沒有任何明細。抽籤販售一上線積分就變成入場券，爭議、退點、重複扣款全部會撞上來。
--
-- ## 為什麼是實體表而不是像 token_ledger 那樣做 VIEW
--
-- token_ledger 能做成 VIEW，是因為它的來源本來就是權威紀錄（recharge_records 是
-- 綠界對帳的基礎）。積分沒有這種東西：膜拜與後台直改根本沒有留下任何一列，
-- 任務與簽到也只有「哪天領過」不含金額。硬要拼 VIEW 就是在猜。
--
-- 而且抽籤登記需要**冪等**（玩家連點兩下不能扣兩次），那需要一個帶唯一鍵的
-- 實體列去擋，VIEW 做不到。
--
-- ## 對帳的不變式
--
--   users.points = (SELECT SUM(delta) FROM point_ledger WHERE user_id = users.id)
--
-- 為了讓這條式子從第一天就成立，下面會把每個現有玩家的餘額寫成一筆 `opening`
-- （期初結轉）。沒有它，帳本永遠比餘額少一截，之後每次對帳都要人工解釋差額。

BEGIN;

CREATE TABLE IF NOT EXISTS point_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 正＝加點、負＝扣點。不用兩個欄位（in/out），加總才寫得出來
  delta           integer NOT NULL,
  -- 當下餘額。可以由 SUM 重算，但對帳與客服要的是「這一筆之後剩多少」，
  -- 每次重算整條會愈來愈慢，也看不出中間有沒有被人繞過帳本改過
  balance_after   integer NOT NULL,
  type            text NOT NULL,
  reason          text,
  -- 來源憑證：ref_id 用 text 是因為來源的主鍵型別不一（bigint／uuid／複合）
  ref_table       text,
  ref_id          text,
  -- 冪等鍵。同一個動作重放（連點兩下、網路重試）只會生效一次
  idempotency_key text UNIQUE,
  -- 管理員操作才有值，對應 admins.username
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE point_ledger IS
  '積分帳本。users.points 必須等於本表該玩家的 SUM(delta)；所有加減點一律走 grant_points/spend_points，不可直接 UPDATE users.points';

CREATE INDEX IF NOT EXISTS idx_point_ledger_user_time ON point_ledger (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_point_ledger_type ON point_ledger (type, created_at DESC);

/*
 * type 的值域刻意用 CHECK 而不是 enum：加一種來源只要改這條 constraint，
 * enum 要 ALTER TYPE 而且不能在交易裡回頭。
 *
 *   opening         期初結轉（本次遷移一次性寫入）
 *   check_in        每日簽到          task            任務獎勵
 *   referral        邀請循環獎勵       line_bonus      LINE 綁定贈點
 *   worship         被膜拜            draw            積分抽獎（扣）
 *   lottery_entry   抽籤登記（扣）     lottery_refund  抽籤退點
 *   manual          後台手動調整       correction      帳務更正
 */
ALTER TABLE point_ledger DROP CONSTRAINT IF EXISTS point_ledger_type_chk;
ALTER TABLE point_ledger ADD CONSTRAINT point_ledger_type_chk CHECK (type IN (
  'opening','check_in','task','referral','line_bonus','worship',
  'draw','lottery_entry','lottery_refund','manual','correction'
));

-- RLS：玩家只讀得到自己的（前台「積分明細」要用）。
-- ⚠️ 開了 RLS 沒建 policy 前台會靜默拿到空陣列（CLAUDE.md 記過這個坑）
ALTER TABLE point_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS point_ledger_self_read ON point_ledger;
CREATE POLICY point_ledger_self_read ON point_ledger
  FOR SELECT USING (auth.uid() = user_id);
-- 寫入一律走底下的 SECURITY DEFINER 函數，不開任何 INSERT/UPDATE policy

COMMIT;
