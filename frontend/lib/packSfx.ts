/**
 * 卡包輪播的音效（抽卡商品頁上半部）。
 *
 * 自老闆的原型 `public/images/card/pack-showcase.jsx` 逐段移植 ——
 * 全部是 WebAudio 合成，不載任何音檔。
 *
 * 噪音緩衝只建一次（1 秒的白噪音）之後重複使用：每次觸發都重生
 * 一段 buffer 的話，快速連續切換卡包會明顯卡頓。
 */

import { isSoundMuted } from '@/lib/soundPrefs';

let AC: AudioContext | null = null;
let NOISE: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (isSoundMuted()) return null;
  try {
    if (!AC) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      AC = new Ctor();
      const len = AC.sampleRate;
      const buf = AC.createBuffer(1, len, AC.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      NOISE = buf;
    }
    if (AC.state === 'suspended') void AC.resume();
    return AC;
  } catch {
    return null;
  }
}

/** iOS 的 AudioContext 必須在使用者手勢裡建立，否則第一次操作會沒聲音 */
export function unlockPackAudio() {
  ensure();
}

/** 切換卡包：咻 */
export function swoosh() {
  const c = ensure();
  if (!c || !NOISE) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = NOISE;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(2200, t);
  f.frequency.exponentialRampToValueAtTime(350, t + 0.28);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(t);
  src.stop(t + 0.32);
}

/** 開始拖曳：鋁箔窸窣（四段高通噪音錯開，才像袋子被捏到） */
export function crinkle() {
  const c = ensure();
  if (!c || !NOISE) return;
  const t = c.currentTime;
  for (let k = 0; k < 4; k++) {
    const st = t + k * 0.028 + Math.random() * 0.015;
    const src = c.createBufferSource();
    src.buffer = NOISE;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2600 + Math.random() * 2200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, st);
    g.gain.exponentialRampToValueAtTime(0.1 + Math.random() * 0.06, st + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(st);
    src.stop(st + 0.06);
  }
}
