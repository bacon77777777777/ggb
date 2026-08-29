'use client';

/**
 * 星流背景 —— 從畫面中心往外衝的星點＋拖尾（老闆 2026-08-29 指定，撕開封口用）
 *
 * 跟 `PackShowcase3D` 裡那組 `.ggb-meteor` 是**兩件不同的東西**，不要互相取代：
 *   · 那組是商品頁卡包輪播的背景，四顆、慢、往左下飄 —— 遠方的流星
 *     （老闆說過六顆快速掠過「太假」，所以刻意慢）
 *   · 這支是撕開封口的全畫面演出背景，星點從中心往外衝、帶拖尾 —— 速度感
 * 那組能用純 CSS 是因為只有四顆；這裡幾百顆各自有深度與透視，只能走 canvas。
 *
 * canvas 本身**保持透明**，底色由呼叫端的容器畫（撕開封口是 S.stage 那條暗紫
 * 放射漸層）。拖尾不是靠半透明色塊蓋圖層，是每幀用 `destination-out` 把既有像素
 * 的 alpha 減掉一點 —— 蓋色塊的話會把底下的漸層一起蓋掉，變成一塊死黑。
 */

import { useEffect, useRef } from 'react';

type Rgb = [number, number, number];

export type StarWarpFieldProps = {
  /** 星點數量。實際數量會依螢幕寬度縮減，見 resolveCount() */
  particleCount?: number;
  /** 三色調色盤，每顆星隨機取一色 */
  colors?: [string, string, string];
  /** 1–10，往外衝的速度 */
  speed?: number;
  /** 1–100，出生半徑的散開程度（越大越靠畫面外圍生成） */
  density?: number;
  /** 0–20，星點大小 */
  starSize?: number;
  /** 1–30，焦距。越小透視越誇張、衝出來越快 */
  focalDepth?: number;
  /** 0–10，接近時的擾動幅度；0 = 直線 */
  turbulence?: number;
  /** 0–100，整體亮度 */
  brightness?: number;
  /** 0–10，閃爍頻率 */
  glitterIntensity?: number;
  /** 0–100，拖尾長度 */
  trailAmount?: number;
  /** true = 由外往中心收（時間反轉） */
  reverse?: boolean;
  className?: string;
};

const DEFAULTS = {
  particleCount: 500,
  colors: ['#ffffff', '#FF0000', '#FFE500'] as [string, string, string],
  speed: 5,
  density: 100,
  starSize: 20,
  focalDepth: 13,
  turbulence: 0,
  brightness: 100,
  glitterIntensity: 3,
  trailAmount: 100,
  reverse: false,
};

function parseColor(input: string): Rgb {
  const s = (input ?? '').trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(v => parseFloat(v.trim()));
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  }
  return [255, 255, 255];
}

/**
 * 手機自動減量
 *
 * 每顆星每幀要走一次 `stroke()`（拖尾是一條線段），500 顆等於每幀 500 條路徑，
 * 加上滿版的 `destination-out` 與 `lighter` 疊加。撕開封口的演出同時還有另一張
 * 粒子 canvas 在跑，掉幀剛好會掉在整個商品最關鍵的那幾秒。
 * 桌機維持設定值，窄螢幕砍到六成 —— 星點本來就密，少掉的那些看不出來。
 * 不想要這個減量就把呼叫端的 particleCount 調低、然後把這裡改成直接回傳。
 */
function resolveCount(requested: number, viewportWidth: number): number {
  const n = Math.max(1, Math.floor(requested));
  return viewportWidth < 480 ? Math.max(1, Math.round(n * 0.6)) : n;
}

