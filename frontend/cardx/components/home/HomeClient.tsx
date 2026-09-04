"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./HomeClient.module.css";
/* 輪播圖接真資料（老闆 2026-09-04）：跟手機首頁同一個 /api/public/home，照檔期過濾；圖不壓字，高度照卡、寬度隨圖 */
import { fetchHomeCatalog, type HomeProduct } from "@/lib/queries/home";
import { useHomeSecondaryTabs } from "@/cardx/lib/useHomeSecondaryTabs";
import { filterBannersBySchedule } from "@/lib/schedule";
import { isInternalUrl, toInternalPath } from "@/lib/internalUrl";

const FAVORITES_KEY = "cardx.favorites.byId";

function stableSeedFromString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function HomeClient() {
  const router = useRouter();
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [banners, setBanners] = useState<{ id: string; image: string; link: string }[]>([]);
  const [products, setProducts] = useState<HomeProduct[]>([]);
  useEffect(() => {
    let alive = true;
    fetchHomeCatalog()
      .then((d) => {
        if (!alive) return;
        setProducts(d.products);
        const rows = filterBannersBySchedule(d.banners);
        setBanners(rows.map((b) => ({ id: String(b.id), image: b.image_url, link: b.link_url || "#" })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  /* 二級頁籤（推薦＋系列）：演算法照手機首頁，見 cardx/lib/useHomeSecondaryTabs */
  const secondaryTabs = useHomeSecondaryTabs(products);
  const [activeSecondaryTab, setActiveSecondaryTab] = useState("featured");
  const bannerCount = Math.max(1, banners.length);
  const bannerLoop = banners.length >= 2;
  const bannerCycleCount = bannerLoop ? 3 : 1;
  const bannerBaseStart = bannerLoop ? bannerCount : 0;
  const bannerTotalChildren = bannerCount * bannerCycleCount;
  const bannerStepRef = useRef(0);
  const bannerChildIndexRef = useRef(bannerBaseStart);
  const bannerScrollEndTimeoutRef = useRef<number | null>(null);

  const formatTwd = useMemo(() => {
    const formatter = new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 0,
    });
    return (value: number) => formatter.format(Math.round(value));
  }, []);


  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      window.setTimeout(() => setFavoriteById(parsed as Record<string, boolean>), 0);
    } catch {}
  }, []);

  function toggleFavorite(id: string) {
    setFavoriteById((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function HeartIcon() {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      </svg>
    );
  }

  function ensureBannerStep() {
    const el = bannerRef.current;
    if (!el) return 0;
    const first = el.children.item(0) as HTMLElement | null;
    if (!first) return 0;
    const width = first.getBoundingClientRect().width;
    const style = window.getComputedStyle(el);
    const gapRaw = style.columnGap || style.gap || "0";
    const gap = Number.parseFloat(gapRaw) || 0;
    const step = width + gap;
    bannerStepRef.current = step;
    return step;
  }

  function scrollBannerToChildIndex(childIdx: number, behavior: ScrollBehavior) {
    const el = bannerRef.current;
    if (!el) return;
    const step = ensureBannerStep();
    if (!step) return;
    el.scrollTo({ left: step * childIdx, behavior });
  }

  useEffect(() => {
    const selectors = [
      `.${styles.frame3}`,
      `.${styles.container9}`,
      `.${styles.frame12}`,
      `.${styles.frame14}`,
      `.${styles.frame15}`,
    ].join(",");

    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors));

    function onWheel(e: WheelEvent) {
      const el = e.currentTarget as HTMLElement | null;
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth) return;
      const absY = Math.abs(e.deltaY);
      const absX = Math.abs(e.deltaX);
      if (!absY || absY < absX) return;
      e.preventDefault();
      window.scrollBy({ top: e.deltaY, left: 0, behavior: "auto" });
    }

    for (const el of elements) el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      for (const el of elements) el.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    bannerChildIndexRef.current = bannerBaseStart;
    scrollBannerToChildIndex(bannerBaseStart, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerBaseStart]);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;

    let rafId = 0;
    function onScroll() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        if (bannerScrollEndTimeoutRef.current) window.clearTimeout(bannerScrollEndTimeoutRef.current);
        bannerScrollEndTimeoutRef.current = window.setTimeout(() => {
          const target = bannerRef.current;
          if (!target) return;
          const step = bannerStepRef.current || ensureBannerStep();
          if (!step) return;
          const childIdx = Math.max(0, Math.min(bannerTotalChildren - 1, Math.round(target.scrollLeft / step)));
          bannerChildIndexRef.current = childIdx;
          const nextActive = childIdx % bannerCount;
          setActiveBannerIndex((prev) => (prev === nextActive ? prev : nextActive));
          const normalizedChildIdx =
            childIdx < bannerCount ? childIdx + bannerCount : childIdx >= bannerCount * 2 ? childIdx - bannerCount : childIdx;
          if (normalizedChildIdx !== childIdx) {
            window.setTimeout(() => {
              bannerChildIndexRef.current = normalizedChildIdx;
              scrollBannerToChildIndex(normalizedChildIdx, "auto");
            }, 0);
          }
        }, 80);
      });
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
      if (bannerScrollEndTimeoutRef.current) window.clearTimeout(bannerScrollEndTimeoutRef.current);
    };
  }, [bannerCount]);

  useEffect(() => {
    if (!bannerLoop) return;
    const id = window.setInterval(() => {
      const maxChildIdx = bannerTotalChildren - 1;
      let nextChildIdx = bannerChildIndexRef.current + 1;
      if (nextChildIdx > maxChildIdx) nextChildIdx = bannerBaseStart;
      bannerChildIndexRef.current = nextChildIdx;
      const nextActive = nextChildIdx % bannerCount;
      setActiveBannerIndex(nextActive);
      scrollBannerToChildIndex(nextChildIdx, "smooth");
    }, 4500);
    return () => window.clearInterval(id);
  }, [bannerBaseStart, bannerCount, bannerTotalChildren, bannerLoop]);

  const marketItems = [
    {
      id: "m-1",
      title: "【寶可夢】經典卡磚特選組",
      price: 690,
      fmv: 790,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-2",
      title: "【運動卡】新秀簽名卡（精選）",
      price: 590,
      fmv: 720,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-3",
      title: "【收藏品】封裝展示級卡片",
      price: 1280,
      fmv: 1490,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-4",
      title: "【寶可夢】高評級卡片展示",
      price: 1680,
      fmv: 1990,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-5",
      title: "【運動卡】熱門新人卡（盒裝）",
      price: 880,
      fmv: 1060,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-6",
      title: "【收藏品】限量卡套組（精選）",
      price: 980,
      fmv: 1150,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-7",
      title: "【寶可夢】經典卡磚特選組（加開）",
      price: 720,
      fmv: 820,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-8",
      title: "【收藏品】封裝展示級卡片（特選）",
      price: 1380,
      fmv: 1590,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-9",
      title: "【運動卡】熱門新人卡（精選）",
      price: 930,
      fmv: 1120,
      imageUrl: "/cardx/placeholder.svg",
    },
    {
      id: "m-10",
      title: "【寶可夢】高評級卡片展示（新上架）",
      price: 1750,
      fmv: 2080,
      imageUrl: "/cardx/placeholder.svg",
    },
  ];

  const packItems = [
    { id: "p-1", title: "【卡包】夢幻擴充包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "34/80", price: 199 },
    { id: "p-2", title: "【卡包】新系列首發包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "12/80", price: 199 },
    { id: "p-3", title: "【卡包】人氣角色加強包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "58/80", price: 249 },
    { id: "p-4", title: "【卡包】經典回歸特典包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "6/80", price: 249 },
    { id: "p-5", title: "【卡包】收藏家限定包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "41/80", price: 299 },
    { id: "p-6", title: "【卡包】夢幻擴充包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "23/80", price: 199 },
    { id: "p-7", title: "【卡包】新系列首發包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "70/80", price: 199 },
    { id: "p-8", title: "【卡包】人氣角色加強包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "9/80", price: 249 },
    { id: "p-9", title: "【卡包】經典回歸特典包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "52/80", price: 249 },
    { id: "p-10", title: "【卡包】收藏家限定包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "18/80", price: 299 },
  ];

  const customPackItems = packItems;

  const tradeItems = [
    {
      id: "t-1",
      offerTitle: "冰騎士蕾冠王V",
      wantTitle: "新葉喵",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-2",
      offerTitle: "噴火龍ex",
      wantTitle: "古劍豹ex",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-3",
      offerTitle: "咬咬龜",
      wantTitle: "蜈蚣王",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-4",
      offerTitle: "伊布",
      wantTitle: "冰騎士蕾冠王V",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-5",
      offerTitle: "古劍豹ex",
      wantTitle: "噴火龍ex",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-6",
      offerTitle: "新葉喵",
      wantTitle: "伊布",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-7",
      offerTitle: "蜈蚣王",
      wantTitle: "咬咬龜",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-8",
      offerTitle: "伊布",
      wantTitle: "新葉喵",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-9",
      offerTitle: "噴火龍ex",
      wantTitle: "皮卡丘",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
    {
      id: "t-10",
      offerTitle: "古劍豹ex",
      wantTitle: "伊布",
      offerImageUrl: "/cardx/placeholder.svg",
      wantImageUrl: "/cardx/placeholder.svg",
      user: "@coddy20123",
    },
  ];

  return (
    <div className={`${styles.main2} ${styles.homeRoot}`}>
      {banners.length > 0 ? (
      <div className={styles.banner}>
        <div className={styles.frame3} ref={bannerRef}>
          {Array.from({ length: bannerTotalChildren }).map((_, childIdx) => {
            const b = banners[childIdx % bannerCount];
            if (!b) return null;
            const slideStyle = { display: "block", flexShrink: 0, height: 187, width: "auto", borderRadius: 12, overflow: "hidden" } as const;
            const img = <img src={b.image} alt="" style={{ height: 187, width: "auto", display: "block" }} draggable={false} />;
            return isInternalUrl(b.link) ? (
              <Link key={`banner_${childIdx}`} href={toInternalPath(b.link)} style={slideStyle}>{img}</Link>
            ) : (
              <a key={`banner_${childIdx}`} href={b.link} target="_blank" rel="noopener noreferrer" style={slideStyle}>{img}</a>
            );
          })}
        </div>
      </div>
      ) : null}
      {bannerLoop ? (
      <div className={styles.carouselDots} aria-label="Carousel Dots">
        {Array.from({ length: bannerCount }).map((_, idx) => (
          <div
            key={`dot_${idx}`}
            className={`${styles.carouselDot} ${idx === activeBannerIndex ? styles.carouselDotActive : ""}`}
            aria-hidden="true"
            onClick={() => {
              const targetChildIdx = bannerBaseStart + idx;
              bannerChildIndexRef.current = targetChildIdx;
              setActiveBannerIndex(idx);
              scrollBannerToChildIndex(targetChildIdx, "smooth");
            }}
          />
        ))}
      </div>
      ) : null}
      <div className={styles.main}>
        <div className={styles.sectionLobby}>
          <div className={styles.nav}>
            <div className={styles.container9}>
              {/* 綜合的二級頁籤（老闆 2026-09-04：改真資料、演算法同手機版）。選中：link6／text7，其餘：link7／text8 */}
              {secondaryTabs.map((t) => {
                const active = t.id === activeSecondaryTab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={active ? styles.link6 : styles.link7}
                    style={{ cursor: "pointer" }}
                    onClick={() => setActiveSecondaryTab(t.id)}
                  >
                    <p className={active ? styles.text7 : styles.text8}>{t.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.header}>
              <div className={styles.link8}>
                <div className={styles.sVg}>
                  <img alt=""
                    src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg"
                    className={styles.iconCherries}
                  />
                </div>
                <p className={styles.heading2Slots}>市集</p>
              </div>
              <Link className={styles.text10} href="/market">
                查看全部
              </Link>
            </div>
            <div className={styles.frame12}>
              {marketItems.map((item, idx) => {
                const detailId = `listing_${String((idx % 7) + 1).padStart(3, "0")}`;
                return (
                  <div
                    className={styles.item4}
                    key={item.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/market/${detailId}`)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      router.push(`/market/${detailId}`);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                  <div className={styles.rectangle2} style={{ backgroundImage: `url(${item.imageUrl})` }}>
                    <button
                      type="button"
                      className={styles.favoriteButton}
                      aria-pressed={!!favoriteById[item.id]}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                    >
                      <HeartIcon />
                    </button>
                    <div className={styles.backgroundBorderShad}>
                      <p className={styles.a18}>-18%</p>
                    </div>
                  </div>
                  <div className={styles.frame1}>
                    <p className={styles.a2022PaniniPrizm353B}>{item.title}</p>
                    <div className={styles.frame2}>
                      <p className={styles.heading62225}>{formatTwd(item.price)}</p>
                      <div className={styles.overlayBorder}>
                        <p className={styles.fMv2730}>FMV {formatTwd(item.fmv)}</p>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.header}>
              <div className={styles.link8}>
                <div className={styles.sVg}>
                  <img alt=""
                    src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg"
                    className={styles.iconCherries}
                  />
                </div>
                <p className={styles.heading2Slots}>官方卡包</p>
              </div>
              <Link className={styles.text10} href="/packs">
                查看全部
              </Link>
            </div>
            <div className={styles.frame12}>
              {packItems.map((item) => (
                <div
                  className={styles.item4}
                  key={item.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/packs/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    router.push(`/packs/${item.id}`);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div className={styles.rectangle2} style={{ backgroundImage: `url(${item.imageUrl})` }}>
                    <button
                      type="button"
                      className={styles.favoriteButton}
                      aria-pressed={!!favoriteById[item.id]}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                    >
                      <HeartIcon />
                    </button>
                    <div className={styles.backgroundBorderShad}>
                      <p className={styles.a18}>-18%</p>
                    </div>
                  </div>
                  <div className={styles.frame1}>
                    <p className={styles.a2022PaniniPrizm353B}>{item.title}</p>
                    <div className={styles.frame2}>
                      <p className={styles.heading62225}>
                        <span className={styles.priceValue}>{formatTwd(item.price)}</span>
                        <span className={styles.priceSep}> / </span>
                        <span className={styles.priceUnit}>單抽</span>
                      </p>
                      <div className={styles.overlayBorder}>
                        <p className={styles.fMv2730}>{item.remaining}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.header}>
              <div className={styles.link8}>
                <div className={styles.sVg}>
                  <img alt=""
                    src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg"
                    className={styles.iconCherries}
                  />
                </div>
                <p className={styles.heading2Slots}>自製卡包</p>
              </div>
              <Link className={styles.text10} href="/packs">
                查看全部
              </Link>
            </div>
            <div className={styles.frame12}>
              {customPackItems.map((item) => (
                <div
                  className={styles.item4}
                  key={item.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/packs/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    router.push(`/packs/${item.id}`);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div className={styles.rectangle2} style={{ backgroundImage: `url(${item.imageUrl})` }}>
                    <button
                      type="button"
                      className={styles.favoriteButton}
                      aria-pressed={!!favoriteById[item.id]}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                    >
                      <HeartIcon />
                    </button>
                    <div className={styles.backgroundBorderShad}>
                      <p className={styles.a18}>-18%</p>
                    </div>
                  </div>
                  <div className={styles.frame1}>
                    <p className={styles.a2022PaniniPrizm353B}>{item.title}</p>
                    <div className={styles.frame2}>
                      <p className={styles.heading62225}>
                        <span className={styles.priceValue}>{formatTwd(item.price)}</span>
                        <span className={styles.priceSep}> / </span>
                        <span className={styles.priceUnit}>單抽</span>
                      </p>
                      <div className={styles.overlayBorder}>
                        <p className={styles.fMv2730}>{item.remaining}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.section2}>
            <div className={styles.header}>
              <div className={styles.link8}>
                <div className={styles.sVg}>
                  <img alt=""
                    src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg"
                    className={styles.iconCherries}
                  />
                </div>
                <p className={styles.heading2Slots}>交換</p>
              </div>
              <Link className={styles.text10} href="/trades">
                查看全部
              </Link>
            </div>
            <div className={styles.frame14}>
              {tradeItems.map((item) => (
                <div className={`${styles.item4} ${styles.tradeItem}`} key={item.id}>
                  <div
                    className={styles.tradeCard}
                    data-tradecard
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/trades/${item.id}`)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      router.push(`/trades/${item.id}`);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={styles.tradeHeader}>
                      <div className={styles.tradeHeaderLeft}>
                        <div className={styles.tradeAvatar} aria-hidden="true" />
                        <div className={styles.tradeHeaderText}>
                          <div className={styles.tradeUserRow}>
                            <span className={styles.tradeUserHandle}>{item.user}</span>
                            <svg className={styles.tradeVerifiedIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                              <path
                                d="M6.97917 3.62H6.96917C6.21667 3.62 5.63833 3.62 5.19 3.68C4.73583 3.74083 4.39583 3.86583 4.13083 4.13C3.86583 4.39417 3.74083 4.73583 3.68083 5.19C3.62 5.63833 3.62 6.21667 3.62 6.96917V6.97917C3.62 7.20333 3.6175 7.27917 3.59 7.345C3.5625 7.41083 3.51083 7.46583 3.3525 7.62417L3.345 7.6325C2.81333 8.16417 2.40417 8.5725 2.13 8.9325C1.8525 9.29667 1.7 9.62583 1.7 9.99917C1.7 10.3742 1.8525 10.7033 2.13 11.0675C2.405 11.4275 2.81333 11.8358 3.345 12.3675L3.3525 12.3758C3.51083 12.5342 3.5625 12.5883 3.59 12.655C3.6175 12.7217 3.62 12.7967 3.62 13.0208V13.0308C3.62 13.7833 3.62 14.3617 3.68 14.81C3.74083 15.2642 3.86583 15.6042 4.13083 15.8683C4.39583 16.1325 4.73583 16.2583 5.19 16.32C5.63833 16.38 6.21667 16.38 6.96917 16.38H6.97917C7.20333 16.38 7.27917 16.3825 7.345 16.41C7.41083 16.4375 7.46583 16.4892 7.62417 16.6475L7.6325 16.655C8.16417 17.1867 8.5725 17.595 8.9325 17.87C9.29667 18.1475 9.62583 18.3 10 18.3C10.375 18.3 10.7033 18.1475 11.0675 17.87C11.4275 17.595 11.8358 17.1867 12.3675 16.655L12.3758 16.6467C12.5342 16.4883 12.5892 16.4375 12.655 16.41C12.7208 16.3825 12.7967 16.38 13.0208 16.38H13.0308C13.7833 16.38 14.3617 16.38 14.81 16.32C15.2642 16.2592 15.6042 16.1333 15.8692 15.8692C16.1342 15.605 16.2592 15.2642 16.3192 14.81C16.38 14.3617 16.38 13.7833 16.38 13.0308V13.0208C16.38 12.7967 16.3825 12.7208 16.41 12.655C16.4375 12.5892 16.4892 12.5333 16.6475 12.375L16.655 12.3683C17.1867 11.8358 17.5958 11.4267 17.87 11.0683C18.1475 10.7033 18.3 10.3742 18.3 10C18.3 9.62583 18.1475 9.29667 17.87 8.9325C17.595 8.5725 17.1867 8.16417 16.655 7.6325L16.6475 7.62417C16.4892 7.46583 16.4375 7.41083 16.41 7.345C16.3825 7.27917 16.38 7.20333 16.38 6.97833V6.96917C16.38 6.21667 16.38 5.63833 16.32 5.19C16.2592 4.73583 16.1342 4.395 15.8692 4.13083C15.6042 3.86583 15.2642 3.74083 14.81 3.68C14.3617 3.62 13.7833 3.62 13.0308 3.62H13.0208C12.7967 3.62 12.7208 3.6175 12.655 3.59C12.5892 3.5625 12.5333 3.51083 12.3758 3.3525L12.3675 3.345C11.8358 2.81333 11.4275 2.40417 11.0683 2.13C10.7033 1.8525 10.3742 1.7 10 1.7C9.62583 1.7 9.29667 1.8525 8.9325 2.13C8.5725 2.405 8.16417 2.81333 7.6325 3.345L7.62417 3.3525C7.46583 3.51083 7.41083 3.5625 7.345 3.59C7.27917 3.6175 7.20333 3.62 6.97917 3.62ZM8.1725 13.6425C7.93 13.44 7.8975 13.08 8.1 12.8375L10.3 10.1975C10.3902 10.0888 10.5205 10.0212 10.662 10.01C10.8035 9.99876 10.9428 10.0448 11.05 10.1375L11.8775 10.845L13.8375 8.395C14.035 8.1475 14.395 8.1075 14.6425 8.305C14.89 8.5025 14.93 8.8625 14.7325 9.11L12.4025 12.0225C12.3155 12.1315 12.1887 12.2 12.05 12.2133C11.9114 12.2267 11.7738 12.1838 11.6675 12.095L10.8525 11.395L8.9775 13.6425C8.775 13.885 8.415 13.9158 8.1725 13.6425Z"
                                fill="#1D9BF0"
                                fillRule="evenodd"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div className={styles.tradeHeaderSub}>50+卡牌可交換</div>
                        </div>
                      </div>
                      <div className={styles.tradeHeaderActions}>
                        <div className={styles.tradeDeltaPill}>+ 18%</div>
                        <button
                          type="button"
                          className={styles.tradeFavoriteButton}
                          aria-label="收藏"
                          aria-pressed={!!favoriteById[item.id]}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item.id);
                          }}
                        >
                          <HeartIcon />
                        </button>
                      </div>
                    </div>

                    <div className={styles.tradeBody}>
                      <div className={styles.tradeSide}>
                        <div className={styles.tradeSideTitle}>你將獲得</div>
                          {(() => {
                            const getCount = 1 + (stableSeedFromString(`${item.id}_get`) % 4);
                            const base = [item.offerImageUrl, item.wantImageUrl].filter(Boolean);
                            const getImages =
                              base.length === 0 ? [] : Array.from({ length: getCount }, (_, idx) => base[idx % base.length]).slice(0, 4);
                            const n = getImages.length;
                            const gridClass =
                              n === 1
                                ? `${styles.tradeThumbGrid} ${styles.tradeThumbGridOne}`
                                : n === 2
                                  ? `${styles.tradeThumbGrid} ${styles.tradeThumbGridTwo}`
                                  : n === 3
                                    ? `${styles.tradeThumbGrid} ${styles.tradeThumbGridThree}`
                                    : `${styles.tradeThumbGrid} ${styles.tradeThumbGridFour}`;
                            const tileClassFor = (idx: number) => {
                              if (n === 3 && idx === 2) return `${styles.tradeThumb} ${styles.tradeThumbSpan2}`;
                              return styles.tradeThumb;
                            };
                            return (
                              <div className={gridClass}>
                                {getImages.map((src, idx) => (
                                  <div key={`${item.id}_get_${idx}`} className={tileClassFor(idx)}>
                                    <img alt="" className={styles.tradeThumbImg} src={src} />
                                    <div className={styles.tradeThumbOverlay}>PSA 10</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        <div className={styles.tradeValueRow}>
                          <span>總價值約:</span>
                          <span>$20,000</span>
                        </div>
                      </div>

                      <svg className={styles.tradeSwapIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M12 3C10.7839 3.00179 9.58073 3.25003 8.46322 3.72973C7.3457 4.20942 6.33699 4.91063 5.498 5.791L3.854 4.146C3.78407 4.07589 3.6949 4.02813 3.59779 4.00876C3.50068 3.9894 3.40001 3.9993 3.30854 4.03722C3.21706 4.07513 3.13891 4.13936 3.08398 4.22175C3.02905 4.30414 2.99982 4.40098 3 4.5V9C3 9.26522 3.10536 9.51957 3.29289 9.70711C3.48043 9.89464 3.73478 10 4 10H8.5C8.59902 10.0002 8.69586 9.97095 8.77825 9.91602C8.86064 9.86109 8.92487 9.78294 8.96279 9.69146C9.0007 9.59999 9.01061 9.49932 8.99124 9.40221C8.97187 9.3051 8.92411 9.21593 8.854 9.146L6.914 7.207C7.56678 6.51217 8.35461 5.95802 9.22919 5.57851C10.1038 5.199 11.0466 5.00214 12 5C13.7038 5.00118 15.3487 5.62372 16.6263 6.75093C17.9039 7.87815 18.7265 9.43263 18.94 11.123C18.9527 11.2561 18.9919 11.3853 19.0554 11.503C19.1189 11.6207 19.2053 11.7244 19.3096 11.8081C19.4139 11.8918 19.5339 11.9537 19.6626 11.9902C19.7912 12.0267 19.9258 12.037 20.0585 12.0206C20.1912 12.0041 20.3193 11.9612 20.4351 11.8944C20.5509 11.8276 20.6522 11.7383 20.7329 11.6316C20.8136 11.525 20.8721 11.4033 20.9049 11.2737C20.9377 11.1441 20.9442 11.0092 20.924 10.877C20.6485 8.70351 19.5905 6.70486 17.948 5.25503C16.3054 3.8052 14.1909 3.00352 12 3ZM3.945 12.008C3.68195 12.0407 3.44266 12.1765 3.27971 12.3856C3.11676 12.5947 3.04349 12.8599 3.076 13.123C3.3515 15.2965 4.4095 17.2951 6.05204 18.745C7.69459 20.1948 9.80912 20.9965 12 21C13.2166 21.0018 14.4206 20.7549 15.5384 20.2746C16.6561 19.7944 17.6639 19.0908 18.5 18.207L20.146 19.853C20.2159 19.923 20.3049 19.9708 20.402 19.9902C20.499 20.0096 20.5996 19.9998 20.691 19.962C20.7824 19.9242 20.8606 19.8601 20.9156 19.7779C20.9706 19.6956 21 19.5989 21 19.5V15C21 14.7348 20.8946 14.4804 20.7071 14.2929C20.5196 14.1054 20.2652 14 20 14H15.5C15.401 13.9998 15.3041 14.0291 15.2217 14.084C15.1394 14.1389 15.0751 14.2171 15.0372 14.3085C14.9993 14.4 14.9894 14.5007 15.0088 14.5978C15.0281 14.6949 15.0759 14.7841 15.146 14.854L17.086 16.793C16.4354 17.4907 15.648 18.0467 14.7724 18.4239C13.8968 18.8011 12.9527 18.9912 12 18.982C10.2962 18.9808 8.65133 18.3583 7.3737 17.2311C6.09607 16.1039 5.27347 14.5494 5.06 12.859C5.04342 12.7264 5.00084 12.5989 4.93472 12.483C4.8686 12.3671 4.78022 12.2652 4.6747 12.1831C4.56918 12.1009 4.44864 12.0401 4.31986 12.0041C4.19109 11.9682 4.05661 11.9578 3.92375 11.9735L3.945 12.008Z"
                          fill="currentColor"
                        />
                      </svg>

                      <div className={styles.tradeSide}>
                        <div className={styles.tradeSideTitle}>你將失去</div>
                        {(() => {
                          const loseCount = 1 + (stableSeedFromString(`${item.id}_lose`) % 4);
                          const base = [item.wantImageUrl, item.offerImageUrl].filter(Boolean);
                          const loseImages =
                            base.length === 0 ? [] : Array.from({ length: loseCount }, (_, idx) => base[idx % base.length]).slice(0, 4);
                          const n = loseImages.length;
                          const gridClass =
                            n === 1
                              ? `${styles.tradeThumbGrid} ${styles.tradeThumbGridOne}`
                              : n === 2
                                ? `${styles.tradeThumbGrid} ${styles.tradeThumbGridTwo}`
                                : n === 3
                                  ? `${styles.tradeThumbGrid} ${styles.tradeThumbGridThree}`
                                  : `${styles.tradeThumbGrid} ${styles.tradeThumbGridFour}`;
                          const tileClassFor = (idx: number) => {
                            if (n === 3 && idx === 2) return `${styles.tradeThumb} ${styles.tradeThumbSpan2}`;
                            return styles.tradeThumb;
                          };
                          return (
                            <div className={gridClass}>
                              {loseImages.map((src, idx) => (
                                <div key={`${item.id}_lose_${idx}`} className={tileClassFor(idx)}>
                                  <img alt="" className={styles.tradeThumbImg} src={src} />
                                  <div className={styles.tradeThumbOverlay}>PSA 10</div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        <div className={styles.tradeValueRow}>
                          <span>總價值約:</span>
                          <span>$27,000</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.tradeFooter}>23分鐘前</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.section3}>
            <div className={styles.header}>
              <div className={styles.link8}>
                <div className={styles.sVg}>
                  <img alt=""
                    src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg"
                    className={styles.iconCherries}
                  />
                </div>
                <p className={styles.heading2Slots}>品牌IP</p>
              </div>
              <Link className={styles.text10} href="/market">
                查看全部
              </Link>
            </div>
            <div className={styles.frame15}>
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
              <img alt=""
                src="/cardx/placeholder.svg"
                className={styles.rectangle3}
              />
            </div>
          </div>
          <div className={styles.trustSection}>
            <div className={styles.header}>
              <div className={styles.link8}>
                <p className={styles.heading2Slots}>平台保障</p>
              </div>
            </div>
            <div className={styles.trustGrid}>
              <div className={styles.trustCard}>
                <p className={styles.trustTitle}>交易代管</p>
                <p className={styles.trustDesc}>付款後資金由平台保管，交易完成才撥款給賣家。</p>
              </div>
              <div className={styles.trustCard}>
                <p className={styles.trustTitle}>實名驗證</p>
                <p className={styles.trustDesc}>買賣雙方皆需完成 KYC，交易對象更安心。</p>
              </div>
              <div className={styles.trustCard}>
                <p className={styles.trustTitle}>開抽透明</p>
                <p className={styles.trustDesc}>機率公開、結果可追溯，每一抽都有紀錄。</p>
              </div>
            </div>
            <div className={styles.trustCtaRow}>
              <Link className={styles.trustCta} href="/market">
                前往市集
              </Link>
            </div>
          </div>
        </div>
      </div>
      <footer className={styles.footer} aria-label="Footer">
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <p className={styles.footerName}>CardX</p>
            <p className={styles.footerDesc}>收藏、交換、探索卡牌，一站完成。</p>
          </div>
          <div className={styles.footerCol}>
            <p className={styles.footerTitle}>產品</p>
            <Link className={styles.footerLink} href="/market">
              市場
            </Link>
            <Link className={styles.footerLink} href="/rewards">
              獎勵
            </Link>
          </div>
          <div className={styles.footerCol}>
            <p className={styles.footerTitle}>資訊</p>
            <Link className={styles.footerLink} href="/info">
              最新消息
            </Link>
            <Link className={styles.footerLink} href="/info">
              新手指南
            </Link>
          </div>
          <div className={styles.footerCol}>
            <p className={styles.footerTitle}>支援</p>
            <a className={styles.footerLink} href="mailto:support@cardx.example">
              support@cardx.example
            </a>
            <Link className={styles.footerLink} href="/info">
              隱私權政策
            </Link>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p className={styles.footerCopy}>© {new Date().getFullYear()} CardX</p>
          <div className={styles.footerSocial} aria-label="Social">
            <a className={styles.footerLink} href="/info">
              X
            </a>
            <a className={styles.footerLink} href="/info">
              Discord
            </a>
            <a className={styles.footerLink} href="/info">
              Telegram
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
