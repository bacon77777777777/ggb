'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  initGachaKnobAudio, disposeGachaKnobAudio, setKnobAmbience, setKnobMusicVolume, setKnobDucking,
  sfxCoin, sfxKnobTick, sfxKnobRelease, sfxKnobNudge, sfxHatch, sfxCapsuleHit,
  sfxCapsuleRoll, sfxCapsuleLand, sfxFlap, sfxKnobDing,
} from './gachaKnobSfx';

/**
 * 旋鈕轉蛋機的音效編排（mode2 / mode3 / mode5 共用）
 *
 * 三台機器的邏輯本來就是同一份複製三次，音效只寫一份掛上去，
 * 不要再各自 `playSfx` —— 那正是原本「三個音檔、頭尾各一聲」的來源。
 *
 * 這支負責的是**時間軸對齊**：聲音掛在動畫與物理事件上，不是掛在 React
 * 的 state 翻轉上。旋鈕的棘輪聲照「實際轉到的角度」發（跟著 framer 的
 * 緩動曲線走），落蛋的閘門／滾動／落地照落蛋動畫的節點發。
 */

/** 旋鈕動畫：跟機台元件的 framer-motion 設定一致（duration 1.2s、cubic-bezier(.4,0,.2,1)）*/
const SPIN_MS = 1200;
const SPIN_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
/** 棘輪齒數：一圈幾聲。太多會糊成噪音，太少不像機構 */
const TEETH = 22;
/** 落蛋動畫 0.8s；落地聲提早 80ms —— 聲音比畫面早一點點才對得上眼睛 */
const DROP_MS = 800;
const LAND_LEAD_MS = 80;
/* 背景音樂音量。音符本身的振幅是 0.07 上下，乘完大約 -28dBFS ——
   機械音出來時還聽得到、但不會蓋過它。太吵的話改這一個數字就好 */
const MUSIC_VOLUME = 0.5;

/** cubic-bezier 求值：給經過時間的比例 x，回傳動畫進度 y */
function bezierProgress(x: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = (u: number) => 3 * u * (1 - u) ** 2 * x1 + 3 * u ** 2 * (1 - u) * x2 + u ** 3;
  const cy = (u: number) => 3 * u * (1 - u) ** 2 * y1 + 3 * u ** 2 * (1 - u) * y2 + u ** 3;
  // 二分法八次就夠精確（誤差 < 0.4%），這是每幀跑的東西，不需要牛頓法
  let lo = 0, hi = 1, u = x;
  for (let i = 0; i < 8; i++) {
    u = (lo + hi) / 2;
    if (cx(u) < x) lo = u; else hi = u;
  }
  return cy(u);
}

export function useKnobMachineSfx({
  isShaking,
  isDropping,
  isWaiting,
  /** 這一次有沒有轉整圈（推一下＝沒有，立即轉蛋／試試看＝有） */
  spins,
}: {
  isShaking: boolean;
  isDropping: boolean;
  isWaiting: boolean;
  spins: boolean;
}) {
  const prevShaking = useRef(false);
  const prevDropping = useRef(false);
  const prevWaiting = useRef(false);
  const spinRaf = useRef(0);
  const timers = useRef<number[]>([]);
  /*
   * 進頁面時蛋還會自己沉一下（物理迴圈一掛載就在跑），那幾聲落在玩家還沒
   * 按任何東西的時候，聽起來像雜音。第一次轉動之後才開始讓碰撞出聲。
   */
  const armed = useRef(false);

  // 掛載就把引擎接上：待機嗡鳴讓機台「活著」，背景音樂進頁面就跑
  useEffect(() => {
    initGachaKnobAudio();
    setKnobAmbience(true);
    setKnobMusicVolume(MUSIC_VOLUME);
    return () => {
      cancelAnimationFrame(spinRaf.current);
      timers.current.forEach(clearTimeout);
      timers.current = [];
      disposeGachaKnobAudio();
    };
  }, []);

  // 演出中把音樂壓低，機械聲才出得來
  useEffect(() => { setKnobDucking(isShaking || isDropping); }, [isShaking, isDropping]);

  // 轉動：投幣 → 棘輪（跟著實際角度）→ 轉到底的凸輪聲
  useEffect(() => {
    if (isShaking && !prevShaking.current) {
      armed.current = true;
      sfxCoin();
      if (!spins) {
        // 推一下不轉整圈，機構只有一聲悶響；蛋撞來撞去的聲音由物理事件自己發
        const id = window.setTimeout(() => sfxKnobNudge(), 90);
        timers.current.push(id);
      } else {
        const start = performance.now();
        let nextTooth = 1 / TEETH;
        let lastP = 0;
        const tick = () => {
          const x = Math.min(1, (performance.now() - start) / SPIN_MS);
          const p = bezierProgress(x, SPIN_EASE);
          // 轉得快的時候棘輪聲大一點 —— 手感就是從這種細節來的
          const speed = Math.min(1, (p - lastP) * 45);
          lastP = p;
          while (p >= nextTooth && nextTooth <= 1) {
            sfxKnobTick(0.35 + speed * 0.65);
            nextTooth += 1 / TEETH;
          }
          if (x < 1) spinRaf.current = requestAnimationFrame(tick);
          else sfxKnobRelease();
        };
        spinRaf.current = requestAnimationFrame(tick);
      }
    }
    prevShaking.current = isShaking;
  }, [isShaking, spins]);

  // 落蛋：閘門 → 滑道滾動 → 落地叩
  useEffect(() => {
    if (isDropping && !prevDropping.current) {
      sfxHatch();
      timers.current.push(window.setTimeout(() => sfxCapsuleRoll(), 110));
      timers.current.push(window.setTimeout(() => sfxCapsuleLand(), DROP_MS - LAND_LEAD_MS));
    }
    prevDropping.current = isDropping;
  }, [isDropping]);

  // 蛋停在取物口：提示 ding
  useEffect(() => {
    if (isWaiting && !prevWaiting.current) sfxKnobDing();
    prevWaiting.current = isWaiting;
  }, [isWaiting]);

  /** 蛋的碰撞（物理迴圈裡呼叫，力道 0~1）。節流與門檻在引擎裡做 */
  const collision = useCallback((power: number) => {
    if (!armed.current) return;
    sfxCapsuleHit(power);
  }, []);
  /** 玩家點取物口 */
  const pickup = useCallback(() => sfxFlap(), []);

  return { collision, pickup };
}
