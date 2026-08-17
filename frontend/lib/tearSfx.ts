/**
 * 一番賞撕紙音效與彩帶。
 *
 * 音效自老闆的原型 `public/images/ichiban-tear/ichiban-tear.html` 逐段移植 ——
 * 全部是 WebAudio 合成，不載任何音檔。
 *
 * 為什麼不是播一顆 mp3：撕紙的聲音要跟著手指走。原型的做法是
 *   拖曳中每 8px 觸發一次 crackle（虛線孔一格格裂開的細碎「啵啵」）
 *   撕開瞬間才放 bigRip（三層「唰——」疊在一起，加一記低頻撞擊）
 * 先前站上的版本是在翻頁動畫**完成之後**才播一顆 0.5 秒的撕紙 mp3，
 * 玩家整段拖曳都是安靜的，聲音永遠慢半拍。
 */

let AC: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!AC) AC = new Ctor();
    if (AC.state === 'suspended') void AC.resume();
    return AC;
  } catch {
    return null;
  }
}

/** iOS 要在使用者手勢裡先解鎖，否則第一次撕會沒聲音 */
export function unlockTearAudio() {
  ctx();
}

function noiseBuffer(ac: AudioContext, dur: number) {
  const b = ac.createBuffer(1, Math.max(1, (ac.sampleRate * dur) | 0), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** 拖曳中的細碎「啵啵」聲：模擬虛線孔一格格裂開。intensity 0~1 */
export function crackle(intensity: number) {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.07);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400 + Math.random() * 2600;
  bp.Q.value = 1.2 + Math.random() * 2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.1 + 0.3 * intensity, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.08);
}

/** 撕開瞬間的大聲「唰——」 */
export function bigRip() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  for (let i = 0; i < 3; i++) {
    const st = t + i * 0.055;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.34);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(3200 - i * 500, st);
    bp.frequency.exponentialRampToValueAtTime(520, st + 0.3);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.42 - i * 0.09, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.32);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(st);
    src.stop(st + 0.36);
  }
  /*
   * 纖維分離的「沙——」尾音（高頻噪音短衰減）。
   * 老闆改版後的原型 ichiban-tear_1 用它取代了原本的低頻頓感 ——
   * 低頻聽起來像東西掉在桌上，高頻尾音才像紙纖維被扯開。
   */
  const tail = ac.createBufferSource();
  tail.buffer = noiseBuffer(ac, 0.28);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3800;
  const tg = ac.createGain();
  tg.gain.setValueAtTime(0.0001, t + 0.08);
  tg.gain.exponentialRampToValueAtTime(0.18, t + 0.13);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  tail.connect(hp).connect(tg).connect(ac.destination);
  tail.start(t + 0.08);
  tail.stop(t + 0.36);
}

/** 紙屑顏色：紙白 ×2（比例高）＋ 券面紅＋米色，同原型 */
const BIT_COLORS = ['#f6efe2', '#f6efe2', '#b8262b', '#e8dcc4'];

/**
 * 撕開後從撕線噴出的紙屑（同老闆原型 ichiban-tear_1 的 spawnBits）。
 *
 * 不是彩色彩帶而是紙屑 —— 顏色取自券本身，噴發角度集中在撕線附近再往下掉，
 * 看起來才像「這張紙被撕開」而不是「有人在慶祝」。
 * 動畫結束自己移除，不留 DOM。
 */
export function spawnConfetti(host: HTMLElement, count = 16) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const rect = host.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:60';
  host.appendChild(layer);

  const w = rect.width || 375;
  const h = rect.height || 400;
  let alive = count;

  for (let i = 0; i < count; i++) {
    const b = document.createElement('i');
    const size = 3 + Math.random() * 5;
    b.style.cssText = [
      'position:absolute',
      'border-radius:1px',
      `width:${size}px`,
      `height:${size * (0.6 + Math.random())}px`,
      `background:${BIT_COLORS[i % BIT_COLORS.length]}`,
      // 從撕線附近散出（券大約在畫面中段）
      `left:${w * 0.5}px`,
      `top:${h * 0.42 + Math.random() * h * 0.16}px`,
      'will-change:transform,opacity',
    ].join(';');
    layer.appendChild(b);

    const ang = -0.6 + Math.random() * 1.2;
    const dist = 60 + Math.random() * 130;
    const anim = b.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist + 90}px) rotate(${Math.random() * 400 - 200}deg)`,
          opacity: 0,
        },
      ],
      { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      if (--alive <= 0) layer.remove();
    };
  }

  // 保險：動畫被中斷（分頁切走）時也要清掉
  window.setTimeout(() => layer.remove(), 2200);
}

/**
 * 撕開瞬間的黃光一閃（同老闆原型 ichiban-tear_1 的 #flash.pop）。
 *
 * 徑向漸層由畫面 50%/46% 往外淡出，0.55 秒內快速亮起再收掉 ——
 * 18% 處到最亮是刻意的：亮得比撕開動作稍慢一點點，才像被「撕」出來的光。
 * 蓋在紙屑之下（z-index 29 對 60），光是背景、紙屑要看得見。
 */
export function flashPop(host: HTMLElement) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute',
    'inset:0',
    'background:radial-gradient(circle at 50% 46%,rgba(255,238,200,.95),rgba(255,238,200,0) 55%)',
    'opacity:0',
    'z-index:29',
    'pointer-events:none',
  ].join(';');
  host.appendChild(el);

  const anim = el.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0 }],
    { duration: 550, easing: 'ease-out', fill: 'forwards' }
  );
  anim.onfinish = () => el.remove();
  window.setTimeout(() => el.remove(), 1200);
}
