-- 411: 活動頁新手友善化
-- 1) hero 下新增「30 秒看懂」三卡區（方形圖卡，圖先用灰色塊 placeholder）
-- 2) 全頁術語簡化：保底→進度、檔次→每轉金額、延續判定→白話
-- 適用 zetcho-rush 與 slam-dunk 兩頁

BEGIN;

-- ═══ 共用：兩頁都把既有區塊 sort_order +1（讓出位置 1 給 30 秒卡區）═══
UPDATE event_sections s
SET sort_order = sort_order + 1
FROM events e
WHERE e.id = s.event_id
  AND e.slug IN ('zetcho-rush', 'slam-dunk')
  AND s.sort_order >= 1;

-- ═══ 插入 30 秒看懂（兩頁同內容）═══
INSERT INTO event_sections (event_id, sort_order, type, content)
SELECT e.id, 1, 'cards', jsonb_build_object(
  'h2', '30 秒看懂',
  'h2_type', 'pp',
  'subtitle', '只有三件事，看完就能玩',
  'layout', 'square',
  'cards', jsonb_build_array(
    jsonb_build_object(
      'tag', 'STEP 1', 'variant', 'star',
      'title', '投幣開轉',
      'subtitle', '選好每轉金額（10G 起），每一轉都會退回一些 G 幣'
    ),
    jsonb_build_object(
      'tag', 'STEP 2', 'variant', 'grand',
      'title', '隨時可能中大獎',
      'subtitle', '每一轉都有機率直接進入 RUSH；一直沒中，轉滿 200 轉也保證進入'
    ),
    jsonb_build_object(
      'tag', 'STEP 3', 'variant', 'star',
      'title', 'RUSH＝連續掉卡',
      'subtitle', '每一轉掉出一張實體卡牌，可寄送到家或換回 G 幣'
    )
  )
)
FROM events e WHERE e.slug IN ('zetcho-rush', 'slam-dunk');

-- ═══ hero 副標：先講「隨時可能中」，保底是安全網 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'subtitle', E'隨時可能中，轉滿 200 轉必定中。\n進入絕頂，卡牌一張張落下。')
FROM events e WHERE e.id = s.event_id AND e.slug = 'zetcho-rush' AND s.type = 'hero';

UPDATE event_sections s SET content = content || jsonb_build_object(
  'subtitle', E'隨時可能灌籃，轉滿 200 轉必定灌籃。\n進入 RUSH，球星卡一張張落下。')
FROM events e WHERE e.id = s.event_id AND e.slug = 'slam-dunk' AND s.type = 'hero';

-- ═══ SPEC 區：拿掉「保底轉數/檔次/共用獎池」術語 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'subtitle', (CASE e.slug WHEN 'zetcho-rush' THEN '絕頂RUSH · 機台規格' ELSE '灌籃SLAM DUNK · 機台規格' END),
  'stats', jsonb_build_array(
    jsonb_build_object('v', '200 轉', 'l', '轉滿保證進入 RUSH，沒滿也隨時可能中', 'color', '#ffd24a'),
    jsonb_build_object('v', '5 台',  'l', '同時開放，每台進度各自累積', 'color', '#e879f9'),
    jsonb_build_object('v', '5 檔',  'l', '每轉 10〜300G 自由選，上機後鎖定', 'color', '#ffd24a'),
    jsonb_build_object('v', '共用獎池', 'l', '五台抽的是同一批實體卡牌', 'color', '#e879f9')
  ))
FROM events e WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk') AND s.type = 'stats';

-- ═══ 流程五步：白話化 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'steps', jsonb_build_array(
    jsonb_build_object('title', '選金額上機',
      'description', '每轉金額 10〜300G 自由選，金額愈高、卡牌獎池愈高級'),
    jsonb_build_object('title', '開始旋轉',
      'description', '每一轉都退回一些 G 幣，同時進度 +1'),
    jsonb_build_object('title', (CASE e.slug WHEN 'zetcho-rush' THEN '進入絕頂RUSH' ELSE '觸發灌籃RUSH' END),
      'description', '每一轉都有機率直接中；進度滿 200 轉保證中'),
    jsonb_build_object('title', 'RUSH 中＝連續抽卡',
      'description', '機台整台變裝，每一轉掉出一張實體卡牌'),
    jsonb_build_object('title', '能連幾張看運氣',
      'description', '每拿一張再判定一次，成功就繼續掉，失敗就結束')
  ))
FROM events e WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk') AND s.type = 'steps';

-- ═══ 返還表：說明白話化（表格數字不動）═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'subtitle', '每一轉都會退幣，轉到的圖案決定退多少',
  'note', '※ 退幣金額＝每轉金額 × 圖案倍率，最低的黃金序章也有 20%。')
FROM events e
WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk')
  AND s.type = 'table' AND s.content->>'h2' = '普通旋轉返還';

-- ═══ 直擊區：白話化 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'subtitle', '不想慢慢轉，可以付費直接進入 RUSH',
  'fb', '直擊價格＝還沒轉的轉數 × 每轉金額。已經轉愈多，直擊就愈便宜。')
FROM events e WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk') AND s.type = 'fukuro'
  AND s.content->>'ft' = '不想等？付費直接進入 RUSH';

-- ═══ 機制保證：「保底不會歸零」→「進度不會歸零」═══
UPDATE event_sections s SET content = jsonb_set(content, '{rules,0,title}', '"進度不會歸零"')
FROM events e WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk') AND s.type = 'rule';

-- ═══ 檔次一覽表：改「成本對照」白話 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'subtitle', '轉滿成本與直擊價格對照',
  'note', '※ 直擊＝買下還沒轉的轉數，所以全新機台的直擊價等於轉滿 200 轉的總投入；已經轉愈多，直擊愈便宜（最低 1 轉份）。',
  'rows', jsonb_build_array(
    jsonb_build_array('轉滿 200 轉總投入', '2,000G', '4,000G', '10,000G', '20,000G', '60,000G'),
    jsonb_build_array('直擊價（全新機台）', '2,000G', '4,000G', '10,000G', '20,000G', '60,000G')
  ))
FROM events e
WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk')
  AND s.type = 'table' AND s.content->>'h2' = '各檔次一覽';

-- ═══ 兩種面貌：badge 與 callout 白話化 ═══
UPDATE event_sections s SET content =
  jsonb_set(
    content || jsonb_build_object('callout', '每台目前的進度與今日中獎次數都公開 ―― 挑一台再上機。'),
    '{items,0,badge}', '"累積進度"')
FROM events e WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk') AND s.type = 'gallery';

-- ═══ 結尾 CTA 與 sticky：白話化 ═══
UPDATE event_sections s SET content = content || jsonb_build_object('subtitle', '進度滿了，卡牌就是你的。')
FROM events e WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk') AND s.type = 'cta';

UPDATE event_sections s SET content = content || jsonb_build_object('sub_text', '五台開放中 · 每台進度公開')
FROM events e WHERE e.id = s.event_id AND e.slug IN ('zetcho-rush', 'slam-dunk') AND s.type = 'sticky_cta';

COMMIT;
