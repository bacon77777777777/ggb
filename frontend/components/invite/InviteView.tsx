'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ChevronLeft, Copy, Loader2, Share2 } from 'lucide-react';
import { TopFadeBlur } from '@/components/ui/TopFadeBlur';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { buildInviteMessage } from '@/lib/inviteMessage';
import { createClient } from '@/lib/supabase/client';
import { MissionService, type UserMission } from '@/services/mission';
import { asset } from '@/lib/asset';
import { formatMemberNo } from '@/lib/memberNo';
/* 1024 以上掛進 cardx 的外殼、改成左右兩欄（老闆 2026-09-05：邀請頁電腦端也要重構、靠齊 cardx）。
   手機版（1024 以下）的樹一字不動，只是把 hero／進度條／成就列抽成變數讓兩邊共用 */
import { AppShell } from '@/cardx/components/layout/AppShell';
import { defaultSidebarItems } from '@/cardx/lib/navigation';
import homeStyles from '@/cardx/components/home/HomeClient.module.css';
import { Button3D, SecondaryButton, SurfaceCard } from '@/cardx/components/ui/Kit';
import { useMinWidth } from '@/lib/useMinWidth';

/**
 * 邀請好友頁 —— 滿版主視覺＋循環獎進度區
 *
 * 老闆定的形態：hero 圖上疊 QR（對位圖上印好的白框）與下方的邀請碼；
 * 「分享＝複製邀請訊息」「下載＝存合成圖」在 Navbar 右側，CustomEvent
 * 丟回來執行。下方只推一件事：每邀 5 位好友領 100 積分（無上限），
 * 進度條＋領取鈕，活動頁設計語言、背景 #401a03 銜接 hero 底緣。
 *
 * 「有效邀請」= 好友綁定 LINE（規則見 migration 505）。
 * 按過分享或下載會記 share_invite 日任務。
 */

/**
 * 白框在 invite.webp 上的實測位置（程式逐像素掃出來的，非目測）
 *
 * 掃法：逐列找「最長的連續白色像素段」，超過 280px 的才算白框那幾列 ——
 * 不能只數整列的白色像素總數，貴賓狗的白毛與背景亮塊會一起被算進去
 * （實測那樣掃出來的框會多 10px、左界還會跑到 x=150）。
 *
 * 2026-09-01 換新主視覺後重掃：x 241~558、y 964~1204（800×1320）
 * → 中心 (50%, 82.12%)、框內短邊 240px。
 * QR 取短邊的九成 = 216px，上下各留 12px 白邊當掃碼靜區。
 *
 * ⚠️ 換圖一定要重掃這幾個數字。舊圖的框在 y 770~1069，新圖整個往下移了，
 * 沿用舊值的話 QR 會有一半壓在角色身上（老闆 9/1 回報的「QR 太大」，
 * 實際是「又大又偏上」：舊的 269px 從 y 916 就開始畫，白框 964 才起頭）。
 * CSS 與下載 canvas 共用這幾個常數，只改這裡。
 */
const HERO_SRC = asset('/images/invite/invite.webp');
const QR_CENTER_Y = 0.8212; // 白框中心 y = (964+1204)/2 / 1320
const QR_SIZE = 0.27; // 相對圖寬（= 216px / 800px，框內短邊 240 的九成）

/**
 * 邀請碼放在白框下方那條藍色緞帶上（9/1 的新主視覺又有緞帶了，是深藍色的）。
 * 逐像素掃出來的藍塊是 y 1211~1281，黃字壓在上面對比夠。換圖要重掃這個數字。
 */
const RIBBON_CENTER_Y = 0.9439; // 量自 9/1 新圖：藍色緞帶 y 1211~1281 的中心 / 1320
const CODE_FONT_PX = 28; // 相對 800 寬的 canvas 字級
const CODE_YELLOW = '#ffe600'; // 會員卡推薦碼同款黃

interface ReferralStatus {
  qualified: number;
  claimable: number;
  step: number;
  pointsPerStep: number;
  cycleProgress: number;
  nextTarget: number;
}

/**
 * 邀請好友頁的本體。從 app/invite/page.tsx 搬出來：Next 的 page 元件不能收自訂 props，
 * 而會員中心要用 `embedded` 把它塞進右欄當一個分頁（老闆 2026-09-05：邀請頁電腦端不獨立一頁）。
 * `embedded` 只畫那張卡、不包 AppShell；桌機直接開 /invite 會轉到 /profile?tab=invite。手機版不受影響。
 */
