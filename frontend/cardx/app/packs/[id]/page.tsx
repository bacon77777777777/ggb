"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { formatMoney } from "@/cardx/components/ui/money";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import styles from "@/cardx/app/market/[id]/MarketDetail.module.css";
import { makePackDetail } from "@/cardx/lib/packs";

const FAVORITES_KEY = "cardx.favorites.byId";
const RECENTS_KEY = "cardx.recent.detailVisits";

function readFavorites(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeFavorites(next: Record<string, boolean>) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {}
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pushRecentVisit(entry: {
  kind: "packs";
  id: string;
  ts: number;
  title: string;
  imageUrl: string;
  price: number;
  remaining: string;
}) {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [entry, ...list.filter((x) => x && typeof x === "object" && !(x.kind === entry.kind && x.id === entry.id))].slice(0, 200);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
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

function MediaGallery({ title, images }: { title: string; images: string[] }) {
  const activeImageSrc = images[0];

  return (
    <div className={styles.mediaCard}>
      <div className={styles.mediaStage}>
        <div className={styles.mediaInner}>
          <div className={styles.mediaMain}>
            <Image className={styles.mediaImage} src={activeImageSrc} alt={title} fill sizes="(max-width: 1023px) 92vw, 560px" priority />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PackDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "pack_001";
  const detail = useMemo(() => makePackDetail(id), [id]);
  const price = formatMoney(detail.priceMoney);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef<HTMLDivElement | null>(null);
  const fairnessInfoCloseRef = useRef<HTMLButtonElement | null>(null);
  const [dockShiftY, setDockShiftY] = useState(0);
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const favorited = !!favoriteById[id];
  const [panelTop, setPanelTop] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [fairnessInfoOpen, setFairnessInfoOpen] = useState(false);

  useEffect(() => {
    window.setTimeout(() => setFavoriteById(readFavorites()), 0);
  }, []);

  useEffect(() => {
    function sync() {
      setFavoriteById(readFavorites());
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== FAVORITES_KEY) return;
      sync();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);

  function toggleFavorite(targetId: string) {
    setFavoriteById((prev) => {
      const next = { ...prev, [targetId]: !prev[targetId] };
      if (!next[targetId]) delete next[targetId];
      writeFavorites(next);
      return next;
    });
  }

  function handleOpen() {
    try {
      const raw = window.localStorage.getItem("cardx.kyc.v1");
      const parsed = raw ? JSON.parse(raw) : null;
      const status = parsed && typeof parsed === "object" ? (parsed.status as string) : "";
      const next = `/checkout?kind=pack&id=${encodeURIComponent(id)}`;
      if (status !== "approved") {
        router.push(`/account/kyc?next=${encodeURIComponent(next)}`);
        return;
      }
      router.push(next);
    } catch {
      const next = `/checkout?kind=pack&id=${encodeURIComponent(id)}`;
      router.push(`/account/kyc?next=${encodeURIComponent(next)}`);
    }
  }

  useEffect(() => {
    const total = detail.totalPacks;
    const remaining = clamp(total - detail.openedPacks, 0, total);
    pushRecentVisit({
      kind: "packs",
      id: detail.id,
      ts: Date.now(),
      title: detail.title,
      imageUrl: detail.imageUrl,
      price: detail.priceMoney.amount,
      remaining: `${remaining}/${total}`,
    });
  }, [detail.id, detail.imageUrl, detail.openedPacks, detail.priceMoney.amount, detail.title, detail.totalPacks]);

  const oddsRows = useMemo(() => {
    const total = detail.totalPacks;
    const opened = clamp(detail.openedPacks, 0, total);
    const pool = [
      { tier: "A賞", name: detail.topHits[0]?.subtitle ?? "Top Hit", total: 1 },
      { tier: "B賞", name: detail.topHits[1]?.subtitle ?? "稀有卡", total: 2 },
      { tier: "C賞", name: detail.topHits[2]?.subtitle ?? "妙花種子R", total: 60 },
      { tier: "D賞", name: "一般賞", total: Math.max(0, total - 1 - 2 - 60) },
    ];

    return pool.map((x) => {
      const consumed = Math.floor((opened / total) * x.total);
      const remaining = clamp(x.total - consumed, 0, x.total);
      return { ...x, remaining };
    });
  }, [detail.openedPacks, detail.topHits, detail.totalPacks]);

  const prizeSummaryCards = useMemo(() => {
    const a = oddsRows.find((x) => x.tier === "A賞") ?? oddsRows[0];
    return [
      { label: "最大賞", value: a?.name ?? "—" },
      { label: "最大賞剩餘", value: a ? `${a.remaining}/${a.total}` : "—" },
      { label: "已抽", value: `${detail.openedPacks}/${detail.totalPacks}` },
      { label: "回饋率", value: `${detail.payoutPct}%` },
    ];
  }, [detail.openedPacks, detail.payoutPct, detail.totalPacks, oddsRows]);

  const sortedTopHits = useMemo(() => {
    return [...detail.topHits].sort((a, b) => b.price - a.price);
  }, [detail.topHits]);

  const approxPrice = price;
  const remainingTotal = useMemo(() => `${clamp(detail.totalPacks - detail.openedPacks, 0, detail.totalPacks)}/${detail.totalPacks}`, [detail.openedPacks, detail.totalPacks]);

  useEffect(() => {
    let raf = 0;

    function readHeaderHeightPx() {
      const shell = document.querySelector<HTMLElement>('[class*="shell"]');
      if (!shell) return 64;
      const raw = window.getComputedStyle(shell).getPropertyValue("--header-height").trim();
      const n = Number(raw.replace("px", ""));
      return Number.isFinite(n) && n > 0 ? n : 64;
    }

    function update() {
      const wrap = layoutRef.current;
      const stop = stopRef.current;
      if (!wrap || !stop) {
        setDockShiftY(0);
        setPanelTop(null);
        setIsMobile(false);
        return;
      }

      const mobile = window.innerWidth <= 1023;
      setIsMobile((prev) => (prev === mobile ? prev : mobile));
      if (mobile) {
        setDockShiftY(0);
        setPanelTop(null);
        return;
      }

      const headerH = readHeaderHeightPx();
      const measuredTop = Math.max(headerH + 20, Math.round(wrap.getBoundingClientRect().top));
      setPanelTop((prev) => (prev === measuredTop ? prev : measuredTop));

      const topOffset = measuredTop;
      const gap = 16;
      const bottomGap = 20;
      const panelH = window.innerHeight - topOffset - bottomGap;
      const scrollY = window.scrollY;
      const stopY = stop.getBoundingClientRect().top + scrollY;
      const threshold = scrollY + topOffset + panelH + gap;

      const overlap = Math.max(0, threshold - stopY);
      setDockShiftY((prev) => (prev === overlap ? prev : overlap));
    }

    function onScroll() {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!fairnessInfoOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFairnessInfoOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => fairnessInfoCloseRef.current?.focus());

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [fairnessInfoOpen]);

  const panelActions = (
    <div className={styles.actionGrid}>
      <button
        type="button"
        className={styles.secondaryButton}
        aria-label="私訊"
        style={{ width: 48, minWidth: 48, height: 48, padding: 0, display: "grid", placeItems: "center" }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ display: "block" }}>
          <use href="#icon-chat-3" />
        </svg>
      </button>

      <button
        type="button"
        className={styles.secondaryButton}
        aria-label="收藏"
        aria-pressed={favorited}
        onClick={() => toggleFavorite(id)}
        style={{
          width: 48,
          minWidth: 48,
          height: 48,
          padding: 0,
          display: "grid",
          placeItems: "center",
          color: favorited ? "#ff4d4f" : undefined,
          borderColor: favorited ? "rgba(255, 77, 79, 0.55)" : undefined,
          background: favorited ? "rgba(255, 77, 79, 0.18)" : undefined,
        }}
      >
        <HeartIcon />
      </button>

      <button
        className={`button-3d button-3d_green button-3d_sm ${styles.buyButton3d}`}
        data-v-c8c96dbe=""
        type="button"
        aria-label="開封卡包"
        onClick={handleOpen}
      >
        <span className="button-3d__outer" data-v-c8c96dbe="">
          <span className="button-3d__inner" data-v-c8c96dbe="">
            <span className="button-3d__text" data-v-c8c96dbe="">
              立即開抽
            </span>
          </span>
        </span>
      </button>
    </div>
  );

  const panelInner = (
    <div className={styles.infoCol} style={isMobile ? undefined : { height: "100%" }}>
      <h1 className={styles.title}>{detail.title}</h1>
      <div className={styles.ownerRow}>
        <span>供應商</span>
        <span className={styles.ownerName}>CardX</span>
      </div>

      <div className={styles.priceCard} aria-label="配率表">
        <div style={{ display: "grid", gap: 10 }}>
          <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
            配率表
          </div>
          <div style={{ display: "grid" }}>
            {oddsRows.map((r, idx) => {
              const total = Math.max(1, r.total);
              const pct = (r.remaining / total) * 100;
              const isLast = idx === oddsRows.length - 1;
              return (
                <div
                  key={`${r.tier}_${r.name}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1px 1fr 1fr 78px",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 12px",
                    minWidth: 0,
                    borderBottom: isLast ? undefined : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap" }}>{r.tier}</div>
                  <div />
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.92)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.name}
                  </div>
                  <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${clamp(pct, 0, 100)}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(34,131,246,0.85), rgba(36,163,255,0.85))",
                      }}
                    />
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.88)" }}>
                    {r.remaining}/{r.total}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "42px 1px 1fr 1fr 78px",
              gap: 12,
              alignItems: "center",
              padding: "10px 12px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap" }}>總計</div>
            <div />
            <div />
            <div />
            <div style={{ textAlign: "right", fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.88)" }}>{remainingTotal}</div>
          </div>
        </div>

        <div className={styles.priceNow} aria-label="單抽" style={{ gap: 4 }}>
          <div className={styles.priceCardLabel}>單抽</div>
          <div className={styles.priceCardValue}>{approxPrice}</div>
        </div>

        {panelActions}
      </div>
    </div>
  );

  return (
    <AppShell sidebarItems={defaultSidebarItems} hideBottomNavOnMobile>
      <div className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="breadcrumb">
          <Link href="/packs" className={styles.breadcrumbBack} scroll={false} aria-label="返回卡包">
            <span className={styles.breadcrumbBackIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path
                  d="M15 18l-6-6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.breadcrumbBackText}>
              <span>卡包</span>
              <span className={styles.breadcrumbSep} aria-hidden="true">
                {" "}
                /{" "}
              </span>
              <span>{detail.gameLabel}</span>
              <span className={styles.breadcrumbSep} aria-hidden="true">
                {" "}
                /{" "}
              </span>
              <span className={styles.breadcrumbStrong}>{detail.title}</span>
            </span>
          </Link>
        </nav>

        <div
          aria-label="卡包詳情版型"
          ref={layoutRef}
          style={{
            position: "relative",
            paddingRight: isMobile
              ? 0
              : "max(0px, calc((100vw - var(--sidebar-width) - (var(--app-gutter) * 2) - 16px) / 2 + 16px))",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: 16,
            }}
          >
            {isMobile ? (
              <section className={styles.hero} aria-label="卡包主圖與面板">
                <div className={styles.mediaCol}>
                  <MediaGallery key={detail.id} title={detail.title} images={[detail.imageUrl]} />
                </div>
                {panelInner}
              </section>
            ) : (
              <div className={styles.mediaCol} aria-label="卡包主圖">
                <MediaGallery key={detail.id} title={detail.title} images={[detail.imageUrl]} />
              </div>
            )}

            <div style={{ display: "grid", gap: 16 }}>
              <section className={styles.section} aria-label="大賞資訊">
                <div className={styles.sectionHeader}>大賞資訊</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {prizeSummaryCards.map((row) => (
                    <div key={row.label} className={styles.itemDetailCard}>
                      <div className={styles.itemDetailLabel}>{row.label}</div>
                      <div className={styles.itemDetailValue}>{row.value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.section} aria-label="公平性驗證">
                <div className={styles.sectionHeaderRow} style={{ justifyContent: "flex-start", gap: 4, alignItems: "center" }}>
                  <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                    公平性驗證
                  </div>
                  <button
                    type="button"
                    aria-label="公平性驗證說明"
                    onClick={() => setFairnessInfoOpen(true)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.72)",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      cursor: "pointer",
                      flex: "0 0 auto",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" style={{ display: "block" }}>
                      <path
                        fill="currentColor"
                        d="M11 17h2v-6h-2v6zm1-8.75c.69 0 1.25-.56 1.25-1.25S12.69 5.75 12 5.75 10.75 6.31 10.75 7 11.31 8.25 12 8.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
                      />
                    </svg>
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <div className={styles.itemDetailCard}>
                    <div className={styles.itemDetailLabel}>隨機種子（TXID）</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span className={styles.itemDetailValue} style={{ flex: "1 1 auto" }}>
                        {detail.soldOut ? detail.txid : "完抽後公布"}
                      </span>
                      <button
                        type="button"
                        aria-label="複製 TXID"
                        disabled={!detail.soldOut}
                        onClick={() => void navigator.clipboard.writeText(detail.txid)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          border: detail.soldOut ? "1px solid rgba(77,163,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                          background: detail.soldOut ? "rgba(77,163,255,0.12)" : "rgba(255,255,255,0.04)",
                          color: detail.soldOut ? "rgba(77,163,255,0.95)" : "rgba(255,255,255,0.40)",
                          display: "grid",
                          placeItems: "center",
                          padding: 0,
                          cursor: detail.soldOut ? "pointer" : "not-allowed",
                          opacity: detail.soldOut ? 1 : 0.85,
                          flex: "0 0 auto",
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style={{ display: "block" }}>
                          <path
                            fill="currentColor"
                            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className={styles.itemDetailCard}>
                    <div className={styles.itemDetailLabel}>雜湊值（TXID HASH）</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span className={styles.itemDetailValue} style={{ flex: "1 1 auto" }}>
                        {detail.txidHash}
                      </span>
                      <button
                        type="button"
                        aria-label="複製 TXID HASH"
                        onClick={() => void navigator.clipboard.writeText(detail.txidHash)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          border: "1px solid rgba(77,163,255,0.35)",
                          background: "rgba(77,163,255,0.12)",
                          color: "rgba(77,163,255,0.95)",
                          display: "grid",
                          placeItems: "center",
                          padding: 0,
                          cursor: "pointer",
                          flex: "0 0 auto",
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style={{ display: "block" }}>
                          <path
                            fill="currentColor"
                            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.section} aria-label="賞項一覽">
                <div className={styles.sectionHeader}>賞項一覽</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 16,
                  }}
                >
                  {sortedTopHits.map((h, idx) => {
                    const isTop = idx === 0;
                    const labelColor = isTop ? "rgba(0,0,0,0.68)" : "rgba(255,255,255,0.62)";
                    const titleColor = isTop ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.94)";
                    const priceColor = isTop ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.85)";
                    const footerBg = isTop
                      ? "linear-gradient(180deg, rgba(255, 246, 220, 0.98), rgba(220, 175, 90, 0.96))"
                      : undefined;

                    return (
                      <div
                        key={h.id}
                        style={{
                          borderRadius: 16,
                          border: isTop ? "1px solid rgba(255, 215, 120, 0.85)" : "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          overflow: "hidden",
                          minWidth: 0,
                          boxShadow: isTop
                            ? "inset 0 0 0 2px rgba(255, 244, 200, 0.98), inset 0 0 0 5px rgba(215, 162, 71, 0.92), 0 0 0 1px rgba(0,0,0,0.22), 0 18px 40px rgba(0,0,0,0.35)"
                            : undefined,
                        }}
                      >
                        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "rgba(0,0,0,0.18)" }}>
                          <Image src={h.imageUrl} alt="" fill sizes="(max-width: 1023px) 40vw, 240px" style={{ objectFit: "cover" }} unoptimized />
                        </div>
                        <div style={{ padding: 12, display: "grid", gap: 6, background: footerBg }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: labelColor }}>{h.title}</div>
                          <div style={{ fontSize: 13, fontWeight: 950, color: titleColor, lineHeight: "16px" }}>{h.subtitle}</div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: priceColor }}>
                            約{formatMoney({ amount: h.price, currency: "TWD" })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          {!isMobile ? (
            <aside
              aria-label="右側操作面板"
              style={{
                position: "fixed",
                top: panelTop == null ? "calc(var(--header-height) + 20px)" : `${panelTop}px`,
                right: "var(--app-gutter)",
                width: "calc((100vw - var(--sidebar-width) - (var(--app-gutter) * 2) - 16px) / 2)",
                height:
                  panelTop == null ? "calc(100dvh - var(--header-height) - 40px)" : `calc(100dvh - ${panelTop}px - 20px)`,
                zIndex: 30,
                transform: dockShiftY > 0 ? `translateY(${-dockShiftY}px)` : undefined,
                overflowY: "auto",
              }}
            >
              {panelInner}
            </aside>
          ) : null}
        </div>

        <div className={styles.mobileActionBar} aria-label="行動操作">
          <div className={styles.mobileActionGrid}>
            <button
              type="button"
              className={styles.secondaryButton}
              aria-label="私訊"
              style={{ width: 48, minWidth: 48, height: 48, padding: 0, display: "grid", placeItems: "center" }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ display: "block" }}>
                <use href="#icon-chat-3" />
              </svg>
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              aria-label="收藏"
              aria-pressed={favorited}
              onClick={() => toggleFavorite(id)}
              style={{
                width: 48,
                minWidth: 48,
                height: 48,
                padding: 0,
                display: "grid",
                placeItems: "center",
                color: favorited ? "#ff4d4f" : undefined,
                borderColor: favorited ? "rgba(255, 77, 79, 0.55)" : undefined,
                background: favorited ? "rgba(255, 77, 79, 0.18)" : undefined,
              }}
            >
              <HeartIcon />
            </button>

            <button
              className={`button-3d button-3d_green button-3d_sm ${styles.buyButton3d}`}
              data-v-c8c96dbe=""
              type="button"
              aria-label="開封卡包"
              onClick={handleOpen}
            >
              <span className="button-3d__outer" data-v-c8c96dbe="">
                <span className="button-3d__inner" data-v-c8c96dbe="">
                  <span className="button-3d__text" data-v-c8c96dbe="">
                    立即開抽
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>

        {fairnessInfoOpen ? (
          <div
            role="presentation"
            onClick={() => setFairnessInfoOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              background: "rgba(0,0,0,0.62)",
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="公平性驗證說明"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(560px, calc(100vw - 32px))",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(17, 25, 35, 0.96)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                padding: 16,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>公平性驗證</div>
                <button
                  ref={fairnessInfoCloseRef}
                  type="button"
                  aria-label="關閉"
                  onClick={() => setFairnessInfoOpen(false)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.82)",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                    cursor: "pointer",
                    flex: "0 0 auto",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                    ×
                  </span>
                </button>
              </div>

              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, lineHeight: "18px", color: "rgba(255,255,255,0.82)" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    每次創建卡包商品時，會先用 TXID Hash 決定每個賞項落在第幾包（例如：A賞=第38包、B賞=第3/56包）。
                    完抽（{detail.totalPacks} 抽）後公開 TXID，任何人都可用 TXID 驗證 TXID Hash 是否一致，並驗證大賞位置是否可被事後修改。
                  </div>
                  <div>
                    你可以把 TXID 視為「隨機種子」，TXID Hash 則是「提前承諾（commit）」：先公布 Hash，等完抽後再公布 TXID 讓所有人驗證。
                  </div>
                  <div>
                    驗證方式：將公開的 TXID 重新計算 Hash，與商品頁顯示的 TXID Hash 比對；一致代表開抽結果與大賞位置無法被事後篡改。
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div ref={stopRef} aria-hidden="true" style={{ height: 1 }} />
        <div className={homeStyles.main2}>
          <div className={homeStyles.main}>
            <div className={homeStyles.sectionLobby}>
              <section className={homeStyles.section} aria-label="相似商品">
                <div className={homeStyles.header}>
                  <div className={homeStyles.link8}>
                    <div className={homeStyles.sVg}>
                      <img alt="" src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg" className={homeStyles.iconCherries} />
                    </div>
                    <p className={homeStyles.heading2Slots}>相似商品</p>
                  </div>
                  <Link className={homeStyles.text10} href="/packs">
                    查看全部
                  </Link>
                </div>
                <div className={homeStyles.frame12}>
                  {detail.similar.slice(0, 8).map((item) => (
                    <div
                      className={homeStyles.item4}
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
                      <div className={homeStyles.rectangle2} style={{ backgroundImage: `url(${item.imageUrl})` }}>
                        <button type="button" className={homeStyles.favoriteButton} aria-pressed={false}>
                          <HeartIcon />
                        </button>
                        <div className={homeStyles.backgroundBorderShad}>
                          <p className={homeStyles.a18}>-18%</p>
                        </div>
                      </div>
                      <div className={homeStyles.frame1}>
                        <p className={homeStyles.a2022PaniniPrizm353B}>{item.title}</p>
                        <div className={homeStyles.frame2}>
                          <p className={homeStyles.heading62225}>
                            <span className={homeStyles.priceValue}>{formatMoney({ amount: item.price, currency: "TWD" })}</span>
                            <span className={homeStyles.priceSep}> / </span>
                            <span className={homeStyles.priceUnit}>單抽</span>
                          </p>
                          <div className={homeStyles.overlayBorder}>
                            <p className={homeStyles.fMv2730}>{item.remaining}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
