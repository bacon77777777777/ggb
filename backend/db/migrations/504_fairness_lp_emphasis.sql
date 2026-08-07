-- 504: 公平性驗證活動頁 —— 標出內文重點
--
-- 內文整段同一種灰字，玩家會直接跳過。用 `**字**` 標記讓關鍵句上主題色（本頁為綠色）。
-- 標的原則：只標「玩家記住這句就夠」的部分，不標整句 —— 全部都是重點等於沒有重點。

BEGIN;

-- ═══ 驗證碼是什麼 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'body',
  '把整檔的開獎表想成一份名單，驗證碼就是這份名單的**指紋**（技術上叫 SHA-256 雜湊）。' ||
  E'\n\n' ||
  '它有兩個特性：**同一份名單永遠算出同一組指紋**；**名單只要改動一個字，指紋就會完全不同**。' ||
  E'\n\n' ||
  '所以我們在**開賣時就先把指紋公布出來**，等於當眾把名單封進保險箱。' ||
  '這一檔結束後名單公開，你可以**自己拿去算一次** —— 算出來的指紋必須跟開賣那天公布的一模一樣。' ||
  '對得上，代表中間沒被動過；**對不上，代表我們改過東西，而且賴不掉**。'
)
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness'
  AND s.type = 'text' AND s.content->>'h2' = '驗證碼是什麼';

-- ═══ 哪些玩法適用 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'body',
  '**一番賞、抽卡、自製賞**採用號碼封存，可以照上面的方式驗算。' ||
  E'\n\n' ||
  '**轉蛋與盒玩沒有號碼** —— 它們每一抽都是當下獨立隨機，不存在「開賣前就排好」這回事，' ||
  '因此沒有可以事後比對的開獎表。'
)
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness'
  AND s.type = 'text' AND s.content->>'h2' = '哪些玩法適用';

-- ═══ 怎麼運作（三步驟的說明） ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'steps', jsonb_build_array(
    jsonb_build_object(
      'title', '開賣前先封存',
      'description', '商品一上架，哪個號碼對到哪個獎就**全部排定**，同時公布驗證碼。'),
    jsonb_build_object(
      'title', '抽到的都有號碼',
      'description', '每一件收進倉庫時都帶著它的號碼，**那就是你的收據**。'),
    jsonb_build_object(
      'title', '完抽後公開對照',
      'description', '這一檔抽完，**開獎表整份公開**。用你的號碼去查，就知道當初排給你的是不是這件。')
  ))
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness' AND s.type = 'steps';

-- ═══ 圖說 ═══
UPDATE event_sections s SET content = content || jsonb_build_object(
  'callout', '販售中只看得到驗證碼，**完抽後同一個位置會變成完整的開獎表**。')
FROM events e WHERE e.id = s.event_id AND e.slug = 'fairness' AND s.type = 'gallery';

COMMIT;
