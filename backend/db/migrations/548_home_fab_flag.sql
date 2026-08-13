-- 548: 首頁右下角懸浮選單的顯示開關
--
-- 老闆要能在後台「功能開關」直接把它藏起來 / 放出來，不用改程式。
--
-- 只有開／關兩態，沒有「維護中」：它只是一組頁面入口的容器，
-- 沒有「暫時停一下、等一下回來」這件事可講。真的要停某一個入口，
-- 該停的是那個入口自己的旗標（market / sell / exchange / slot 那幾個）。
--
-- 預設 off：功能上線時美術圖還沒進來，先別讓玩家看到三個空白方塊。
--
-- `enabled` 不用自己填 —— migration 483 的 trigger 會讓它永遠等於 (state = 'on')。

INSERT INTO public.feature_flags (key, state)
VALUES ('home_fab', 'off')
ON CONFLICT (key) DO NOTHING;
