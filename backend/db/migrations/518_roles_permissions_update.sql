-- 518: 六個內建角色的頁面權限調整（老闆 2026-08-09 核可建議表）
--
-- 原則：admin = 除權限/帳號/殺率/開發紀錄外全開；operator 補營運工具；
-- marketing 補內容與活動全套；logistics 補物流帳；supplier 加配送管理
-- （API 已做 supplier_id 過濾＋個資遮罩＋唯讀）；accountant 補齊金流五明細
-- 與複核/退款。header_* 是頂部快捷的獨立權限，與頁面權限成對給。
-- 自訂角色不動，只更新這六個內建 name。

UPDATE roles SET permissions = ARRAY[
  'dashboard','products','orders','users','draws','recharges',
  'reports_overview','reports_behavior','recharge_review',
  'coupons','coupons_report','categories','settings_promotions',
  'banners','announcements','news','events','suppliers','referrals',
  'settings_modules','settings_shipping','logs','cs_tickets',
  'header_members','header_settlements','header_refunds',
  'header_recharge_review','header_products','header_orders'
], updated_at = now() WHERE name = 'admin';

UPDATE roles SET permissions = ARRAY[
  'dashboard','orders','draws','products','users','recharge_review',
  'cs_tickets','header_orders'
], updated_at = now() WHERE name = 'operator';

UPDATE roles SET permissions = ARRAY[
  'dashboard','products','banners','news','announcements','events',
  'settings_promotions','categories','coupons','reports_overview',
  'reports_behavior','referrals','content_drafts'
], updated_at = now() WHERE name = 'marketing';

UPDATE roles SET permissions = ARRAY[
  'orders','reports_logistics','header_orders'
], updated_at = now() WHERE name = 'logistics';

UPDATE roles SET permissions = ARRAY[
  'products','orders','reports_settlement'
], updated_at = now() WHERE name = 'supplier';

UPDATE roles SET permissions = ARRAY[
  'dashboard','recharges','reports_logistics','reports_products',
  'reports_dismantled','reports_settlement','coupons_report',
  'settlement_snapshots','recharge_review','header_refunds',
  'header_recharge_review'
], updated_at = now() WHERE name = 'accountant';
