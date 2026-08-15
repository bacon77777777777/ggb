'use client';
/* eslint-disable @next/next/no-img-element -- 封面／商品圖是 R2 外站網址、要 object-fit 滿版，走原生 img */

/**
 * 商城短影音 —— 播放頁（第 0 期原型，規格見 docs/06_商城短影音開發文件.md §5）
 *
 * 網頁做 Reels 的三個硬限制都在這裡處理：
 *  1. 自動播放必須靜音：一開始 muted 自動播；使用者點「開聲音」那一下，
 *     把**固定 3 個 <video>**（播放器池）都 muted=false 並 play()/pause() 一次解鎖，
 *     之後只換 src 不 new 元素——iOS 只認被點過的元素，每支 new 一個會再被靜音。
 *  2. 低耗電模式擋自動播放：play() 被拒就顯示中央播放鈕，不當錯誤。
 *  3. 記憶體：同時只有目前 ±1 三支真的有 <video>，其餘只有封面圖。
 *
 * 捲動用原生 scroll-snap（硬體捲動），IntersectionObserver 決定「目前這支」；
 * 網址跟著捲到哪一支 replace 成 /sell/reels/<id>，分享／重新整理都回得來。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, Share2, Volume2, VolumeX, ChevronLeft, Play } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { REELS_PROTO, type Reel } from '@/lib/sell/reelsProto';
import '@/app/sell/market.css';
import '@/app/sell/reels/reels.css';

const POOL = 3;

export default function ReelsFeed({ startId }: { startId?: number }) {
  const router = useRouter();
  const { showToast } = useToast();

  // 深連結那支排第一，其餘照原順序
  const [items] = useState<Reel[]>(() => {
    const list = [...REELS_PROTO];
    if (startId) {
      const i = list.findIndex((r) => r.id === startId);
      if (i > 0) {
        const [x] = list.splice(i, 1);
        list.unshift(x);
      }
    }
    return list;
  });

  const feedRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const poolRef = useRef<HTMLVideoElement[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const curRef = useRef(0);
  const [cur, setCur] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [capOpen, setCapOpen] = useState<Record<number, boolean>>({});
  const [burstAt, setBurstAt] = useState<{ idx: number; n: number }>({ idx: -1, n: 0 });
  const lastTap = useRef(0);
  const tapTimer = useRef<number>(0);

  /* ── 播放器池：三個 <video> 掛載時建好，之後只換 src ── */
  useEffect(() => {
    poolRef.current = Array.from({ length: POOL }, () => {
      const v = document.createElement('video');
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.muted = true;
      v.loop = true;
      v.preload = 'metadata';
      v.disablePictureInPicture = true;
      return v;
    });
    return () => {
      poolRef.current.forEach((v) => {
        v.pause();
        v.removeAttribute('src');
        v.load();
        v.remove();
      });
      poolRef.current = [];
    };
  }, []);

  const playCur = useCallback(() => {
    const v = poolRef.current[curRef.current % POOL];
    if (!v) return;
    v.play()
      .then(() => {
        setNeedTap(false);
        setPaused(false);
      })
      .catch(() => {
        // 低耗電模式／還沒互動：顯示播放鈕等使用者點
        setNeedTap(true);
      });
  }, []);

  /* ── 目前 ±1 三支掛上池裡的播放器，其餘只有封面；只播目前這支 ── */
  useEffect(() => {
    curRef.current = cur;
    const pool = poolRef.current;
    if (!pool.length) return;
    for (let i = cur - 1; i <= cur + 1; i++) {
      if (i < 0 || i >= items.length) continue;
      const v = pool[i % POOL];
      const slot = slotRefs.current[i];
      const it = items[i];
      if (!slot) continue;
      if (v.parentElement !== slot) slot.appendChild(v);
      if (v.dataset.rid !== String(it.id)) {
        v.dataset.rid = String(it.id);
        v.poster = it.poster;
        v.src = it.video;
        v.load();
      }
      v.preload = i === cur + 1 ? 'auto' : 'metadata';
      if (i !== cur) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {}
      }
    }
    playCur();

    // 進度條只跟目前這支
    const v = pool[cur % POOL];
    const onT = () => {
      if (progressRef.current && v.duration) progressRef.current.style.width = `${(v.currentTime / v.duration) * 100}%`;
    };
    v.addEventListener('timeupdate', onT);
    if (progressRef.current) progressRef.current.style.width = '0%';
    return () => v.removeEventListener('timeupdate', onT);
  }, [cur, items, playCur]);

  /* ── 哪一支在畫面中央：IntersectionObserver（threshold .6） ── */
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; r: number } | null = null;
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.idx);
          if (e.isIntersecting && (!best || e.intersectionRatio > best.r)) best = { idx, r: e.intersectionRatio };
        }
        if (best && best.r >= 0.6 && best.idx !== curRef.current) setCur(best.idx);
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll('.reel').forEach((el) => io.observe(el));
    // 網址上已經指到某一支（回上一頁回來、或 [id] 路由以外的深連結）而它不是第一支：直接捲過去
    const m = location.pathname.match(/^\/sell\/reels\/(\d+)/);
    if (m) {
      const idx = items.findIndex((r) => r.id === Number(m[1]));
      if (idx > 0) root.scrollTo({ top: idx * root.clientHeight, behavior: 'instant' as ScrollBehavior });
    }
    return () => io.disconnect();
  }, [items]);

  /* ── 網址跟著目前這支（分享／重新整理回得來） ──
     ⚠️ state 要把 history.state 原封不動帶回去（裡面有 Next 的 __NA／tree）：Next 對 pushState/replaceState
     打了 patch，看到 __NA 就直接放行、不更新 usePathname —— 全站的 PathnameKeyed 是拿 pathname 當 key
     重掛整頁，換一支影片就重掛整個 feed（播放器池、聲音狀態全部歸零）不能接受。
     重新整理／分享連結走 [id] 路由（server 端就把那支排第一）；瀏覽器回上一頁時 Next 會照 tree 渲染
     /sell/reels 這頁、網址仍是 /sell/reels/<id>，由掛載時那段把 feed 捲到那支。 */
  useEffect(() => {
    const id = items[cur]?.id;
    if (!id) return;
    const url = `/sell/reels/${id}`;
    if (location.pathname !== url) history.replaceState(history.state, '', url);
  }, [cur, items]);

  /* ── 切到背景就停，回來續播 ── */
  useEffect(() => {
    const onVis = () => {
      const v = poolRef.current[curRef.current % POOL];
      if (!v) return;
      if (document.hidden) v.pause();
      else if (!paused) v.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [paused]);

  /* ── 開聲音：同一個點擊裡把三個播放器都解鎖 ── */
  const toggleSound = () => {
    const willMute = !muted;   // 目前靜音 → 開聲音；目前有聲 → 關掉
    poolRef.current.forEach((v, k) => {
      v.muted = willMute;
      if (!willMute && k !== curRef.current % POOL && v.src) {
        // 非目前那兩支：借這次手勢 play/pause 一下，之後換 src 也能出聲
        v.play().then(() => v.pause()).catch(() => {});
      }
    });
    setMuted(willMute);
    if (!willMute) playCur();
  };

  const togglePause = () => {
    const v = poolRef.current[curRef.current % POOL];
    if (!v) return;
    if (v.paused) {
      v.play().then(() => { setPaused(false); setNeedTap(false); }).catch(() => setNeedTap(true));
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const like = (idx: number, force?: boolean) => {
    const id = items[idx].id;
    setLiked((s) => ({ ...s, [id]: force ?? !s[id] }));
  };

  // 單擊暫停／播放，雙擊愛心（280ms 判定）
  const onTap = (idx: number) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      like(idx, true);
      setBurstAt((b) => ({ idx, n: b.n + 1 }));
      return;
    }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => togglePause(), 280);
  };

  const share = async (r: Reel) => {
    const url = `${location.origin}/sell/reels/${r.id}`;
    const title = `【吉吉比商城】${r.caption.slice(0, 30)}`;
    const mobile = /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && matchMedia('(pointer: coarse)').matches;
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
      if (mobile && nav.share) { await nav.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      showToast('連結已複製', 'success');
    } catch {
      /* 使用者取消分享，不處理 */
    }
  };

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/sell');
  };

  const nt = (n: number) => n.toLocaleString('zh-TW');

  return (
    <div className="reels-root">
      <div className="reels-col">
        <div className="reels-top">
          <button type="button" onClick={goBack} aria-label="返回"><ChevronLeft strokeWidth={2.4} /></button>
          <button type="button" className="snd" onClick={toggleSound} aria-label={muted ? '開聲音' : '關聲音'}>
            {muted ? <VolumeX /> : <Volume2 />}
            <span>{muted ? '開聲音' : '聲音開'}</span>
          </button>
        </div>

        <div className="reels-feed" ref={feedRef}>
          {items.map((r, idx) => {
            const isCur = idx === cur;
            const showPlay = isCur && (paused || needTap);
            return (
              <section className="reel" key={r.id} data-idx={idx}>
                <img className="poster" src={r.poster} alt="" loading={idx < 2 ? 'eager' : 'lazy'} draggable={false} />
                <div className="vslot" ref={(el) => { slotRefs.current[idx] = el; }} />
                <div className="tap" onPointerUp={() => isCur && onTap(idx)} />
                <div className="shade-top" />
                <div className="shade" />
                {showPlay && <div className="cplay"><Play fill="#fff" stroke="none" /></div>}
                {burstAt.idx === idx && burstAt.n > 0 && (
                  <Heart key={burstAt.n} className="burst" fill="#ff2d55" stroke="none" />
                )}

                <div className="rail">
                  <button type="button" onClick={() => like(idx)} aria-label="讚">
                    <span className={`ic${liked[r.id] ? ' on' : ''}`}><Heart fill={liked[r.id] ? '#ff2d55' : 'none'} strokeWidth={2} /></span>
                    <span>{nt(r.likes + (liked[r.id] ? 1 : 0))}</span>
                  </button>
                  <button type="button" onClick={() => share(r)} aria-label="分享">
                    <span className="ic"><Share2 strokeWidth={2} /></span>
                    <span>分享</span>
                  </button>
                </div>

                <div className="meta">
                  <div className="who">
                    <span className="av">{r.seller.avatar ? <img src={r.seller.avatar} alt="" /> : r.seller.name[0].toUpperCase()}</span>
                    <b>{r.seller.name}</b>
                    <span className="tier">{r.seller.tier}</span>
                  </div>
                  <p
                    className={`cap${capOpen[r.id] ? ' open' : ''}`}
                    onClick={() => setCapOpen((s) => ({ ...s, [r.id]: !s[r.id] }))}
                  >
                    {r.caption}
                  </p>
                  <Link href={`/sell/${r.listing.id}`} className="pcardm" prefetch={false}>
                    <img src={r.listing.image} alt="" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="t">{r.listing.title}</span>
                      <span className="p" style={{ display: 'block' }}><i>NT$</i>{nt(r.listing.price)}</span>
                    </span>
                    <span className="go">看商品</span>
                  </Link>
                </div>

                <div className="prog">{isCur && <i ref={progressRef} />}</div>
              </section>
            );
          })}
        </div>

        {/* 底部導航：跟商城引擎（app/sell/proto/shell.ts）同一組，短影音為選中 */}
        <div className="reels-nav mk">
          <nav className="tabbar" role="tablist">
            <button role="tab" aria-selected="false" onClick={() => router.push('/sell')}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" /></svg>找物
            </button>
            <button role="tab" aria-selected="false" onClick={() => router.push('/sell?tab=official')}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l1.5-5h15L21 9M4.5 9v11h15V9M4.5 9h15" /><path d="M9.5 20v-6h5v6" /></svg>官方
            </button>
            <button role="tab" aria-selected="true">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="4" width="17" height="16" rx="3" /><path d="M10 9.2v5.6l4.6-2.8z" /></svg>短影音
            </button>
            <button role="tab" aria-selected="false" onClick={() => router.push('/sell?tab=notis')}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 15V10a6 6 0 10-12 0v5l-1.6 2.4h15.2z" /><path d="M10 19.5a2.2 2.2 0 004 0" /></svg>通知
            </button>
            <button role="tab" aria-selected="false" onClick={() => router.push('/sell?tab=me')}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5a7.5 7.5 0 0115 0" /></svg>我的
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
