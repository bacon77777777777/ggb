/**
 * 海景日夜循環 —— 抽卡商品頁上半部的背景
 *
 * 原型：`public/images/card/webgl-scroll-sync-v3`（CodePen「WebGL Scroll Sync V3」）
 * MIT License, Copyright (c) 2026 Luis Alberto Martinez Riancho
 * https://codepen.io/luis-lessrain/pen/LERxVqv
 *
 * ── 原型改了什麼 ──────────────────────────────────────────────
 *
 * 原型是「捲動」驅動的五段場景 `DAWN → MIDDAY → DUSK → NIGHT → STORM`。
 * 那個順序**不是一個循環**，直接接上 24 小時有兩個毛病：
 *   ① 線性對時間會整個錯位（00:00 變日出、12:00 變黃昏）
 *   ② 第五段是 STORM 不是回到 NIGHT，23:59 → 00:00 會從陰天硬跳回日出
 *
 * 所以這裡把五段重排成首尾同色的閉環（顏色本身沒改，只換順序）：
 *
 *   c0 = 深夜   c1 = 日出   c2 = 正午   c3 = 日落   c4 = 深夜（＝c0）
 *
 * s = 0 與 s = 1 長得一模一樣，午夜就沒有接縫。
 * STORM 那組先不用（老闆 2026-09-01），之後要做「天氣」再接回來。
 *
 * 跟著重排的還有太陽軌跡、月亮強度、星星、浪高、霧濃度 —— 它們原本都是
 * 照捲動進度寫死的，不一起改就會出現「正午滿天星」這種事。
 *
 * ── 夜間提亮 ──────────────────────────────────────────────────
 *
 * 原型的 NIGHT 近乎全黑（skyTop 0.01/0.01/0.05）。那是滿版藝術品的用法；
 * 我們這格上面還要站一個卡包、疊按鈕，太黑會變成「卡包貼在黑底上」。
 * 老闆 2026-09-01 指定整體提亮 —— 現在是「有月光的藍夜」，看得見海面。
 * 要再調就改 `NIGHT` 那一組數字，其他四段不受影響。
 */

/** RGB 0~1 */
type Rgb = readonly [number, number, number];

/*
 * 一天的色票。**索引 0 與最後一項必須相同**，否則午夜會有接縫。
 *
 * 原型只給五段（日出／正午／日落／深夜／暴風雨），去掉暴風雨、補上首尾的深夜之後
 * **白天只剩「正午」一個顏色**。那不夠用：色票是線性內插的，早上七點就變成
 * 「日出橘 × 正午藍」對半混，混出來是灰紫色 —— 不像清晨也不像白天（實測 07:00
 * 與 17:00 都是這個問題）。所以中間補了「早晨」與「午後」兩段，
 * 讓晨昏的橘只在真正的晨昏出現。
 *
 * 加減段數不用改別的地方：GLSL 的挑色函式是照這個陣列長度產生出來的。
 * 只要記得下面那幾組純量（浪高／霧／月亮／星星）要跟著一樣長。
 */
const NIGHT = {
  skyTop: [0.045, 0.065, 0.17] as Rgb,
  skyHori: [0.14, 0.2, 0.38] as Rgb,
  sunCol: [0.76, 0.82, 0.98] as Rgb,
  seaDeep: [0.035, 0.055, 0.13] as Rgb,
  seaShlo: [0.11, 0.17, 0.34] as Rgb,
  fogCol: [0.11, 0.16, 0.3] as Rgb,
};

const DAWN = {
  skyTop: [0.18, 0.06, 0.24] as Rgb,
  skyHori: [0.92, 0.48, 0.18] as Rgb,
  sunCol: [1.0, 0.62, 0.22] as Rgb,
  seaDeep: [0.08, 0.05, 0.12] as Rgb,
  seaShlo: [0.28, 0.17, 0.24] as Rgb,
  fogCol: [0.8, 0.5, 0.3] as Rgb,
};

/** 早晨：已經是白天了，但光還帶著金色 */
const MORNING = {
  skyTop: [0.1, 0.26, 0.62] as Rgb,
  skyHori: [0.72, 0.72, 0.78] as Rgb,
  sunCol: [1.0, 0.88, 0.62] as Rgb,
  seaDeep: [0.05, 0.16, 0.34] as Rgb,
  seaShlo: [0.16, 0.38, 0.58] as Rgb,
  fogCol: [0.72, 0.76, 0.86] as Rgb,
};

