'use client';

/**
 * 吉吉比・撕開卡包 —— 老闆原型 `public/images/card/ggb-pack-rip.jsx` 的移植。
 *
 * **動畫、物理、音效、版面全部照原型，邏輯一行沒改。** 只做接口上的三件事：
 *   1. 示範用的內嵌 base64 素材 → 由 props 帶入真實商品圖
 *   2. 移除示範用的 ⚙️ 設定面板（換圖、手動選稀有度）→ 線上由商品資料決定
 *   3. 「再撕一包」→ onFinish，交回商品頁決定（進倉庫／再抽一包）
 *
 * 刻意保持 .jsx 不轉 TypeScript：轉型別要動到原型的每一行，
 * 之後老闆再給新版原型就對不起來。tsconfig 的 allowJs 本來就開著。
 */

import React, { useState, useRef, useEffect } from "react";
import { SoundToggle, RAISED_STYLE, RAISED_STYLE_GOLD } from "@/components/ui/SoundToggle";
import useSoundMuted from "@/hooks/useSoundMuted";
import { createClient } from "@/lib/supabase/client";
import { hapticLight, hapticMedium } from '@/lib/haptics';
import StarWarpField from '@/components/card/StarWarpField';
import { PACK_RATIO } from '@/components/card/packSpec';

/* 後台「抽獎模組設定 → 卡包模式 → 撕開封口」可調的參數，
   讀不到就用這組預設（跟 backend/app/settings/modules/machineParams.ts 的 default 一致） */
const PARAM_DEFAULTS = {
  vortexScale: 100, vortexOffsetY: 0,
  energyScale: 100, energyOffsetY: 0,
  fxOpacity: 0.9,
  dealStagger: 90, flipDelay: 500, skipFlyMs: 55,
  sfxVolume: 1,
  peelCurl: 45,
  // 背景流星（老闆 2026-08-29）
  starOn: true, starCount: 500, starSpeed: 5, starSize: 20, starTrail: 0, starBrightness: 100,
  // 封條的銀色壓紋（老闆 2026-08-29：看起來像塑膠套，關掉）
  sealTexture: false,
};

/* ============================================================
   GGB 撕開卡包 — packs.com "Demo Open" 流程
   1) 畫面任意處左右滑 → 整條封條弧形向後掀（摺線發光+火花）
   2) 撕開後：卡牌全部「背面」像發牌一樣從下往上頂進定位（傾斜堆疊）
   3) 0.5 秒後最上張從左水平旋轉 180° 翻出正面（帶傾斜）
   4) 滑掉 → 下一張自動翻；最後一張 大賞/小賞 光環
   ============================================================ */

const STRIP_FRAC = 0.07;    // 封條高度（撕的支點線位置，越小越靠上）
const PEEL_FACTOR = 0.6;    // 撕完需滑動的螢幕寬倍數（越小越快撕完）
const STRIP_PAD_TOP = 240;  // 封條 canvas 上方預留（掀起空間）
const STRIP_PAD_X = 200;  // 左側預留：弧線往左上掃，捲得越多需要越寬
const STRIP_PAD_RIGHT = 280; // 右側預留：尾端往右上出鏡
const CARD_COUNT_DEFAULT = 5;

/* ---------- 稀有度等級（參考站：最後一張卡背霓虹描邊，藍→紫→金） ---------- */
const TIERS = {
  blue:   { tag: "✨ 稀有", rim: "#6ea8ff", glow: "#8ec2ff", big: false, spark: ["#9fd0ff", "#e6f4ff", "#ffffff"] },
  purple: { tag: "💜 史詩", rim: "#b76bff", glow: "#cf9bff", big: true,  spark: ["#d9a8ff", "#b76bff", "#ffffff"] },
  gold:   { tag: "🏆 傳說", rim: "#ffd54a", glow: "#ffe98a", big: true,  spark: ["#ffd54a", "#ffe98a", "#ff9e3d", "#ffffff"] },
};
/* 大賞特效改用老闆給的影片（energy.mp4 / vortex.mp4），
   原本的九格 SVG 輪播與侵蝕濾鏡已移除 —— 素材留在 public/images/card/light/ 沒刪 */

const DEAL_STAGGER = 90;    // 每張發牌間隔 ms
const DEAL_DUR = 480;       // 單張上滑時間 ms

/* ---------- 內建素材（吉吉比卡包 / 卡背 / 卡面，可在 ⚙️ 換圖） ---------- */

