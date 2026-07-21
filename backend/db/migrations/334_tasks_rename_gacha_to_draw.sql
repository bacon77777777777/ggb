-- Migration 334: 任務文字「轉蛋」→「抽獎」（依 title/description 模式更新，UUID 無關）
-- draw_count/draw_streak/single_day_draws 統計所有抽獎類型（一番賞/轉蛋/抽卡/自製賞/盲盒）

-- description 批次取代
UPDATE public.tasks
SET description = replace(description, '轉蛋', '抽獎')
WHERE description LIKE '%轉蛋%'
  AND condition_type IN ('draw_count', 'draw_streak', 'single_day_draws', 'birthday_draw');

-- title 批次取代
UPDATE public.tasks
SET title = replace(title, '轉蛋', '抽獎')
WHERE title LIKE '%轉蛋%'
  AND condition_type IN ('draw_count', 'draw_streak', 'single_day_draws', 'birthday_draw');