const MIDDAY = {
  skyTop: [0.05, 0.24, 0.68] as Rgb,
  skyHori: [0.42, 0.62, 0.9] as Rgb,
  sunCol: [1.0, 0.96, 0.8] as Rgb,
  seaDeep: [0.03, 0.14, 0.34] as Rgb,
  seaShlo: [0.09, 0.38, 0.6] as Rgb,
  fogCol: [0.58, 0.72, 0.9] as Rgb,
};

/** 午後：比正午暖一點，還沒到日落的橘 */
const AFTERNOON = {
  skyTop: [0.08, 0.24, 0.62] as Rgb,
  skyHori: [0.78, 0.72, 0.7] as Rgb,
  sunCol: [1.0, 0.9, 0.66] as Rgb,
  seaDeep: [0.05, 0.14, 0.3] as Rgb,
  seaShlo: [0.16, 0.36, 0.52] as Rgb,
  fogCol: [0.78, 0.74, 0.76] as Rgb,
};

const DUSK = {
  skyTop: [0.26, 0.06, 0.04] as Rgb,
  skyHori: [0.88, 0.32, 0.04] as Rgb,
  sunCol: [1.0, 0.38, 0.05] as Rgb,
  seaDeep: [0.1, 0.06, 0.04] as Rgb,
  seaShlo: [0.24, 0.13, 0.06] as Rgb,
  fogCol: [0.7, 0.28, 0.05] as Rgb,
};

const STOPS = [NIGHT, DAWN, MORNING, MIDDAY, AFTERNOON, DUSK, NIGHT] as const;

/** 浪高／霧濃度／月亮／星星，長度要與 STOPS 相同 */
const WAVE_AMP = [0.054, 0.082, 0.074, 0.07, 0.078, 0.1, 0.054];
const FOG_DEN = [0.034, 0.02, 0.014, 0.01, 0.014, 0.022, 0.034];
/* 月亮與星星只出現在深夜與晨昏的**夜側**。日落那一段留 0：
   給 0.2 的話下午五點（午後→日落的過渡）就會掛一顆月亮在天上 */
const MOON_AMT = [0.95, 0.2, 0.0, 0.0, 0.0, 0.0, 0.95];
const STAR_AMT = [1.0, 0.3, 0.0, 0.0, 0.0, 0.0, 1.0];

// ── 台灣時間 → 場景進度 s ─────────────────────────────────────

/**
 * 錨點表：[台灣時間（小時，可帶小數）, s]
 *
 * s 的四個定位點是固定的（0.25 日出／0.50 正午／0.75 日落／0 與 1 深夜），
 * **要調的是幾點對到那些點**，改這張表就好，其他都不用動。
 * 台灣全年日出約 05:10~06:35、日落約 17:15~18:45，取中間值當基準。
 *
 * ⚠️ **深夜與白天都必須是一段平台**，不能只給一個點。
 * 色票只有一組白天色（正午），s 只要離開 0.5 就開始混進日出／日落的橘。
 * 第一版寫 `12:00 → 0.5` 但兩側直接斜下去，結果早上九點是「三分之一日出橘」、
 * 凌晨三點是「四分之一日出紫」 —— 都不是那個時間該有的顏色。
 * 現在 08:00~16:00 一路壓在 0.5、20:00~隔天 04:00 壓在深夜，
 * 只有晨昏各兩小時在過渡，這才像真的一天。
 */
const KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0 / 6],    // 00:00 深夜
  [4, 0 / 6],    // 04:00 深夜（平台結束）
  [6, 1 / 6],    // 06:00 日出
  [8, 2 / 6],    // 08:00 早晨
  [11, 3 / 6],   // 11:00 正午
  [15, 4 / 6],   // 15:00 午後
  [18, 5 / 6],   // 18:00 日落
  [20, 6 / 6],   // 20:00 入夜（＝與 00:00 同色）
  [24, 6 / 6],
];

