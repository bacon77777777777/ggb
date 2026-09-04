"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SidebarItem } from "@/cardx/lib/types";
import styles from "./AppShell.module.css";
/* 接吉吉比的真資料（老闆 2026-09-04：頂部導航這些按鈕都用得到，先接真實資料）：
   登入狀態／G 幣／頭像走 AuthContext，鈴鐺未讀跟手機版 Navbar 同一套算法，聲音開關接站上的靜音偏好 */
import { useAuth } from "@/contexts/AuthContext";
import { asset } from "@/lib/asset";
import { createClient } from "@/lib/supabase/client";
import { countUnread } from "@/lib/announcementRead";
import { setSoundMuted } from "@/lib/soundPrefs";
import { useSoundMuted } from "@/hooks/useSoundMuted";

type Props = {
  sidebarItems: SidebarItem[];
  hideBottomNavOnMobile?: boolean;
  containerMaxWidth?: string;
  children: React.ReactNode;
};

declare global {
  interface Window {
    liff?: {
      init: (args: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: (args?: { redirectUri?: string }) => void;
      logout: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
    };
  }
}

type AuthUser = { provider: "ggb"; email?: string; displayName: string; pictureUrl?: string; tokens: number; points: number };

export function AppShell({ sidebarItems, hideBottomNavOnMobile, containerMaxWidth, children }: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user: ggbUser, isAuthenticated, logout: ggbLogout } = useAuth();
  const authUser: AuthUser | null = isAuthenticated && ggbUser
    ? {
        provider: "ggb",
        email: ggbUser.email,
        displayName: ggbUser.name || ggbUser.full_name || (ggbUser.email ? ggbUser.email.split("@")[0] : "") || "會員",
        pictureUrl: ggbUser.avatar_url || undefined,
        tokens: ggbUser.tokens ?? 0,
        points: ggbUser.points ?? 0,
      }
    : null;
  const avatarStyle = {
    backgroundImage: `url("${authUser?.pictureUrl ?? asset("/images/avatar.webp")}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as const;
  /* 鈴鐺未讀：個人通知（排除私訊類）＋公告，跟手機版 Navbar 同一套 */
  const [bellUnread, setBellUnread] = useState(false);
  useEffect(() => {
    if (!authUser) { setBellUnread(false); return; }
    const supabase = createClient();
    let alive = true;
    const check = async () => {
      try {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("is_read", false)
          .not("type", "in", "(exchange_message,sell_message)");
        if (!alive) return;
        if ((count ?? 0) > 0) { setBellUnread(true); return; }
        const res = await fetch("/api/announcements?limit=30");
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !Array.isArray(data) || data.length === 0) return;
        setBellUnread(countUnread(data as { id: string; published_at: string }[]) > 0);
      } catch {}
    };
    void check();
    const handler = () => { void check(); };
    window.addEventListener("ggb:announcementsRead", handler);
    return () => { alive = false; window.removeEventListener("ggb:announcementsRead", handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!authUser, pathname]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const soundMuted = useSoundMuted();
  const settingsAllSound = !soundMuted;
  const setSettingsAllSound = (fn: (v: boolean) => boolean) => setSoundMuted(!fn(settingsAllSound));
  const [settingsAnimations, setSettingsAnimations] = useState(true);
  const [settingsHideLockedGames, setSettingsHideLockedGames] = useState(false);
  const [settingsMusic, setSettingsMusic] = useState(60);
  const [settingsSfx, setSettingsSfx] = useState(60);
  const [liffStatus, setLiffStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [liffError, setLiffError] = useState<string | null>(null);
  const profileWrapDesktopRef = useRef<HTMLDivElement | null>(null);
  const profileWrapMobileRef = useRef<HTMLDivElement | null>(null);
  const profileCloseTimerRef = useRef<number | null>(null);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
  const liffEnabled = !!liffId;

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("cardx.sidebarCollapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  // 帶 query 的項目（五個類別都走 /packs?cat=…）要連 query 一起比，不然五個會一起亮
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const isActive = useCallback(
    (href: string) => {
      if (href === "#") return false;
      const q = href.indexOf("?");
      if (q >= 0) return pathname === href.slice(0, q) && search === href.slice(q);
      if (href === "/") return pathname === "/";
      return pathname === href || pathname.startsWith(`${href}/`);
    },
    [pathname, search]
  );

  const leftMenuGroups = useMemo(() => {
    const groups: Array<Array<Extract<SidebarItem, { kind: "link" }>>> = [];
    let current: Array<Extract<SidebarItem, { kind: "link" }>> = [];

    for (const item of sidebarItems) {
      if (item.kind === "divider") {
        if (current.length) groups.push(current);
        current = [];
        continue;
      }
      if (item.kind === "link") current.push(item);
    }
    if (current.length) groups.push(current);

    return groups;
  }, [sidebarItems]);

  const iconForLabel = useCallback((label: string) => {
    // 老闆 2026-09-04 的側欄清單多出來的項目：先用 sprite 裡現有的 19 顆圖示對，重複難免，之後再換
    const extra: Record<string, string> = {
      "一番賞": "#icon-gift", "盒玩": "#icon-box", "轉蛋": "#icon-casino", "抽卡": "#icon-docs", "自製賞": "#icon-missions",
      "挑戰機台": "#icon-sport", "交易所": "#icon-bag-dollar", "商城": "#icon-bag-dollar", "卡牌交換": "#icon-swap",
      "情報": "#icon-docs", "通知": "#icon-notifications",
      "成交行情": "#icon-sport", "任務": "#icon-missions", "獎勵": "#icon-gift",
    };
    if (extra[label]) return extra[label];
    return label === "收藏"
      ? "#icon-like"
      : label === "近期"
        ? "#icon-recent"
        : label === "市集"
          ? "#icon-bag-dollar"
          : label === "卡包"
            ? "#icon-box"
            : label === "交換"
              ? "#icon-swap"
              : label === "任務"
                ? "#icon-missions"
                : label === "活動"
                  ? "#icon-promotions"
                  : label === "排行榜"
                    ? "#icon-crown"
                    : label === "獎勵"
                      ? "#icon-gift"
                      : label === "最新消息"
                        ? "#icon-docs"
                        : label === "話題"
                          ? "#icon-chat-3"
                          : label === "卡牌走勢"
                            ? "#icon-sport"
                            : "#icon-chevron-right";
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem("cardx.sidebarCollapsed");
        setSidebarCollapsed(raw === "1");
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (mobileMenuOpen) setMobileMenuOpen(false);
      if (profileOpen) setProfileOpen(false);
      if (settingsOpen) setSettingsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen, profileOpen, settingsOpen]);

  useEffect(() => {
    let rafId = 0;
    function update() {
      const next = window.scrollY > 0;
      setHeaderElevated((prev) => (prev === next ? prev : next));
    }

    function onScroll() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        update();
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);




  useEffect(() => {
    if (!profileOpen) return;
    function onMouseDown(e: MouseEvent) {
      const node = e.target as Node;
      const desktopWrap = profileWrapDesktopRef.current;
      const mobileWrap = profileWrapMobileRef.current;
      if (desktopWrap && desktopWrap.contains(node)) return;
      if (mobileWrap && mobileWrap.contains(node)) return;
      setProfileOpen(false);
    }
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [profileOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    function onPointerDown(e: PointerEvent) {
      const wrap = settingsWrapRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      setSettingsOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [settingsOpen]);

  const cancelProfileClose = useCallback(() => {
    if (!profileCloseTimerRef.current) return;
    window.clearTimeout(profileCloseTimerRef.current);
    profileCloseTimerRef.current = null;
  }, []);

  const scheduleProfileClose = useCallback(() => {
    cancelProfileClose();
    profileCloseTimerRef.current = window.setTimeout(() => {
      setProfileOpen(false);
      profileCloseTimerRef.current = null;
    }, 120);
  }, [cancelProfileClose]);

  async function logout() {
    setProfileOpen(false);
    setSettingsOpen(false);
    await ggbLogout();
  }

  if (liffEnabled && liffStatus !== "ready") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(1200px 600px at 20% -10%, rgba(43,124,255,0.06), rgba(0,0,0,0)), #f9fafb",
          color: "#111827",
          padding: 24,
        }}
      >
        <div style={{ width: "min(520px, 100%)", display: "grid", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.2px" }}>正在取得 LINE 許可</div>
          <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
            {liffStatus === "error"
              ? liffError ?? "取得許可失敗。"
              : "首次使用會出現授權畫面，請同意後回到此頁。"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.shell} ${sidebarCollapsed ? styles.shellCollapsed : ""} ${
        headerElevated ? styles.shellScrolled : ""
      } ${hideBottomNavOnMobile ? styles.shellNoBottomNav : ""}`}
    >
      <header className={styles.header}>
        <div className={styles.headerDesktop} aria-label="Header">
          <button
            className={styles.iconHamburger}
            type="button"
            aria-label="開啟選單"
            aria-expanded={mobileMenuOpen}
            onClick={() => {
              if (window.innerWidth <= 768) {
                setMobileMenuOpen((v) => !v);
                return;
              }
              toggleSidebarCollapsed();
            }}
          >
            <svg
              className={`${styles.hamburgerIcon} ${sidebarCollapsed ? styles.hamburgerIconCollapsed : ""}`}
              viewBox="0 0 24 24"
              width="24"
              height="24"
              aria-hidden="true"
            >
              <use href="#icon-hamburger-open" />
            </svg>
          </button>

          <Link href="/" className={styles.logoDesktopLink} aria-label="吉吉比">
            {/* 老闆 2026-09-04：logo 換成吉吉比 */}
            <img src="/images/logo.png" alt="吉吉比" style={{ height: 35, width: "auto", display: "block" }} />
          </Link>

          <Link
            href="/missions"
            className={`bonus-cabinet ${styles.bonusCabinet}`}
            data-v-4ec444f2=""
            aria-label="簽到"
            /* 老闆 2026-09-04：圖標跟文字離近一點（原本固定 86 寬＋space-between 把兩個推到兩端） */
            style={{ width: "auto", minWidth: 0, gap: 6, justifyContent: "center", padding: "5px 14px 5px 7px" }}
          >
            <span className="background" data-v-4ec444f2="" aria-hidden="true" />
            <span className={styles.bonusIconWrap} aria-hidden="true">
              <img className={styles.bonusIcon} src={asset("/images/topbar/4b.png")} alt="" aria-hidden="true" />
            </span>
            <span className={styles.bonusText} aria-hidden="true">
              簽到
            </span>
          </Link>

          <Link href="/search" className={styles.squarePill} aria-label="搜尋">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <use href="#icon-search" />
            </svg>
          </Link>

          {authUser ? (
            <div className={styles.authedRight}>
              <div className={styles.balancePill} aria-label="資產">
                <button className={styles.balanceTrigger} type="button" aria-label="儲值紀錄" onClick={() => router.push("/profile?tab=topup-history")}>
                  <img src={asset("/images/gcoin.webp")} alt="G" style={{ width: 18, height: 18, display: "block" }} />
                  <span className={styles.balanceText}>{authUser.tokens.toLocaleString()}</span>
                  <svg className={styles.chevronIcon} viewBox="0 0 24 24" aria-hidden="true">
                    <use href="#icon-chevron-right" />
                  </svg>
                </button>
                <Link
                  href="/topup"
                  className={`button-3d button-3d_red button-3d_sm ${styles.depositBtn}`}
                  data-v-c8c96dbe=""
                  aria-label="儲值"
                >
                  <span className="button-3d__outer" data-v-c8c96dbe="">
                    <span className="button-3d__inner" data-v-c8c96dbe="">
                      <span className="button-3d__text" data-v-c8c96dbe="">
                        儲值
                      </span>
                    </span>
                  </span>
                </Link>
              </div>

              <div
                ref={profileWrapDesktopRef}
                className={styles.profileWrap}
                onMouseEnter={() => {
                  cancelProfileClose();
                  setProfileOpen(true);
                }}
                onMouseLeave={() => scheduleProfileClose()}
              >
                <button
                  className={styles.profilePill}
                  type="button"
                  aria-label="個人選單"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((v) => !v)}
                >
                  <span className={styles.avatar} style={avatarStyle} aria-hidden="true" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {authUser.displayName}
                  </span>
                  <svg
                    className={`${styles.profileArrow} ${profileOpen ? styles.profileArrowOpen : ""}`}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <use href="#icon-chevron-right" />
                  </svg>
                </button>
                {profileOpen ? (
                  <div
                    className={styles.profileMenu}
                    role="menu"
                    aria-label="個人選單"
                    onMouseEnter={() => {
                      cancelProfileClose();
                      setProfileOpen(true);
                    }}
                    onMouseLeave={() => scheduleProfileClose()}
                  >
                    <div className={styles.profilePanelTop}>
                      <div className={styles.profileHeroAvatar} style={avatarStyle} aria-hidden="true" />
                      <div className={styles.profileLevelPill} aria-hidden="true">
                        1 等級
                      </div>
                      <div className={styles.profileHeroName}>
                        {authUser.displayName}
                      </div>

                      <div className={styles.profileLevelRow} aria-hidden="true">
                        <div className={styles.profileLevelLeft}>1 等級</div>
                        <div className={styles.profileLevelRight}>2 等級</div>
                      </div>

                      <div className={styles.profileProgressRow} aria-hidden="true">
                        <div className={styles.profileProgressTrack}>
                          <div className={styles.profileProgressFill} style={{ width: "9.97%" }} />
                        </div>
                        <div className={styles.profileProgressPct}>
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <use href="#icon-gift" />
                          </svg>
                          <span>9.97%</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.profileMenuList} role="presentation">
                      <Link className={styles.profileMenuItem} role="menuitem" href="/profile" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-settings" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>會員中心</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=warehouse" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-box" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>倉庫</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=draw-history" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-docs" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>抽獎紀錄</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=topup-history" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-recent" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>儲值紀錄</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=follows" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-like" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>收藏</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/messages" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-chat-3" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>訊息</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/invite" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-gift" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>邀請好友</span>
                      </Link>
                    </div>

                    <button className={styles.profileLogout} type="button" onClick={logout}>
                      登出
                    </button>
                  </div>
                ) : null}
              </div>

              <div ref={settingsWrapRef} className={styles.settingsWrap}>
                {/* 老闆 2026-09-04：設定、鈴鐺、聊聊三顆放同一個膠囊，分隔線隔開 */}
                <div className={`${styles.overlayPill} ${styles.iconGroup}`} style={{ width: "auto", minWidth: 0, gap: 4, padding: "0 6px", cursor: "default" }}>
                  <button
                    type="button"
                    aria-label="設定"
                    aria-expanded={settingsOpen}
                    onClick={() => { setProfileOpen(false); setSettingsOpen((v) => !v); }}
                    className={styles.iconGroupBtn}
                  >
                    {/* 齒輪的圖形把 24 格塞滿，鈴鐺跟對話框沒有，同尺寸看起來齒輪特別大——縮到 20 視覺上才一樣（老闆 2026-09-04） */}
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <use href="#icon-settings" />
                    </svg>
                  </button>
                  <span className={styles.verticalDivider} aria-hidden="true" />
                  <Link href="/announcements" aria-label="通知" className={styles.iconGroupBtn}>
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <use href="#icon-notifications" />
                    </svg>
                    {bellUnread ? (
                      <span aria-hidden="true" style={{ position: "absolute", top: 3, right: 5, width: 8, height: 8, borderRadius: "50%", background: "rgb(var(--primary))", boxShadow: "0 0 0 2px #f3f4f6" }} />
                    ) : null}
                  </Link>
                  <span className={styles.verticalDivider} aria-hidden="true" />
                  <Link href="/messages" aria-label="訊息" className={styles.iconGroupBtn}>
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <use href="#icon-chat-3" />
                    </svg>
                  </Link>
                </div>
                {settingsOpen ? (
                  <div className={styles.settingsMenu} role="dialog" aria-label="設定">
                    <div className={styles.settingsGrid}>
                      <div className={styles.settingsCol}>
                        <button className={styles.settingsRow} type="button" aria-label="語言">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsFlag} aria-hidden="true">
                              <img src="/cardx/placeholder.svg" alt="" aria-hidden="true" />
                            </span>
                            <span className={styles.settingsMeta}>
                              <span className={styles.settingsLabel}>語言</span>
                              <span className={styles.settingsValue}>中文</span>
                            </span>
                          </span>
                          <span className={styles.settingsCaret} aria-hidden="true" />
                        </button>

                        <div className={styles.settingsRow} role="group" aria-label="全部聲音">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsIcon} aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                <path
                                  d="M11 5L6 9H3v6h3l5 4V5zm8.5 7a4.5 4.5 0 0 1-2.1 3.8v-7.6A4.5 4.5 0 0 1 19.5 12z"
                                  fill="currentColor"
                                  opacity="0.9"
                                />
                              </svg>
                            </span>
                            <span className={styles.settingsValueSolo}>全部聲音</span>
                          </span>
                          <button
                            type="button"
                            className={`${styles.toggle} ${settingsAllSound ? styles.toggleOn : ""}`}
                            aria-pressed={settingsAllSound}
                            onClick={() => setSettingsAllSound((v) => !v)}
                          >
                            <span className={styles.toggleKnob} />
                          </button>
                        </div>

                        <div className={styles.settingsSliderBlock} aria-label="音量">
                          <div className={styles.settingsSliderLabel}>音樂</div>
                          <input
                            className={styles.settingsSlider}
                            type="range"
                            min={0}
                            max={100}
                            value={settingsMusic}
                            onChange={(e) => setSettingsMusic(Number(e.target.value))}
                          />
                          <div className={styles.settingsSliderLabel}>音效</div>
                          <input
                            className={styles.settingsSlider}
                            type="range"
                            min={0}
                            max={100}
                            value={settingsSfx}
                            onChange={(e) => setSettingsSfx(Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className={styles.settingsCol}>
                        <button className={styles.settingsRow} type="button" aria-label="顯示餘額幣別">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsFlag} aria-hidden="true">
                              <span className={styles.settingsFlagDot} />
                            </span>
                            <span className={styles.settingsMeta}>
                              <span className={styles.settingsLabel}>顯示餘額幣別</span>
                              <span className={styles.settingsValue}>TWD</span>
                            </span>
                          </span>
                          <span className={styles.settingsCaret} aria-hidden="true" />
                        </button>

                        <button className={styles.settingsRow} type="button" aria-label="交易幣別">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsFlag} aria-hidden="true">
                              <span className={styles.settingsFlagDot} />
                            </span>
                            <span className={styles.settingsMeta}>
                              <span className={styles.settingsLabel}>交易幣別</span>
                              <span className={styles.settingsValue}>TWD</span>
                            </span>
                          </span>
                          <span className={styles.settingsCaret} aria-hidden="true" />
                        </button>

                        <div className={styles.settingsRow} role="group" aria-label="隱藏已下架商品">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsIcon} aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                <path
                                  d="M12 5c6.5 0 10 7 10 7s-3.5 7-10 7S2 12 2 12s3.5-7 10-7zm0 2c-3.1 0-5.6 2.5-5.6 5.6S8.9 18.2 12 18.2s5.6-2.5 5.6-5.6S15.1 7 12 7zm0 2.2a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8z"
                                  fill="currentColor"
                                  opacity="0.9"
                                />
                                <path d="M4 20L20 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.8" />
                              </svg>
                            </span>
                            <span className={styles.settingsValueSolo}>隱藏已下架商品</span>
                          </span>
                          <button
                            type="button"
                            className={`${styles.toggle} ${settingsHideLockedGames ? styles.toggleOn : ""}`}
                            aria-pressed={settingsHideLockedGames}
                            onClick={() => setSettingsHideLockedGames((v) => !v)}
                          >
                            <span className={styles.toggleKnob} />
                          </button>
                        </div>

                        <div className={styles.settingsRow} role="group" aria-label="動畫">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsIcon} aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                <path
                                  d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 5v5.3l4.2 2.5-.9 1.5L11 13V7z"
                                  fill="currentColor"
                                  opacity="0.9"
                                />
                              </svg>
                            </span>
                            <span className={styles.settingsValueSolo}>動畫</span>
                          </span>
                          <button
                            type="button"
                            className={`${styles.toggle} ${settingsAnimations ? styles.toggleOn : ""}`}
                            aria-pressed={settingsAnimations}
                            onClick={() => setSettingsAnimations((v) => !v)}
                          >
                            <span className={styles.toggleKnob} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

            </div>
          ) : (
            <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Link href="/login" className={styles.loginPill} style={{ marginLeft: 0 }}>登入</Link>
            <Link href="/register" className={`button-3d button-3d_red button-3d_sm ${styles.registerBtn}`} data-v-c8c96dbe="" aria-label="註冊" style={{ marginLeft: 0 }}>
              <span className="button-3d__outer" data-v-c8c96dbe=""><span className="button-3d__inner" data-v-c8c96dbe=""><span className="button-3d__text" data-v-c8c96dbe="">註冊</span></span></span>
            </Link>
            {/* 老闆 2026-09-04：未登入不顯示設定膠囊（裡面全是登入後才用得到的偏好） */}
            </div>
          )}
        </div>

        <div className={styles.headerMobile} aria-label="Header">
          <Link href="/" className={styles.logoMobileLink} aria-label="吉吉比">
            <img src="/images/logo.png" alt="吉吉比" style={{ height: 32, width: "auto", display: "block" }} />
          </Link>

          <Link href="/missions" className={styles.bonusPillMobile} aria-label="簽到">
            <span className={styles.bonusPillMobileIcon} style={{ backgroundImage: `url("${asset("/images/topbar/4b.png")}")` }} aria-hidden="true" />
          </Link>

          {authUser ? (
            <div ref={profileWrapMobileRef} className={styles.profileWrapMobile}>
              <button
                className={styles.profilePill}
                type="button"
                aria-label="個人選單"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((v) => !v)}
              >
                <span className={styles.avatar} style={avatarStyle} aria-hidden="true" />
                <svg
                  className={`${styles.profileArrow} ${profileOpen ? styles.profileArrowOpen : ""}`}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <use href="#icon-chevron-right" />
                </svg>
              </button>
              {profileOpen ? (
                <div className={styles.profileMenu} role="menu" aria-label="個人選單">
                  <div className={styles.profilePanelTop}>
                    <div className={styles.profileHeroAvatar} style={avatarStyle} aria-hidden="true" />
                    <div className={styles.profileLevelPill} aria-hidden="true">
                      1 等級
                    </div>
                    <div className={styles.profileHeroName}>
                      {authUser.displayName}
                    </div>

                    <div className={styles.profileLevelRow} aria-hidden="true">
                      <div className={styles.profileLevelLeft}>1 等級</div>
                      <div className={styles.profileLevelRight}>2 等級</div>
                    </div>

                    <div className={styles.profileProgressRow} aria-hidden="true">
                      <div className={styles.profileProgressTrack}>
                        <div className={styles.profileProgressFill} style={{ width: "9.97%" }} />
                      </div>
                      <div className={styles.profileProgressPct}>
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <use href="#icon-gift" />
                        </svg>
                        <span>9.97%</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.profileMenuList} role="presentation">
                    <Link className={styles.profileMenuItem} role="menuitem" href="/profile" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-settings" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>會員中心</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=warehouse" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-box" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>倉庫</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=draw-history" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-docs" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>抽獎紀錄</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=topup-history" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-recent" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>儲值紀錄</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/profile?tab=follows" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-like" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>收藏</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/messages" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-chat-3" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>訊息</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/invite" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-gift" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>邀請好友</span>
                    </Link>
                  </div>

                  <button className={styles.profileLogout} type="button" onClick={logout}>
                    登出
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Link href="/login" className={styles.loginPillMobile}>登入</Link>
          )}
        </div>
      </header>

      <div className={styles.content}>
        <aside className={styles.sidebar} aria-label="側邊欄">
          {!sidebarCollapsed ? (
            <div className={styles.leftMenu}>
              <nav className={styles.leftMenuList} aria-label="側欄選單">
                {leftMenuGroups.map((group, groupIdx) => (
                  <div key={`g_${groupIdx}`} className={styles.leftMenuGroup}>
                    {group.map((item, idx) => {
                      return (
                        <Link
                          key={`${item.href}_${item.label}_${groupIdx}_${idx}`}
                          className={`${styles.leftMenuItem} ${isActive(item.href) ? styles.leftMenuItemActive : ""} ${
                            idx === group.length - 1 ? styles.leftMenuItemLast : ""
                          }`}
                          href={item.disabled ? "#" : item.href}
                          onClick={item.disabled ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                          aria-disabled={item.disabled || undefined}
                        >
                          <span className={styles.leftMenuItemIcon} aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                              <use href={iconForLabel(item.label)} />
                            </svg>
                          </span>
                          <span className={styles.leftMenuItemLabel}>{item.label}</span>
                        </Link>
                      );
                    })}
                    {groupIdx !== leftMenuGroups.length - 1 ? (
                      <div className={styles.leftMenuDivider} aria-hidden="true" />
                    ) : null}
                  </div>
                ))}
              </nav>
            </div>
          ) : (
            <div className={styles.collapsedMenu} aria-label="側邊欄">
              <nav className={styles.collapsedNav} aria-label="側欄選單">
                {leftMenuGroups.map((group, groupIdx) => (
                  <div key={`cg_${groupIdx}`} className={styles.collapsedGroup}>
                    {group.map((item, idx) => {
                      return (
                        <Link
                          key={`c_${item.href}_${item.label}_${groupIdx}_${idx}`}
                          className={`${styles.collapsedItem} ${isActive(item.href) ? styles.collapsedItemActive : ""}`}
                          href={item.disabled ? "#" : item.href}
                          onClick={item.disabled ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                          aria-disabled={item.disabled || undefined}
                          title={item.label}
                          aria-label={item.label}
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                            <use href={iconForLabel(item.label)} />
                          </svg>
                        </Link>
                      );
                    })}
                    {groupIdx !== leftMenuGroups.length - 1 ? (
                      <div className={styles.collapsedDivider} aria-hidden="true" />
                    ) : null}
                  </div>
                ))}
              </nav>
            </div>
          )}
        </aside>

        <main className={styles.main}>
          <div
            className={styles.mainInner}
            style={
              containerMaxWidth
                ? ({
                    ["--ui-container-max" as unknown as string]: containerMaxWidth,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {children}
          </div>
        </main>
      </div>

      {mobileMenuOpen ? (
        <div className={styles.backdrop} role="presentation" onClick={closeMobileMenu} />
      ) : null}
      <aside
        id="cardx-mobile-drawer"
        className={`${styles.mobileDrawer} ${mobileMenuOpen ? styles.mobileDrawerOpen : ""}`}
        aria-hidden={!mobileMenuOpen}
      >
        <nav className={styles.leftMenuList} aria-label="手機側欄">
          {leftMenuGroups.map((group, groupIdx) => (
            <div key={`mg_${groupIdx}`} className={styles.leftMenuGroup}>
              {group.map((item, idx) => (
                <Link
                  key={`m_${item.href}_${item.label}_${groupIdx}_${idx}`}
                  className={`${styles.leftMenuItem} ${isActive(item.href) ? styles.leftMenuItemActive : ""} ${
                    idx === group.length - 1 ? styles.leftMenuItemLast : ""
                  }`}
                  href={item.disabled ? "#" : item.href}
                          onClick={item.disabled ? (e: React.MouseEvent) => e.preventDefault() : closeMobileMenu}
                  aria-disabled={item.disabled || undefined}
                >
                  <span className={styles.leftMenuItemIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <use href={iconForLabel(item.label)} />
                    </svg>
                  </span>
                  <span className={styles.leftMenuItemLabel}>{item.label}</span>
                </Link>
              ))}
              {groupIdx !== leftMenuGroups.length - 1 ? <div className={styles.leftMenuDivider} aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>
      </aside>

      <nav className={styles.bottomNav} aria-label="底部導航">
        <button
          className={`${styles.bottomNavItem} ${mobileMenuOpen ? styles.bottomNavItemActive : ""}`}
          type="button"
          aria-label="切換選單"
          aria-expanded={mobileMenuOpen}
          aria-controls="cardx-mobile-drawer"
          onClick={() => {
            setProfileOpen(false);
            setSettingsOpen(false);
            setMobileMenuOpen((v) => !v);
          }}
        >
          <svg className={styles.bottomNavIcon} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <use href="#icon-hamburger-open" />
          </svg>
          <span>菜單</span>
        </button>
        <Link
          className={`${styles.bottomNavItem} ${isActive("/market") ? styles.bottomNavItemActive : ""}`}
          href="/market"
        >
          <svg className={styles.bottomNavIcon} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <use href="#icon-bag-dollar" />
          </svg>
          <span>市集</span>
        </Link>
        <Link
          className={`${styles.bottomNavItem} ${isActive("/trades") ? styles.bottomNavItemActive : ""}`}
          href="/trades"
        >
          <svg className={styles.bottomNavIcon} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <use href="#icon-swap" />
          </svg>
          <span>交換</span>
        </Link>
        <Link
          className={`${styles.bottomNavItem} ${isActive("/packs") ? styles.bottomNavItemActive : ""}`}
          href="/packs"
        >
          <svg className={styles.bottomNavIcon} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <use href="#icon-box" />
          </svg>
          <span>卡包</span>
        </Link>
        <Link
          className={`${styles.bottomNavItem} ${isActive("/account") ? styles.bottomNavItemActive : ""}`}
          href="/account"
        >
          <svg className={styles.bottomNavIcon} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <use href="#icon-settings" />
          </svg>
          <span>我的</span>
        </Link>
      </nav>
    </div>
  );
}
