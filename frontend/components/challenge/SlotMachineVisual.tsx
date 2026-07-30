'use client';

import { useRef, useEffect, useCallback } from 'react';

type SpinState = 'idle' | 'spinning' | 'video' | 'result';

export interface SlotMachineVisualProps {
  spinState: SpinState;
  isRushActive: boolean;
  rushHitsRemaining: number;
  isAuto: boolean;
  spinsThisTier: number;
  floorSpinCount: number;
  rushTriggered: boolean;
  onSpin: () => void;
  onDirect: () => void;
  onAutoToggle: () => void;
}

const SYMS = [
  { t: '7',   cls: 'smv-s7'    },
  { t: '🐯',  cls: 'smv-sHu'   },
  { t: '🍊',  cls: 'smv-sSho'  },
  { t: 'BAR', cls: 'smv-sBar'  },
  { t: '⚡',  cls: 'smv-sBolt' },
  { t: '★',  cls: 'smv-sStar'  },
];
const N = SYMS.length, REP = 5;
const MARQUEE_DEFAULT = '★ GGB RUSH ★ 押忍!! ★ 拉下拉桿試試手氣 ★ GOOD LUCK ★';

const SMV_CSS = `
.smv-stage {
  position:relative; width:100%; aspect-ratio:750/932;
  container-type:inline-size;
  animation:smv-breathe 3.4s ease-in-out infinite;
  user-select:none; -webkit-user-select:none;
  font-family:"PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
  overflow:hidden;
}
@keyframes smv-breathe {
  0%,100%{filter:drop-shadow(0 0 16px rgba(255,150,40,.16));}
  50%    {filter:drop-shadow(0 0 32px rgba(255,180,60,.38));}
}
.smv-stage.smv-rushmode{animation:smv-breatheFast .4s ease-in-out infinite;}
@keyframes smv-breatheFast{
  0%,100%{filter:drop-shadow(0 0 24px rgba(255,70,40,.5));}
  50%    {filter:drop-shadow(0 0 54px rgba(255,220,70,.9));}
}

/* Machine base */
.smv-machine{
  position:absolute;inset:0;
  background:url('/images/slot/machine/main.png') center/100% 100% no-repeat;
  pointer-events:none;
}

/* RUSH sign */
.smv-rushsign{
  position:absolute;left:27.07%;top:27.15%;width:45.87%;height:8.8%;z-index:5;
  background:url('/images/slot/machine/light_rush.png') center/100% 100% no-repeat;
  pointer-events:none;
  animation:smv-signPulse 2.4s ease-in-out infinite;transform-origin:center;
}
@keyframes smv-signPulse{
  0%,100%{opacity:.72;filter:drop-shadow(0 0 .3cqw rgba(255,190,60,.4));}
  50%    {opacity:1;  filter:drop-shadow(0 0 1.6cqw rgba(255,200,70,.95));}
}
.smv-stage.smv-spinning .smv-rushsign{animation-duration:.85s;}
.smv-stage.smv-rushmode .smv-rushsign{animation:smv-signStrobe .15s steps(2) infinite;}
@keyframes smv-signStrobe{
  0% {opacity:1;transform:scale(1.06);filter:drop-shadow(0 0 2.2cqw #ffd84d) brightness(1.5);}
  50%{opacity:.25;transform:scale(1);}
}

/* Marquee */
.smv-marquee{
  position:absolute;left:24.93%;top:14.59%;width:50%;height:7.83%;
  overflow:hidden;border-radius:1cqw;display:flex;align-items:center;z-index:5;
}
.smv-marquee-txt{
  white-space:nowrap;font-weight:900;letter-spacing:.35cqw;font-size:3.6cqw;color:#ffb51e;
  text-shadow:0 0 .8cqw #ff8c00,0 0 2.4cqw rgba(255,120,0,.9);
  animation:smv-ticker 9s linear infinite;
}
@keyframes smv-ticker{from{transform:translateX(100%);}to{transform:translateX(-100%);}}
.smv-marquee.smv-win .smv-marquee-txt{
  animation:smv-strobeTxt .22s steps(2) infinite;
  font-size:4.4cqw;margin:auto;transform:none;
  color:#fff35e;text-shadow:0 0 1cqw #ff2a00,0 0 3cqw #ffb300;
}
@keyframes smv-strobeTxt{0%{opacity:1;}50%{opacity:.15;}}
.smv-marquee::after{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(rgba(0,0,0,.55) 28%,transparent 32%);
  background-size:.9cqw .9cqw;
}

/* Reels */
.smv-reel{position:absolute;overflow:hidden;z-index:3;}
.smv-r0{left:22.00%;top:40.77%;width:17.07%;height:15.88%;}
.smv-r1{left:42.40%;top:40.77%;width:16.13%;height:15.88%;}
.smv-r2{left:61.73%;top:40.77%;width:16.27%;height:15.88%;}
.smv-strip{position:absolute;left:0;width:100%;will-change:transform;}
.smv-cell{
  height:var(--smv-rowH,80px);display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:9.5cqw;
  font-family:Impact,"Arial Black","Microsoft JhengHei",sans-serif;
}
.smv-s7  {color:#e03014;text-shadow:.3cqw .3cqw 0 #7a0d00;}
.smv-sHu {color:#ff9500;text-shadow:.3cqw .3cqw 0 #6b3c00;}
.smv-sSho{color:#d4a017;text-shadow:.3cqw .3cqw 0 #5e4506;}
.smv-sBar{color:#1c1c1c;font-size:7cqw;letter-spacing:.2cqw;text-shadow:.2cqw .2cqw 0 #999;}
.smv-sBolt{color:#f5c400;text-shadow:0 0 1.2cqw #ff9d00;}
.smv-sStar{color:#b03df0;text-shadow:.3cqw .3cqw 0 #4d0f73;}
.smv-reel.smv-blur .smv-strip{filter:blur(.45cqw);}
.smv-shade{
  position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(rgba(70,70,70,.3),transparent 26%,transparent 74%,rgba(70,70,70,.3));
}
.smv-reel.smv-hit{animation:smv-reelFlash .3s steps(2) 6;}
@keyframes smv-reelFlash{
  0% {box-shadow:inset 0 0 0 .6cqw #ffe14d,0 0 2.6cqw #ffd000;}
  50%{box-shadow:none;}
}

/* Lever */
.smv-lever-hit{position:absolute;left:2%;top:44%;width:16%;height:26%;z-index:7;cursor:pointer;}
.smv-lever{position:absolute;left:5.07%;top:50.32%;height:30.47%;z-index:6;pointer-events:none;}
.smv-lf{position:absolute;left:0;top:0;height:100%;background:center/100% 100% no-repeat;opacity:0;}
.smv-lf.show{opacity:1;}
.smv-lf1{aspect-ratio:69/284;background-image:url('/images/slot/machine/1.png');}
.smv-lf2{aspect-ratio:73/284;background-image:url('/images/slot/machine/2.png');}
.smv-lf3{aspect-ratio:74/284;background-image:url('/images/slot/machine/3.png');}
.smv-lf4{aspect-ratio:70/284;background-image:url('/images/slot/machine/4.png');}

/* Buttons */
.smv-btn{position:absolute;z-index:7;cursor:pointer;background:center/100% 100% no-repeat;}
.smv-btn-auto{left:21.87%;top:61.48%;width:17.33%;height:8.58%;background-image:url('/images/slot/machine/auto.png');}
.smv-btn-spin{
  left:39.20%;top:62.34%;width:23.73%;height:11.16%;
  background-image:url('/images/slot/machine/spin.png');
  animation:smv-invite 1.8s ease-in-out infinite;
}
.smv-btn-rush{left:62.93%;top:61.48%;width:17.33%;height:8.58%;background-image:url('/images/slot/machine/rush.png');}
@keyframes smv-invite{
  0%,100%{filter:drop-shadow(0 0 .2cqw rgba(255,220,120,.3));}
  50%    {filter:drop-shadow(0 0 1.6cqw rgba(255,220,120,.95)) brightness(1.12);}
}
.smv-btn:hover {filter:brightness(1.15) drop-shadow(0 0 1cqw rgba(255,230,150,.8));}
.smv-btn:active{transform:translateY(3%) scale(.97);filter:brightness(.92);}
.smv-stage.smv-spinning .smv-btn,.smv-stage.smv-spinning .smv-lever-hit{pointer-events:none;}
.smv-stage.smv-spinning .smv-btn{filter:saturate(.6) brightness(.85);animation:none;}
.smv-btn-auto.smv-on{animation:smv-autopulse .9s infinite;}
@keyframes smv-autopulse{50%{filter:brightness(1.5) drop-shadow(0 0 1.4cqw #ffd84d);}}

/* RUSH in-game: spin button pulses orange */
.smv-stage.smv-rushmode .smv-btn-spin{animation:smv-rushspin .35s ease-in-out infinite;}
@keyframes smv-rushspin{
  0%,100%{filter:drop-shadow(0 0 .4cqw rgba(255,80,0,.6)) brightness(1);}
  50%    {filter:drop-shadow(0 0 2cqw rgba(255,120,0,.95)) brightness(1.2);}
}

/* Flash */
.smv-flash{
  position:absolute;inset:0;pointer-events:none;z-index:10;opacity:0;
  background:radial-gradient(circle at 50% 42%,rgba(255,250,220,.98),rgba(255,190,60,.6) 45%,transparent 75%);
}
.smv-flash.go{animation:smv-flashout .6s ease-out both;}
@keyframes smv-flashout{0%{opacity:1;}100%{opacity:0;}}

/* Shake */
.smv-stage.smv-shake{animation:smv-shake .09s linear 10 !important;}
@keyframes smv-shake{
  25%{transform:translate(.6cqw,-.4cqw) rotate(.3deg);}
  75%{transform:translate(-.6cqw,.4cqw) rotate(-.3deg);}
}

/* Coins */
.smv-coin{
  position:absolute;width:4.6cqw;height:4.6cqw;border-radius:50%;
  pointer-events:none;z-index:8;
  background:radial-gradient(circle at 35% 28%,#fff6bd,#ffd93a 42%,#eda800 72%,#b97a00);
  border:.4cqw solid #925f00;
  display:flex;align-items:center;justify-content:center;
  color:#8a5a00;font-weight:900;font-size:2.4cqw;
  font-family:Impact,"Arial Black",sans-serif;
  box-shadow:0 0 1.2cqw rgba(255,190,40,.95),inset 0 -.4cqw .6cqw rgba(140,80,0,.5);
}

/* Big win overlay */
.smv-bigwin{
  position:absolute;inset:0;display:none;
  align-items:center;justify-content:center;pointer-events:none;z-index:9;
}
.smv-bigwin.show{display:flex;}
.smv-bigwin-txt{
  font-family:Impact,"Arial Black","Microsoft JhengHei",sans-serif;
  font-size:14cqw;font-weight:900;letter-spacing:1cqw;white-space:nowrap;
  background:linear-gradient(#fff8c2,#ffd400 40%,#ff7a00 70%,#ffd400);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 1.5cqw #ff3c00) drop-shadow(.5cqw .8cqw 0 rgba(80,20,0,.9));
  animation:smv-winpop .5s cubic-bezier(.2,2.4,.4,1) both,smv-winstrobe .16s steps(2) .5s infinite;
}
@keyframes smv-winpop{
  from{transform:scale(.1) rotate(-8deg);opacity:0;}
  to  {transform:scale(1)  rotate(-4deg);opacity:1;}
}
@keyframes smv-winstrobe{
  50%{filter:drop-shadow(0 0 4cqw #fff35e) drop-shadow(.5cqw .8cqw 0 rgba(80,20,0,.9)) brightness(1.6);}
}

/* RUSH badge */
.smv-rush-badge{
  position:absolute;top:2.8%;left:50%;transform:translateX(-50%);
  background:linear-gradient(135deg,#ffd700,#ff9500);
  color:#1a0a00;font-weight:900;font-size:3cqw;
  padding:.45cqw 1.4cqw;border-radius:3cqw;
  z-index:6;white-space:nowrap;
  box-shadow:0 0 2cqw rgba(255,215,0,.9);
  animation:smv-badgePulse .9s ease-in-out infinite;
}
@keyframes smv-badgePulse{
  0%,100%{box-shadow:0 0 2cqw rgba(255,215,0,.8);}
  50%    {box-shadow:0 0 4cqw rgba(255,215,0,1),0 0 8cqw rgba(255,140,0,.6);}
}

/* 保底進度條：夾在三個 reel 正上方 */
.smv-floor-bar{
  position:absolute;left:22%;top:38.8%;width:56.5%;height:1.2%;
  background:rgba(0,0,0,.45);border-radius:.8cqw;z-index:4;overflow:hidden;
}
.smv-floor-fill{
  height:100%;
  background:linear-gradient(90deg,#e55b00,#ffd700);
  transition:width .3s ease;
}
`;

