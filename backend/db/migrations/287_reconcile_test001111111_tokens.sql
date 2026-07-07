-- Migration 287: Reconcile 53,695 G discrepancy in test001111111 account
--
-- Root cause investigation:
--   On 2026-07-06 08:49:14 UTC, GB哥 executed adjustUserTokens(+60,000) for
--   user c424d203-c75b-454a-920c-9bbb7366a580 via LINE command "老闆手動補充".
--   The users.tokens UPDATE succeeded (recorded in user_event_logs), but the
--   token_adjustments INSERT silently failed — no error handling caused it to be
--   swallowed. Additionally, the ledger already had a 6,305 over-count before
--   this event (pre-migration-284 draw records). Net missing from ledger: 53,695 G.
--
--   A partial retroactive fix of +30,000 was already manually entered at 09:47 UTC
--   (id in token_adjustments: already exists). This migration closes the remaining gap.
--
-- Verification before insert:
--   SELECT tokens FROM users WHERE id = 'c424d203-c75b-454a-920c-9bbb7366a580'; → 397414
--   SELECT SUM(delta) FROM token_ledger WHERE user_id = 'c424d203-c75b-454a-920c-9bbb7366a580'; → 343719
--   Discrepancy: 397414 - 343719 = 53695

INSERT INTO token_adjustments (user_id, delta, reason, created_by)
VALUES (
  'c424d203-c75b-454a-920c-9bbb7366a580',
  53695,
  '帳本補錄：2026-07-06 08:49 GB哥指令 +60,000 G（users.tokens已更新但token_adjustments INSERT靜默失敗），扣除帳本既有多算6,305，淨補差額53,695。詳見migration 287。',
  '系統補錄'
);