/* ---------- 銀色壓紋封條貼圖（含小膠囊釦） ---------- */
function makeSealSVG() {
  const ribs = Array.from({ length: 124 }, (_, i) =>
    `<rect x='${i * 5}' y='0' width='2.6' height='160' fill='${i % 2 ? "#9aa4b8" : "#eef2f8"}' opacity='${i % 2 ? 0.55 : 0.8}'/>`
  ).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='620' height='160' viewBox='0 0 620 160'>
  <rect width='620' height='160' fill='#c9d2e2' opacity='.35'/>
  ${ribs}
  <rect width='620' height='160' fill='url(#s)'/>
  <defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0' stop-color='#fff' stop-opacity='.5'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/>
    <stop offset='1' stop-color='#000' stop-opacity='.22'/>
  </linearGradient></defs>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
const SEAL_URL = makeSealSVG();

/* ---------- 音效：老闆提供的素材（public/images/card/media） ----------
 * 原本是 WebAudio 現場合成的（撕紙聲是帶通白噪音、翻牌是掃頻），換成真實錄音。
 * 實作上要顧三件事：
 *  1. **連放會互相截斷** —— 同一顆 <audio> 重播得 currentTime=0，前一次的尾音就沒了。
 *     SKIP 飛牌每 55ms 一張，所以密集的音效各備兩顆輪流用。
 *  2. **循環音要記得停** —— 靜音、翻牌、元件卸載都得 stop，
 *     不然玩家關掉演出後聲音還留在頁面上跑。
 *  3. **自動播放限制** —— 這個場景一定是玩家點「立即開包／試試看」進來的，
 *     手勢已經有了所以 play() 不會被擋；仍然把 promise catch 掉以防萬一。
 * 音量比例沿用參考站的設定，再乘上後台的「音效音量」。
 */
const MEDIA = "/images/card/media";
const SFX = {
  //  key          檔案                          音量   循環   同時疊幾顆
  packIdle:  [`${MEDIA}/pack-idle-loop.mp3`,     1.0,  true,  1],
  packTear:  [`${MEDIA}/pack-tear.mp3`,          0.45, false, 1],
  packDone:  [`${MEDIA}/pack-tear-done.mp3`,     0.7,  false, 1],
  shuffle:   [`${MEDIA}/deal-shuffle.mp3`,       0.6,  false, 1],
  dealA:     [`${MEDIA}/card-deal-a.mp3`,        0.5,  false, 2],
  dealB:     [`${MEDIA}/card-deal-b.mp3`,        0.5,  false, 2],
  fly:       [`${MEDIA}/card-fly.mp3`,           0.5,  false, 2],
  flip:      [`${MEDIA}/card-flip.mp3`,          0.6,  false, 2],
  hype:      [`${MEDIA}/hype-loop.mp3`,          1.0,  true,  1],
  winRare:   [`${MEDIA}/win-rare.mp3`,           0.54, false, 1],
  winEpic:   [`${MEDIA}/win-epic.mp3`,           0.54, false, 1],
  winLegend: [`${MEDIA}/win-legend.mp3`,         0.58, false, 1],
};
/* 稀有度 → 中獎音。blue 稀有 / purple 史詩 / gold 傳說 */
const WIN_BY_TIER = { blue: "winRare", purple: "winEpic", gold: "winLegend" };

function useSfx(enabled, master = 1) {
  const onRef = useRef(enabled); onRef.current = enabled;
  const volRef = useRef(master); volRef.current = master;
  const bank = useRef({});
  const dealN = useRef(0);
  const api = useRef({});

  // 用到才建 <audio>，沒撕開的玩家不會白抓那支 451KB 的醞釀音
  const slot = (key) => {
    if (typeof window === "undefined" || !SFX[key]) return null;
    if (!bank.current[key]) {
      const [src, vol, loop, n] = SFX[key];
      bank.current[key] = {
        vol, i: 0,
        els: Array.from({ length: n }, () => {
          const a = new Audio(src);
          a.preload = "auto"; a.loop = !!loop;
          return a;
        }),
      };
    }
    return bank.current[key];
  };
  const play = (key) => {
    if (!onRef.current) return;
    const s = slot(key); if (!s) return;
    const a = s.els[s.i]; s.i = (s.i + 1) % s.els.length;
    a.volume = Math.max(0, Math.min(1, s.vol * (Number(volRef.current) || 0)));
    try { a.currentTime = 0; const r = a.play(); if (r && r.catch) r.catch(() => {}); } catch { /* 播不出來就算了，不能炸掉演出 */ }
  };
  const stop = (key) => {
    const s = bank.current[key]; if (!s) return;
    for (const a of s.els) { try { a.pause(); a.currentTime = 0; } catch { /* 同上 */ } }
  };
  const stopAll = () => Object.keys(bank.current).forEach(stop);

  api.current.idleLoop = () => play("packIdle");
  api.current.stopIdle = () => stop("packIdle");
  // 撕開是一段連續音：pointermove 每幀都會叫到，已經在播就不要從頭來
  api.current.tear = () => { const s = slot("packTear"); if (s && !s.els[0].paused) return; play("packTear"); };
  api.current.tearDone = () => { stop("packTear"); stop("packIdle"); play("packDone"); };
  api.current.shuffle = () => play("shuffle");
  api.current.deal = () => play(dealN.current++ % 2 ? "dealB" : "dealA");
  api.current.fly = () => play("fly");
  api.current.flip = () => play("flip");
  api.current.hype = () => play("hype");
  api.current.stopHype = () => stop("hype");
  api.current.win = (tier) => play(WIN_BY_TIER[tier] || "winRare");
  // SKIP 直接結束整場時一次收乾淨（醞釀音是 28 秒的 loop，沒收會拖到彈窗上）
  api.current.stopAll = stopAll;
  /*
   * 預熱：把所有 <audio> 都先建起來讓瀏覽器抓檔。
   * 一開始挑在「撕開完成」才預熱，但撕開完成音是同一個 tick 播的 ——
   * 那時才建 <audio> 等於完全沒預熱到，第一次一定慢。改成掛載就抓。
   */
  api.current.prewarm = () => { Object.keys(SFX).forEach(slot); };
  useEffect(() => { api.current.prewarm(); }, []);

  useEffect(() => { if (!enabled) stopAll(); }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return api;
}

/* ============================================================ */
export default function GGBPackRip({
  packImage,
  cardBack,
  cards: cardsProp,
  prizeTier: prizeTierProp = "blue",
  /**
   * 每一包各自的特效等級，例如買十包就是十個元素。
   * 沒給就退回單一的 prizeTier（買一包、或舊的呼叫端）。
   */
  prizeTiers: prizeTiersProp = /** @type {('blue'|'purple')[] | null} */ (null),
  soundDefault = true,
  /**
   * 快速模式（商品頁左上角的閃電，玩家設定會記住）。開啟時：
   *   1. 略過撕包步驟，直接進發牌
   *   2. 「快進本包」（點空白處）的落點**不變**，還是逐包停在壓軸
   *      （10/30 → 20/30 → 30/30）—— 差別只在中間那幾張不演飛牌，
   *      瞬間到位、也不出聲（老闆 2026-08-23）
   * **每包壓軸照樣浮起等點擊** —— 那是抽獎的爽點，加速鍵只吃過場動畫，不吃它。
   *
   * 為什麼閃電不改落點：改成直衝整筆最後一張的話，前面每一包的壓軸全被吃掉，
   * 玩家等於花錢買了十包卻只看到一包的演出。想直接結束的人按 SKIP。
   */
  fast = false,
  /** 演出畫面裡也有一顆同樣的閃電，切了要回寫商品頁的偏好 */
  onFastChange,
  /** 一包幾張。SKIP 用它算出「本包的壓軸在哪」 */
  cardsPerPack = 1,
  onFinish,
  onExit,
  title = "吉吉比・撕開卡包",
}) {
  const [phase, setPhase] = useState("idle"); // idle | tearing | ripped | cards | done
  const [progress, setProgress] = useState(0);
  // 素材與稀有度改由商品資料決定（原型是內建 base64 ＋ ⚙️ 手動換）
  const packImg = packImage;
  const cards = cardsProp;
  // prizeTier 的計算移到 cardIdx 宣告之後（要用它算出現在在第幾包）
  // 音效跟著全站靜音偏好走（與盒玩、一番賞同一顆開關），不再自己 useState ——
  // 玩家在商品頁關掉聲音，進了演出又自己響起來的話，那顆開關等於管不到這裡
  const muted = useSoundMuted();
  const sound = !muted;
  /*
   * 快速模式的本地狀態。演出畫面裡也有一顆閃電（SKIP 正上方），按下去要當場生效，
   * 不能等商品頁把 prop 傳回來 —— 那一趟 re-render 玩家會看到按鈕慢半拍。
   * prop 變動時同步過來，商品頁與演出內才不會各說各話。
   */
  const [fastOn, setFastOn] = useState(fast);
  useEffect(() => { setFastOn(fast); }, [fast]);
  const fastRef = useRef(fastOn); fastRef.current = fastOn;
  /*
   * ⚠️ 副作用不能寫在 setState 的 updater 裡（老闆 2026-08-27 演出中途開閃電時炸出
   * 「Cannot update a component (ProductDetailPage) while rendering GGBPackRip」）。
   *
   * updater 必須是純函式：React 可能在 render 期間呼叫它，在裡面呼叫商品頁的
   * setSkipPackIntroPref 就等於「渲染 A 的時候去更新 B」。嚴格模式下 updater 還會
   * 跑兩次，震動也會連震兩下。
   *
   * 改成先從 fastRef 算出結果，setState 與副作用各歸各的。
   * fastRef 順手同步，快進（advanceStep）當下就吃得到新值，不必等 re-render。
   */
  const toggleFast = () => {
    const next = !fastRef.current;
    fastRef.current = next;
    setFastOn(next);
    hapticLight();
    if (onFastChange) onFastChange(next);
  };
  /*
   * 撕包要不要略過，只看**掛載當下**的值。演出中途才打開閃電時撕包早就過了，
   * 拿即時值去判斷會害 useEffect 重跑、把已經在發牌的流程再踢一次。
   */
  const skipIntro = useRef(fast).current;
  const [cardIdx, setCardIdx] = useState(0);
  /*
   * 逐包演出。
   *
   * 整筆購買是一疊連續的牌（買十包＝一百張），但**每一包都要有自己的收尾**——
   * 真實卡包就是每包最後一張才是壓軸。先前把整筆當成一疊，只有第一百張吃得到
   * 特效，中間九包全是平的；SKIP 也只跳到最後一包，所以看起來像是
   * 「第 91 張才開始有特效」。
   */
  const packSize = Math.max(1, cardsPerPack);
  /*
   * 「這張是不是某一包的壓軸」。買 3 包 × 10 張 → index 9 / 19 / 29 都算。
   * 光環、火花、閃電、醞釀音、浮動待點擊全部吃這個判定，
   * SKIP 的落點與自動翻牌的例外也都以它為準，只留這一份定義。
   */
  const isPackLast = (idx) => (idx + 1) % packSize === 0 || idx === cards.length - 1;
  /** 從 idx 往後數，本包的壓軸在哪一張（已經是壓軸就回自己） */
  const packLastOf = (idx) =>
    Math.min(cards.length - 1, (Math.floor(idx / packSize) + 1) * packSize - 1);
  /*
   * 逐包收尾只在「卡包模式」成立（每包 ≥ 2 張）。
   * 單抽模式 packSize 是 1，那時每一張都會被 isPackLast 判成壓軸 ——
   * 若照卡包規則辦，買五張單抽就變成每張都要點一下才翻，太黏。
   */
  const packCeremony = packSize >= 2;
  /** 這張要不要停下來等玩家點（不自動翻）：整筆最後一張永遠要，其餘看是不是卡包壓軸 */
  const waitsForTap = (idx) => idx === cards.length - 1 || (packCeremony && isPackLast(idx));
  const tierAt = (idx) =>
    Array.isArray(prizeTiersProp)
      ? prizeTiersProp[Math.floor(idx / packSize)] || "blue"
      : prizeTierProp;
  const prizeTier = tierAt(cardIdx); // blue稀有 / purple史詩
  const [dealt, setDealt] = useState(false);   // 發牌完成
  const [dealing, setDealing] = useState(false); // 發牌動畫進行中（才用階梯延遲）
  const [settled, setSettled] = useState(true);  // 新頂牌是否已從堆疊位滑到頂位
  const [flipped, setFlipped] = useState(false); // 最上張已翻正面
  const [auraOn, setAuraOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [cfg, setCfg] = useState(PARAM_DEFAULTS);
  useEffect(() => {
    createClient()
      .from('machine_theme_params')
      .select('params')
      .eq('theme', 'card_peel')
      .maybeSingle()
      .then(({ data }) => setCfg({ ...PARAM_DEFAULTS, ...(data?.params ?? {}) }), () => {});
  }, []);

  const sfx = useSfx(sound, cfg.sfxVolume);
  const packRef = useRef(null);
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const peel = useRef({ on: false, lastX: 0, sinceSpark: 0 });
  /* 發牌階段「點卡片以外的空白處」＝快進本包，見 onStageDown／onStageUp */
  const stageTap = useRef({ on: false, sx: 0, sy: 0 });
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const progRef = useRef(progress); progRef.current = progress;
  const timers = useRef([]);
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const [dims, setDims] = useState({ w: 300, h: 510 });

  useEffect(() => {
    /*
     * 卡包尺寸（老闆 2026-08-29 指定跟輪播統一比例）
     *
     * 原本是寫死的 `h = w * 1.7`，跟輪播的 62×116（1:1.871）對不起來 ——
     * 同一張圖在輪播被裁切、在這裡被縱向拉伸，兩邊長得不一樣。改吃 packSpec。
     *
     * 第三個上限是這次一起加的：比例從 1.7 換成 1.871，同樣寬度下卡包**高了 10%**
     * （300 寬時 510 → 561）。高螢幕吃不到這條，矮螢幕才會生效，
     * 免得卡包把底下那行「左右滑動撕開」擠出畫面。
     */
    const w = Math.min(
      300,
      window.innerWidth * 0.72,
      (window.innerHeight * 0.70) / PACK_RATIO,
    );
    setDims({ w, h: w * PACK_RATIO });
  }, []);

  /* 火花粒子 */
  useEffect(() => {
    let raf;
    const loop = () => {
      const cv = canvasRef.current;
      if (cv) {
        const c = cv.getContext("2d");
        c.clearRect(0, 0, cv.width, cv.height);
        particles.current = particles.current.filter(p => p.life > 0);
        for (const p of particles.current) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 0.03;
          c.globalAlpha = Math.max(p.life, 0);
          c.fillStyle = p.col;
          c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
        }
        c.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const emitSparks = (x, y, n, cols = ["#ffd54a", "#fff3b0", "#ff9e3d", "#ffffff"]) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      particles.current.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        r: 1 + Math.random() * 2.2, life: 0.6 + Math.random() * 0.5,
        col: cols[(Math.random() * cols.length) | 0],
      });
    }
  };

  const foldPoint = () => {
    const rect = packRef.current?.getBoundingClientRect();
    const stage = document.getElementById("ggb-stage")?.getBoundingClientRect();
    if (!rect || !stage) return null;
    const fx = Math.min(0.95, Math.max(0.04, progRef.current * 1.12)); // 剝離支點
    return {
      x: rect.left - stage.left + rect.width * fx,
      y: rect.top - stage.top + rect.height * STRIP_FRAC * 0.85,
    };
  };

  useEffect(() => { // 撕的過程摺線持續冒火花
    if (phase !== "tearing") return;
    const iv = setInterval(() => {
      if (progRef.current > 0.03 && progRef.current < 1) {
        const fp = foldPoint(); if (fp) emitSparks(fp.x, fp.y, 2);
      }
    }, 150);
    return () => clearInterval(iv);
  }, [phase]); // eslint-disable-line

  /*
   * 卡包躺在畫面上還沒撕開時的等待底噪（參考站的 pack-pre-opening，10 秒循環）。
   * 快速模式是掛載後直接發牌，那段沒有撕包畫面，就不要放。
   */
  useEffect(() => {
    if (phase !== "idle" || skipIntro || !sound) return;
    const a = sfx.current; // 收進區域變數，cleanup 才不會抓到之後的 ref
    a.idleLoop();
    return () => a.stopIdle();
  }, [phase, skipIntro, sound]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 撕開：整個畫面 左滑/右滑 都可以 ---------- */
  const onStageDown = (e) => {
    if (e.target.closest?.("[data-ui]")) return;
    /*
     * 卡牌階段：輕點空白處＝快進本包（老闆 2026-08-27）。
     *
     * SKIP 改成「直接結束整場」之後，原本那套四段式快進要有地方去，
     * 就放在「卡片以外的地方」。**不能連卡片一起吃**：卡片被收掉之後
     * 下一張要 500ms 才自動翻（見 dismissCard），加上 380ms 的飛出動畫，
     * 中間有將近 0.9 秒的空窗；玩家在那裡點下去會被判成「還沒到壓軸」，
     * 直接飛過本包剩下的牌，整包被吃掉。卡片的點擊維持原樣（翻牌／收牌）。
     *
     * 這裡收得到事件就代表點的是空白處 —— 卡片的 onCardDown 會 stopPropagation。
     */
    if (phaseRef.current === "cards") {
      stageTap.current = { on: true, sx: e.clientX, sy: e.clientY };
      return;
    }
    if (phaseRef.current !== "idle" && phaseRef.current !== "tearing") return;
    peel.current = { on: true, lastX: e.clientX, sinceSpark: 0 };
    sfx.current.tear(); // 一段連續的撕包音，撕完在 finishRip 收掉
    if (phaseRef.current === "idle") setPhase("tearing");
  };
  const onStageMove = (e) => {
    const p = peel.current;
    if (!p.on || (phaseRef.current !== "tearing" && phaseRef.current !== "idle")) return;
    const dx = Math.abs(e.clientX - p.lastX);
    p.lastX = e.clientX;
    if (!dx) return;
    p.sinceSpark += dx;
    if (p.sinceSpark > 14) {
      p.sinceSpark = 0;
      const fp = foldPoint();
      if (fp) emitSparks(fp.x, fp.y, 5);
    }
    /*
     * ⚠️ finishRip 不能寫在 setProgress 的 updater 裡。React 嚴格模式（dev 預設開）
     * 會把 updater 呼叫兩次，撕開完成的音效、洗牌、翻牌全部放了兩遍
     * （2026-08-19 換成真實音效後才聽得出來，合成音時只是聽起來厚一點）。
     * 改成自己算好進度、在 updater 外面判斷，另外用 ripped 這道鎖保證只跑一次。
     */
    const np = Math.min(1, progRef.current + dx / (window.innerWidth * PEEL_FACTOR));
    /*
     * 撕開的顆粒感：每前進約 8% 震一下輕的。
     * 真實撕紙是一連串細微的斷裂，不是一下大的 —— 密集短震最接近那個感覺。
     * iOS 沒有「持續震動」API，連續觸覺一律靠這樣堆出來。
     */
    if (Math.floor(np / 0.08) > Math.floor(progRef.current / 0.08)) hapticLight();
    progRef.current = np;
    setProgress(np);
    if (np >= 1) finishRip();
  };
  const onStageUp = (e) => {
    peel.current.on = false;
    const t = stageTap.current;
    if (!t.on) return;
    stageTap.current = { on: false, sx: 0, sy: 0 };
    if (phaseRef.current !== "cards") return;
    if (flying || skipping) return;            // 飛牌途中的點擊不算
    /*
     * 發牌動畫還在跑時不吃點擊。剛撕完包的手指常常還在畫面上補一下，
     * 那一下要是被判成快進，整包就在玩家看清楚之前飛光了。
     * （卡片本身的點擊照舊 —— 那是玩家真的瞄準了才點得到。）
     */
    if (dealing) return;
    // 拖了一段距離就不是「輕點」——玩家可能只是想滑卡片卻沒壓在卡上
    if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 10) return;
    advanceStep();
  };

  const ripped = useRef(false); // 撕開只認第一次（見 onStageMove 的說明）
  const finishRip = () => {
    if (ripped.current) return;
    ripped.current = true;
    hapticMedium();  // 撕開的瞬間
    peel.current.on = false;
    sfx.current.tearDone();
    setFlash(true); later(() => setFlash(false), 400);
    setPhase("ripped");
    for (let i = 0; i < 8; i++) { const fp = foldPoint(); if (fp) emitSparks(fp.x, fp.y, 5); }
    later(startDeal, 780);
  };

  /* ---------- 發牌 → 自動翻第一張 ---------- */
  const startDeal = () => {
    setPhase("cards");
    setCardIdx(0); setFlipped(false); setAuraOn(false); setDealt(false);
    setSettled(true); setDealing(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setDealt(true)));
    sfx.current.shuffle();
    const n = Math.min(cards.length, 8); // 疊太多沒必要全部動畫
    // 發牌：每張跟著音效震一下，牌落到桌上的手感
    for (let i = 0; i < n; i++) later(() => { sfx.current.deal(); hapticLight(); }, i * cfg.dealStagger);
    const dealDone = (n - 1) * cfg.dealStagger + DEAL_DUR;
    later(() => setDealing(false), dealDone);
    // 第一張若本身就是要等玩家點的（只買一張、或每包只有一張）就不自動翻
    later(() => { if (!waitsForTap(0)) flipTop(0); }, dealDone + cfg.flipDelay);
  };

  const flipTop = (idx) => {
    if (phaseRef.current !== "cards") return;
    setFlipped(true);
    sfx.current.stopHype(); // 翻下去的瞬間收掉醞釀音，讓中獎音接手
    sfx.current.flip();
    // 每包的最後一張都要有收尾，不是只有整筆的最後一張
    if (isPackLast(idx)) {
      later(() => {
        setAuraOn(true);
        setFlash(true); later(() => setFlash(false), 450);
        // 用 idx 算等級而不是 prizeTier —— 這支是 callback，
        // 執行時 cardIdx 可能已經前進到下一張了
        const tier = tierAt(idx);
        const T2 = TIERS[tier] || TIERS.blue;
        sfx.current.win(tier);
        const stage = document.getElementById("ggb-stage")?.getBoundingClientRect();
        if (stage) emitSparks(stage.width / 2, stage.height / 2, T2.big ? 60 : 30, T2.spark);
      }, 380);
    }
  };

  /**
   * 把 from ~ target 之間的牌一張張卡背朝上往右飛出去，最後停在 target（老闆 2026-08-19）。
   * 原本是瞬間跳過去，看不出中間發生什麼事。
   *
   * 節奏由後台參數「SKIP 飛牌速度」控制（55ms／張）。
   * 飛出動畫 .14s 比間隔略長，牌才會有殘影般的連續感而不是一格一格跳。
   *
   * **target 一定是某一包的壓軸**，所以落地一律不自動翻 —— 留著給玩家點。
   */
  /**
   * 快速模式的「直衝」：沒有飛牌、沒有音效，直接換成 target 那張的卡背。
   *
   * 老闆 2026-08-23：「現在感覺是加速，不是跳到」。中間那幾張就算飛得再快也是快轉，
   * 按 SKIP 的人要的是「別演了」。計數器直接跳到 10/30，玩家看得出發生了什麼。
   *
   * **落點跟一般 SKIP 完全一樣（本包壓軸）**，只差沒有過場動畫。
   */
  const jumpTo = (target) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setSkipping(false);
    setFlying(null);
    setCardOffset({ x: 0, y: 0 });
    setCardIdx(target);
    setSettled(true);
    setFlipped(false);
  };

  const flyThrough = (from, target) => {
    /*
     * 先把待辦計時器清乾淨。接在 dismissCard 後面呼叫時，它內部那支
     * 「380ms 後換下一張、再 500ms 自動翻」還排著 —— 不清掉的話，
     * 牌都飛到下一包了才突然翻開一張，畫面會亂掉。
     */
    timers.current.forEach(clearTimeout); timers.current = [];
    // 快速模式不飛牌（走 jumpTo），所以節奏只看 skipFlyMs
    const STEP_MS = Math.max(20, Number(cfg.skipFlyMs) || 55);

    setSkipping(true);
    setCardOffset({ x: 0, y: 0 });

    for (let at = from; at < target; at++) {
      const k = at - from;
      later(() => {
        setFlipped(false);            // 一律卡背，不翻正面
        setFlying({ dir: 1 });        // 往右飛
        sfx.current.deal();           // 短音；card-fly 有 1 秒，55ms 一張會糊成一團
        /*
         * 這裡**不震動**（老闆 2026-08-20）。
         * 55ms 一張的節奏下，每張都叫一次 Taptic Engine 會把主執行緒卡住 ——
         * 飛牌動畫直接掉幀，看起來像是「跳過去」而不是「飛出去」。
         * 手感是加分項，動畫看得到才是本體。
         */
      }, k * STEP_MS);
      later(() => {
        setCardIdx(at + 1);
        setFlying(null);
        setSettled(true);
      }, k * STEP_MS + STEP_MS * 0.7);
    }

    later(() => {
      setSkipping(false);
      setFlying(null);
      setCardIdx(target);
      setSettled(true);
      setFlipped(false);
    }, (target - from) * STEP_MS + 140);
  };

  /**
   * 快進一步（四段式，老闆 2026-08-23 改為逐包）。**觸發方式是輕點空白處**，
   * 不是 SKIP —— 2026-08-27 把 SKIP 還給它原本的意思（見 endShow）：
   *   還沒到本包壓軸   → 中間幾張飛掉，停在本包最後一張的卡背（浮起、不翻）
   *   已在壓軸但沒翻   → 翻開它（光環／火花／中獎音照跑）
   *   壓軸翻了、還有下一包 → 收掉這張，接著飛到下一包的壓軸
   *   壓軸翻了、是整筆最後一張 → 收演出，回商品頁跳「恭喜獲得」
   *
   * 落點為什麼是「本包壓軸」而不是舊版的「最後一包開頭」：
   * 舊版 `cards.length - cardsPerPack` 會把前面每一包的壓軸整個吃掉 ——
   * 買 3 包在 1/30 快進直接飛到 21/30，玩家看到的是莫名其妙翻開一張普通牌。
   *
   * 閃電（快速模式）不改落點，只決定中間那幾張要不要演飛牌；
   * 每包壓軸仍然浮起等點擊，加速鍵不吃掉抽獎的爽點。
   */
  const advanceStep = () => {
    if (phaseRef.current !== "cards") return;
    if (skipping) return;           // 飛牌途中不重複觸發，不然會卡在 skipping 狀態
    const lastIdx = cards.length - 1;
    timers.current.forEach(clearTimeout); timers.current = [];
    /*
     * 發牌動畫還沒跑完就按 SKIP 的話，上面那行會把「發牌結束」的計時器一起清掉，
     * dealing 會永遠停在 true（階梯延遲不收）。這裡直接把發牌狀態收尾。
     */
    setDealing(false); setDealt(true);

    /*
     * 落點永遠是「本包壓軸」—— 閃電**不改落點**，只決定中間那幾張要不要演。
     * 買 3 包就是 10/30 → 20/30 → 30/30，每一包的壓軸玩家都看得到。
     */
    const targetOf = (from) => (packCeremony ? packLastOf(from) : lastIdx);
    const advance = (from, target) => {
      if (fastRef.current) jumpTo(target); else flyThrough(from, target);
    };
    const target = targetOf(cardIdx);

    if (cardIdx < target) { advance(cardIdx, target); return; }

    // 已經站在落點（本包壓軸）上
    if (!flipped) { flipTop(cardIdx); return; }
    if (cardIdx >= lastIdx) {           // 整筆看完了
      setAuraOn(false);
      if (onFinish) onFinish();
      return;
    }
    /*
     * 壓軸已經看過 → 就只是收掉它，跟用手滑掉一模一樣：下一張（也就是**下一包的
     * 第一張**）照常自動翻開。
     *
     * ⚠️ 這裡曾經「順便再飛到下一包的壓軸」當作省按鍵的優化，結果是
     * 10/30 翻開後按 SKIP 直接變 20/30 —— 整個第二包被吃掉，計數器的包數跟著亂跳，
     * 翻牌互動也接不上（老闆 2026-08-23）。SKIP 一次只做一件事。
     */
    dismissCard(1);
  };

  /**
   * SKIP＝直接結束整場（老闆 2026-08-27）。
   *
   * 舊的 SKIP 是「快進一步」，名實不符 —— 全世界的 SKIP 都是「別演了，直接給結果」，
   * 玩家按下去期待結束卻只前進一步。快進那套沒有消失，改成輕點空白處觸發。
   *
   * 不做二次確認：抽到什麼本來就全在商品頁的「恭喜獲得」彈窗裡，
   * 這裡不會吃掉任何玩家看不到的東西，攔一層只是多一次點擊。
   */
  const endShow = () => {
    if (phaseRef.current === "done") return;
    timers.current.forEach(clearTimeout); timers.current = [];
    setSkipping(false); setFlying(null); setAuraOn(false);
    // 醞釀音是 28 秒的 loop，不收會一路拖到彈窗上（卸載的 cleanup 慢一拍）
    sfx.current.stopAll();
    if (onFinish) onFinish(); else setPhase("done");
  };

  /*
   * 閃電（略過撕包）：掛載後直接進發牌，不演撕封條那段。
   * 放在 startDeal 定義之後才不會踩到 TDZ；只跑一次，之後的階段照常。
   */
  useEffect(() => {
    if (!skipIntro) return;
    const t = setTimeout(() => { if (phaseRef.current === "idle") startDeal(); }, 60);
    return () => clearTimeout(t);
  }, [skipIntro]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 卡牌滑掉 / 點擊 ---------- */
  const cardDrag = useRef({ on: false, sx: 0, sy: 0, dx: 0, dy: 0, t: 0 });
  const [cardOffset, setCardOffset] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 }); // 翻開後 3D 傾斜
  const [flying, setFlying] = useState(null);
  const [skipping, setSkipping] = useState(false);
  // 每一包的最後一張都是壓軸（最末張同時也是整筆的結束）
  const isLast = isPackLast(cardIdx);
  // 計數器用：現在在第幾包／共幾包（買多包時「最後一張」要指明是哪一包的）
  const packNo = Math.floor(cardIdx / packSize) + 1;
  const packTotal = Math.ceil(cards.length / packSize);

  /* 紫/金等級：最後一張卡背周圍閃電電弧（參考站紫光閃電，隨機劈啪） */
  /*
   * 閃電只在「最後一張、還沒翻、已發完牌」時跑 —— 那是翻牌前的醞釀，
   * 打在卡背周圍（沿用原型的時機，也就是老闆參考圖的樣子）。
   * 紫色大賞才有；藍色是一般等級，只留柔光不打閃。
   */
  const boltsOn = phase === "cards" && isLast && !flipped && dealt && prizeTier === "purple";
  /*
   * 大賞醞釀音（參考站的 card-anticipate，28 秒的循環底噪）：
   * 最後一張還沒翻、而且是紫／金等級才鋪 —— 藍色是一般等級，鋪這麼滿反而不稀奇。
   * 條件比 boltsOn 寬一級（金也要），所以另外算一份。
   */
  const hypeOn = phase === "cards" && isLast && !flipped && dealt
    && (TIERS[prizeTier] || TIERS.blue).big;

  /*
   * 卡背醞釀期的間隔震動（老闆 2026-08-19）。
   *
   * 藍與紫**都要**，但要分得出來 —— 紫比較密、比較重（450ms / MEDIUM），
   * 藍是輕微的心跳感（760ms / LIGHT）。玩家把手機拿在手上、眼睛盯著卡背時，
   * 光靠震動的節奏就知道這張大不大。
   *
   * 不用更密的間隔：iOS 的 Taptic 有速率上限，灌太快會被系統丟掉反而變沒感覺；
   * 而且太密會從「心跳」變成「嗡嗡聲」，緊張感消失。
   */
  const anticipateOn = phase === "cards" && isLast && !flipped && dealt;
  useEffect(() => {
    if (!anticipateOn) return;
    const purple = prizeTier === "purple";
    const every = purple ? 450 : 760;
    const beat = () => (purple ? hapticMedium() : hapticLight());
    beat();                                   // 卡背停穩就先來一下
    const id = setInterval(beat, every);
    return () => clearInterval(id);
  }, [anticipateOn, prizeTier]);
  useEffect(() => {
    if (!hypeOn || !sound) return;
    const a = sfx.current; // 同上
    a.hype();
    return () => a.stopHype();
  }, [hypeOn, sound]); // eslint-disable-line

  const onCardDown = (e) => {
    if (phase !== "cards" || flying || !dealt) return;
    e.stopPropagation();
    cardDrag.current = { on: true, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, t: Date.now() };
  };
  const onCardMove = (e) => {
    if (flipped && !flying) { // 滑過或拖曳都感應 3D 傾斜
      const r = e.currentTarget.getBoundingClientRect();
      setTilt({
        x: ((e.clientY - r.top) / r.height - 0.5) * -14,
        y: ((e.clientX - r.left) / r.width - 0.5) * 14,
      });
    }
    const d = cardDrag.current; if (!d.on) return;
    d.dx = e.clientX - d.sx; d.dy = e.clientY - d.sy;
    if (flipped) setCardOffset({ x: d.dx, y: d.dy });
  };
  const dismissCard = (dir) => {
    setTilt({ x: 0, y: 0 });
    setFlying({ dir });
    sfx.current.fly();
    later(() => {
      setFlying(null);
      setCardOffset({ x: 0, y: 0 });
      if (cardIdx >= cards.length - 1) {
        setAuraOn(false);
        if (onFinish) onFinish(); else setPhase("done");
      }
      else {
        const next = cardIdx + 1;
        setCardIdx(next);
        setFlipped(false);
        setSettled(false); // 新頂牌先停在堆疊位（較小較暗）
        requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true))); // 平滑升上頂位
        /*
         * 每包的壓軸都改成「點擊才翻」（老闆 2026-08-23）。
         * 先前只放過整筆最後一張，所以 10/30、20/30 雖然浮起來、有光環電弧，
         * 卻在 500ms 後被自動翻掉 —— 玩家根本來不及點，逐包的壓軸感等於沒有。
         */
        if (!waitsForTap(next)) later(() => flipTop(next), 500);
      }
    }, 380);
  };
  const onCardUp = () => {
    const d = cardDrag.current; if (!d.on) return;
    d.on = false;
    if (!flipped) { flipTop(cardIdx); return; } // 還沒翻 → 點一下先翻牌
    const dist = Math.hypot(d.dx, d.dy);
    const v = dist / Math.max(1, Date.now() - d.t);
    if (dist > 90 || v > 0.6) dismissCard(d.dx >= 0 ? 1 : -1);
    else if (dist < 8) dismissCard(1);
    else setCardOffset({ x: 0, y: 0 });
  };

  const reset = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    ripped.current = false;
    setPhase("idle"); setProgress(0); setCardIdx(0);
    setDealt(false); setFlipped(false); setAuraOn(false);
    peel.current = { on: false, lastX: 0, sinceSpark: 0 };
  };

  // （原型的 ⚙️ 上傳換圖已移除：線上素材來自商品資料）

  const { w, h } = dims;
  const stripH = h * STRIP_FRAC;
  const p = progress;
  const T = TIERS[prizeTier] || TIERS.blue;
  const glowOn = phase === "tearing" && p > 0.02;
  const BASE_TILT = -6; // 卡堆基本傾斜
  const STACK_Y = -30;  // 未翻開的卡堆整體上移

  /* ---------- 封條 canvas：逐像素欄位彎曲的連續曲面（不會一條一條） ---------- */
  const stripCanvasRef = useRef(null);
  const stripSrcRef = useRef(null);
  const drawStrip = () => {
    const cv = stripCanvasRef.current, src = stripSrcRef.current;
    if (!cv || !src || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round((w + STRIP_PAD_X + STRIP_PAD_RIGHT) * dpr);
    const ch = Math.round((stripH + STRIP_PAD_TOP + 8) * dpr);
    if (cv.width !== cw) { cv.width = cw; cv.height = ch; }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w + STRIP_PAD_X + STRIP_PAD_RIGHT, stripH + STRIP_PAD_TOP + 8);
    const front = Math.min(1, p * 1.12);   // 剝離支點
    const fx = front * w;
    const sx = src.width / w;
    // 1) 支點右邊：還貼著的封條，原樣平貼
    if (fx < w - 0.5) {
      g.drawImage(src, fx * sx, 0, (w - fx) * sx, src.height,
        STRIP_PAD_X + fx, STRIP_PAD_TOP, w - fx, stripH);
    }
    /*
     * 2) 支點左邊：已撕開的封條，捲成一捲 —— **用 3D 投影畫，不是在畫面平面上畫弧**。
     *
     * 撕的方向是水平的，所以撕裂前緣是一條垂直線，膜會繞著**垂直軸**往回捲。
     * 先前照原型在 XY 平面上掃一條大弧，出來就是一個平平的「C」往上翹，
     * 沒有空間感（老闆 2026-08-19：「怎麼會是往上彎曲，這樣好醜」）。
     *
     * 正確的做法是把它當成貼在圓柱上的帶子：
     *   弧長 s → 轉角 θ = s/R（膜以大致固定的半徑捲）
     *   3D 位置 X = 支點 - R·sinθ（往左繞回來）、Z = R·(1-cosθ)（捲向鏡頭）
     *   透視投影 scale = F/(F-Z)：捲到面前的那段會變大、繞到後面的變小
     * 於是自然得到三件平面畫法給不了的東西：
     *   ① 橫向壓縮 —— θ=90° 時帶子正對側面，投影寬度趨近 0
     *   ② 自我遮擋 —— 依 Z 由遠而近排序後畫，捲到前面的段落自然蓋住後面的
     *   ③ 正反面 —— cosθ<0 時看到的是膜的**背面**，鋪一層白讓它像銀色內裡
     */
    if (fx > 0.5) {
      const R = Math.max(12, Number(cfg.peelCurl) || 45);
      const F = 900;                                    // 透視焦距，越小越誇張
      const px = STRIP_PAD_X + fx;                      // 支點（撕裂前緣）
      const yMid = STRIP_PAD_TOP + stripH * 0.5;
      const COLS = Math.max(20, Math.min(110, Math.floor(fx / 2)));
      const step = fx / COLS;
      // 沿弧長取角度：支點附近先平貼（跟未撕段接得上），越往自由端捲得越快
      const ang = (sArc) => (sArc / R) * Math.sqrt(Math.min(1, sArc / fx));
      const proj = (sArc) => {
        const th = ang(sArc);
        const Z = R * (1 - Math.cos(th));
        const sc = F / (F - Z);
        return {
          th, sc,
          x: px + (px - R * Math.sin(th) - px) * sc,
          // 只抬一點點：這捲東西是貼著撕裂線往鏡頭捲，不是飄在包上方
          y: yMid - R * 0.14 * (1 - Math.cos(th)) * sc,
        };
      };
      const slices = [];
      for (let i = 0; i < COLS; i++) {
        const a = proj(i * step), b = proj((i + 1) * step);
        const mid = proj((i + 0.5) * step);
        slices.push({ i, a, b, mid, z: R * (1 - Math.cos(mid.th)) });
      }
      // 由遠而近畫 —— 這一步才有自我遮擋，少了它捲到面前的段落會被後面的蓋掉
      slices.sort((u, v) => u.z - v.z);
      for (const sl of slices) {
        const { i, a, b, mid } = sl;
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        const wdt = Math.max(1.1, x1 - x0 + 1.1);
        const hgt = stripH * mid.sc;
        const yTop = mid.y - hgt / 2;
        const facing = Math.cos(mid.th);                // >0 印刷面朝我們，<0 看到背面
        const srcX0 = (fx - (i + 1) * step) * sx, srcW = Math.max(1, step * sx);
        g.save();
        g.drawImage(src, srcX0, 0, srcW, src.height, x0, yTop, wdt, hgt);
        if (facing < 0) {                               // 背面：銀色內裡
          g.fillStyle = `rgba(246,248,255,${(0.42 - 0.3 * facing).toFixed(3)})`;
          g.fillRect(x0, yTop, wdt, hgt);
        } else {                                        // 正面：受光的反光
          g.fillStyle = `rgba(255,255,255,${(0.26 * (1 - facing)).toFixed(3)})`;
          g.fillRect(x0, yTop, wdt, hgt);
        }
        // 轉到側面時壓暗，圓柱感才出得來
        const shade = 0.34 * Math.max(0, 1 - Math.abs(facing) * 1.15);
        if (shade > 0.01) { g.fillStyle = `rgba(24,20,40,${shade.toFixed(3)})`; g.fillRect(x0, yTop, wdt, hgt); }
        g.fillStyle = `rgba(255,236,150,${(0.6 * Math.min(1, mid.th / 1.2)).toFixed(3)})`; // 撕口亮邊
        g.fillRect(x0, yTop + hgt - 1.4 * mid.sc, wdt, 1.4 * mid.sc);
        g.restore();
      }
    }
    // 膠囊釦：水平置中在支點上、垂直坐在撕裂線高度
    const capW = 34, capH = 13, capR = 6.5;
    const capX = STRIP_PAD_X + Math.min(w - capW - 6, Math.max(6, front * w - capW / 2));
    const capY = STRIP_PAD_TOP + stripH - capH * 0.55;
    g.beginPath();
    g.moveTo(capX + capR, capY);
    g.lineTo(capX + capW - capR, capY);
    g.arc(capX + capW - capR, capY + capR, capR, -1.5708, 1.5708);
    g.lineTo(capX + capR, capY + capH);
    g.arc(capX + capR, capY + capR, capR, 1.5708, 4.7124);
    g.closePath();
    g.fillStyle = "#f2f5fb"; g.fill();
    g.strokeStyle = "#aab3c6"; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = "#8a93a8";
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(capX + capW / 2 + (i - 1) * 7, capY + capH / 2, 1.8, 0, 7);
      g.fill();
    }
  };
  useEffect(() => { // 合成封條底圖（卡包上緣 + 銀色壓紋）
    if (!w) return;
    let alive = true;
    const load = (u2) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u2;
    });
    /* 封條壓紋（SEAL_URL）預設不畫 —— 老闆 2026-08-29：「很像塑膠套」。
       關掉之後上緣就只是卡包自己那 7% 的圖，撕的動作、摩擦火花、捲曲都不變；
       「這裡是封口」的暗示改由膠囊釦（下面 drawStrip 畫的那顆三點小片）承擔。
       後台「抽獎模組設定 → 撕開封口 → 開包節奏 → 封條壓紋」可以開回來。 */
    Promise.all([load(packImg), cfg.sealTexture ? load(SEAL_URL) : Promise.resolve(null)]).then(([pk, seal]) => {
      if (!alive) return;
      const c = document.createElement("canvas");
      c.width = Math.round(w * 2); c.height = Math.round(stripH * 2);
      const g = c.getContext("2d");
      const r = 20; // 圓角上緣
      g.beginPath();
      g.moveTo(0, c.height); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
      g.lineTo(c.width - r, 0); g.quadraticCurveTo(c.width, 0, c.width, r);
      g.lineTo(c.width, c.height); g.closePath(); g.clip();
      g.drawImage(pk, 0, 0, pk.width, pk.height * STRIP_FRAC, 0, 0, c.width, c.height);
      if (seal) { g.globalAlpha = 0.9; g.drawImage(seal, 0, 0, c.width, c.height); g.globalAlpha = 1; }
      stripSrcRef.current = c;
      drawStrip();
    }).catch(() => {});
    return () => { alive = false; };
  }, [packImg, dims, cfg.sealTexture]); // eslint-disable-line
  useEffect(() => { drawStrip(); }); // progress 變動時重繪

  /*
   * 最上張卡的外層位移／動畫抽成變數 —— 特效影片要「跟著卡片飄動與傾斜」
   * （老闆 2026-08-19），所以影片層直接套同一組 transform 與同名 keyframes，
   * 而不是各寫一份。寫兩份的話卡片改位置、特效就會脫節。
   */
  const cardTransform = flying
    ? `translate(${flying.dir * 130}vw, ${cardOffset.y - 80}px) rotate(${flying.dir * 35}deg)`
    : !dealt
      ? `translateY(120vh) rotate(${BASE_TILT}deg)`
      : !settled
        ? `translateY(${STACK_Y + 26}px) rotate(${BASE_TILT + 2.5}deg) scale(.95)` // 從堆疊位起步
        : flipped
          ? isLast
            ? `translate(${cardOffset.x}px, ${cardOffset.y + 12}px) rotate(${(cardOffset.x * 0.05).toFixed(2)}deg) scale(1.05)` // 最後一張：畫面正中間
            : `translate(${cardOffset.x - 34}px, ${cardOffset.y}px) rotate(${BASE_TILT - 3 + cardOffset.x * 0.06}deg)`
          : `translate(${cardOffset.x}px, ${cardOffset.y + STACK_Y}px) rotate(${BASE_TILT + cardOffset.x * 0.06}deg)`;
  const cardTransition = flying
    ? (skipping ? "transform .14s ease-in" : "transform .38s ease-in")
    : cardDrag.current.on
      ? "none"
      : !dealt
        ? `transform ${DEAL_DUR}ms cubic-bezier(.2,.9,.3,1) 0ms`
        : !settled
          ? "none"
          : "transform .35s ease, filter .35s ease";
  // 待翻的最後一張才飄／才傾斜（翻開後傾斜改由指標控制）
  const cardIdle = isLast && !flipped && dealt && settled;
  const floatAnim = cardIdle ? "ggbFloatCard 3.2s ease-in-out infinite" : "none";
  const tiltAnim = cardIdle ? "ggbTilt3d 4.6s ease-in-out infinite" : "none";
  const tiltTransform = flipped ? `rotateX(${tilt.x.toFixed(1)}deg) rotateY(${tilt.y.toFixed(1)}deg)` : "none";

  return (
    <div id="ggb-stage" style={S.stage}
      onPointerDown={onStageDown} onPointerMove={onStageMove}
      onPointerUp={onStageUp} onPointerCancel={onStageUp}>
      <style>{CSS_KEYFRAMES}</style>

      {/* 背景流星（老闆 2026-08-29）。z-0 壓在所有演出元素底下 —— 這頁的內容
          最低是 z-2，所以它永遠在最後面；canvas 本身是透明的，S.stage 的暗紫
          放射漸層照樣透出來。
          **沒有動到原型的任何一行**：純粹在最底下多鋪一層，撕包、發牌、翻牌的
          邏輯與版面都不知道它存在。
          參數在後台「抽獎模組設定 → 撕開封口 → 背景流星」，跟這個模組其他
          參數同一套。 */}
      {cfg.starOn !== false && (
        <StarWarpField
          className="z-0"
          particleCount={cfg.starCount}
          speed={cfg.starSpeed}
          starSize={cfg.starSize}
          trailAmount={cfg.starTrail}
          brightness={cfg.starBrightness}
        />
      )}

      <canvas ref={canvasRef} width={typeof window !== "undefined" ? window.innerWidth : 400}
        height={typeof window !== "undefined" ? window.innerHeight : 800} style={S.canvas} />
      {flash && <div style={{ ...S.flash, background: phase === "cards" ? T.glow : "#ffedb0" }} />}

      {/* 頂欄 */}
      {/* 標題與關閉鈕移除（老闆指定）：全畫面演出不需要品名，關閉走演出自己的收尾流程。
          靜音改用站上共用的 SoundToggle，跟盒玩商品頁同一顆 */}
      <div data-ui>
        {/* safeTop：這層 stage 是 fixed inset-0 的滿版演出，y=0 是螢幕實體頂邊，
            不疊安全區鈕會塞進動態島（老闆 2026-08-22 截圖） */}
        <SoundToggle className="absolute top-3 right-3 z-[60]" safeTop />
        {/* 閃電（快速模式）：左上角，與右上角的靜音鈕左右對稱。
            造型直接沿用 SoundToggle 匯出的 RAISED_STYLE／RAISED_STYLE_GOLD ——
            關閉時跟靜音鈕一模一樣，開啟時整顆轉金，與商品頁那顆同一份樣式。
            每包只有一張時快進本來就直達最後，這顆沒有意義，不顯示。 */}
        {phase === "cards" && packCeremony && (
          <button
            type="button"
            onClick={toggleFast}
            aria-pressed={fastOn}
            aria-label={fastOn ? "關閉快速模式" : "開啟快速模式"}
            title={fastOn ? "快速模式：開（略過撕包，快進不演飛牌）" : "快速模式：關（撕包照演，快進逐張飛出）"}
            className="pointer-events-auto absolute top-3 left-3 z-[60] w-[38px] h-[38px] rounded-full flex items-center justify-center transition-all active:scale-95 active:translate-y-[1px]"
            style={{
              ...(fastOn ? RAISED_STYLE_GOLD : RAISED_STYLE),
              color: fastOn ? "#4a3200" : "#fff",
              marginTop: "env(safe-area-inset-top)",
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden
                 className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
              <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
            </svg>
          </button>
        )}
      </div>

      {/* ---------- 卡包（弧形掀封條） ---------- */}
      {(phase === "idle" || phase === "tearing" || phase === "ripped") && (
        <div style={{
          ...S.packWrap,
          animation: phase === "idle" && p === 0
            ? "ggbBob 3s ease-in-out infinite"
            : phase === "tearing" && p < 1 ? "ggbJitter .22s linear infinite" : "none",
        }}>
          <div ref={packRef} style={{
            position: "relative", width: w, height: h,
            touchAction: "none",
            // 被撕的力道帶歪：3D 傾斜 + 微轉
            transform: `perspective(1100px) rotateY(${(p * 9).toFixed(1)}deg) rotate(${(-p * 8).toFixed(1)}deg)`,
            transition: peel.current.on ? "none" : "transform .3s ease",
            filter: "drop-shadow(0 26px 34px rgba(0,0,0,.5))",
          }}>
            <div style={{
              position: "absolute", inset: 0, zIndex: 2,
              backgroundImage: `url("${packImg}")`, backgroundSize: `${w}px ${h}px`,
              clipPath: `inset(${stripH}px 0 0 0)`,
              borderRadius: 10,
              transform: phase === "ripped" ? "translateY(70%) scale(.9)" : "none",
              opacity: phase === "ripped" ? 0 : 1,
              transition: "transform .55s ease-in .25s, opacity .5s ease-in .3s",
            }} />
            {/* 封條：canvas 連續曲面 */}
            <div style={{
              position: "absolute", left: 0, top: 0, width: w, height: stripH, zIndex: 3,
              pointerEvents: "none",
              filter: "drop-shadow(0 3px 5px rgba(0,0,0,.22))",
              transform: phase === "ripped" ? "translate(260px,-420px) rotate(22deg)" : "none",
              opacity: phase === "ripped" ? 0 : 1,
              transition: phase === "ripped" ? "transform .6s cubic-bezier(.3,.7,.4,1), opacity .5s ease .08s" : "none",
            }}>
              <canvas ref={stripCanvasRef} style={{
                position: "absolute",
                left: -STRIP_PAD_X, top: -STRIP_PAD_TOP,
                width: w + STRIP_PAD_X + STRIP_PAD_RIGHT, height: stripH + STRIP_PAD_TOP + 8,
              }} />
            </div>

            {/* 剝離線漏光：只亮在已撕開的範圍；爆閃光源＝支點，跟著進度滾動 */}
            <div style={{
              position: "absolute", left: 0, top: stripH - 5, height: 10,
              width: Math.min(1, p * 1.12) * w,
              zIndex: 4, pointerEvents: "none",
              /* 亮黃光（老闆 2026-08-29）：原本右端是純白（#fff9 → #ffffff），
                 撕到一半整條像日光燈管。改用模組本來就在用的金色系 ——
                 #ffd54a 金、#ffe98a 淺金、#fff3b0 淡金，跟傳說光環、火花同一組色票。 */
              background: "linear-gradient(90deg,#ffd54a22,#ffe98a,#fff3b0)",
              filter: "blur(3px)",
              opacity: glowOn ? Math.min(1, p * 2.2) : 0,
              transition: "opacity .15s",
            }} />
            <div style={{
              position: "absolute", top: stripH - 46, width: 110, height: 90,
              left: Math.min(0.95, Math.max(0.04, p * 1.12)) * w - 55,
              zIndex: 4, pointerEvents: "none", borderRadius: "50%",
              /* 光源核心同樣從純白換成淡金，不然光帶黃了、中間那球還是白的 */
              background: "radial-gradient(circle,#fff3b0,#ffd54a88 40%,#ffd54a00 70%)",
              filter: "blur(4px)",
              transform: `scale(${0.7 + p * 0.5})`,
              opacity: glowOn ? Math.min(1, 0.35 + p * 1.6) : 0,
              transition: "opacity .15s",
            }} />
          </div>

          {phase !== "ripped" && (
            <div style={S.hint}>
              {p === 0 ? "左右滑動撕開" : `${Math.round(p * 100)}%`}
            </div>
          )}
        </div>
      )}

      {/* ---------- 卡牌堆：背面發牌 → 翻牌 ---------- */}
      {phase === "cards" && (
        <div style={S.cardArea}>
          {/*
            卡牌後方的漩渦（老闆給的 vortex.mp4）。
            素材是 yuv420p 黑底、**沒有 alpha 通道**，靠 mix-blend-mode: screen 把黑色透掉。

            ⚠️ screen 只跟「同一個堆疊環境裡、畫在它下面」的東西混合。原本 S.cardArea 帶著
            z-index 自成一個堆疊環境，影片底下什麼都沒有，黑底就原封不動變成一個黑方塊
            （老闆 2026-08-19 截圖）。所以 cardArea 的 z-index 已拿掉，讓影片混到舞台底色。
            另外混合模式掛在**最外層**而不是 <video> 上：外層有 transform／z-index 會自成
            堆疊環境，掛在裡面的話一樣被隔離。

            三層結構完全複製卡片本體（外層位移 → 飄動 → 傾斜），特效才會跟著卡片一起晃。
            紫色大賞才放；藍色維持柔光就好，不然每包都在放特效反而不稀奇。
          */}
          {prizeTier === "purple" && isLast && dealt && settled && (
            <div style={{
              ...S.fxLayer, zIndex: 4,
              transform: cardTransform, transition: cardTransition, opacity: cfg.fxOpacity,
            }}>
              <div style={{ ...S.fxSpin, animation: floatAnim }}>
                <div style={{ ...S.fxSpin, animation: tiltAnim, transform: tiltTransform }}>
                  <video
                    src="/images/card/light/vortex.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      ...S.fxVideo,
                      height: `${cfg.vortexScale}%`,
                      transform: `translate(-50%, calc(-50% + ${cfg.vortexOffsetY}px))`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {auraOn && isLast && flipped && !flying && (
            /* 原本這裡還有一圈 conic-gradient 放射光，跟漩渦影片疊起來又亂又髒，
               改成只留柔光讓影片當主角。

               ⚠️ 這層柔光**必須跟著 cardTransform 走**，跟漩渦／電弧影片同一套做法。
               先前它釘死在 cardArea 的中心：玩家一把卡片拖開，柔光就原地留下一塊
               卡片形狀的亮框，看起來像背景有塊陰影（老闆 2026-08-23 截圖兩次）。
               只擋 `flying` 不夠 —— 拖曳中根本還沒開始飛。 */
            <div style={{
              position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none",
              transform: cardTransform, transition: cardTransition,
            }}>
              <div style={{ ...S.auraGlow, boxShadow: `0 0 90px 30px ${T.glow}66` }} />
            </div>
          )}

          {/* 底下的牌（卡背，往下露出、扇形微轉） */}
          {cards.slice(cardIdx + 1, cardIdx + 4).map((_, j) => {
            const k = j + 1;
            return (
              <div key={cardIdx + k} style={{
                ...S.card, backgroundImage: `url("${cardBack}")`,
                zIndex: 10 - j,
                transform: dealt
                  ? `rotate(${BASE_TILT + k * 2.5}deg) translateY(${STACK_Y + k * 26}px) scale(${1 - k * 0.05})`
                  : `translateY(120vh) rotate(${BASE_TILT}deg)`,
                transition: dealing
                  ? `transform ${DEAL_DUR}ms cubic-bezier(.2,.9,.3,1) ${(k) * DEAL_STAGGER}ms`
                  : "transform .35s ease",
                filter: "brightness(.82)",
                boxShadow: "0 10px 30px #0008",
              }} />
            );
          })}

          {/* 大賞的能量特效（老闆給的 energy.mp4，取代原本九格 SVG 輪播）。
              同樣是黑底無 alpha、同樣三層跟著卡片動，只差 z-index 比卡片高，
              電弧才會繞在卡片前面。大小／高度由後台的能量特效參數控制。 */}
          {boltsOn && settled && (
            <div style={{
              ...S.fxLayer, zIndex: 26,
              transform: cardTransform, transition: cardTransition, opacity: cfg.fxOpacity,
            }}>
              <div style={{ ...S.fxSpin, animation: floatAnim }}>
                <div style={{ ...S.fxSpin, animation: tiltAnim, transform: tiltTransform }}>
                  <video
                    src="/images/card/light/energy.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      ...S.fxVideo,
                      height: `${cfg.energyScale}%`,
                      transform: `translate(-50%, calc(-50% + ${cfg.energyOffsetY}px))`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 最上張：3D 翻牌（背 → 正）— key 讓撥掉的牌不會飛回來 */}
          <div key={cardIdx} style={{
            position: "absolute", inset: 0, zIndex: 20,
            perspective: 1100, touchAction: "none",
            cursor: dealt ? "grab" : "default",
            transform: cardTransform,
            filter: dealt && !settled ? "brightness(.82)" : "none",
            transition: cardTransition,
          }}
            onPointerDown={onCardDown} onPointerMove={onCardMove}
            onPointerUp={onCardUp} onPointerCancel={onCardUp}
            onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
            {/* 飄動層：最後一張待翻時緩緩浮動 */}
            <div style={{
              position: "absolute", inset: 0, transformStyle: "preserve-3d",
              animation: floatAnim,
            }}>
            {/* 3D 傾斜層：滑鼠 / 拖曳感應 */}
            <div style={{
              position: "absolute", inset: 0, transformStyle: "preserve-3d",
              transform: tiltTransform,
              // 待翻的最後一張也緩緩傾斜 —— 只有上下飄不夠立體（老闆 2026-08-19）
              animation: tiltAnim,
              transition: "transform .15s ease",
            }}>
            <div style={{
              position: "absolute", inset: 0,
              transformStyle: "preserve-3d",
              transform: `rotateY(${flipped ? -180 : 0}deg)`, // 從左水平旋轉 180°
              transition: "transform .6s cubic-bezier(.35,.1,.25,1)",
            }}>
              {/* 背面 */}
              <div style={{
                ...S.face, backgroundImage: `url("${cardBack}")`,
                boxShadow: isLast
                  ? `0 0 0 3px ${T.rim}, 0 0 ${T.big ? 34 : 24}px ${T.glow}, 0 0 ${T.big ? 100 : 70}px ${T.glow}${T.big ? "88" : "66"}, 0 18px 50px #000a`
                  : "0 18px 50px #000a",
                animation: isLast && !flipped ? "ggbRimPulse 1.6s ease-in-out infinite" : "none",
              }} />
              {/* 正面 */}
              <div style={{
                ...S.face, backgroundImage: `url("${cards[cardIdx]}")`,
                transform: "rotateY(180deg)",
                boxShadow: auraOn && isLast
                  ? `0 0 40px ${T.rim}, 0 18px 50px #0009`
                  : "0 18px 50px #000a",
              }} />
            </div>
            </div>
            </div>
          </div>

          {/* 只留數量膠囊（老闆 2026-08-23：「太多文字廢話了」）——
              底下那行操作提示整條移除；「第 N/M 包」只在真的買多包時才出現，
              買一包顯示「第 1/1 包」是廢話。 */}
          <div style={S.counter} data-ui>
            <span style={S.counterChip}>
              {cardIdx + 1} / {cards.length}
              {packTotal > 1 && <span style={{ opacity: .7 }}>{`　第 ${packNo}/${packTotal} 包`}</span>}
            </span>
          </div>
        </div>
      )}

      {/* SKIP：右下角，樣式與一番賞過場影片那顆一致 */}
      {phase === "cards" && (
        <button data-ui onClick={endShow} style={S.skipBtn}>SKIP</button>
      )}

      {/* ---------- 完成 ---------- */}
      {/* 「開封完成」總覽頁移除（老闆指定）：最後一張看完直接回商品頁，
          由商品頁的「恭喜獲得」彈窗收尾，不要兩層結算畫面 */}
    </div>
  );
}

const S = {
  stage: {
    position: "fixed", inset: 0, overflow: "hidden", userSelect: "none", touchAction: "none",
    /* 黑暗紫（老闆 2026-08-27）：原本是亮紫 #5a3fc9，卡片與光效在上面浮不出來。
       壓深之後金／紫的光環、閃電、火花才是畫面上最亮的東西。 */
    background: "radial-gradient(130% 100% at 50% 18%, #2b1a5c 0%, #1d1140 40%, #110828 72%, #070311 100%)",
    fontFamily: "'PingFang TC','Noto Sans TC',sans-serif", color: "#f0edfc",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  canvas: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 },
  flash: { position: "absolute", inset: 0, zIndex: 40, animation: "ggbFlash .45s ease-out forwards", pointerEvents: "none" },
  topbar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 60,
    display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px",
  },
  brand: { fontWeight: 800, fontSize: 15, letterSpacing: 1, color: "#fff" },
  skipBtn: {
    position: "absolute", right: 16, bottom: 16, zIndex: 60,
    height: 40, padding: "0 20px", borderRadius: 8,
    background: "rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.3)",
    color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: "0.25em",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  },
  iconBtn: {
    background: "#ffffff1e", border: "1px solid #ffffff30", borderRadius: 10,
    width: 38, height: 38, fontSize: 17, cursor: "pointer", color: "#fff",
  },
  panel: {
    position: "absolute", top: 62, right: 14, zIndex: 61, background: "#241558f2",
    border: "1px solid #ffffff26", borderRadius: 14, padding: 14,
    display: "flex", flexDirection: "column", gap: 10, backdropFilter: "blur(8px)",
  },
  uplBtn: {
    background: "#3a2790", border: "1px solid #6a55d6", color: "#e4ddff", fontSize: 13,
    borderRadius: 9, padding: "9px 12px", cursor: "pointer", textAlign: "center",
  },
  tierBtn: {
    background: "#ffffff12", border: "1px solid #ffffff26", color: "#b9aee8",
    borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  tierOn: { background: "#4a3a10", borderColor: "#ffd54a", color: "#ffd54a" },
  tierOnB: { background: "#16344a", borderColor: "#6ea8ff", color: "#bfe3ff" },
  tierOnP: { background: "#2d1650", borderColor: "#b76bff", color: "#e3c8ff" },
  packWrap: { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 26, zIndex: 10 },
  hint: { fontSize: 16, color: "#fff", letterSpacing: 1, fontWeight: 700, minHeight: 24, textShadow: "0 2px 8px #0008" },
  cardArea: {
    // ⚠️ 不要加 z-index：加了就自成堆疊環境，特效影片的 mix-blend-mode: screen
    //    會找不到底色可混，黑底直接糊成一個黑方塊（老闆 2026-08-19 截圖）。
    //    這裡不加也不影響疊法 —— 舞台上要壓在卡片之上的元素都自己帶了更高的 z-index。
    position: "relative", width: "min(70vw,270px)", aspectRatio: "5/7",
    display: "flex", alignItems: "center", justifyContent: "center",
    marginTop: "-6vh",
  },
  card: {
    position: "absolute", inset: 0, borderRadius: 16,
    backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#1c2230",
  },
  face: {
    position: "absolute", inset: 0, borderRadius: 16,
    backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#1c2230",
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
  },
  aura: {
    position: "absolute", left: "50%", top: "50%", width: "180vmin", height: "180vmin",
    marginLeft: "-90vmin", marginTop: "-90vmin", borderRadius: "50%",
    pointerEvents: "none", zIndex: 5,
  },
  /*
   * 影片特效共用（vortex / energy）：黑底素材靠 mix-blend-mode: screen 去背。
   *   fxLayer 對齊卡片外框，套跟卡片一樣的位移；混合模式掛這層
   *   fxSpin  飄動層 / 傾斜層，套跟卡片同名的 keyframes
   *   fxVideo 以卡片寬為基準的正方形，置中；大小與高度由後台參數決定
   * 用「卡片寬的百分比 + 置中」而不是 inset 負值 —— 素材是正方形、卡片是 5:7，
   * 用 inset 撐的話 contain 會自己留黑邊，位置怎麼調都對不準（老闆 2026-08-19）。
   */
  fxLayer: {
    position: "absolute", inset: 0, pointerEvents: "none",
    perspective: 1100, mixBlendMode: "screen",
  },
  fxSpin: { position: "absolute", inset: 0, transformStyle: "preserve-3d" },
  fxVideo: {
    position: "absolute", left: "50%", top: "50%",
    // 尺寸以**卡牌高度**為基準（100% = 跟卡牌一樣高），素材是正方形所以寬＝高。
    // 先前用卡牌寬度當基準，數字看起來不大、算出來卻遠大於卡牌（漩渦 260% = 682px
    // 對上 263px 寬的卡），電弧整片甩到畫面邊緣（老闆 2026-08-19：「沒對到」）。
    width: "auto", aspectRatio: "1", objectFit: "contain", pointerEvents: "none",
    // ⚠️ Tailwind preflight 有 `img, video { max-width: 100% }`，不解掉的話
    //    寬度會被夾在 100%，參數調了完全沒反應（實測 200% 與 150% 都算出 270px）。
    maxWidth: "none",
  },
  /* 形狀而已；定位與 z-index 由外層那個跟著 cardTransform 走的容器負責 */
  auraGlow: { position: "absolute", inset: "8%", borderRadius: 20, pointerEvents: "none" },
  prizeTag: {
    position: "absolute", top: -54, left: 0, right: 0, textAlign: "center", zIndex: 30,
    fontSize: 26, fontWeight: 900, letterSpacing: 3, animation: "ggbCardIn .5s cubic-bezier(.2,1.6,.4,1)",
  },
  counter: {
    position: "absolute", bottom: -84, left: 0, right: 0, textAlign: "center",
    color: "#cfc6f2", zIndex: 30,
  },
  counterChip: {
    display: "inline-block", padding: "6px 22px", borderRadius: 999,
    background: "#ffffff22", border: "1px solid #ffffff2e", fontSize: 15, fontWeight: 700, color: "#fff",
    backdropFilter: "blur(6px)",
  },
  doneWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 20, zIndex: 20 },
  doneTitle: { fontSize: 24, fontWeight: 900, letterSpacing: 2 },
  againBtn: {
    background: "linear-gradient(135deg,#1c9457,#67d99a)", color: "#04140b", fontWeight: 900,
    fontSize: 16, border: "none", borderRadius: 999, padding: "13px 38px", cursor: "pointer",
    boxShadow: "0 8px 26px #1c945766", letterSpacing: 2,
  },
};

const CSS_KEYFRAMES = `
@keyframes ggbBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
@keyframes ggbSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes ggbPulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
@keyframes ggbFlash { from{opacity:.9} to{opacity:0} }
@keyframes ggbCardIn { from{transform:scale(.85);opacity:.4} to{transform:scale(1);opacity:1} }
@keyframes ggbJitter { 0%,100%{transform:translate(0,0)} 25%{transform:translate(.8px,-.5px)} 50%{transform:translate(-.7px,.6px)} 75%{transform:translate(.5px,.5px)} }
@keyframes ggbFloatCard { 0%,100%{transform:translateY(0) rotate(-1.2deg)} 50%{transform:translateY(-10px) rotate(1.2deg)} }
@keyframes ggbTilt3d { 0%,100%{transform:rotateX(7deg) rotateY(-9deg)} 50%{transform:rotateX(-6deg) rotateY(9deg)} }
@keyframes ggbBoltFloat { 0%,100%{transform:translateY(0) rotate(-6deg) rotateX(6deg) rotateY(-7deg)} 50%{transform:translateY(-8px) rotate(-6deg) rotateX(-5deg) rotateY(7deg)} }
@keyframes ggbRimPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.3)} }
@media (prefers-reduced-motion: reduce){ *{animation:none !important} }
`;
