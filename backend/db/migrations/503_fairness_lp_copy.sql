-- 503: 公平性驗證活動頁文案重整
--
-- 三個問題：
-- 1) 多處重複同一件事（「開賣前排好」在三步驟講一次、圖說再講一次、結尾又講一次）
-- 2) 「哪些玩法適用」寫著「剩幾個、機率多少一律公開在商品頁的配率表」——
--    平台不公開單品機率，前台的品項詳情也已移除機率與轉蛋／盒玩的剩餘張數。
--    這句話與實際不符，是對玩家的錯誤承諾。
-- 3) 通篇沒有解釋「驗證碼／HASH」到底是什麼。底部警語列寫著
--    「吉吉比使用 HASH 公平可驗證的技術建立」，玩家點進來卻找不到那是什麼東西。
--
-- 重整後的順序：這是什麼 → 三步驟 → 在哪裡看 → 適用範圍 → CTA

BEGIN;

-- ═══ 新增「什麼是驗證碼」區塊，插在三步驟之前 ═══
UPDATE event_sections s SET sort_order = sort_order + 1
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness' AND s.sort_order >= 1;

INSERT INTO event_sections (event_id, sort_order, type, content)
SELECT e.id, 1, 'text', jsonb_build_object(
  'h2', '驗證碼是什麼',
  'body',
  '把整檔的開獎表想成一份名單，驗證碼就是這份名單的指紋（技術上叫 SHA-256 雜湊）。' ||
  E'\n\n' ||
  '它有兩個特性：同一份名單永遠算出同一組指紋；名單只要改動一個字，指紋就會完全不同。' ||
  E'\n\n' ||
  '所以我們在開賣時先把指紋公布出來，等於當眾把名單封進保險箱。' ||
  '這一檔結束後名單公開，你可以自己拿去算一次 —— 算出來的指紋必須跟開賣那天公布的一模一樣。' ||
  '對得上，代表中間沒被動過；對不上，代表我們改過東西，而且賴不掉。'
)
FROM events e WHERE e.slug = 'fairness';

-- ═══ 三步驟：去掉與新區塊重複的說明，只留動作 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'h2', '怎麼運作',
  'steps', jsonb_build_array(
    jsonb_build_object(
      'title', '開賣前先封存',
      'description', '商品一上架，哪個號碼對到哪個獎就全部排定，同時公布驗證碼。'),
    jsonb_build_object(
      'title', '抽到的都有號碼',
      'description', '每一件收進倉庫時都帶著它的號碼，那就是你的收據。'),
    jsonb_build_object(
      'title', '完抽後公開對照',
      'description', '這一檔抽完，開獎表整份公開。用你的號碼去查，就知道當初排給你的是不是這件。')
  ))
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness' AND s.type = 'steps';

-- ═══ 圖說：拿掉重複的「已封存／公開」敘述，改講在哪一頁做什麼 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'callout', '販售中只看得到驗證碼，完抽後同一個位置會變成完整的開獎表。')
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness' AND s.type = 'gallery';

-- ═══ 適用範圍：移除「機率一律公開」的錯誤承諾 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'h2', '哪些玩法適用',
  'body',
  '一番賞、抽卡、自製賞採用號碼封存，可以照上面的方式驗算。' ||
  E'\n\n' ||
  '轉蛋與盒玩沒有號碼 —— 它們每一抽都是當下獨立隨機，不存在「開賣前就排好」這回事，' ||
  '因此沒有可以事後比對的開獎表。')
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness' AND s.type = 'text'
  AND s.content->>'h2' = '哪些玩法適用';

COMMIT;