/** 日出／日落的時刻，只給太陽軌跡用（顏色走上面那張表）*/
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 18;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/**
 * 現在是台灣時間幾點（小時，帶小數）。
 *
 * **不吃裝置時區** —— 直接拿 UTC 毫秒加八小時。玩家把手機設成美國時區，
 * 看到的還是台灣的天色。
 */
export function taiwanHours(now: number = Date.now()): number {
  const tw = new Date(now + 8 * 3600_000);
  return tw.getUTCHours() + tw.getUTCMinutes() / 60 + tw.getUTCSeconds() / 3600;
}

/** 台灣時間（小時）→ 場景進度 0~1 */
export function skyProgressAtHour(hours: number): number {
  const h = ((hours % 24) + 24) % 24;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const [h0, s0] = KEYFRAMES[i];
    const [h1, s1] = KEYFRAMES[i + 1];
    if (h >= h0 && h <= h1) {
      if (h1 === h0) return s1;
      return s0 + (s1 - s0) * smoothstep((h - h0) / (h1 - h0));
    }
  }
  return KEYFRAMES[KEYFRAMES.length - 1][1];
}

/** 現在的場景進度 0~1 */
export function skyProgressNow(now: number = Date.now()): number {
  return skyProgressAtHour(taiwanHours(now));
}

/**
 * 太陽在天上的位置：0 = 日出、0.5 = 正午、1 = 日落，區間外就是在地平線下。
 *
 * **刻意不跟 s 綁在一起。** 顏色需要「白天一整段都長一樣」的平台，
 * 太陽卻要從早到晚一路走完 —— 綁在一起的話，白天平台會讓太陽在天頂卡八小時。
 * 這裡直接照時間線性算，跨午夜也連續（23:59 與 00:01 算出來的高度一樣）。
 */
