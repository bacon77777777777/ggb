-- 534: 拿掉 user_events 過期的 event_type CHECK（STG 專用，PROD 早就沒有了）
--
-- STG 上這個 constraint 只允許五種：
--   product_view / product_click / search / draw / series_click
--
-- 但前台 `lib/trackEvent.ts` 的事件表早就長到二十幾種（page_view、page_exit、
-- scroll_depth、search_query、banner_click、leaderboard_view、news_* …）。
-- 送進來的事件不在名單裡就被資料庫擋掉，而 `trackEvent()` 是刻意 silent fail
-- （追蹤不能弄壞前台），所以**整批事件靜默消失、沒有任何錯誤訊息**。
--
-- 實測 2026-08-12：STG 的 `user_events` 是 0 筆，PROD 同期有 7,455 筆。
-- 差別就在 PROD 沒有這個 constraint —— 這是 schema 漂移，STG 停在舊版。
--
-- 對齊做法是「拿掉」而不是「補上新名單」：事件種類會一直長，
-- 名單型 constraint 每加一種就要記得改，忘了就再靜默掉一批 ——
-- 這次就是這樣壞的。分析頁本來就會忽略不認得的 event_type，不需要資料庫把關。

ALTER TABLE public.user_events
  DROP CONSTRAINT IF EXISTS user_events_event_type_check;
