-- 639：清掉 user_ip_log 裡的綠界 IP（老闆 2026-08-28）
--
-- 那些列是綠界 server-to-server callback 寫進去的，`x-forwarded-for` 是
-- **綠界伺服器**的位址、不是玩家的。風控的同 IP 規則讀它，等於永遠在報綠界
-- （PROD 22 筆全部是同一個 175.99.72.1）。
--
-- 程式端已經改掉：玩家 IP 改在「建立訂單」那支寫（event_type='recharge_create'），
-- callback 不再寫。這裡把舊的假資料清掉 —— 留著只會誤導下一個看到這張表的人。

DELETE FROM user_ip_log WHERE event_type = 'recharge';

COMMENT ON TABLE user_ip_log IS
  '玩家 IP 紀錄。只在有玩家 request 的地方寫（如建立儲值訂單）；'
  '**不要在綠界 callback 寫**，那支拿到的是綠界伺服器的 IP。'
  '風控的同網段偵測讀的是 visit_logs / user_event_logs，見 lib/riskMultiIp.ts。';
