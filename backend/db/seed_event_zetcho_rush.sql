-- 絕頂RUSH 活動說明頁（內容種子，非 schema migration）
--
-- 用途：以 events / event_sections 活動頁模組建立「絕頂RUSH」玩法說明頁
-- 網址：/events/zetcho-rush
-- 內容參數皆取自實際機台設定（slot_themes id=1）。
--
-- 兩項刻意的內容規則：
--   1. 不揭露任何機率（觸發率、延續率、返還品項機率）——僅呈現「保證」與「金額」
--   2. 不放影片演出——絕頂RUSH 為 classic（圖素）機台，本來就沒有影片演出，
--      lp-assets/zetcho/*.mp4 是影片型機台的素材，放在此頁會誤導
-- 可重複執行（會先刪除同 slug 再重建）；後台 /events 可直接編輯。

BEGIN;

DELETE FROM public.events WHERE slug = 'zetcho-rush';

INSERT INTO public.events (slug, title, bg_color, accent_color, theme_mode, is_active)
VALUES ('zetcho-rush', '絕頂RUSH', '#0a0610', '#e100ff', 'dark', TRUE);

INSERT INTO public.event_sections (event_id, sort_order, type, content)
SELECT e.id, v.sort_order, v.type, v.content::jsonb
FROM public.events e, (VALUES
(0, 'hero', $J${
  "eyebrow": "SLOT TYPE B",
  "title": "絕頂RUSH",
  "subtitle": "轉滿 200 轉，必定觸發。\n進入絕頂，卡牌一張張落下。",
  "highlight_text": "保底 200 轉必觸發 · 每一轉都有返還 · 觸發保證至少 1 張卡",
  "badge_text": "",
  "cta_text": "前往挑戰",
  "cta_url": "/challenge",
  "bg_video_url": "",
  "bg_poster_url": "",
  "bg_image_url": "/images/slot/machine/main.png",
  "gems": [],
  "scatter": [
    {"url": "/images/slot/machine/01.png", "top": "-2%",  "left": "-12%",  "size": "clamp(130px,34vw,300px)", "rotate": -18, "blur": 3.5, "opacity": 0.68},
    {"url": "/images/slot/machine/02.png", "top": "3%",   "right": "-10%", "size": "clamp(110px,29vw,260px)", "rotate": 16,  "blur": 5.5, "opacity": 0.5},
    {"url": "/images/slot/machine/03.png", "top": "15%",  "left": "13%",   "size": "clamp(70px,18vw,160px)",  "rotate": 9,   "blur": 8,   "opacity": 0.34},
    {"url": "/images/slot/machine/04.png", "top": "12%",  "right": "15%",  "size": "clamp(64px,16vw,145px)",  "rotate": -8,  "blur": 9,   "opacity": 0.3},
    {"url": "/images/slot/machine/05.png", "bottom": "-3%", "left": "-8%", "size": "clamp(125px,33vw,290px)", "rotate": 24,  "blur": 4,   "opacity": 0.6},
    {"url": "/images/slot/machine/06.png", "bottom": "6%",  "right": "-6%","size": "clamp(105px,27vw,240px)", "rotate": -22, "blur": 2.5, "opacity": 0.7}
  ]
}$J$),
(1, 'stats', $J${
  "h2": "SPEC",
  "h2_type": "pp",
  "subtitle": "保底型 · 絕頂RUSH",
  "stats": [
    {"v": "200 轉", "l": "保底轉數。轉滿必定觸發 RUSH", "color": "#ffd24a"},
    {"v": "至少 1 張", "l": "觸發即保證獲得卡牌", "color": "#e879f9"},
    {"v": "10〜300G", "l": "五種入場檔次，上機後該場鎖定", "color": "#ffd24a"},
    {"v": "實體卡牌", "l": "獲得的卡牌可申請寄送或回收成 G 幣", "color": "#e879f9"}
  ]
}$J$),
(2, 'steps', $J${
  "h2": "絕頂RUSH 的流程",
  "subtitle": "每一轉都有返還，保底轉滿必定進入 RUSH",
  "steps": [
    {"title": "選擇檔次上機", "description": "10 / 20 / 50 / 100 / 300G 五選一，上機後該場鎖定不可更換"},
    {"title": "普通旋轉", "description": "每一轉都會返還 G 幣，同時累積保底轉數"},
    {"title": "觸發絕頂RUSH", "description": "保底轉滿 200 轉必定觸發；未轉滿時也可能隨時降臨"},
    {"title": "RUSH 中＝抽卡", "description": "進入 RUSH 後每轉抽出實體卡牌，保證至少 1 張"},
    {"title": "延續判定", "description": "每獲得一張後判定是否延續，延續成功就繼續抽下一張"}
  ]
}$J$),
(3, 'table', $J${
  "h2": "普通旋轉返還",
  "h2_highlight": {"text": "返還", "type": "pp"},
  "subtitle": "每一轉都有返還，任何檔次都不會出現 0G",
  "columns": ["返還品項", "10G", "20G", "50G", "100G", "300G"],
  "rows": [
    ["神域共鳴", "24G", "48G", "120G", "240G", "720G"],
    ["命運之瞳", "15G", "30G", "75G", "150G", "450G"],
    ["緋色幸運", "8G", "16G", "40G", "80G", "240G"],
    ["黃金序章", "2G", "4G", "10G", "20G", "60G"]
  ],
  "note": "※ 返還金額 ＝ 該檔次投注額 × 品項倍率。最低的黃金序章也會返還投注額的 20%。",
  "highlight_col": 0
}$J$),
(4, 'rel', $J${
  "h2": "連莊難度",
  "h2_highlight": {"text": "連莊", "type": "pp"},
  "subtitle": "第一張是保證，之後每多一張都愈來愈難",
  "rows": [
    {"name": "第 1 張", "value": "★★★★★", "desc": "觸發即保證，一定拿得到", "name_color": "#5aff9a"},
    {"name": "第 2 張", "value": "★★★☆☆", "desc": "延續判定通過才有", "name_color": "#ffd24a"},
    {"name": "第 3 張", "value": "★★☆☆☆", "desc": "難度再上一階", "name_color": "#ff9a3d"},
    {"name": "第 4 張以上", "value": "★☆☆☆☆", "desc": "長連莊是真本事", "name_color": "#ff4d5a"}
  ],
  "callout": "★ 表示拿到的容易程度，愈少顆愈難。每一次延續成功，都是實打實多一張卡牌入袋。"
}$J$),
(5, 'fukuro', $J${
  "h2": "絕頂直擊",
  "h2_type": "pp",
  "ft": "不想等？付費直接進入 RUSH",
  "ft_type": "pp",
  "fb": "直擊價格 ＝ 剩餘保底轉數 × 檔次金額。已經轉愈多，直擊就愈便宜。",
  "fb2": "",
  "variant": "accent",
  "subtitle": "把剩下的保底轉數一次買斷，立刻進入絕頂RUSH",
  "chips": ["10G 檔｜全新機台 2,000G", "20G 檔｜4,000G", "50G 檔｜10,000G", "100G 檔｜20,000G", "300G 檔｜60,000G"],
  "callout": "直擊是「購買進入權」的功能。進入後獲得的卡牌與連莊數仍由抽選決定，可能低於支付的金額，不保證一擊回本。"
}$J$),
(6, 'rule', $J${
  "h2": "機制保證",
  "h2_highlight": {"text": "保證", "type": "gold"},
  "subtitle": "以下規則寫在系統裡，不是話術",
  "rules": [
    {"title": "保底必觸發", "desc": "轉滿 200 轉一定進入 RUSH，進度不會被歸零重來", "title_color": "#ffd24a"},
    {"title": "最低 1 張保證", "desc": "觸發 RUSH 後，至少獲得 1 張卡牌", "title_color": "#5aff9a"},
    {"title": "每轉都有返還", "desc": "普通旋轉不會出現 0G，最低也返還投注額的 20%", "title_color": "#e879f9"},
    {"title": "保底進度公開", "desc": "機台列表直接顯示各機台目前保底進度與今日 RUSH 次數", "title_color": "#ff4d5a"}
  ]
}$J$),
(7, 'table', $J${
  "h2": "各檔次一覽",
  "subtitle": "保底成本與直擊價格對照",
  "columns": ["", "10G", "20G", "50G", "100G", "300G"],
  "rows": [
    ["保底轉數", "200 轉", "200 轉", "200 轉", "200 轉", "200 轉"],
    ["轉滿保底投注額", "2,000G", "4,000G", "10,000G", "20,000G", "60,000G"],
    ["直擊價（全新機台）", "2,000G", "4,000G", "10,000G", "20,000G", "60,000G"],
    ["單轉最低返還", "2G", "4G", "10G", "20G", "60G"],
    ["單轉最高返還", "24G", "48G", "120G", "240G", "720G"]
  ],
  "note": "※ 直擊價會隨保底進度下降：剩餘轉數 × 檔次金額，最低 1 轉份。",
  "highlight_col": 0
}$J$),
(8, 'gallery', $J${
  "h2": "機台一覽",
  "h2_type": "pp",
  "layout": "grid",
  "subtitle": "五台同規格機台同時開放，保底進度各自獨立",
  "items": [
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot-machine-1-1785553507978.webp", "caption": "絕頂RUSH", "badge": "機台", "color": "#e879f9", "poster": "", "media_type": "image"}
  ],
  "callout": "每台機台的保底進度分開計算，挑戰列表可直接看到各機台目前進度與今日 RUSH 次數。",
  "callout_border": "#6a4a1e"
}$J$),
(9, 'fukuro', $J${
  "h2": "",
  "ft": "一人一台 ―― 座位機制",
  "ft_type": "gold",
  "fb": "上機後機台為你保留 30 秒，每次旋轉或直擊 +60 秒（最長 90 秒）。閒置到期會自動讓位給其他玩家，離開前 15 秒畫面會先提示。",
  "fb2": "",
  "chips": ["上機保留 30 秒", "每轉 +60 秒", "上限 90 秒", "離席前 15 秒提示"],
  "callout": "",
  "subtitle": ""
}$J$),
(10, 'cta', $J${
  "h2": "絕頂，會連莊。",
  "h2_type": "pp",
  "subtitle": "轉滿 200 轉，卡牌就是你的。",
  "text": "前往挑戰",
  "url": "/challenge"
}$J$),
(11, 'sticky_cta', $J${
  "text": "前往挑戰",
  "sub_text": "保底 200 轉必觸發 · 觸發保證至少 1 張卡",
  "url": "/challenge"
}$J$)
) AS v(sort_order, type, content)
WHERE e.slug = 'zetcho-rush';

COMMIT;