export function solarPhaseAtHour(hours: number): number {
  const h = ((hours % 24) + 24) % 24;
  return (h - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
}

export function solarPhaseNow(now: number = Date.now()): number {
  return solarPhaseAtHour(taiwanHours(now));
}

/**
 * 開發用時間覆寫：網址帶 `?sky=14:30` 就固定在那個時刻。
 * 給老闆檢查各時段用的，正式流程不會走到（沒帶參數就回 null）。
 */
export function parseSkyOverride(search: string): number | null {
  const m = /[?&]sky=(\d{1,2})(?::(\d{1,2}))?/.exec(search);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  if (!Number.isFinite(h) || h < 0 || h > 24) return null;
  return h + (Number.isFinite(mi) ? mi : 0) / 60;
}

// ── 給 CSS 用的漸層（載入中／WebGL 不能用時的底色）──────────────

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** 0~1 的線性色 → CSS `rgb()`。加 gamma 是為了跟 shader 的輸出對得上 */
const toCss = (c: Rgb) => {
  const g = (v: number) => Math.round(clamp01(v) * 255);
  return `rgb(${g(c[0])},${g(c[1])},${g(c[2])})`;
};

/** s 落在第幾段、段內比例多少（與 shader 的 uSc／uBl 同一套算法） */
export function stopIndexAndBlend(s: number): { index: number; blend: number } {
  const raw = clamp01(s) * (STOPS.length - 1);
  const index = Math.min(Math.floor(raw), STOPS.length - 2);
  return { index, blend: raw - index };
}

/**
 * 當下時刻的天空漸層（CSS）。
 *
 * 用途有三個，全部是「WebGL 還沒畫出來或畫不出來」的時候：
 * 卡包輪播載入中、WebGL 建不起來的退路、`prefers-reduced-motion`。
 * 顏色一樣照當下時間算，所以就算退到這條路，日夜感還在。
 */
export function skyGradientCss(s: number): string {
  const { index, blend } = stopIndexAndBlend(s);
  const a = STOPS[index];
  const b = STOPS[index + 1];
  const top = toCss(mixRgb(a.skyTop, b.skyTop, blend));
  const hori = toCss(mixRgb(a.skyHori, b.skyHori, blend));
  const shlo = toCss(mixRgb(a.seaShlo, b.seaShlo, blend));
  const deep = toCss(mixRgb(a.seaDeep, b.seaDeep, blend));
  /* 地平線壓在 50%：那是 3D 卡包場景裡地板消失的高度（相機水平看出去，
     消失點必定落在畫面正中），兩邊對齊卡包的倒影才會落在海裡而不是浮在空中 */
  return `linear-gradient(180deg, ${top} 0%, ${hori} 47%, ${shlo} 53%, ${deep} 100%)`;
}

/**
 * 夜色濃度 0~1（深夜 1、白天 0）。跟星星用同一組數字，所以會同進同出。
 * 給流星層用：白天讓它整層淡掉，夜裡才浮出來。
 */
export function nightAmount(s: number): number {
  const { index, blend } = stopIndexAndBlend(s);
  return STAR_AMT[index] + (STAR_AMT[index + 1] - STAR_AMT[index]) * blend;
}

/**
 * 當下時刻的地平線顏色（線性 0~1）。
 *
 * 給 3D 卡包場景的霧用。那層霧原本是配白棚寫死的近白色（0xe9edf7），
 * 側包在 z = -0.9 ~ -2.2，離鏡頭約 9~11，霧的近平面是 7 —— 也就是**會吃到**。
 * 背景換成海景之後不跟著換色的話，深夜的側包會蒙上一層灰白霧，很明顯是錯的。
 */
export function skyHorizonRgb(s: number): Rgb {
  const { index, blend } = stopIndexAndBlend(s);
  return mixRgb(STOPS[index].skyHori, STOPS[index + 1].skyHori, blend);
}

// ── Fragment shader ──────────────────────────────────────────

const v3 = (c: Rgb) => `vec3(${c.map(n => n.toFixed(4)).join(', ')})`;
const sCol = (pick: (s: (typeof STOPS)[number]) => Rgb) =>
  `sCol(${STOPS.map(s => v3(pick(s))).join(', ')})`;
const sF = (arr: number[]) => {
  if (arr.length !== STOPS.length) {
    throw new Error(`oceanSky: 純量陣列長度 ${arr.length} 與色票段數 ${STOPS.length} 不符`);
  }
  return `sF(${arr.map(n => n.toFixed(4)).join(', ')})`;
};

/**
 * 產生「照 uSc 挑相鄰兩段、再用 uBl 內插」的 GLSL 函式。
 *
 * 為什麼用 if/else 而不是陣列索引：GLSL ES 1.00 對非常數索引有一堆限制，
 * 原型當初就是為了避開它才寫成一長串參數。段數變了這裡自動跟著長，
 * 不用手改 —— 加一段色票只要改 STOPS 那個陣列。
 */
function makePicker(name: string, type: 'vec3' | 'float'): string {
  const n = STOPS.length;
  const args = Array.from({ length: n }, (_, i) => `${type} c${i}`).join(', ');
  const branches = Array.from({ length: n - 2 }, (_, i) =>
    `  ${i === 0 ? 'if' : 'else if'} (si == ${i + 1}) { a = c${i + 1}; b = c${i + 2}; }`,
  ).join('\n');
  return `${type} ${name}(${args}) {
  int si = int(uSc);
  ${type} a = c0; ${type} b = c1;
${branches}
  return mix(a, b, uBl);
}`;
}

/*
 * 效能：raymarch 的步數。原型是 22 + 5，那是給滿版藝術品用的。
 * 我們這格只有 375×466，實測降到 12 + 4 看不出分層，成本少一半。
 * 每個海面像素要跑 (march + refine + 法線 4 + 浪花 5) 次波高函數，
 * 每次波高又是 7 個 sin 加一次 noise —— 這是整支 shader 唯一的成本來源，
 * 要再省就是動這兩個數字。
 */
const MARCH_STEPS = 12;
const REFINE_STEPS = 4;

/**
 * 海景的 fragment shader。
 *
 * 與原型的差異（除了上面說的色票重排）：
 *   1. **鏡頭釘死**。原型的 camY／camZ／pitch 都跟著進度跑，我們的卡包是
 *      固定位置，地平線整天慢慢漂會很怪。pitch 設 0 讓地平線落在畫面正中
 *      —— 那正是 3D 場景裡地板的消失點高度，兩邊才對得起來。
 *   2. **storm 常數 0**。整段被編譯器摺掉，不留執行成本。
 *   3. 拿掉沒用到的 uBg，以及原型用來緩動捲動的 smoother()
 *      —— 我們的 s 由時間曲線給，已經是平滑的，再套一次會讓
 *      「0.25 = 日出」這個定位失準。
 */
export const OCEAN_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2  uR;
uniform float uT, uS, uSc, uBl, uSun;

#define PI 3.14159265359
#define MARCH_STEPS ${MARCH_STEPS}
#define REFINE_STEPS ${REFINE_STEPS}

float sat(float x) { return clamp(x, 0.0, 1.0); }

${makePicker('sCol', 'vec3')}

${makePicker('sF', 'float')}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float waveH(vec2 p, float t, float amp) {
  float h = 0.0;
  vec2 swell1 = normalize(vec2(1.0, 0.28));
  vec2 swell2 = normalize(vec2(-0.48, 0.88));
  vec2 swell3 = normalize(vec2(0.82, -0.16));
  float d1 = dot(p, swell1);
  float d2 = dot(p, swell2);
  float d3 = dot(p, swell3);
  h += amp * 0.66 * sin(d1 * 0.42 + t * 0.38);
  h += amp * 0.22 * sin(d1 * 0.94 - t * 0.62);
  h += amp * 0.14 * sin(d2 * 1.18 - t * 0.82);
  h += amp * 0.09 * sin(d3 * 1.82 + t * 1.04);
  h += amp * 0.11 * sin(p.x * 1.45 - t * 0.76 + p.y * 0.66);
  h += amp * 0.07 * sin(p.x * 2.85 + t * 1.06 - p.y * 0.52);
  h += amp * 0.04 * sin(p.x * 4.60 - t * 1.50 + p.y * 1.02);
  float micro = noise(p * 14.0 + vec2(t * 0.18, t * 0.06)) - 0.5;
  h += micro * amp * 0.010;
  return h;
}

vec3 waveNorm(vec2 p, float t, float amp) {
  float e = 0.018;
  float hL = waveH(p - vec2(e, 0.0), t, amp);
  float hR = waveH(p + vec2(e, 0.0), t, amp);
  float hD = waveH(p - vec2(0.0, e), t, amp);
  float hU = waveH(p + vec2(0.0, e), t, amp);
  return normalize(vec3(-(hR - hL) / (2.0 * e), 1.0, -(hU - hD) / (2.0 * e)));
}

float starField(vec2 uv) {
  vec2 gv = floor(uv);
  vec2 lv = fract(uv) - 0.5;
  float h = hash(gv);
  float size = mix(0.012, 0.0025, h);
  float d = length(lv + vec2(hash(gv + 3.1) - 0.5, hash(gv + 7.3) - 0.5) * 0.25);
  float star = smoothstep(size, 0.0, d);
  star *= smoothstep(0.82, 1.0, h);
  return star;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uR * 0.5) / uR.y;

  float s = uS;

  /* 鏡頭釘死：地平線固定在畫面正中（pitch = 0），與 3D 場景的地板消失點對齊 */
  vec3 ro = vec3(0.0, 1.10, 0.0);
  vec3 rd = normalize(vec3(uv.x, uv.y, -1.4));

  float night = ${sF(STAR_AMT)};

  vec3 skyTop  = ${sCol(c => c.skyTop)};
  vec3 skyHori = ${sCol(c => c.skyHori)};
  vec3 sunCol  = ${sCol(c => c.sunCol)};
  vec3 seaDeep = ${sCol(c => c.seaDeep)};
  vec3 seaShlo = ${sCol(c => c.seaShlo)};
  vec3 fogCol  = ${sCol(c => c.fogCol)};

  /*
   * 太陽軌跡吃 uSun（0 = 日出、0.5 = 正午、1 = 日落），不吃 s ——
   * 顏色有白天平台、太陽沒有，兩者要分開走（見 lib/oceanSky 的說明）。
   * 區間外不夾住：角度自然走過頭，sin 為負就沉到地平線下，
   * 下面的 sunGlow 會把它整個淡掉，深夜自然就沒有太陽。
   */
  float sunAngle = uSun * PI;
  /*
   * 橫向擺幅原型是 0.75，那是給 16:9 滿版用的。我們這格是 375×466 的直式，
   * uv.x 只到 ±0.40 —— 0.75 會讓太陽整天都在畫面外，只有正午那一刻剛好進來
   * （而且正好被卡包擋住）。收到 0.28 之後剛好橫跨整個畫面寬：
   * 早上從左緣升起、正午在卡包後面透出光暈、傍晚落到右緣。
   */
  float sunArcX = cos(sunAngle) * -0.28;
  float sunArcY = sin(sunAngle) * 0.38 - 0.08;

  vec3 sunDir = normalize(vec3(sunArcX, sunArcY, -1.0));
  /* 月亮位置：原型的 (−0.14, 0.42) 換算到我們這個直式畫面會落在**上緣之外**，
     只看得到半顆被切掉的光暈。往下往左挪，讓它整顆進到畫面左上、避開主卡包 */
  vec3 moonDir = normalize(vec3(-0.22, 0.24, -1.0));

  float waveAmp = ${sF(WAVE_AMP)};
  float fogDen  = ${sF(FOG_DEN)};
  float moonAmt = ${sF(MOON_AMT)};

  float sunAbove = step(0.0, sunDir.y);
  float sunGlow = smoothstep(-0.10, 0.06, sunDir.y);

  vec3 col;

  if (rd.y < 0.0) {
    float tFlat = ro.y / (-rd.y);
    float stepSize = tFlat / float(MARCH_STEPS);
    float t = stepSize;

    for (int i = 0; i < MARCH_STEPS; i++) {
      vec2 wpTest = ro.xz + rd.xz * t;
      float wy = ro.y + rd.y * t;
      if (wy < waveH(wpTest, uT, waveAmp)) break;
      t += stepSize;
    }

    float ta = t - stepSize;
    float tb = t;

    for (int i = 0; i < REFINE_STEPS; i++) {
      float tm = (ta + tb) * 0.5;
      vec2 wpm = ro.xz + rd.xz * tm;
      if (ro.y + rd.y * tm < waveH(wpm, uT, waveAmp)) tb = tm;
      else ta = tm;
    }

    t = (ta + tb) * 0.5;

    vec2 wp = ro.xz + rd.xz * t;
    vec3 n = waveNorm(wp, uT, waveAmp);
    vec3 vDir = -rd;

    float fres = pow(1.0 - clamp(dot(n, vDir), 0.0, 1.0), 4.0);

    vec3 refl = reflect(rd, n);
    float rh = clamp(refl.y, 0.0, 1.0);

    vec3 reflSky = mix(skyHori, skyTop, pow(rh, 0.42));
    reflSky = mix(reflSky, skyHori, 0.12);

    float rSun = max(dot(refl, sunDir), 0.0);
    reflSky += sunCol * pow(rSun, 120.0) * 2.0 * sunGlow;
    reflSky += sunCol * pow(rSun, 18.0) * 0.07 * sunGlow;

    if (moonAmt > 0.04) {
      float rMoon = max(dot(refl, moonDir), 0.0);
      reflSky += vec3(0.72, 0.80, 0.95) * pow(rMoon, 120.0) * 0.78 * moonAmt;
    }

    float depth = exp(-t * 0.40);
    vec3 waterC = mix(seaDeep, seaShlo, depth * 0.5);

    vec3 absorb = vec3(0.85, 0.92, 1.0);
    waterC *= mix(vec3(1.0), absorb, clamp(t * 0.25, 0.0, 1.0));

    col = mix(waterC, reflSky, 0.15 + fres * 0.34);

    float spec = pow(max(dot(reflect(-sunDir, n), vDir), 0.0), 200.0);
    col += sunCol * spec * 1.10 * sunAbove;

    float broadSpec = pow(max(dot(reflect(-sunDir, n), vDir), 0.0), 32.0);
    col += sunCol * broadSpec * 0.12 * sunGlow;

    float sunLine = pow(max(dot(reflect(rd, n), sunDir), 0.0), 8.0);
    col += sunCol * sunLine * 0.48 * smoothstep(0.0, 0.35, -rd.y) * sunGlow;

    float sparkle = noise(wp * 18.0 + vec2(uT * 0.55, uT * 0.22));
    sparkle = smoothstep(0.94, 1.0, sparkle);
    col += sunCol * sparkle * 0.08 * sunGlow * sunAbove;

    if (moonAmt > 0.04) {
      float mSpec = pow(max(dot(reflect(-moonDir, n), vDir), 0.0), 520.0);
      col += vec3(0.72, 0.80, 0.95) * mSpec * 0.09 * moonAmt;
    }

    float hC = waveH(wp, uT, waveAmp);
    float hL = waveH(wp - vec2(0.025, 0.0), uT, waveAmp);
    float hR = waveH(wp + vec2(0.025, 0.0), uT, waveAmp);
    float hD = waveH(wp - vec2(0.0, 0.025), uT, waveAmp);
    float hU = waveH(wp + vec2(0.0, 0.025), uT, waveAmp);

    float curvature = hR + hL + hU + hD - 4.0 * hC;
    float foam = clamp(curvature * 24.0, 0.0, 1.0);
    col += foam * vec3(1.0) * 0.03;

    float fog = 1.0 - exp(-t * fogDen * 1.65);
    col = mix(col, fogCol, fog);
  } else {
    float h = clamp(rd.y, 0.0, 1.0);
    col = mix(skyHori, skyTop, pow(h, 0.38));
  }

  float horizonW = 0.008;
  float skyMix = smoothstep(-horizonW, horizonW, rd.y);

  vec3 skyCol;
  {
    float h = clamp(rd.y, 0.0, 1.0);
    skyCol = mix(skyHori, skyTop, pow(h, 0.38));

    float cloudBand = noise(rd.x * 5.5 + vec2(rd.y * 3.0, uT * 0.015));
    float cloudBand2 = noise(rd.x * 8.0 - vec2(rd.y * 4.0, uT * 0.010));
    float clouds = smoothstep(0.62, 0.86, cloudBand * 0.65 + cloudBand2 * 0.35);
    clouds *= smoothstep(-0.02, 0.24, rd.y);
    clouds *= 0.08;

    skyCol = mix(skyCol, mix(skyCol * 0.97, vec3(1.0, 0.82, 0.65), 0.35), clouds);

    float sd = max(dot(rd, sunDir), 0.0);
    skyCol += sunCol * pow(sd, 380.0) * 6.8 * sunGlow;
    skyCol += sunCol * pow(sd, 22.0)  * 0.20 * sunGlow;
    skyCol += sunCol * pow(sd, 5.0)   * 0.09 * sunGlow;

    float sunDisk = smoothstep(0.99925, 0.99995, dot(rd, sunDir));
    skyCol += sunCol * sunDisk * 2.6 * sunGlow;

    float horizonBand = exp(-abs(rd.y) * 24.0);
    skyCol += sunCol * horizonBand * 0.11 * sunGlow;

    if (moonAmt > 0.04) {
      float md = max(dot(rd, moonDir), 0.0);
      /*
       * 月亮：原型的 (820, 7.4) 在近乎全黑的夜空裡是一顆亮月，
       * 但我們把夜色提亮、畫面又只有 375 寬 —— 同一組數字會糊成一顆
       * 過曝的白球（直徑快佔畫面寬的五分之一）。指數拉高把盤面收小、
       * 亮度與外圈光暈一起壓下來，才像月亮而不像探照燈。
       */
      skyCol += vec3(0.88, 0.92, 1.0) * pow(md, 2400.0) * 3.6 * moonAmt;
      skyCol += vec3(0.88, 0.92, 1.0) * pow(md, 6.0)    * 0.018 * moonAmt;
    }

    if (night > 0.02) {
      vec2 starUv = rd.xy / max(0.12, rd.z + 1.6);
      starUv *= 140.0;
      float stars = starField(starUv) + starField(starUv * 0.55 + 11.7) * 0.65;
      stars *= smoothstep(0.02, 0.26, rd.y);
      skyCol += vec3(0.80, 0.88, 1.0) * stars * night * 0.82;
    }

    float horizonMist = exp(-abs(rd.y) * 38.0);
    skyCol += fogCol * horizonMist * 0.09;
  }

  col = mix(col, skyCol, skyMix);

  float hEdge = smoothstep(-0.008, 0.018, rd.y);
  col = mix(fogCol, col, hEdge * 0.25 + 0.75);

  float grain = hash(gl_FragCoord.xy * 0.5 + floor(uT * 12.0)) - 0.5;
  col += grain * 0.006;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export const OCEAN_VERTEX_SHADER = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