export default function InviteView({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [missions, setMissions] = useState<UserMission[]>([]);
  const [claimingMission, setClaimingMission] = useState<string | null>(null);

  const code = user?.invite_code ?? null;
  const cardxShell = useMinWidth(1024);
  useEffect(() => {
    if (cardxShell && !embedded) router.replace('/profile?tab=invite');
  }, [cardxShell, embedded, router]);
  const link = code && typeof window !== 'undefined'
    ? `${window.location.origin}/login?invite=${code}`
    : null;

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login?next=/invite');
  }, [isLoading, user, router]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/user/referral-status');
      if (res.ok) setStatus(await res.json());
    } catch { /* 進度區顯示骨架就好 */ }
  }, []);

  // 成就區：任務中心同一套資料（get_user_missions），只取邀請四階
  const fetchMissions = useCallback(async () => {
    try {
      const all = await MissionService.getUserMissions();
      setMissions(
        all
          .filter(m => m.condition_type === 'invite_friend' && m.type === 'achievement')
          .sort((a, b) => a.target_value - b.target_value),
      );
    } catch { /* 成就區維持骨架 */ }
  }, []);

  useEffect(() => {
    if (user) { void fetchStatus(); void fetchMissions(); }
  }, [user, fetchStatus, fetchMissions]);

  const claimMission = async (m: UserMission) => {
    setClaimingMission(m.id);
    try {
      const res = await MissionService.claimReward(m.id, m.period_key || 'ALL');
      if (res?.success === false) {
        showToast(res?.message === 'Already claimed' ? '已經領取過了' : '領取失敗，請重試一次', 'error');
      } else {
        showToast(`已領取 ${m.reward_coins} 積分`, 'success');
      }
      void fetchMissions();
    } catch {
      showToast('領取失敗，請重試一次', 'error');
    } finally {
      setClaimingMission(null);
    }
  };

  useEffect(() => {
    if (!link) return;
    // margin: 0 —— 靜區由圖上的白框提供，QR 自帶白邊會跟框疊出雙重白
    QRCode.toDataURL(link, { width: 512, margin: 0, color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  /** 分享／下載都算完成「分享邀請」日任務（自己能控制的動作才進日清單） */
  const trackShare = () => {
    try {
      void createClient().rpc('track_mission_event', { p_event_type: 'share_invite' });
    } catch { /* 任務進度掉一次無妨，不擋分享 */ }
  };

  const copyMessage = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(buildInviteMessage(code, window.location.origin));
      showToast('邀請訊息已複製，快分享給朋友', 'success');
      trackShare();
    } catch {
      showToast('複製失敗，請重試一次', 'error');
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast('邀請碼已複製', 'success');
    } catch {
      showToast('複製失敗，請重試一次', 'error');
    }
  };

  /** 把畫面那張合成圖（hero＋QR＋邀請碼字）畫進 canvas，輸出 PNG blob */
  const composeHero = async (): Promise<Blob | null> => {
    if (!qr) return null;
    const load = (src: string) => new Promise<HTMLImageElement>((ok, err) => {
      const im = new window.Image();
      im.onload = () => ok(im); im.onerror = err; im.src = src;
    });
    const [hero, qrImg] = await Promise.all([load(HERO_SRC), load(qr)]);
    // 畫布照主視覺的原始長寬比（老闆 2026-09-04：下載圖高度被壓扁）——
    // 之前寫死 800×1200（2:3），9/1 換的新圖不是這個比例，drawImage 直接把它壓進去
    const W = 800, H = Math.round(W * hero.naturalHeight / hero.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(hero, 0, 0, W, H);

    const size = W * QR_SIZE;
    ctx.drawImage(qrImg, (W - size) / 2, H * QR_CENTER_Y - size / 2, size, size);

    // 紅旗上的邀請碼 —— 下載版只有字，不畫複製圖標（老闆指定）；
    // 「邀請碼」白、碼黃，跟畫面同款雙色
    if (code) {
      ctx.font = `bold ${CODE_FONT_PX}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = '邀請碼 ';
      const wLabel = ctx.measureText(label).width;
      const startX = (W - wLabel - ctx.measureText(formatMemberNo(code)).width) / 2;
      const textY = H * RIBBON_CENTER_Y + 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, startX, textY);
      ctx.fillStyle = CODE_YELLOW;
      ctx.fillText(formatMemberNo(code), startX + wLabel, textY);
    }

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  };

  // 合成圖先畫好放著 —— iPhone 的分享面板要在點擊的當下叫出來，
  // 點了才開始畫會錯過手勢窗口，面板就開不出來
  const heroBlob = useRef<Blob | null>(null);
  useEffect(() => {
    if (!qr) return;
    heroBlob.current = null;
    composeHero().then(b => { heroBlob.current = b; }).catch(() => { /* 點下載時再重試 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr, code]);

  /**
   * 下載：手機走系統分享面板直出（面板上就有「儲存影像」，也能直接
   * 丟 LINE / AirDrop）；桌機直接下載（老闆指定，桌機 Chrome 其實也
   * 支援分享檔案，不擋掉會被誤走面板）。
   */
  const downloadHero = async () => {
    let blob = heroBlob.current;
    if (!blob) { try { blob = await composeHero(); } catch { blob = null; } }
    if (!blob) { showToast('圖片還在準備中，請再試一次', 'error'); return; }

    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua) ||
      (ua.includes('Mac') && navigator.maxTouchPoints > 1); // iPadOS 會偽裝成 Mac
    const file = new File([blob], 'ggb-invite.png', { type: 'image/png' });
    if (isMobile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); trackShare(); } catch { /* 玩家取消分享 */ }
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ggb-invite.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('已下載邀請圖', 'success');
    trackShare();
  };

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/user/referral-status', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || '領取失敗，請重試一次', 'error'); return; }
      if ((json.claimed_points ?? 0) > 0) {
        showToast(`已領取 ${json.claimed_points} 積分`, 'success');
      } else {
        showToast('目前沒有可領的獎勵', 'error');
      }
      void fetchStatus();
    } catch {
      showToast('領取失敗，請重試一次', 'error');
    } finally {
      setClaiming(false);
    }
  };

  const step = status?.step ?? 5;
  const claimable = status?.claimable ?? 0;
  // 有可領的獎勵時進度條打滿 —— 0/5 配上亮著的領取鈕會看不懂
  const filled = status ? (claimable > 0 ? step : status.cycleProgress) : 0;

  /** 底欄「立即領取」：不做禁用態（老闆指定），沒得領就跳提示 */
  const claimNow = () => {
    if (!status) return;
    if (claimable <= 0) {
      // 兩行寫法（老闆 2026-08-28）：先講還差幾位、再講領得到什麼，
      // 比「累積滿 5 位才能領取」那種先講限制的說法好讀
      const left = Math.max(1, step - (status.cycleProgress || 0));
      showToast(
        <>
          再邀請 {left} 位
          <br />
          即可領取 {(status.pointsPerStep ?? 0).toLocaleString()} 積分
        </>,
        'info',
      );
      return;
    }
    void claim();
  };

  const goBack = () => {
    // 直接貼連結進來的沒有上一頁可回，退回會員中心
    if (window.history.length > 1) router.back();
    else router.push('/profile');
  };

  /* ── 三塊共用區塊（手機與桌機都用同一份）── */
  const heroInner = (
    <>
        <Image
          src={HERO_SRC}
          alt="邀請好友"
          width={800}
          height={1320}
          priority
          className="h-auto w-full"
        />
        {/* QR 對位到圖上印好的白框中心（座標見檔頭常數） */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${QR_CENTER_Y * 100}%`, width: `${QR_SIZE * 100}%` }}
        >
          {qr ? (
            // QR 是本地生成的 data URI，用原生 img 就好
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="邀請 QR code" className="aspect-square w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-lg bg-neutral-100" />
          )}
        </div>
        {/* 紅旗上的邀請碼＋複製圖標（圖標只在畫面上，下載版不畫） */}
        {code && (
          <button
            type="button"
            onClick={() => void copyCode()}
            className="absolute inset-x-0 flex -translate-y-1/2 items-center justify-center gap-[1vw] md:gap-1"
            style={{ top: `${RIBBON_CENTER_Y * 100}%` }}
          >
            <span className="text-[3.5vw] font-bold text-white md:text-[16px]">
              邀請碼 <span style={{ color: CODE_YELLOW }}>{formatMemberNo(code)}</span>
            </span>
            <Copy className="h-[3vw] w-[3vw] text-white/90 md:h-3.5 md:w-3.5" />
          </button>
        )}
    </>
  );
  const progressBar = (
    <div className="relative mt-2.5 h-[15px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("/images/invite/bar_track.png")} alt="" className="absolute inset-0 h-full w-full" />
            {filled > 0 && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${(filled / step) * 100}%` }}>
                <div
                  className="h-full"
                  style={{
                    backgroundImage: `url(${asset('/images/invite/bar_fill.png')})`,
                    backgroundSize: `${(step / filled) * 100}% 100%`,
                    backgroundPosition: 'left center',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              </div>
            )}
    </div>
  );
  const missionList = (
    <div>
      {missions.length === 0 && (
                <div className="space-y-4 px-1 py-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-100" />
                  ))}
                </div>
              )}
              {/* 列樣式照簽到頁「成就」原樣搬（老闆指定一模一樣）。
                  簽到頁是 750 設計稿縮放渲染，這裡是 375 基準的一般版面，
                  所以所有尺寸取設計稿的一半（143→72、80→40、28→14…）。
                  勳章直接用簽到頁同一批 /images/mask/ 高解析圖 —— 原本的
                  ach1~4 是從設計稿裁的 88×80 小圖，3x 螢幕會放大到糊 */}
              {missions.map(m => {
                const icon = ACH_BADGES[m.target_value] ?? ACH_BADGES[1];
                const title = ACH_TITLES[m.target_value];
                const cur = Math.min(m.progress ?? 0, m.target_value);
                const done = (m.progress ?? 0) >= m.target_value;
                return (
                  <div key={m.id} className="relative flex min-h-[72px] w-full items-center justify-between border-b border-[#eee] py-2 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={icon} alt="" className="h-9 w-auto max-w-10 object-contain" />
                      </div>
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <div className="flex w-full items-end gap-1.5">
                          <p className="text-[14px] font-medium text-neutral-900">{m.title}</p>
                          <p className="text-[12px] font-normal text-accent-orange">+{m.reward_coins}積分</p>
                        </div>
                        <p className="whitespace-nowrap text-[12px] font-normal text-neutral-500">{m.description}</p>
                        {title && (
                          <span className={`inline-flex items-center rounded-full bg-gradient-to-r px-[5px] py-[1px] text-[10px] font-semibold text-white ${TITLE_STYLES[title.color] ?? TITLE_STYLES.gold}`}>
                            {title.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      {!m.is_claimed && (
                        <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-neutral-400">
                          <span className="text-accent-orange">{cur}</span>/{m.target_value}
                        </span>
                      )}
                      {m.is_claimed ? (
                        <div className="w-[56px] text-center text-[12px] text-neutral-400">已領取</div>
                      ) : done ? (
                        <div
                          onClick={() => { if (claimingMission !== m.id) void claimMission(m); }}
                          className="flex h-6 w-[56px] cursor-pointer items-center justify-center rounded-[100px] bg-gradient-to-r from-[#ffa048] to-[#fd4703] transition-transform active:scale-95"
                        >
                          <p className="text-center text-[13px] font-medium text-white">{claimingMission === m.id ? '…' : '領取'}</p>
                        </div>
                      ) : (
                        <div
                          onClick={() => void copyMessage()}
                          className="relative flex h-6 w-[56px] cursor-pointer items-center justify-center rounded-[100px] transition-transform active:scale-95"
                        >
                          <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[100px] border border-solid border-[#ff5e00]" />
                          <p className="text-center text-[13px] font-medium text-accent-orange">去完成</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
      })}
    </div>
  );

  /* 桌機那張卡：左邊主視覺、右邊三段（邀請碼與操作／循環獎進度／成就） */
  const desktopCard = (
    <>
                <SurfaceCard style={{ padding: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: '380px minmax(0, 1fr)', alignItems: 'stretch', width: '100%' }}>
                  <div style={{ position: 'relative', background: '#f3f4f6' }}>
                    <div className="relative w-full">{heroInner}</div>
                  </div>

                  <div style={{ padding: '24px 28px', minWidth: 0, display: 'grid', alignContent: 'start' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#111827', letterSpacing: '-0.2px' }}>邀請好友，無限拿積分</div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: '#6b7280', lineHeight: '20px' }}>
                      好友用你的邀請碼註冊並綁定 LINE 就算一位有效邀請；每邀滿 {step} 位可領 {(status?.pointsPerStep ?? 0).toLocaleString()} 積分，沒有上限。
                    </div>
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 14, background: '#f3f4f6' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#6b7280' }}>你的邀請碼</span>
                        <span style={{ fontSize: 22, fontWeight: 900, color: '#111827', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>{code ? formatMemberNo(code) : '—'}</span>
                        <button type="button" onClick={() => void copyCode()} aria-label="複製邀請碼" style={{ border: 0, background: 'transparent', padding: 4, cursor: 'pointer', color: '#6b7280', display: 'grid', placeItems: 'center' }}>
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      <Button3D color="red" onClick={claimNow} style={{ height: 40, borderRadius: 12, minWidth: 116 }}>
                        {claiming ? '領取中…' : '立即領取'}
                      </Button3D>
                      <SecondaryButton onClick={() => void copyMessage()} style={{ height: 40 }}>複製邀請訊息</SecondaryButton>
                      <SecondaryButton onClick={() => void downloadHero()} style={{ height: 40 }}>下載邀請圖</SecondaryButton>
                    </div>

                    <div aria-hidden="true" style={{ height: 1, background: '#e5e7eb', margin: '20px 0 16px' }} />

                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>循環獎進度</div>
                        <div style={{ marginTop: 2, fontSize: 13, fontWeight: 800, color: '#6b7280' }}>被邀請的好友綁定 LINE 帳號即可 +1</div>
                      </div>
                      {status ? (
                        <p className="shrink-0 font-black leading-none">
                          <span style={{ fontSize: 24, color: '#ff2b2b' }}>{filled}</span>
                          <span style={{ fontSize: 16, color: '#111827' }}>/{step}</span>
                        </p>
                      ) : (
                        <span className="h-5 w-10 shrink-0 animate-pulse rounded bg-neutral-100" />
                      )}
                    </div>
                    {progressBar}

                    <div aria-hidden="true" style={{ height: 1, background: '#e5e7eb', margin: '20px 0 8px' }} />

                    <div style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>成就</div>
                    {missionList}
                  </div>
                </SurfaceCard>
    </>
  );

  if (embedded) return desktopCard;

  // null＝還不知道視窗寬度，先不畫，兩套殼才不會疊在一起
  if (cardxShell === null) return null;

  if (cardxShell) {
    // 轉去會員中心的邀請分頁（上面的 effect），這裡先不畫
    return null;
  }

  if (false) {
    return (
      <div className="cardx-root" data-cardx-page="invite">
        <AppShell sidebarItems={defaultSidebarItems}>
          <div className={homeStyles.main2}>
            <div className={homeStyles.main}>
              <div className={homeStyles.sectionLobby}>
                {/* 整頁就一張卡（老闆 2026-09-05：拆成四個橫向區塊很醜）：左邊主視覺，右邊同一張卡裡
                    用細分隔線分三段——邀請碼與操作／循環獎進度／成就 */}
                {desktopCard}
              </div>
            </div>
          </div>
        </AppShell>
      </div>
    );
  }

  return (
    /* data-ptr-strip="none"：下拉的空隙不鋪灰底，轉蛋球直接浮在 hero 圖上
       （老闆 2026-08-21：「轉蛋圖標直接移到最上面來蓋在 hero 圖上」）*/
    <div className="min-h-screen bg-white pb-[calc(96px+env(safe-area-inset-bottom))]" data-ptr-strip="none">
      {/* 動態島底下的漸層毛玻璃（老闆 2026-08-22）：hero 是亮金色插圖、本來就有底色，只模糊不帶色 */}
      <TopFadeBlur className="md:hidden" />
      {/* 頂部操作列 —— 文章內頁同款：浮動圓鈕蓋在 hero 上（老闆指定），
          返回＋分享（分享＝複製邀請訊息） */}
      <div className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between pt-[env(safe-area-inset-top)] pointer-events-none">
        <button
          type="button"
          onClick={goBack}
          className="pointer-events-auto m-[10px] flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"
        >
          <ChevronLeft className="h-5 w-5 stroke-[2.5]" />
        </button>
        <button
          type="button"
          onClick={() => void copyMessage()}
          className="pointer-events-auto m-[10px] flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* 主視覺滿版：手機上左右貼齊瀏覽器邊（老闆指定）；
          桌機給寬度上限與圓角，不然 800px 的圖會被拉到糊。

          出血段自動裁切（老闆 2026-08-21）：圖頂多的那 120px 是給動態島墊高用的
          （120/800 = 15vw 渲染高）。用 env(safe-area-inset-top) 當開關——
            · 瀏覽器分頁 env=0 → 內層上移 15vw，把出血段推出外層裁切框、收乾淨
            · PWA/App env≈15vw → 上移量歸零，出血段保留、剛好塞進動態島下
          圖與 QR/邀請碼都在「內層」一起移動，百分比定位完全不受影響。 */}
      <div className="w-full overflow-hidden md:mx-auto md:mt-4 md:max-w-md md:rounded-t-3xl">
      <div className="relative w-full [margin-top:min(0px,calc(env(safe-area-inset-top)_-_15vw))] md:!mt-0">
        {heroInner}
      </div>
      </div>

      {/* ── 進度卡（老闆設計稿：黃粉漸層底、左句右 n/5、亮綠分段條）──
          底圖與進度條都是設計稿附的素材（card_progress / bar_track /
          bar_fill），背景 100% 100% 拉伸；領取鈕只在有得領時出現
         （設計稿畫的是 2/5 未達標狀態，沒有畫按鈕）*/}
      <div className="w-full bg-white md:mx-auto md:max-w-md">
        {/* 底圖 750 寬、卡面佔 3.1%~96.8% —— 側邊留白是圖自帶的，
            所以容器滿版寬（老闆指定），內距用百分比對齊卡面 */}
        <div
          className="mt-3 w-full px-[7.5%] pb-6 pt-4"
          style={{ backgroundImage: `url(${asset('/images/invite/card_progress.png')})`, backgroundSize: '100% 100%' }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-bold text-neutral-900">被邀請的好友綁定 LINE 帳號即可 +1</p>
            {status ? (
              <p className="shrink-0 font-black leading-none">
                <span className="text-[24px]" style={{ color: '#ff2b2b' }}>{filled}</span>
                <span className="text-[16px] text-neutral-900">/{step}</span>
              </p>
            ) : (
              <span className="h-5 w-10 shrink-0 animate-pulse rounded bg-white/60" />
            )}
          </div>

          {/* 分段進度條：素材軌道＋亮綠填充，填充用寬度裁切露出 */}
          {progressBar}

        </div>

        {/* ── 成就卡（老闆設計稿：REWARD 底紋綠粉框、四階成就列）──
            底圖只有卡片上緣（含 REWARD 底紋），下面接白底自然延伸 */}
        <div className="mb-14 mt-2 w-full bg-white">
          {/* 「成就」標題已畫在底圖上（新版 bg.png），內容從標題下方開始
              —— pt 用寬度百分比對齊圖上標題的下緣（62/750） */}
          <div
            className="bg-top bg-no-repeat px-[6.5%] pb-2 pt-[10%]"
            style={{ backgroundImage: `url(${asset('/images/invite/card_reward.png')})`, backgroundSize: '100% auto' }}
          >
            {missionList}
          </div>
        </div>
      </div>

      {/* 底部操作欄 —— 一番賞內頁同款：毛玻璃白底固定底欄，兩顆按鈕。
          立即領取不做禁用態（老闆指定），沒得領按了跳提示 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-100 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex h-16 max-w-md items-center gap-2.5 px-4">
          <button
            type="button"
            onClick={() => void downloadHero()}
            className="h-[44px] flex-1 rounded-xl bg-neutral-100 text-[15px] font-black text-neutral-700 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200"
          >
            下載邀請圖
          </button>
          <button
            type="button"
            onClick={claimNow}
            className="flex h-[44px] flex-1 items-center justify-center rounded-xl bg-primary text-[15px] font-black text-white transition-all active:scale-[0.98]"
          >
            {claiming ? <Loader2 className="h-5 w-5 animate-spin" /> : '立即領取'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 勳章：與簽到頁成就同一批高解析圖（invite_friend:N），以目標人數對應 */
const ACH_BADGES: Record<number, string> = {
  1: asset('/images/mask/初級召集人.png'),
  5: asset('/images/mask/揪團王.png'),
  20: asset('/images/mask/傳教士.png'),
  100: asset('/images/mask/信徒滿天下.png'),
};

/** 稱號小標：與簽到頁 ACHIEVEMENT_TITLE / TITLE_STYLES 同款漸層膠囊 */
const ACH_TITLES: Record<number, { name: string; color: string }> = {
  20: { name: '人氣王', color: 'blue' },
  100: { name: '推廣大使', color: 'green' },
};

const TITLE_STYLES: Record<string, string> = {
  gold:   'from-yellow-400 to-amber-500',
  purple: 'from-purple-500 to-violet-600',
  red:    'from-rose-500 to-pink-600',
  blue:   'from-blue-500 to-cyan-500',
  green:  'from-accent-emerald to-teal-500',
};
