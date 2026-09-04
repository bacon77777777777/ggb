"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./HomeClient.module.css";
/* 輪播圖接真資料（老闆 2026-09-04）：跟手機首頁同一個 /api/public/home，照檔期過濾；圖不壓字，高度照卡、寬度隨圖 */
import { fetchHomeCatalog, type HomeProduct } from "@/lib/queries/home";
import { useHomeCatalogView, BUILT_IN_TAB_IDS, SORT_MODES, type SortMode } from "@/cardx/lib/useHomeCatalogView";
import { PillSelect, FilterIcon } from "@/cardx/components/ui/PillSelect";
import { recordImpression, recordClick } from "@/lib/feed/events";
import type { FeedBucket } from "@/lib/feed/assemble";
import { asset } from "@/lib/asset";
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

/**
 * 商品小卡：外觀照 cardx /packs 的小卡，內容是我們的商品。
 * 推薦籤的卡帶 meta（桶別／位置）：看到一半記曝光、點了記點擊（跟手機版 ProductCard 同一套 lib/feed/events）。
 */
function HomeProductCard({ product, meta, followed, onToggleFollow }: {
  product: HomeProduct;
  meta?: { bucket: FeedBucket; position: number };
  followed: boolean;
  onToggleFollow: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement | null>(null);
  const id = Number(product.id);
  useEffect(() => {
    if (!meta || !ref.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.5) { recordImpression(id, meta.bucket, meta.position); io.disconnect(); }
      }
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [id, meta]);
  const go = () => {
    if (meta) recordClick(id, meta.bucket, meta.position);
    router.push(`/item/${product.id}`);
  };
  const perPack = (product as { cards_per_pack?: number | null }).cards_per_pack;
  const unit = typeof perPack === "number" && perPack >= 2 ? "包" : "抽";
  const total = product.total_count ?? 0;
  const remaining = product.remaining ?? 0;
  const soldOut = (typeof product.remaining === "number" && product.remaining <= 0) || product.status === "ended";
  return (
    <div
      ref={ref}
      className={styles.item4}
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); go(); }}
      style={{ width: "100%", maxWidth: "none", flex: "unset", cursor: "pointer", opacity: soldOut ? 0.6 : 1 }}
    >
      <div
        className={styles.rectangle2}
        style={{
          backgroundImage: `url(${product.image_url || asset("/images/item_defaulet.webp")})`,
          // 商品圖整張放進去不裁（老闆 2026-09-04：商品圖要 fit）；直式卡包圖左右會留底色
          width: "100%", height: "auto", aspectRatio: "1 / 1", backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
        }}
      >
        <button
          type="button"
          className={styles.favoriteButton}
          aria-pressed={followed}
          aria-label={followed ? "取消收藏" : "收藏"}
          onClick={(e) => { e.stopPropagation(); onToggleFollow(); }}
          style={followed ? { color: "#ff4d4f" } : undefined}
        >
          <HeartIcon />
        </button>
        {product.is_hot ? (
          <div className={styles.backgroundBorderShad}><p className={styles.a18} style={{ color: "#ff6b6b" }}>熱門</p></div>
        ) : null}
      </div>
      <div className={styles.frame1}>
        <p className={styles.a2022PaniniPrizm353B}>{product.name}</p>
        <div className={styles.frame2}>
          <p className={styles.heading62225}>
            <img src={asset("/images/gcoin.webp")} alt="G" style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 4 }} />
            <span className={styles.priceValue}>{product.price.toLocaleString()}</span>
            <span className={styles.priceSep}> / </span>
            <span className={styles.priceUnit}>{unit}</span>
          </p>
          {total > 0 ? (
            <div className={styles.overlayBorder}><p className={styles.fMv2730}>{soldOut ? "已完抽" : `${remaining}/${total}`}</p></div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HomeClient() {
  const router = useRouter();
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [banners, setBanners] = useState<{ id: string; image: string; link: string }[]>([]);
  const [products, setProducts] = useState<HomeProduct[]>([]);
  const [menus, setMenus] = useState<{ id: string; name: string }[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchHomeCatalog()
      .then((d) => {
        if (!alive) return;
        setProducts(d.products);
        setMenus(d.menus);
        setCatalogLoaded(true);
        const rows = filterBannersBySchedule(d.banners);
        setBanners(rows.map((b) => ({ id: String(b.id), image: b.image_url, link: b.link_url || "#" })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  /* 類別 tab／二級頁籤／排序／商品順序：演算法整份照手機首頁，見 cardx/lib/useHomeCatalogView */
  const view = useHomeCatalogView(products, menus);
  const { secondaryTabs, activeSecondaryTab, setActiveSecondaryTab } = view;
  // 類別 tab 以網址為準（/?tab=… 或 /?menu=…）：側欄、頁面上的 tab 都改網址，這裡跟著切
  /*
   * 類別／二級籤／排序三個狀態都以網址為準（老闆 2026-09-04：桌機縮到手機、手機放大到桌機都要停在同一籤）：
   * `/?tab=ichiban&series=寶可夢&sort=hot`。手機那棵也讀寫同一組參數（app/page.tsx）。
   */
  const searchParams = useSearchParams();
  useEffect(() => {
    const menu = searchParams.get("menu");
    const tab = searchParams.get("tab");
    const series = searchParams.get("series");
    const sort = searchParams.get("sort");
    view.setActivePrimaryTab(menu ? `menu:${menu}` : tab && (BUILT_IN_TAB_IDS as readonly string[]).includes(tab) ? tab : "all");
    view.setActiveSecondaryTab(series ? `series:${series}` : "featured");
    view.setSortMode(sort && SORT_MODES.includes(sort as SortMode) ? (sort as SortMode) : "latest");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const setUrl = (patch: { tab?: string; series?: string | null; sort?: string | null }) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (patch.tab !== undefined) {
      sp.delete("tab"); sp.delete("menu");
      if (patch.tab.startsWith("menu:")) sp.set("menu", patch.tab.slice("menu:".length));
      else if (patch.tab !== "all") sp.set("tab", patch.tab);
    }
    if (patch.series !== undefined) { if (patch.series) sp.set("series", patch.series); else sp.delete("series"); }
    if (patch.sort !== undefined) { if (patch.sort && patch.sort !== "latest") sp.set("sort", patch.sort); else sp.delete("sort"); }
    const q = sp.toString();
    router.replace(q ? `/?${q}` : "/", { scroll: false });
  };
  // 換類別：系列歸零、排序保留（跟手機一樣）
  const goPrimaryTab = (id: string) => setUrl({ tab: id, series: null });
  /* 商品格：欄數照 /packs 的算法（卡寬 220～280 之間取欄數），捲到底再載 4 列 */
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(5);
  const [visibleRows, setVisibleRows] = useState(4);
  useEffect(() => {
    function computeColumns() {
      if (window.innerWidth <= 1023) { setColumns(2); return; }
      const el = listRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const gap = 16;
      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (280 + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (220 + gap)));
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
      setColumns((prev) => (prev === next ? prev : next));
    }
    computeColumns();
    window.addEventListener("resize", computeColumns);
    return () => window.removeEventListener("resize", computeColumns);
  }, []);
  useEffect(() => { setVisibleRows(4); }, [view.activePrimaryTab, view.activeSecondaryTab, view.sortMode]);
  const visibleCount = Math.min(view.items.length, visibleRows * columns);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= view.items.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisibleRows((r) => r + 4);
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, view.items.length]);
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
          {/* 吸頂那條改成兩列：類別 tab（樣式照最新消息頁的分段式）＋ 二級膠囊＋排序（老闆 2026-09-04） */}
          <div className={styles.nav} style={{ flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, borderRadius: 14, background: "rgba(255,255,255,0.04)", padding: 6, overflowX: "auto", scrollbarWidth: "none" }}>
              {view.primaryTabs.map((t) => {
                const active = t.id === view.activePrimaryTab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => goPrimaryTab(t.id)}
                    style={{
                      flex: "1 0 auto", height: 42, border: 0, borderRadius: 10, padding: "0 14px", cursor: "pointer",
                      fontSize: 14, fontWeight: 600, transition: "all 200ms ease", whiteSpace: "nowrap",
                      background: active ? "rgba(255,255,255,0.08)" : "transparent",
                      color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.58)",
                      boxShadow: active ? "0 1px 0 rgba(255,255,255,0.06), 0 4px 18px rgba(0,0,0,0.25)" : "none",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div className={styles.container9} style={{ flex: "1 1 auto", minWidth: 0 }}>
                {/* 二級頁籤（推薦＋系列，演算法同手機版）。選中：link6／text7，其餘：link7／text8 */}
                {secondaryTabs.map((t) => {
                  const active = t.id === activeSecondaryTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={active ? styles.link6 : styles.link7}
                      style={{ cursor: "pointer" }}
                      onClick={() => setUrl({ series: t.id.startsWith("series:") ? t.id.slice("series:".length) : null })}
                    >
                      <p className={active ? styles.text7 : styles.text8}>{t.label}</p>
                    </button>
                  );
                })}
              </div>
              {/* 排序：/packs 那顆下拉搬過來、放最右（老闆 2026-09-04），選項同手機版 */}
              <div style={{ flexShrink: 0 }}>
                <PillSelect
                  value={view.sortMode}
                  onChange={(next) => setUrl({ sort: next })}
                  options={view.sortOptions.map((o) => ({ key: o.id, label: o.label }))}
                  ariaLabel="排序"
                  icon={<FilterIcon />}
                  borderless
                  fit
                />
              </div>
            </div>
          </div>
          {/* 商品格：/packs 的小卡，一排 N 張、捲到底自動載入（手機首頁的商品格換成 cardx 外觀） */}
          <section className={styles.section} aria-label="商品列表">
            <div
              ref={listRef}
              className={styles.frame12}
              style={{
                display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16,
                justifyItems: "stretch", alignItems: "stretch", width: "100%", overflow: "visible", overflowX: "visible",
                marginTop: 0, paddingTop: 0, paddingBottom: 0,
              }}
            >
              {view.items.slice(0, visibleCount).map((p) => (
                <HomeProductCard
                  key={p.id}
                  product={p}
                  meta={view.feedMeta.current.get(String(p.id))}
                  followed={view.follows.has(Number(p.id))}
                  onToggleFollow={() => void view.toggleFollow(Number(p.id))}
                />
              ))}
            </div>
            <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
            <div style={{ textAlign: "center", padding: "24px 0 8px", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
              {visibleCount < view.items.length ? "載入中…" : view.items.length > 0 ? "到底了" : catalogLoaded ? "此分類暫無商品" : ""}
            </div>
          </section>
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
