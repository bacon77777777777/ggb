'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { X } from 'lucide-react';

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

const MASK_COUNT = 11;
function getMaskSrc(index: number) {
  return `/images/mask/${(index % MASK_COUNT) + 1}.png`;
}

const FAKE_NAMES = ['轉蛋狂魔', '歐皇降臨', '傳說課長', '招財喵喵', '錦鯉本鯉', '彩虹歐巴', '天選之人', '命運支配者', '抽蛋之神', '非洲酋長'];

const FAKE_EXTRAS = [
  { draws: 512, title: { id: 'f1', name: '轉蛋狂熱者', color_key: 'purple' }, earnedSlots: [0, 3, 7, 12, 18] },
  { draws: 284, title: { id: 'f2', name: '抽蛋之神',   color_key: 'gold'   }, earnedSlots: [1, 5, 8, 14] },
  { draws: 167, title: { id: 'f3', name: '傳說課長',   color_key: 'red'    }, earnedSlots: [2, 4, 6, 9, 20] },
  { draws: 739, title: { id: 'f6', name: '全勤戰士',   color_key: 'blue'   }, earnedSlots: [0, 2, 10, 16] },
  { draws: 92,  title: { id: 'f4', name: '歐皇',       color_key: 'gold'   }, earnedSlots: [3, 8, 10, 22] },
  { draws: 445, title: { id: 'f7', name: '人氣王',     color_key: 'green'  }, earnedSlots: [1, 5, 19] },
  { draws: 203, title: { id: 'f5', name: '揪團王',     color_key: 'purple' }, earnedSlots: [4, 6, 7, 21] },
  { draws: 318, title: { id: 'f8', name: '天選之人',   color_key: 'red'    }, earnedSlots: [0, 2, 9, 17] },
  { draws: 651, title: { id: 'f9', name: '命運支配者', color_key: 'gold'   }, earnedSlots: [1, 3, 5, 7, 25] },
  { draws: 421, title: { id: 'f0', name: '火力全開',   color_key: 'red'    }, earnedSlots: [2, 6, 10, 28] },
];

// Total achievement badge count — matches the 29 tasks in migration 227
const TOTAL_BADGES = 29;

function buildFakeProfile(userId: string, avatarUrl: string): PlayerProfile {
  const num = parseInt(userId.replace('placeholder-', ''), 10) || 0;
  const extra = FAKE_EXTRAS[num % FAKE_EXTRAS.length];
  const fakeName = FAKE_NAMES[num % FAKE_NAMES.length];
  return {
    id: userId,
    nickname: fakeName,
    avatar_url: avatarUrl,
    total_draws: extra.draws,
    total_spent: 0,
    title: extra.title,
    badges: Array.from({ length: TOTAL_BADGES }, (_, i) => ({
      id: `fake-badge-${i}`,
      name: `勳章 ${i + 1}`,
      icon: '',
      category: 'draw',
      earned: extra.earnedSlots.includes(i),
      earned_at: null,
      sort_order: i,
    })),
  };
}

interface Props {
  userId: string;
  nickname?: string;
  avatarUrl?: string;
  onWorship: () => void;
  onClose: () => void;
  isPlaceholder?: boolean;
}

// Figma design reference: 960 × 877 px
const DESIGN_W = 960;
const DESIGN_H = 877;

export default function PlayerProfileCard({ userId, nickname: propNickname, avatarUrl: propAvatarUrl, onWorship, onClose, isPlaceholder }: Props) {
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
    if (isPlaceholder) {
      setProfile(buildFakeProfile(userId, propAvatarUrl || '/images/avatar/01.png'));
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
          {/* 關閉按鈕 — 同購買確認視窗風格 */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 p-1 text-neutral-400 hover:text-neutral-600 active:scale-95 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>

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
                      {profile?.title && (
                        <div
                          className="flex gap-[6px] items-center shrink-0 px-[12px]"
                          style={{ height: 40, background: '#fc2c54', borderRadius: 20 }}
                        >
                          <p className="text-white text-[24px] leading-none font-medium whitespace-nowrap">
                            {profile.title.name}
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
                {/* Frame8：只顯示已獲得的徽章 */}
                <div className="flex flex-wrap gap-[20px] items-center justify-center w-full content-center">
                  {badges.filter(b => b.earned).length === 0 ? (
                    <p className="text-[32px] text-neutral-400">尚未獲得任何徽章</p>
                  ) : badges.filter(b => b.earned).map((badge, idx) => (
                    <div
                      key={badge.id}
                      className="relative shrink-0 cursor-pointer"
                      style={{ width: 72, height: 72 }}
                      onClick={() => setActiveBadgeId(activeBadgeId === badge.id ? null : badge.id)}
                    >
                      <img
                        src={getMaskSrc(badge.sort_order ?? idx)}
                        alt={badge.name}
                        width={72}
                        height={72}
                        style={{ width: 72, height: 72, objectFit: 'contain' }}
                      />
                      {activeBadgeId === badge.id && (
                        <div
                          className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-20"
                          style={{ top: 80 }}
                        >
                          <div
                            className="absolute left-1/2 -translate-x-1/2"
                            style={{
                              top: -10,
                              width: 0, height: 0,
                              borderLeft: '10px solid transparent',
                              borderRight: '10px solid transparent',
                              borderBottom: '10px solid rgba(0,0,0,0.75)',
                            }}
                          />
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
