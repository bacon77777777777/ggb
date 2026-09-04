"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { SidebarItem } from "@/cardx/lib/types";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";
import styles from "./AppShell.module.css";

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

type AuthUser =
  | { provider: "google" | "email"; email?: string }
  | { provider: "line"; userId: string; displayName: string; pictureUrl?: string };

export function AppShell({ sidebarItems, hideBottomNavOnMobile, containerMaxWidth, children }: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAllSound, setSettingsAllSound] = useState(true);
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
  const pathname = usePathname();
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
  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/";
      return pathname === href || pathname.startsWith(`${href}/`);
    },
    [pathname]
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
    if (liffEnabled) return;
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const sb = supabase;

    async function syncFromSession() {
      try {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session?.user) {
          setAuthUser(null);
          return;
        }
        const email = session.user.email ?? undefined;
        const user = { provider: "email" as const, email };
        setAuthUser(user);
        try {
          window.localStorage.setItem("cardx.auth.user", JSON.stringify(user));
        } catch {}
      } catch {
        setAuthUser(null);
      }
    }

    void syncFromSession();
    const { data } = sb.auth.onAuthStateChange(() => {
      void syncFromSession();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function readAuthUser(): AuthUser | null {
      try {
        const raw = window.localStorage.getItem("cardx.auth.user");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        if (parsed.provider === "google" || parsed.provider === "email") {
          const email = typeof parsed.email === "string" ? parsed.email : undefined;
          return { provider: parsed.provider, email };
        }
        if (parsed.provider === "line") {
          const userId = typeof parsed.userId === "string" ? parsed.userId : "";
          const displayName = typeof parsed.displayName === "string" ? parsed.displayName : "";
          if (!userId || !displayName) return null;
          const pictureUrl = typeof parsed.pictureUrl === "string" ? parsed.pictureUrl : undefined;
          return { provider: "line", userId, displayName, pictureUrl };
        }
        return null;
      } catch {
        return null;
      }
    }

    function sync() {
      setAuthUser((prev) => {
        const next = readAuthUser();
        if (!next && !prev) return prev;
        if (!next || !prev) return next;
        if (next.provider !== prev.provider) return next;
        if (next.provider === "line") {
          if (prev.provider !== "line") return next;
          if (next.userId === prev.userId && next.displayName === prev.displayName && next.pictureUrl === prev.pictureUrl) return prev;
          return next;
        }
        if (prev.provider === "line") return next;
        if (next.email === prev.email) return prev;
        return next;
      });
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== "cardx.auth.user") return;
      sync();
    }

    sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    if (!liffEnabled) return;
    if (liffStatus === "ready") return;
    let cancelled = false;

    async function waitForLiff() {
      const startedAt = Date.now();
      while (!window.liff) {
        if (Date.now() - startedAt > 6000) return null;
        await new Promise((r) => setTimeout(r, 50));
      }
      return window.liff;
    }

    async function init() {
      setLiffStatus("loading");
      setLiffError(null);
      const liff = await waitForLiff();
      if (!liff) {
        if (!cancelled) {
          setLiffStatus("error");
          setLiffError("未載入 LINE LIFF SDK。");
        }
        return;
      }

      try {
        await liff.init({ liffId });
      } catch {
        if (!cancelled) {
          setLiffStatus("error");
          setLiffError("LIFF 初始化失敗。");
        }
        return;
      }

      try {
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
      } catch {}

      try {
        const profile = await liff.getProfile();
        const user: AuthUser = {
          provider: "line",
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        };
        if (!cancelled) {
          setAuthUser(user);
          try {
            window.localStorage.setItem("cardx.auth.user", JSON.stringify(user));
          } catch {}
          setLiffStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setLiffStatus("error");
          setLiffError("無法取得 LINE 使用者資訊。");
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [liffEnabled, liffId, liffStatus]);

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

  function logout() {
    const supabase = supabaseBrowser();
    setAuthUser(null);
    setProfileOpen(false);
    setSettingsOpen(false);
    try {
      window.localStorage.removeItem("cardx.auth.user");
    } catch {}
    if (supabase) void supabase.auth.signOut();
    try {
      if (window.liff && window.liff.isLoggedIn()) window.liff.logout();
    } catch {}
  }

  if (liffEnabled && liffStatus !== "ready") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(1200px 600px at 20% -10%, rgba(43,124,255,0.12), rgba(0,0,0,0)), #0b1016",
          color: "rgba(255,255,255,0.92)",
          padding: 24,
        }}
      >
        <div style={{ width: "min(520px, 100%)", display: "grid", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.2px" }}>正在取得 LINE 許可</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.64)", lineHeight: 1.6 }}>
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

          <Link href="/" className={styles.logoDesktopLink} aria-label="CardX">
            <span className={styles.logoText}>
              CARD<span className={styles.logoTextAccent}>X</span>
            </span>
          </Link>

          <Link
            href="/rewards"
            className={`bonus-cabinet ${styles.bonusCabinet}`}
            data-v-4ec444f2=""
            aria-label="獎勵"
          >
            <span className="background" data-v-4ec444f2="" aria-hidden="true" />
            <span className={styles.bonusIconWrap} aria-hidden="true">
              <img className={styles.bonusIcon} src="/cardx/placeholder.svg" alt="" aria-hidden="true" />
            </span>
            <span className={styles.bonusText} aria-hidden="true">
              獎勵
            </span>
          </Link>

          <button className={styles.squarePill} type="button" aria-label="搜尋">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <use href="#icon-search" />
            </svg>
          </button>

          {authUser ? (
            <div className={styles.authedRight}>
              <div className={styles.balancePill} aria-label="資產">
                <button className={styles.balanceTrigger} type="button" aria-label="資產明細">
                  <span className={styles.balanceIcon} aria-hidden="true">
                    $
                  </span>
                  <span className={styles.balanceText}>0.00000000</span>
                  <svg className={styles.chevronIcon} viewBox="0 0 24 24" aria-hidden="true">
                    <use href="#icon-chevron-right" />
                  </svg>
                </button>
                <Link
                  href="/account"
                  className={`button-3d button-3d_red button-3d_sm ${styles.depositBtn}`}
                  data-v-c8c96dbe=""
                  aria-label="充值"
                >
                  <span className="button-3d__outer" data-v-c8c96dbe="">
                    <span className="button-3d__inner" data-v-c8c96dbe="">
                      <span className="button-3d__text" data-v-c8c96dbe="">
                        充值
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
                  <span className={styles.avatar} aria-hidden="true" />
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
                      <div className={styles.profileHeroAvatar} aria-hidden="true" />
                      <div className={styles.profileLevelPill} aria-hidden="true">
                        1 等級
                      </div>
                      <div className={styles.profileHeroName}>
                        {authUser.provider === "line"
                          ? authUser.displayName
                          : authUser.email
                            ? authUser.email.split("@")[0]
                            : "User1095718"}
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
                      <Link className={styles.profileMenuItem} role="menuitem" href="/account" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-bag-dollar" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>我的帳戶</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/favorites" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-like" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>收藏</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/account/addresses" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-settings" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>地址管理</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/orders" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-docs" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>交易紀錄</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/recent" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-recent" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>近期</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/topics" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-chat-3" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>話題</span>
                      </Link>
                      <Link className={styles.profileMenuItem} role="menuitem" href="/rewards" onClick={() => setProfileOpen(false)}>
                        <span className={styles.profileMenuIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <use href="#icon-gift" />
                          </svg>
                        </span>
                        <span className={styles.profileMenuText}>獎勵</span>
                      </Link>
                    </div>

                    <button className={styles.profileLogout} type="button" onClick={logout}>
                      登出
                    </button>
                  </div>
                ) : null}
              </div>

              <div ref={settingsWrapRef} className={styles.settingsWrap}>
                <button
                  className={styles.overlayPill}
                  type="button"
                  aria-label="語言與設定"
                  aria-expanded={settingsOpen}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    const onGear = !!target.closest("svg");
                    if (!onGear) return;
                    setProfileOpen(false);
                    setSettingsOpen((v) => !v);
                  }}
                >
                  <img className={styles.overlayFlag} src="/cardx/placeholder.svg" alt="" aria-hidden="true" />
                  <span className={styles.verticalDivider} aria-hidden="true" />
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <use href="#icon-settings" />
                  </svg>
                </button>
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

              <button className={styles.bellPill} type="button" aria-label="通知">
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                  <use href="#icon-notifications" />
                </svg>
              </button>

              <button className={styles.chatPill} type="button" aria-label="聊天">
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                  <use href="#icon-chat-3" />
                </svg>
              </button>
            </div>
          ) : (
            <div ref={settingsWrapRef} className={styles.settingsWrap} style={{ marginLeft: "auto" }}>
              <button
                className={styles.overlayPill}
                type="button"
                aria-label="語言與設定"
                aria-expanded={settingsOpen}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const onGear = !!target.closest("svg");
                  if (!onGear) return;
                  setProfileOpen(false);
                  setSettingsOpen((v) => !v);
                }}
              >
                <img className={styles.overlayFlag} src="/cardx/placeholder.svg" alt="" aria-hidden="true" />
                <span className={styles.verticalDivider} aria-hidden="true" />
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                  <use href="#icon-settings" />
                </svg>
              </button>
              {settingsOpen ? (
                <div className={styles.settingsMenu} role="dialog" aria-label="設定">
                  <div className={styles.settingsGrid}>
                    <div className={styles.settingsCard}>
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

                      <div className={styles.settingsCard}>
                        <button className={styles.settingsRow} type="button" aria-label="顯示法幣餘額">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsFlag} aria-hidden="true">
                              <span className={styles.settingsFlagDot} />
                            </span>
                            <span className={styles.settingsMeta}>
                              <span className={styles.settingsLabel}>顯示法幣餘額</span>
                              <span className={styles.settingsValue}>UAH</span>
                            </span>
                          </span>
                          <span className={styles.settingsCaret} aria-hidden="true" />
                        </button>

                        <button className={styles.settingsRow} type="button" aria-label="體育博彩貨幣">
                          <span className={styles.settingsRowLeft}>
                            <span className={styles.settingsFlag} aria-hidden="true">
                              <span className={styles.settingsFlagDot} />
                            </span>
                            <span className={styles.settingsMeta}>
                              <span className={styles.settingsLabel}>體育博彩貨幣</span>
                              <span className={styles.settingsValue}>USD</span>
                            </span>
                          </span>
                          <span className={styles.settingsCaret} aria-hidden="true" />
                        </button>

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
          )}
        </div>

        <div className={styles.headerMobile} aria-label="Header">
          <Link href="/" className={styles.logoMobileLink} aria-label="CardX">
            <span className={styles.logoTextMobile}>
              C<span className={styles.logoTextAccent}>X</span>
            </span>
          </Link>

          <Link href="/rewards" className={styles.bonusPillMobile} aria-label="獎勵">
            <span className={styles.bonusPillMobileIcon} aria-hidden="true" />
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
                <span className={styles.avatar} aria-hidden="true" />
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
                    <div className={styles.profileHeroAvatar} aria-hidden="true" />
                    <div className={styles.profileLevelPill} aria-hidden="true">
                      1 等級
                    </div>
                    <div className={styles.profileHeroName}>
                      {authUser.provider === "line"
                        ? authUser.displayName
                        : authUser.email
                          ? authUser.email.split("@")[0]
                          : "User1095718"}
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
                    <Link className={styles.profileMenuItem} role="menuitem" href="/account" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-bag-dollar" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>我的帳戶</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/favorites" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-like" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>收藏</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/account/addresses" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-settings" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>地址管理</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/orders" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-docs" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>交易紀錄</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/recent" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-recent" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>近期</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/topics" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-chat-3" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>話題</span>
                    </Link>
                    <Link className={styles.profileMenuItem} role="menuitem" href="/rewards" onClick={() => setProfileOpen(false)}>
                      <span className={styles.profileMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <use href="#icon-gift" />
                        </svg>
                      </span>
                      <span className={styles.profileMenuText}>獎勵</span>
                    </Link>
                  </div>

                  <button className={styles.profileLogout} type="button" onClick={logout}>
                    登出
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
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
                          href={item.href}
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
                          href={item.href}
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
                  href={item.href}
                  onClick={closeMobileMenu}
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
