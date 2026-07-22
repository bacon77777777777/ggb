'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

interface Badge {
  id: string;
  name: string;
  icon: string;
  category: string;
  earned: boolean;
  earned_at: string | null;
  sort_order: number;
}

interface PlayerProfile {
  id: string;
  nickname: string;
  avatar_url: string;
  total_draws: number;
  total_spent: number;
  title: { id: string; name: string; color_key: string } | null;
  badges: Badge[];
}

const BADGE_IMAGE: Record<string, string> = {
  first_draw:       '/images/mask/初心試煉.png',
  draw_30:          '/images/mask/命運啟程.png',
  draw_100:         '/images/mask/停不下來.png',
  draw_500:         '/images/mask/轉蛋成癮.png',
  draw_1000:        '/images/mask/抽獎之神.png',
  draw_5000:        '/images/mask/命運支配者.png',
  draw_streak_10:   '/images/mask/每日修行.png',
  draw_streak_20:   '/images/mask/永不缺席.png',
  login_streak_7:   '/images/mask/習慣養成.png',
  login_streak_30:  '/images/mask/全勤戰士.png',
  login_streak_100: '/images/mask/常駐居民.png',
  first_topup:      '/images/mask/初次獻祭.png',
  topup_1000:       '/images/mask/小課怡情.png',
  topup_5000:       '/images/mask/荷包失守.png',
  topup_20000:      '/images/mask/錢包蒸發.png',
  topup_100000:     '/images/mask/課長降臨.png',
  topup_streak_5:   '/images/mask/每日供奉.png',
  topup_streak_10:  '/images/mask/信仰充值.png',
  refer_1:          '/images/mask/初級召集人.png',
  refer_5:          '/images/mask/揪團王.png',
  refer_20:         '/images/mask/傳教士.png',
  refer_100:        '/images/mask/信徒滿天下.png',
  lucky_first:      '/images/mask/一發入魂.png',
  lucky_day3:       '/images/mask/天命之子.png',
  lucky_10:         '/images/mask/命運眷顧.png',
  lucky_50:         '/images/mask/神明代抽.png',
  duplicate_10:     '/images/mask/非洲酋長.png',
  single_day_100:   '/images/mask/火力全開.png',
  birthday_draw:    '/images/mask/壽星最大.png',
  ranking_50:       '/images/mask/排行榜信徒.png',
};

// ── 稱號 → 對應徽章 ID（對應 migration 223 titles.badge_id）──
const TITLE_TO_BADGE_ID: Record<string, string> = {
  '轉蛋狂熱者': 'draw_500',
  '抽獎之神':   'draw_1000',
  '命運支配者': 'draw_5000',
  '全勤戰士':   'login_streak_30',
  '吉吉比居民': 'login_streak_100',
  '小課玩家':   'topup_20000',
  '傳說課長':   'topup_100000',
  '真愛玩家':   'topup_streak_10',
  '人氣王':     'refer_20',
  '推廣大使':   'refer_100',
  '歐皇':       'lucky_day3',
  '天選之人':   'lucky_10',
  '命運代行者': 'lucky_50',
  '火力全開':   'single_day_100',
};

// ── 徽章 ID → sort_order（對應 migration 223 badges.sort_order）──
const BADGE_SORT: Record<string, number> = {
  first_draw: 1, draw_30: 2, draw_100: 3, draw_500: 4, draw_1000: 5, draw_5000: 6,
  draw_streak_10: 7, draw_streak_20: 8, login_streak_7: 9, login_streak_30: 10,
  login_streak_100: 11, first_topup: 12, topup_1000: 13, topup_5000: 14,
  topup_20000: 15, topup_100000: 16, topup_streak_5: 17, topup_streak_10: 18,
  refer_1: 19, refer_5: 20, refer_20: 21, refer_100: 22,
  lucky_first: 23, lucky_day3: 24, lucky_10: 25, lucky_50: 26,
  duplicate_10: 27, single_day_100: 28, birthday_draw: 29,
};

// ── 徽章 ID → 中文名稱（對應 migration 223 badges.name）──
const BADGE_NAME: Record<string, string> = {
  first_draw: '初心試煉', draw_30: '命運啟程', draw_100: '停不下來',
  draw_500: '轉蛋成癮', draw_1000: '抽獎之神', draw_5000: '命運支配者',
  draw_streak_10: '每日修行', draw_streak_20: '永不缺席',
  login_streak_7: '習慣養成', login_streak_30: '全勤戰士',
  login_streak_100: '常駐居民', first_topup: '初次獻祭',
  topup_1000: '小課怡情', topup_5000: '荷包失守',
  topup_20000: '錢包蒸發', topup_100000: '課長降臨',
  topup_streak_5: '每日供奉', topup_streak_10: '信仰充值',
  refer_1: '初級召集人', refer_5: '揪團王', refer_20: '傳教士',
  refer_100: '信徒滿天下', lucky_first: '一發入魂',
  lucky_day3: '天命之子', lucky_10: '命運眷顧',
  lucky_50: '神明代抽', duplicate_10: '非洲酋長',
  single_day_100: '火力全開', birthday_draw: '壽星最大',
};

