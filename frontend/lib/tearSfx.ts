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
  // 低頻撞擊：讓「唰」有重量，不然只有高頻沙沙聲
  const th = ac.createOscillator();
  const tg = ac.createGain();
  th.type = 'sine';
  th.frequency.setValueAtTime(140, t);
  th.frequency.exponentialRampToValueAtTime(50, t + 0.18);
  tg.gain.setValueAtTime(0.22, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  th.connect(tg).connect(ac.destination);
  th.start(t);
  th.stop(t + 0.22);
}

const CONFETTI_COLORS = ['#F5C24B', '#E8574A', '#4FA3E3', '#67C98B', '#B87CE8', '#FFFFFF'];

/**
 * 撕開後的彩帶。
 *
 * 用 Web Animations API 而不是 CSS keyframes：每片彩帶的軌跡都不一樣，
 * 用 CSS 要嘛生一堆 keyframes、要嘛全部同一條路徑（看起來就很假）。
 * 動畫結束自己移除，不留 DOM。
 */
export function spawnConfetti(host: HTMLElement, count = 28) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const rect = host.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.style.cssText =
    'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:60';
  host.appendChild(layer);

  const w = rect.width || 375;
  const h = rect.height || 400;
  let alive = count;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('i');
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const long = Math.random() > 0.45;
    el.style.cssText = [
      'position:absolute',
      `left:${w * (0.28 + Math.random() * 0.44)}px`,
      `top:${h * 0.42}px`,
      `width:${long ? 5 : 7}px`,
      `height:${long ? 14 : 7}px`,
      `background:${color}`,
      long ? 'border-radius:1px' : 'border-radius:50%',
      'will-change:transform,opacity',
    ].join(';');
    layer.appendChild(el);

    // 往上噴再落下，橫向散開；每片的力道與旋轉都不同
    const dx = (Math.random() - 0.5) * w * 0.9;
    const up = h * (0.22 + Math.random() * 0.3);
    const dur = 900 + Math.random() * 700;
    const spin = (Math.random() - 0.5) * 900;

    const anim = el.animate(
      [
        { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate3d(${dx * 0.6}px,${-up}px,0) rotate(${spin * 0.5}deg)`,
          opacity: 1,
          offset: 0.35,
        },
        {
          transform: `translate3d(${dx}px,${h * 0.62}px,0) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      { duration: dur, easing: 'cubic-bezier(.22,.68,.4,1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      if (--alive <= 0) layer.remove();
    };
  }

  // 保險：動畫被中斷（分頁切走）時也要清掉
  window.setTimeout(() => layer.remove(), 2600);
}