export default function SlotMachineVisual({
  spinState, isRushActive, rushHitsRemaining, isAuto,
  spinsThisTier, floorSpinCount, rushTriggered,
  onSpin, onDirect, onAutoToggle,
}: SlotMachineVisualProps) {
  const stageRef    = useRef<HTMLDivElement>(null);
  const marqueeTxt  = useRef<HTMLDivElement>(null);
  const marqueeWrap = useRef<HTMLDivElement>(null);
  const reelEls     = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const stripEls    = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const leverEls    = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const flashEl     = useRef<HTMLDivElement>(null);
  const bigwinEl    = useRef<HTMLDivElement>(null);
  const offsets     = useRef([0, 0, 0]);
  const rowH        = useRef(80);
  const rafId       = useRef(0);
  const prevSpin    = useRef<SpinState>('idle');
  const prevRushTrig = useRef(false);

  // Inject CSS once
  useEffect(() => {
    if (document.getElementById('smv-css')) return;
    const el = document.createElement('style');
    el.id = 'smv-css';
    el.textContent = SMV_CSS;
    document.head.appendChild(el);
  }, []);

  // Build reel strips
  useEffect(() => {
    stripEls.current.forEach(strip => {
      if (!strip) return;
      let html = '';
      for (let k = 0; k < REP; k++)
        for (const s of SYMS)
          html += `<div class="smv-cell ${s.cls}">${s.t}</div>`;
      strip.innerHTML = html;
    });
    sync();
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      cancelAnimationFrame(rafId.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = useCallback(() => {
    const h = reelEls.current[0]?.clientHeight ?? 80;
    rowH.current = h;
    stageRef.current?.style.setProperty('--smv-rowH', h + 'px');
  }, []);

  // Sync stage CSS classes + trigger animations
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.classList.toggle('smv-spinning', spinState === 'spinning');
    stage.classList.toggle('smv-rushmode', isRushActive);

    if (spinState === 'spinning' && prevSpin.current !== 'spinning') {
      leverPull();
      reelSpin();
    }
    prevSpin.current = spinState;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinState, isRushActive]);

  // Win effects on rush trigger
  useEffect(() => {
    if (rushTriggered && !prevRushTrig.current) {
      flash();
      shake();
      coinBurst();
      bigWin();
      winMarquee();
    }
    prevRushTrig.current = rushTriggered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rushTriggered]);

  const showFrame = useCallback((i: number) => {
    leverEls.current.forEach((f, k) => f?.classList.toggle('show', k === i));
  }, []);

  const leverPull = useCallback(() => {
    [1, 2, 3, 0].forEach((f, i) => setTimeout(() => showFrame(f), i * 80));
  }, [showFrame]);

  const reelSpin = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    const rh = rowH.current;
    const cycle = N * REP * rh;
    const targets = [0, 1, 2].map((_, i) => ({
      i, target: Math.floor(Math.random() * N), dur: 900 + i * 200,
    }));
    reelEls.current.forEach(r => r?.classList.add('smv-blur'));
    const start = [...offsets.current];
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);

    function frame(now: number) {
      const el = now - t0;
      let done = true;
      for (const a of targets) {
        const p = Math.min(el / a.dur, 1);
        const strip = stripEls.current[a.i];
        const reel  = reelEls.current[a.i];
        const endAt = ((a.target * rh) % (N * rh) + N * rh) % (N * rh);
        const dist  = (2 + a.i) * cycle + ((endAt - (start[a.i] % cycle)) + cycle) % cycle;
        const pos   = start[a.i] + dist * ease(p);
        offsets.current[a.i] = pos;
        if (strip) strip.style.transform = `translateY(${-(pos % (N * rh))}px)`;
        if (p > 0.65) reel?.classList.remove('smv-blur');
        if (p < 1) done = false;
      }
      if (!done) {
        rafId.current = requestAnimationFrame(frame);
      } else {
        reelEls.current.forEach(r => r?.classList.remove('smv-blur'));
      }
    }
    rafId.current = requestAnimationFrame(frame);
  }, []);

  const flash = useCallback(() => {
    const el = flashEl.current;
    if (!el) return;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }, []);

  const shake = useCallback(() => {
    const s = stageRef.current;
    if (!s) return;
    s.classList.add('smv-shake');
    setTimeout(() => s.classList.remove('smv-shake'), 950);
  }, []);

  const coinBurst = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const burst = () => {
      for (let i = 0; i < 26; i++) {
        const c = document.createElement('div');
        c.className = 'smv-coin';
        c.textContent = 'G';
        c.style.cssText = 'left:50%;top:48%';
        stage.appendChild(c);
        const ang = Math.random() * Math.PI * 2;
        const sp = 16 + Math.random() * 34;
        let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp - 26, x = 0, y = 0, life = 0;
        const flip = 6 + Math.random() * 10;
        (function fly() {
          life++; vy += 3.2 * 0.14; x += vx * 0.14; y += vy * 0.14;
          c.style.transform = `translate(${x}cqw,${y}cqw) rotateY(${life * flip}deg) rotate(${life * 4}deg)`;
          c.style.opacity = String(1 - life / 68);
          if (life < 68) requestAnimationFrame(fly); else c.remove();
        })();
      }
    };
    burst();
    setTimeout(burst, 750);
  }, []);

  const bigWin = useCallback(() => {
    const el = bigwinEl.current;
    if (!el) return;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }, []);

  const winMarquee = useCallback(() => {
    const wrap = marqueeWrap.current;
    const txt  = marqueeTxt.current;
    if (!wrap || !txt) return;
    wrap.classList.add('smv-win');
    txt.textContent = '大当り RUSH !!';
    setTimeout(() => {
      wrap.classList.remove('smv-win');
      txt.textContent = MARQUEE_DEFAULT;
    }, 3200);
  }, []);

  const floorPct = floorSpinCount > 0
    ? Math.min((spinsThisTier / floorSpinCount) * 100, 100)
    : 0;

  const canAct = spinState === 'idle';

  return (
    <div ref={stageRef} className="smv-stage">
      {/* Machine background */}
      <div className="smv-machine" />

      {/* RUSH sign */}
      <div className="smv-rushsign" />

      {/* Marquee */}
      <div ref={marqueeWrap} className="smv-marquee">
        <div ref={marqueeTxt} className="smv-marquee-txt">{MARQUEE_DEFAULT}</div>
      </div>

      {/* 保底進度條 */}
      {!isRushActive && floorSpinCount > 0 && (
        <div className="smv-floor-bar">
          <div className="smv-floor-fill" style={{ width: `${floorPct}%` }} />
        </div>
      )}

      {/* Reels */}
      {[0, 1, 2].map(i => (
        <div key={i} ref={el => { reelEls.current[i] = el; }} className={`smv-reel smv-r${i}`}>
          <div ref={el => { stripEls.current[i] = el; }} className="smv-strip" />
          <div className="smv-shade" />
        </div>
      ))}

      {/* Flash */}
      <div ref={flashEl} className="smv-flash" />

      {/* Lever */}
      <div className="smv-lever-hit" onClick={canAct ? onSpin : undefined} />
      <div className="smv-lever">
        {[0, 1, 2, 3].map(i => (
          <div key={i} ref={el => { leverEls.current[i] = el; }}
            className={`smv-lf smv-lf${i + 1}${i === 0 ? ' show' : ''}`}
          />
        ))}
      </div>

      {/* Buttons */}
      <div
        className={`smv-btn smv-btn-auto${isAuto ? ' smv-on' : ''}`}
        onClick={onAutoToggle}
      />
      <div className="smv-btn smv-btn-spin" onClick={canAct ? onSpin : undefined} />
      <div className="smv-btn smv-btn-rush" onClick={canAct ? onDirect : undefined} />

      {/* RUSH badge */}
      {isRushActive && rushHitsRemaining > 0 && (
        <div className="smv-rush-badge">⚡ RUSH ×{rushHitsRemaining}</div>
      )}

      {/* Big win overlay */}
      <div ref={bigwinEl} className="smv-bigwin">
        <span className="smv-bigwin-txt">大当り!!</span>
      </div>
    </div>
  );
}