// ── 與 DB mock 用戶（00000000-...0001~0010）一致的假資料 ──
const MOCK_USER_DATA: Record<number, {
  draws: number;
  title: { id: string; name: string; color_key: string } | null;
  earnedBadgeIds: string[];
}> = {
  1: { draws: 512, title: { id: 'legend_whale',   name: '傳說課長',   color_key: 'red'    }, earnedBadgeIds: ['first_draw','draw_100','topup_100000','first_topup'] },
  2: { draws: 284, title: { id: 'gacha_addict',   name: '轉蛋狂熱者', color_key: 'purple' }, earnedBadgeIds: ['first_draw','draw_30','draw_100','draw_500'] },
  3: { draws: 167, title: { id: 'lucky_king',     name: '歐皇',       color_key: 'gold'   }, earnedBadgeIds: ['first_draw','lucky_first','lucky_day3'] },
  4: { draws: 739, title: { id: 'chosen_one',     name: '天選之人',   color_key: 'gold'   }, earnedBadgeIds: ['first_draw','lucky_first','lucky_day3','lucky_10'] },
  5: { draws: 92,  title: { id: 'full_attendance',name: '全勤戰士',   color_key: 'blue'   }, earnedBadgeIds: ['first_draw','login_streak_7','login_streak_30'] },
  6: { draws: 445, title: { id: 'popularity_king',name: '人氣王',     color_key: 'green'  }, earnedBadgeIds: ['first_draw','refer_1','refer_5','refer_20'] },
  7: { draws: 203, title: null,                                                               earnedBadgeIds: ['first_draw','draw_30','draw_100'] },
  8: { draws: 318, title: { id: 'full_power',     name: '火力全開',   color_key: 'red'    }, earnedBadgeIds: ['first_draw','single_day_100'] },
  9: { draws: 651, title: { id: 'chosen_one',     name: '天選之人',   color_key: 'gold'   }, earnedBadgeIds: ['first_draw','lucky_10'] },
  10:{ draws: 421, title: { id: 'fate_ruler',     name: '命運支配者', color_key: 'gold'   }, earnedBadgeIds: ['first_draw','draw_500','draw_1000','draw_5000'] },
};

const TOTAL_BADGES = 29;

function buildFakeProfile(
  userId: string,
  avatarUrl: string,
  titleFromRanking?: { name: string; color_key: string } | null
): PlayerProfile {
  // Extract index for mock UUIDs (00000000-...000N) or placeholder-N
  let mockNum = 0;
  const mockMatch = userId.match(/00000000-0000-0000-0000-0+(\d+)$/);
  if (mockMatch) {
    mockNum = parseInt(mockMatch[1], 10); // 1-10
  } else {
    mockNum = (parseInt(userId.replace('placeholder-', ''), 10) || 1);
  }

  const data = MOCK_USER_DATA[mockNum] ?? MOCK_USER_DATA[1];
  // Ranking title takes priority over static fake title
  const title = titleFromRanking
    ? { id: 'mock', ...titleFromRanking }
    : data.title;

  // Build badge array: all 29 slots, mark earned ones by badge ID match
  const earnedSet = new Set(data.earnedBadgeIds);
  const badges: Badge[] = Object.entries(BADGE_SORT)
    .sort(([, a], [, b]) => a - b)
    .map(([id, sort_order]) => ({
      id,
      name: BADGE_NAME[id] || id,
      icon: '',
      category: 'draw',
      earned: earnedSet.has(id),
      earned_at: null,
      sort_order,
    }));

  return {
    id: userId,
    nickname: '', // caller uses propNickname
    avatar_url: avatarUrl,
    total_draws: data.draws,
    total_spent: 0,
    title,
    badges,
  };
}

const TITLE_BG: Record<string, string> = {
  gold:   '#e6a817',
  red:    '#fc2c54',
  purple: '#8b5cf6',
  blue:   '#3b82f6',
  green:  '#22c55e',
};

interface Props {
  userId: string | null;
  nickname?: string;
  avatarUrl?: string;
  titleFromRanking?: { name: string; color_key: string } | null;
  onWorship: () => void;
  onClose: () => void;
  isPlaceholder?: boolean;
}

// Figma design reference: 960 × 877 px
const DESIGN_W = 960;
const DESIGN_H = 877;

