-- 公平性說明頁（活動頁模組）
--
-- 寫作原則（見 CLAUDE.md 前台文案原則）：
--   不出現 Seed / TXID / 雜湊 / 伺服器 這類字，玩家看不懂的詞放在說服位置等於沒寫
--   不用 emoji，不長篇大論——這頁的任務是三十秒內讓人相信，不是教學文件
--   圖片一律先用灰色示意圖，老闆之後換掉 url 即可
--
-- 可重跑：先刪同 slug 再建。

DELETE FROM public.events WHERE slug = 'fairness';   -- sections 由 FK CASCADE 一起刪

INSERT INTO public.events (slug, title, kind, theme_mode, bg_color, accent_color, is_active)
VALUES ('fairness', '抽獎公平性', 'other', 'dark', '#0a0610', '#2ecc71', true);

INSERT INTO public.event_sections (event_id, sort_order, type, content)
SELECT e.id, v.sort_order, v.type, v.content::jsonb
FROM public.events e,
(VALUES
  (0, 'hero', $json$
  {
    "eyebrow": "FAIR DRAW",
    "title": "不用相信我們",
    "subtitle": "你可以自己算\n答案在開賣前就封起來了，抽完後我們把鑰匙交給你。",
    "bg_image_url": "/images/placeholder/fair_hero.svg",
    "cta_text": "去看看可以抽什麼",
    "cta_url": "/",
    "highlight_text": "一番賞・抽卡・自製賞　每一抽都可事後驗算"
  }
  $json$),

  (1, 'steps', $json$
  {
    "h2": "三步驟",
    "steps": [
      {
        "title": "開賣前，答案就封起來了",
        "description": "商品一上架，哪個號碼對到哪個獎就全部排好、鎖進系統。我們沒辦法等你抽下去才決定要給你什麼。"
      },
      {
        "title": "你抽走的每一張都有號碼",
        "description": "抽到的東西會標上號碼收進你的倉庫。這個號碼就是你的收據。"
      },
      {
        "title": "全部抽完，鑰匙交給你",
        "description": "這檔完抽後，系統公開當初上鎖用的那組驗證碼。你拿它跟自己的號碼重算一次，就知道有沒有被動過手腳。"
      }
    ]
  }
  $json$),

  (2, 'gallery', $json$
  {
    "h2": "在哪裡看",
    "items": [
      { "media_type": "image", "url": "/images/placeholder/fair_step1.svg", "caption": "商品頁下方" },
      { "media_type": "image", "url": "/images/placeholder/fair_step2.svg", "caption": "倉庫每一件品項" },
      { "media_type": "image", "url": "/images/placeholder/fair_step3.svg", "caption": "驗算頁自己重算" }
    ],
    "callout": "還沒抽完時，你會看到「已封存」；完抽後同一個位置就會變成公開的驗證碼。"
  }
  $json$),

  (3, 'text', $json$
  {
    "h2": "哪些玩法適用",
    "body": "一番賞、抽卡、自製賞採用號碼封存。轉蛋和盒玩沒有號碼，每一抽都是當下獨立隨機，剩幾個、機率多少一律公開在商品頁的配率表。"
  }
  $json$),

  (4, 'cta', $json$
  {
    "h2": "看完就去抽吧",
    "subtitle": "抽到的東西可以申請寄送，也可以回收成 G 幣。",
    "text": "去看看可以抽什麼",
    "url": "/"
  }
  $json$)
) AS v(sort_order, type, content)
WHERE e.slug = 'fairness';
