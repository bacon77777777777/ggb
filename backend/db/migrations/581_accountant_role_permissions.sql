-- 581_accountant_role_permissions.sql
--
-- 會計（accountant）角色權限收斂 —— 這個角色給的是外包會計師（對帳＋報稅），
-- 原則：只看錢、只讀、不碰玩家、不碰任何會改變代幣或款項狀態的按鈕。
--
-- 拿掉：
--   dashboard               營運儀表板（混會員數、活躍度等非財務資訊；老闆指定不給）
--   recharge_review         待複核儲值頁 —— 能對卡住的儲值按「強制成功」，等於憑空發代幣，
--   header_recharge_review  是風控／營運判斷，不是會計的事（頂部鈴鐺同一件事）
--   analytics_supplier      廠商儀表板（廠商經營數據，不是帳）
-- 保留：儲值明細、物流明細、消費明細、分解明細、廠商結算、折價券明細、廠商月結管理、
--       退款申請（header_refunds；對帳要看退款，此頁能核准／拒絕，已口頭交代只看不按）

BEGIN;

UPDATE public.roles
SET permissions = ARRAY[
      'recharges',
      'reports_logistics',
      'reports_products',
      'reports_dismantled',
      'reports_settlement',
      'coupons_report',
      'settlement_snapshots',
      'header_refunds'
    ]::text[],
    description = '外包會計師：對帳與報稅用的財務報表，唯讀',
    updated_at = now()
WHERE name = 'accountant';

COMMIT;