export default function PlayerProfileCard({ userId, nickname: propNickname, avatarUrl: propAvatarUrl, titleFromRanking, onWorship, onClose, isPlaceholder }: Props) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(0.5);
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Compute CSS scale from actual rendered width
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / DESIGN_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch profile data
  useEffect(() => {
    // null userId = SQL bot (NULL::uuid)；isPlaceholder = 前端填充的「虛位以待」空位
    // mock UUID (00000000-...) = SQL 假用戶
    const isMockUUID = !!userId && userId.startsWith('00000000-');
    if (isPlaceholder || !userId || isMockUUID) {
      setProfile(buildFakeProfile(userId || 'placeholder-1', propAvatarUrl || '/images/avatar/01.png', titleFromRanking));
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_player_profile', { p_user_id: userId });
      // Guard: function returns {error:'not_found'} if user row missing
      const d = data as (PlayerProfile & { error?: string }) | null;
      if (d && !d.error && d.id) {
        const existing = d.badges ?? [];
        const padCount = Math.max(0, TOTAL_BADGES - existing.length);
        setProfile({
          ...d,
          badges: [
            ...existing,
            ...Array.from({ length: padCount }, (_, i) => ({
              id: `pad-${i}`,
              name: `勳章 ${existing.length + i + 1}`,
              icon: '',
              category: 'draw',
              earned: false,
              earned_at: null,
              sort_order: existing.length + i,
            })),
          ],
        });
      } else {
        // User not found or error — fall back to ranking props
        setProfile({
          id: userId,
          nickname: propNickname || '',
          avatar_url: propAvatarUrl || '',
          total_draws: 0,
          total_spent: 0,
          title: null,
          badges: Array.from({ length: TOTAL_BADGES }, (_, i) => ({
            id: `empty-${i}`, name: `勳章 ${i + 1}`, icon: '', category: 'draw',
            earned: false, earned_at: null, sort_order: i,
          })),
        });
      }
      setLoading(false);
    };
    load();
  }, [userId, isPlaceholder]);

  const displayName = profile?.nickname || propNickname || '神秘玩家';
  const badges = profile?.badges || [];

  // 真實用戶稱號優先，無則採用排行榜稱號
  const displayTitle = profile?.title ?? titleFromRanking ?? null;

  // 稱號 → badge ID → 在 badges 陣列中找對應徽章（DB 用戶有正確 ID）
  // 若找不到（fake/not-found 用戶），合成一個 synthetic badge 供顯示
  const titleBadgeId = displayTitle ? TITLE_TO_BADGE_ID[displayTitle.name] : null;
  const titleBadge: Badge | null = titleBadgeId
    ? (badges.find(b => b.id === titleBadgeId) ?? {
        id: titleBadgeId,
        name: BADGE_NAME[titleBadgeId] || displayTitle!.name,
        icon: '',
        category: 'draw',
        earned: true,   // 有稱號 = 視為已獲得對應徽章
        earned_at: null,
        sort_order: BADGE_SORT[titleBadgeId] ?? 1,
      })
    : null;

  const otherEarnedBadges = badges.filter(b => b.earned && b.id !== titleBadgeId);
  const wallBadges = [...(titleBadge ? [titleBadge] : []), ...otherEarnedBadges];

  return (
    <>
      {/* 背景遮罩 */}
      <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 底部卡片 */}
      <div className="fixed bottom-0 left-0 right-0 z-[3001] flex justify-center">
        {/* 外層：量測實際寬度 */}
        <div
          ref={outerRef}
          className="w-full max-w-[520px] relative overflow-hidden"
          style={{ height: DESIGN_H * scale, borderRadius: '28px 28px 0 0' }}
        >
          {/* ── 縮放內容（960 × 877 設計稿） ── */}
          <div
            className="absolute top-0 left-0"
            style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {/* 資料小卡 root */}
            <div
              className="relative flex flex-col items-center overflow-hidden"
              style={{ width: DESIGN_W, height: DESIGN_H, borderRadius: '80px 80px 0 0' }}
            >
              {/* 白底 */}
              <div className="absolute inset-0" style={{ background: '#fff', borderRadius: '80px 80px 0 0' }} />
              {/* 全卡漸層背景 (opacity 30) */}
              <img
                alt=""
                className="absolute inset-0 pointer-events-none object-cover"
                src="/images/profilecard/card-bg.png"
                style={{ width: '100%', height: '100%', opacity: 0.3, borderRadius: '80px 80px 0 0' }}
              />

              {/* ── Frame1：頭部區 ── */}
              <div className="relative flex flex-col items-center overflow-hidden shrink-0 w-full" style={{ borderRadius: '80px 80px 0 0' }}>

                {/* Frame2：頭像 + 姓名 + 膜拜（高236px） */}
                <div
                  className="relative flex gap-[32px] items-center shrink-0 w-full"
                  style={{ height: 236, padding: '28px 64px' }}
                >
                  {/* 頭部漸層圖片背景 */}
                  <img
                    alt=""
                    className="absolute inset-0 pointer-events-none object-cover"
                    src="/images/profilecard/header-bg.png"
                    style={{ width: '100%', height: '100%', opacity: 0.5 }}
                  />

                  {/* Frame3：頭像 + 姓名欄 */}
                  <div className="relative flex flex-1 gap-[32px] items-center min-w-0">
                    {/* 頭像 180×180 */}
                    <div className="relative shrink-0 rounded-full overflow-hidden" style={{ width: 180, height: 180 }}>
                      {loading ? (
                        <div className="w-full h-full bg-white/30 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full border-4 border-white/40 border-t-white animate-spin" />
                        </div>
                      ) : (
                        <Image
                          src={profile?.avatar_url || propAvatarUrl || '/images/avatar/01.png'}
                          alt={displayName}
                          width={180}
                          height={180}
                          className="object-cover w-full h-full"
                          unoptimized
                        />
                      )}
                    </div>

                    {/* Frame4：稱號 + 暱稱 */}
                    <div className="relative flex flex-1 flex-col gap-[16px] items-start min-w-0">
                      {/* Component1：稱號標籤 */}
                      {displayTitle && (
                        <div
                          className="flex gap-[6px] items-center shrink-0 px-[12px]"
                          style={{ height: 40, background: TITLE_BG[displayTitle.color_key] ?? '#fc2c54', borderRadius: 20 }}
                        >
                          <p className="text-white text-[24px] leading-none font-medium whitespace-nowrap">
                            {displayTitle.name}
                          </p>
                        </div>
                      )}
                      {/* 暱稱 */}
                      <p
                        className="text-[#141414] leading-[1.2] whitespace-nowrap overflow-hidden text-ellipsis w-full"
                        style={{ fontSize: 42, fontWeight: 500 }}
                      >
                        {loading ? '...' : displayName}
                      </p>
                      {/* 轉蛋次數 */}
                      {!loading && (
                        <p className="text-[#888] whitespace-nowrap" style={{ fontSize: 28, fontWeight: 400 }}>
                          累計轉蛋 {(profile?.total_draws ?? 0).toLocaleString()} 次
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Component2：膜拜大佬按鈕 */}
                  <button
                    onClick={onWorship}
                    className="relative flex items-center justify-center shrink-0 px-[48px]"
                    style={{
                      height: 108,
                      background: 'rgba(255,228,228,0.4)',
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderRadius: 100,
                    }}
                  >
                    <p className="text-[#cb6e6e] text-[36px] font-semibold leading-none whitespace-nowrap">
                      膜拜大佬
                    </p>
                  </button>
                </div>

                {/* Frame6：徽章牆 分隔線 */}
                <div className="relative flex gap-[24px] items-center shrink-0 mt-[24px]">
                  <div style={{ width: 200, height: 2, background: 'rgba(0,0,0,0.1)' }} />
                  <p
                    className="text-[40px] font-semibold leading-none whitespace-nowrap"
                    style={{
                      background: 'linear-gradient(to right, #e876ea, #a34cd7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    徽章牆
                  </p>
                  <div style={{ width: 200, height: 2, background: 'rgba(0,0,0,0.1)' }} />
                </div>
              </div>

              {/* ── Frame7：徽章格 768 × 473 ── */}
              <div
                className="relative shrink-0 flex items-start mt-[48px]"
                style={{ width: 768, height: 473 }}
              >
                {/* Frame8：稱號對應徽章固定第一位，其餘顯示已獲得 */}
                <div className="flex flex-wrap gap-[20px] items-center justify-center w-full content-center">
                  {wallBadges.length === 0 ? (
                    <p className="text-[32px] text-neutral-400">尚未獲得任何徽章</p>
                  ) : wallBadges.map((badge) => {
                    return (
                      <div
                        key={badge.id}
                        className="relative shrink-0 cursor-pointer flex items-center justify-center"
                        style={{ height: 83 }}
                        onClick={() => setActiveBadgeId(activeBadgeId === badge.id ? null : badge.id)}
                      >
                        <img
                          src={BADGE_IMAGE[badge.id] || '/images/mask/初心試煉.png'}
                          alt={badge.name}
                          style={{ height: 83, width: 'auto', objectFit: 'contain' }}
                        />
                        {activeBadgeId === badge.id && (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-20 flex flex-col items-center"
                            style={{ bottom: 80 }}
                          >
                            <div
                              className="whitespace-nowrap text-white font-semibold rounded-full px-[24px]"
                              style={{
                                fontSize: 32,
                                lineHeight: '56px',
                                background: 'rgba(0,0,0,0.75)',
                              }}
                            >
                              {badge.name}
                            </div>
                            <div
                              style={{
                                width: 0, height: 0,
                                borderLeft: '10px solid transparent',
                                borderRight: '10px solid transparent',
                                borderTop: '10px solid rgba(0,0,0,0.75)',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
