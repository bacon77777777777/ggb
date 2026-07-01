-- 1. Add sort_order column
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 100;

-- 2. Deactivate 每日簽到 (login task)
UPDATE public.tasks SET is_active = FALSE WHERE id = 'f59577f8-f930-4c8b-a64f-d5ef92dca2d0';

-- 3. Deactivate weekly share tasks
UPDATE public.tasks SET is_active = FALSE WHERE id = '142471ba-4970-4069-b0ab-01141328d528'; -- 分享達人
UPDATE public.tasks SET is_active = FALSE WHERE id = '83f11780-b11f-49b3-a630-ce39c1a4253c'; -- 社群推廣大使

-- 4. Deactivate 分享大使 achievement
UPDATE public.tasks SET is_active = FALSE WHERE id = '1bd7a655-fdef-48bd-ad6b-b920824ad16f';

-- 5. Fix daily task descriptions: 抽獎→轉蛋, 代幣儲值→儲值
UPDATE public.tasks SET description = '每日完成 1 次轉蛋', sort_order = 1
  WHERE id = '95dfca36-fa9c-427c-858d-d6fef11acccb'; -- 每日首抽
UPDATE public.tasks SET description = '每日累積完成 3 次轉蛋', sort_order = 2
  WHERE id = 'e057137f-b1fc-49f9-8b9b-31ead1a7a5ac'; -- 手氣大爆發
UPDATE public.tasks SET sort_order = 4
  WHERE id = '239f4da8-2e84-4411-ba10-0a432d57f4c3'; -- 每日分享 (kept)
UPDATE public.tasks SET title = '每日儲值', description = '每日完成一次儲值', sort_order = 3
  WHERE id = 'cfdac048-f996-4c17-8667-610fa4c5fc1d'; -- 每日儲值

-- 6. Add replacement daily task for 每日簽到
INSERT INTO public.tasks (title, description, type, condition_type, target_value, reward_coins, icon_name, sort_order)
VALUES ('每日連抽', '每日累積完成 5 次轉蛋', 'daily', 'draw_count', 5, 24, 'Sparkles', 5);

-- 7. Rename weekly draw tasks (中二 names), fix sort_order so 10抽 above 30抽
UPDATE public.tasks SET
  title = '轉蛋使者',
  description = '本週累積完成 10 次轉蛋，命運的開端',
  sort_order = 1
WHERE id = '27d8046e-441c-424a-b0b5-dfcc80e08eb5'; -- 週間抽獎王 → 轉蛋使者

UPDATE public.tasks SET
  title = '轉蛋狂神',
  description = '本週累積完成 30 次轉蛋，突破極限的意志',
  sort_order = 2
WHERE id = 'a85488d9-8d03-43cd-8cab-603f2ee718cb'; -- 抽獎狂熱 → 轉蛋狂神

-- 8. Update 豪爽儲值: 1次 → 3次
UPDATE public.tasks SET
  description = '本週完成 3 次儲值',
  target_value = 3,
  reward_coins = 45,
  sort_order = 3
WHERE id = 'b0b82fe0-bc4d-4525-8a41-71ca5ea633ad';

-- 9. Add new weekly tasks to replace share tasks
INSERT INTO public.tasks (title, description, type, condition_type, target_value, reward_coins, icon_name, sort_order)
VALUES ('轉蛋衝刺', '本週累積完成 50 次轉蛋', 'weekly', 'draw_count', 50, 150, 'Layers', 4);

INSERT INTO public.tasks (title, description, type, condition_type, target_value, reward_coins, icon_name, sort_order)
VALUES ('儲值達人', '本週完成 5 次儲值', 'weekly', 'spend_amount', 5, 60, 'Wallet', 5);

-- 10. Fix achievement descriptions: 抽獎→轉蛋, 代幣儲值→儲值; fix icons to be distinct
UPDATE public.tasks SET
  title = '第一次儲值',
  description = '完成人生第一次儲值'
WHERE id = '7e85ac8e-c4db-4ab5-afab-549613ed3402';

UPDATE public.tasks SET description = '累積完成 5 次轉蛋', sort_order = 1
  WHERE id = 'b0ddb145-241d-4951-b166-ef15ff9e5247'; -- 新手上路
UPDATE public.tasks SET description = '累積完成 30 次轉蛋', icon_name = 'Ticket', sort_order = 2
  WHERE id = 'eb577ac6-f9b8-488f-bdd7-64ac0bb7e726'; -- 轉蛋愛好者
UPDATE public.tasks SET description = '累積完成 100 次轉蛋', icon_name = 'Layers', sort_order = 3
  WHERE id = 'b3a39335-d295-469f-bd87-a413bf38d9c7'; -- 轉蛋達人
UPDATE public.tasks SET description = '累積完成 500 次轉蛋', sort_order = 4
  WHERE id = 'a9090ed2-e7a9-459b-863a-57ae32c15221'; -- 轉蛋狂人
UPDATE public.tasks SET sort_order = 5
  WHERE id = '7e85ac8e-c4db-4ab5-afab-549613ed3402'; -- 第一次儲值

-- 11. Update RPC to sort by sort_order instead of reward_coins
CREATE OR REPLACE FUNCTION public.get_user_missions()
RETURNS TABLE (
  id              UUID,
  type            TEXT,
  title           TEXT,
  description     TEXT,
  target_value    INT,
  reward_coins    INT,
  condition_type  TEXT,
  icon_name       TEXT,
  progress        INT,
  is_completed    BOOLEAN,
  is_claimed      BOOLEAN,
  period_key      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_today   TEXT;
  v_week    TEXT;
BEGIN
  v_user_id := auth.uid();
  v_today   := to_char(NOW(), 'YYYY-MM-DD');
  v_week    := to_char(NOW(), 'IYYY-IW');

  RETURN QUERY
  SELECT
    t.id,
    t.type,
    t.title,
    t.description,
    t.target_value,
    t.reward_coins,
    t.condition_type,
    t.icon_name,
    COALESCE(utp.progress, 0)         AS progress,
    COALESCE(utp.is_completed, false)  AS is_completed,
    COALESCE(utp.is_claimed, false)    AS is_claimed,
    COALESCE(utp.period_key,
      CASE
        WHEN t.type = 'daily'       THEN v_today
        WHEN t.type = 'weekly'      THEN v_week
        ELSE 'ALL'
      END
    ) AS period_key
  FROM public.tasks t
  LEFT JOIN public.user_task_progress utp
    ON utp.task_id = t.id
   AND utp.user_id = v_user_id
   AND (
         (t.type = 'daily'       AND utp.period_key = v_today) OR
         (t.type = 'weekly'      AND utp.period_key = v_week)  OR
         (t.type = 'achievement' AND utp.period_key = 'ALL')
       )
  WHERE t.is_active = TRUE
  ORDER BY
    CASE WHEN COALESCE(utp.is_claimed,   false) THEN 2 ELSE 0 END,
    CASE WHEN COALESCE(utp.is_completed, false) THEN 0 ELSE 1 END,
    t.type,
    t.sort_order ASC;
END;
$$;
