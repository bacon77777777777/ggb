-- 538: 移除首頁彈窗的「對象」與「關閉後」兩個全站設定
--
-- 老闆指定拿掉：那兩個一改就是全站所有彈窗一起改，粒度太粗。
-- 新規則固定成「每次進首頁都跳」，要不要少看一次改由玩家自己決定 ——
-- 每則彈窗下方一個「今日不再顯示」勾選，按叉叉時一起存進 localStorage，
-- 隔天照跳。最新上架彈窗（promo_new_arrival_enabled）吃同一套。
--
-- 前台與後台都已經不再讀這三個 key，留著只會讓下一個人以為還有那兩個開關。
-- 底部警語列（NoticeBar）不受影響：它的 mode 是元件裡自己判斷的
-- （登入 days / 未登入 always），沒有讀 platform_settings。

DELETE FROM public.platform_settings
WHERE key IN ('promo_audience', 'promo_dismiss_mode', 'promo_dismiss_days');
