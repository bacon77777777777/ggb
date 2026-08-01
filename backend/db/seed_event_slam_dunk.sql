-- 灌籃SLAM DUNK 活動說明頁（內容種子，非 schema migration）
-- 由 seed_event_zetcho_rush.sql 複製，玩法參數相同，僅視覺與名稱不同。
--
-- 用途：以 events / event_sections 活動頁模組建立「絕頂RUSH」玩法說明頁
-- 網址：/events/slam-dunk
-- 內容參數皆取自實際機台設定（slot_themes id=1）。
--
-- 兩項刻意的內容規則：
--   1. 不揭露任何機率（觸發率、延續率、返還品項機率）——僅呈現「保證」與「金額」
--   2. 不放影片演出——絕頂RUSH 為 classic（圖素）機台，本來就沒有影片演出，
--      lp-assets/zetcho/*.mp4 是影片型機台的素材，放在此頁會誤導
-- 可重複執行（會先刪除同 slug 再重建）；後台 /events 可直接編輯。

BEGIN;

DELETE FROM public.events WHERE slug = 'slam-dunk';

INSERT INTO public.events (slug, title, bg_color, accent_color, theme_mode, is_active)
VALUES ('slam-dunk', '灌籃SLAM DUNK', '#0a0610', '#ff7a1a', 'dark', TRUE);

INSERT INTO public.event_sections (event_id, sort_order, type, content)
SELECT e.id, v.sort_order, v.type, v.content::jsonb
FROM public.events e, (VALUES
(0, 'hero', $J${
  "eyebrow": "SLOT TYPE D",
  "title": "灌籃SLAM DUNK",
  "subtitle": "轉滿 200 轉，必定灌籃。\n進入 RUSH，球星卡一張張落下。",
  "highlight_text": "抽到的是實體卡牌 ―― 可申請寄送，或回收成 G 幣",
  "badge_text": "",
  "cta_text": "前往挑戰",
  "cta_url": "/challenge",
  "bg_video_url": "",
  "bg_poster_url": "",
  "bg_image_url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/machine-rush.webp",
  "gems": [],
  "scatter": [
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/sym0.webp", "bottom": "-6%", "left": "-12%", "size": "clamp(150px,38vw,340px)", "rotate": 24,  "blur": 1.5,  "opacity": 0.78},
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/sym1.webp", "top": "-4%",    "left": "-10%", "size": "clamp(120px,30vw,270px)", "rotate": -18, "blur": 3,    "opacity": 0.68},
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/sym2.webp", "bottom": "2%",  "right": "-8%", "size": "clamp(95px,24vw,215px)",  "rotate": -22, "blur": 5,    "opacity": 0.56},
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/sym3.webp", "top": "2%",     "right": "-6%", "size": "clamp(76px,19vw,170px)",  "rotate": 16,  "blur": 7,    "opacity": 0.45},
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/sym4.webp", "top": "13%",    "left": "12%",  "size": "clamp(60px,15vw,135px)",  "rotate": 9,   "blur": 9.5,  "opacity": 0.35},
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/sym5.webp", "top": "10%",    "right": "16%", "size": "clamp(48px,12vw,108px)",  "rotate": -8,  "blur": 12,   "opacity": 0.26}
  ]
}$J$),
(1, 'stats', $J${
  "h2": "SPEC",
  "h2_type": "pp",
  "subtitle": "保底型 · 灌籃SLAM DUNK",
  "stats": [
    {"v": "200 轉", "l": "保底轉數。轉滿必定觸發 RUSH", "color": "#ffd24a"},
    {"v": "5 台", "l": "同時開放，每台保底進度各自獨立", "color": "#e879f9"},
    {"v": "5 檔", "l": "10〜300G 任選，上機後該場鎖定", "color": "#ffd24a"},
    {"v": "共用獎池", "l": "五台共用同一份卡牌庫存", "color": "#e879f9"}
  ]
}$J$),
(2, 'steps', $J${
  "h2": "灌籃RUSH 的流程",
  "subtitle": "從上機到結束，一場完整的流程",
  "steps": [
    {"title": "選擇檔次上機", "description": "檔次決定每轉的投注額，以及對應的卡牌獎池"},
    {"title": "普通旋轉", "description": "每轉返還 G 幣，同時把保底進度往前推一格"},
    {"title": "觸發灌籃RUSH", "description": "保底走完必定觸發，未走完時也可能提前降臨"},
    {"title": "RUSH 中＝抽卡", "description": "機台整台變裝，每一轉抽出實體卡牌"},
    {"title": "延續判定", "description": "延續成功就繼續抽下一張，失敗則結束回到普通"}
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
  "h2": "灌籃直擊",
  "h2_type": "pp",
  "ft": "不想等？付費直接進入 RUSH",
  "ft_type": "pp",
  "fb": "直擊價格 ＝ 剩餘保底轉數 × 檔次金額。已經轉愈多，直擊就愈便宜。",
  "fb2": "",
  "variant": "accent",
  "subtitle": "把剩下的保底轉數一次買斷，立刻進入灌籃RUSH",
  "chips": ["10G 檔｜全新機台 2,000G", "20G 檔｜4,000G", "50G 檔｜10,000G", "100G 檔｜20,000G", "300G 檔｜60,000G"],
  "callout": "直擊買的是「立刻進去」，不是「保證賺回來」。進去之後抽到的卡牌、能連幾張，一樣要看運氣，有可能低於你付出的金額。"
}$J$),
(6, 'rule', $J${
  "h2": "機制保證",
  "h2_highlight": {"text": "保證", "type": "gold"},
  "subtitle": "以下每一條都是固定規則，不是話術",
  "rules": [
    {"title": "保底不會歸零", "desc": "進度記在機台上，中途離開、換人接手、隔天再來都不會被清掉", "title_color": "#ffd24a"},
    {"title": "結果立刻定案", "desc": "按下去的那一刻結果就定了，就算斷線或關掉頁面，拿到的卡牌一樣是你的", "title_color": "#5aff9a"},
    {"title": "直擊內容一樣", "desc": "直擊只是買一張入場券，進去之後能抽到什麼、能連幾張，跟自己轉到的一模一樣", "title_color": "#e879f9"},
    {"title": "每轉都有紀錄", "desc": "每一轉花了多少、拿回多少，都能在會員中心的消費明細查到", "title_color": "#ff4d5a"}
  ]
}$J$),
(7, 'table', $J${
  "h2": "各檔次一覽",
  "subtitle": "保底成本與直擊價格對照",
  "columns": ["", "10G", "20G", "50G", "100G", "300G"],
  "rows": [
    ["轉滿保底（200 轉）投注額", "2,000G", "4,000G", "10,000G", "20,000G", "60,000G"],
    ["直擊價（全新機台）", "2,000G", "4,000G", "10,000G", "20,000G", "60,000G"]
  ],
  "note": "※ 直擊等於買下剩餘的保底轉數，因此全新機台的直擊價正好等於轉滿保底的投注額；已經轉愈多，直擊就愈便宜（剩餘轉數 × 檔次金額，最低 1 轉份）。",
  "highlight_col": 0
}$J$),
(8, 'gallery', $J${
  "h2": "兩種面貌",
  "h2_type": "pp",
  "layout": "grid",
  "subtitle": "普通時累積保底，進入灌籃RUSH 後機台由金轉藍",
  "items": [
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/machine-normal.webp", "caption": "普通時", "badge": "累積保底", "color": "#e879f9", "poster": "", "media_type": "image"},
    {"url": "https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/slot/slam-dunk/machine-rush.webp", "caption": "灌籃RUSH", "badge": "抽卡中", "color": "#ffd24a", "poster": "", "media_type": "image"}
  ],
  "callout": "挑戰列表可直接看到每台目前的保底進度與今日 RUSH 次數 ―― 挑一台再上機。",
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
  "h2": "灌籃，會連莊。",
  "h2_type": "pp",
  "subtitle": "保底走完，卡牌就是你的。",
  "text": "前往挑戰",
  "url": "/challenge"
}$J$),
(11, 'sticky_cta', $J${
  "text": "前往挑戰",
  "sub_text": "五台開放中 · 保底進度公開可見",
  "url": "/challenge"
}$J$)
) AS v(sort_order, type, content)
WHERE e.slug = 'slam-dunk';

COMMIT;