export default function StarWarpField({ className, ...opts }: StarWarpFieldProps) {
  const cfgRef = useRef({ ...DEFAULTS, ...opts });
  cfgRef.current = { ...DEFAULTS, ...opts };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 省電／無障礙：跟 .ggb-meteor 一樣，reduce 時整層不畫（底下的漸層自己就成立）
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    type Star = {
      x: number; y: number;
      /** 深度：1 = 最遠，接近 focalDepth = 貼到鏡頭 */
      z: number;
      /** 上一幀投影後的螢幕座標，拿來畫拖尾線段 */
      px: number; py: number;
      /** 每顆自己的相位，擾動與閃爍都吃它，避免整批同步 */
      seed: number;
      /** 每顆自己的速度倍率。同一批重生的星如果等速，會整團移動、看起來像脈衝波 */
      vmul: number;
      colorIdx: number;
      flashUntil: number;
      nextFlash: number;
    };

    const stars: Star[] = [];
    /**
     * 累計秒數（不是幀數）。擾動相位與閃爍節奏都以它為準，
     * 這樣 16/16/22/13ms 這種不穩定的幀距下速度仍然一致，不會跟著抖。
     */
    let elapsed = 0;
    let lastT = performance.now();
    let sizeW = 0, sizeH = 0, sizeDpr = 1;

    // 色字串每幀只組三條（不是每顆星一條）。每顆的透明度走 globalAlpha，
    // 熱迴圈裡完全不配置字串 —— 每顆組一次 rgba() 在 500 顆時是每秒十幾萬個
    // 短命字串，GC 停頓就是卡頓的來源。
    let rgbStrs = ['rgb(255,255,255)', 'rgb(255,255,255)', 'rgb(255,255,255)'];
    let colorKey = '';
    const syncColors = () => {
      const cols = cfgRef.current.colors;
      const key = cols.join('|');
      if (key === colorKey) return;
      colorKey = key;
      rgbStrs = cols.map(c => { const [r, g, b] = parseColor(c); return `rgb(${r},${g},${b})`; });
    };

    // UI 用的整數刻度 → 物理運算用的實際範圍，換算集中在這裡
    const cfg = () => {
      const p = cfgRef.current;
      return {
        reverse: p.reverse,
        density: p.density,
        stepZ: p.speed * 0.0008,
        focalDepth: p.focalDepth / 100,
        starScale: p.starSize * 0.15,
        turbulence: p.turbulence * 0.2,
        glitter: p.glitterIntensity * 0.1,
        brightness: Math.min(1, p.brightness / 100),
        trail: p.trailAmount / 100,
      };
    };

    const resetStar = (s: Star, initial = false) => {
      const { density, reverse, focalDepth, glitter } = cfg();
      const angle = Math.random() * Math.PI * 2;
      const radius = (0.2 + Math.random() * 0.8) * (density / 15);
      s.x = Math.cos(angle) * radius;
      s.y = Math.sin(angle) * radius;
      /* 正向：從最遠處（z=1，靠近中心）出生，往 focalDepth（畫面邊緣）衝。
         反向是它的時間反轉：出生點與半徑完全一樣，只有 z 往另一邊跑。 */
      if (reverse) {
        s.z = initial ? focalDepth + Math.random() * (1 - focalDepth) : focalDepth;
      } else {
        s.z = initial ? Math.random() : 1.0;
      }
      s.px = NaN;
      s.py = NaN;
      s.seed = Math.random() * 1000;
      s.vmul = 0.6 + Math.random() * 0.8;
      s.colorIdx = Math.floor(Math.random() * 3);
      s.flashUntil = 0;
      s.nextFlash = elapsed + 1 + Math.random() * 4 * (1 / Math.max(0.0001, glitter));
    };

    // 調整星數時只增減、不重建整個陣列，改參數才不會整片重來
    const syncCount = () => {
      const count = resolveCount(cfgRef.current.particleCount, sizeW || window.innerWidth);
      if (stars.length === count) return;
      if (stars.length > count) { stars.length = count; return; }
      while (stars.length < count) {
        const s: Star = { x: 0, y: 0, z: 0, px: NaN, py: NaN, seed: 0, vmul: 1, colorIdx: 0, flashUntil: 0, nextFlash: 0 };
        resetStar(s, true);
        stars.push(s);
      }
    };

    const resize = (entry?: ResizeObserverEntry) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cr = entry?.contentRect;
      const w = Math.max(1, Math.floor(cr?.width || container.clientWidth || 1));
      const h = Math.max(1, Math.floor(cr?.height || container.clientHeight || 1));
      /* 尺寸沒變就直接走：ResizeObserver 會因為初次 observe、次像素抖動、
         父層重排而空放，而設定 canvas.width 會**清空整張畫布連同拖尾**，
         等於動畫每次都重來。只有真的變了才重設。 */
      if (sizeW === w && sizeH === h && sizeDpr === dpr) return;
      sizeW = w; sizeH = h; sizeDpr = dpr;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
    };

    resize();
    syncCount();
    const ro = new ResizeObserver(entries => resize(entries[0]));
    ro.observe(container);

    const drawFrame = (deltaSec: number) => {
      const { reverse, stepZ, focalDepth, starScale, turbulence, glitter, brightness, trail } = cfg();
      syncCount();
      syncColors();

      const w = sizeW, h = sizeH;
      const cx = w / 2, cy = h / 2;
      const projScale = Math.min(w, h) * 0.9;
      // 分頁切回來時 delta 會很大，夾住免得整場瞬移
      const dt = Math.max(0.001, Math.min(0.1, deltaSec)) * 60;

      /* 拖尾：用 destination-out 每幀減掉一點既有像素的 alpha。
         衰減率跟幀率無關 —— trail 是「每 1/60 秒保留的比例」，取 dt 次方，
         所以 60Hz、120Hz 或不穩定幀率下拖尾長度一樣。用固定的每幀 alpha
         （原本的做法）會讓光暈隨著幀率浮動、看起來在呼吸。
         下限 0.02 保證就算 trail=100 也還是有在擦，畫面不會糊成一片死白。 */
      const keep = Math.pow(Math.min(0.98, Math.max(0, trail)), dt);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.02, 1 - keep)})`;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        const vz = stepZ * s.vmul * dt;
        if (reverse) {
          s.z += vz;
          if (s.z >= 1.0) { resetStar(s); continue; }
        } else {
          s.z -= vz;
          if (s.z <= focalDepth) { resetStar(s); continue; }
        }

        let tx = s.x, ty = s.y;
        if (turbulence > 0) {
          const t = elapsed * 1.2 + s.seed;
          const amp = turbulence * (1 - s.z) * 0.25;
          tx += Math.sin(t + s.seed) * amp;
          ty += Math.cos(t * 1.13 + s.seed * 0.7) * amp;
        }

        const persp = focalDepth / Math.max(s.z, 0.0001);
        const sx = cx + tx * persp * projScale;
        const sy = cy + ty * persp * projScale;

        /* 出界重生**只做正向**。反向的星出生在 z=focalDepth（persp=1），
           位置本來就可能在畫面外，它是要往內飛進來的；在這裡砍掉的話
           它還沒現身就被殺了。反向只由 z>=1 那條重生，跟正向對稱。 */
        if (!reverse && (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20)) {
          resetStar(s);
          continue;
        }

        let flashMult = 1;
        if (glitter > 0) {
          if (elapsed >= s.nextFlash && s.flashUntil < elapsed) {
            s.flashUntil = elapsed + 0.04 + Math.random() * 0.07;
            s.nextFlash = elapsed + 1 + Math.random() * 4 * (1 / Math.max(0.0001, glitter));
          }
          if (elapsed <= s.flashUntil) flashMult = 1 + 2.5 * glitter;
        }

        /* 上限跟著 starScale 走。原本寫死 1.8px，結果大小超過 ~3 之後全被夾成
           同一顆點，「星點大小」這個控制項在後半段等於沒作用。 */
        const sizePersp = Math.min(2.5, (focalDepth / Math.max(s.z, 0.0001)) * 0.6);
        const baseR = Math.max(0.25, starScale * (0.4 + sizePersp));
        const maxR = 1 + starScale * 2.5;
        const r = Math.min(baseR * flashMult, maxR);

        const lifeT = reverse ? s.z : 1 - s.z;  // 0 = 剛出生，1 = 快消失
        /* 反向的星出生在畫面邊緣、一出來就是 0.85 的亮度，每次重生都會「啵」一下。
           前 12% 的行程做淡入。正向本來就從接近全透明開始，不需要。 */
        const fadeIn = reverse ? Math.min(1, (s.z - focalDepth) / (1 - focalDepth) / 0.12) : 1;
        const a =
          Math.min(1, reverse ? 0.85 - lifeT * 0.6 : lifeT * 0.9 + 0.05) *
          fadeIn * brightness * (flashMult > 1 ? 1 : 0.85);

        const colStr = rgbStrs[s.colorIdx];

        // 拖尾：上一幀到這一幀的線段。刻意細，要的是細線不是刷子
        if (!Number.isNaN(s.px) && !Number.isNaN(s.py)) {
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = colStr;
          ctx.lineWidth = Math.max(0.4, r * 0.4);
          ctx.beginPath();
          ctx.moveTo(s.px, s.py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }

        // 星點本體用 fillRect 不用 arc()：這個半徑下方的跟圓的看起來一樣，
        // 但省掉每顆一次的路徑細分
        ctx.globalAlpha = a;
        ctx.fillStyle = colStr;
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);

        // 閃爍時多疊一個稍大的方塊，讀起來是「一閃」而不是「一圈光暈」
        if (flashMult > 1) {
          const rf = Math.min(r * 1.4, maxR * 1.4);
          ctx.globalAlpha = a * 0.5;
          ctx.fillRect(sx - rf, sy - rf, rf * 2, rf * 2);
        }

        s.px = sx;
        s.py = sy;
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // 跟 dt 一樣要夾：分頁切回來時不夾的話，擾動相位會瞬移、閃爍會一次全放
      elapsed += Math.min(0.1, Math.max(0, deltaSec));
    };

    let raf = 0;
    const loop = (t: number) => {
      const deltaSec = (t - lastT) / 1000;
      lastT = t;
      drawFrame(deltaSec);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // 只建一次。所有參數每幀從 cfgRef 讀，改設定不會重建星群與 rAF
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
    </div>
  );
}
