'use client';

import { useEffect, useState } from 'react';
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

const TITLE_STYLES: Record<string, string> = {
  gold:   'bg-gradient-to-r from-yellow-400 to-amber-500 text-white',
  purple: 'bg-gradient-to-r from-purple-500 to-violet-600 text-white',
  red:    'bg-gradient-to-r from-rose-500 to-pink-600 text-white',
  blue:   'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
  green:  'bg-gradient-to-r from-emerald-500 to-teal-500 text-white',
};

const MASK_COUNT = 11;
function getMaskSrc(index: number) {
  return `/images/mask/${(index % MASK_COUNT) + 1}.png`;
}

// Preset fake profiles for placeholder ranking slots
const FAKE_PRESETS = [
  { nickname: '星光追蹤者', avatarNum: 2, draws: 284, title: { id: 'f1', name: '轉蛋狂熱者', color_key: 'purple' }, badgeIndices: [0, 3, 7] },
  { nickname: '命運守護者', avatarNum: 3, draws: 512, title: { id: 'f2', name: '抽蛋之神',   color_key: 'gold'   }, badgeIndices: [1, 5] },
  { nickname: '漩渦指揮官', avatarNum: 4, draws: 167, title: { id: 'f3', name: '課長',       color_key: 'red'    }, badgeIndices: [2, 4, 6, 9] },
  { nickname: '黃金收藏家', avatarNum: 5, draws: 739, title: null,                                                  badgeIndices: [0, 2] },
  { nickname: '秘境探索者', avatarNum: 6, draws: 92,  title: { id: 'f4', name: '歐皇',       color_key: 'blue'   }, badgeIndices: [3, 8, 10] },
  { nickname: '破曉戰士',   avatarNum: 7, draws: 445, title: null,                                                  badgeIndices: [1] },
  { nickname: '時空漫遊者', avatarNum: 8, draws: 203, title: { id: 'f5', name: '揪團王',     color_key: 'green'  }, badgeIndices: [4, 6] },
];

function buildFakeProfile(userId: string): PlayerProfile {
  const num = parseInt(userId.replace('placeholder-', ''), 10) || 0;
  const preset = FAKE_PRESETS[num % FAKE_PRESETS.length];
  return {
    id: userId,
    nickname: preset.nickname,
    avatar_url: `/images/avatar/0${preset.avatarNum}.png`,
    total_draws: preset.draws,
    total_spent: 0,
    title: preset.title,
    badges: preset.badgeIndices.map(i => ({
      id: `fake-badge-${i}`,
      name: `勳章 ${i + 1}`,
      icon: '',
      category: 'draw',
      earned: true,
      earned_at: null,
      sort_order: i,
    })),
  };
}

interface Props {
  userId: string;
  onWorship: () => void;
  onClose: () => void;
  isPlaceholder?: boolean;
}

export default function PlayerProfileCard({ userId, onWorship, onClose, isPlaceholder }: Props) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (isPlaceholder) {
      setProfile(buildFakeProfile(userId));
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_player_profile', { p_user_id: userId });
      setProfile(data as PlayerProfile);
      setLoading(false);
    };
    load();
  }, [userId, isPlaceholder]);

  const earnedBadges = (profile?.badges || []).filter(b => b.earned);
  const displayName = profile?.nickname || '神秘玩家';

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 z-[3000] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 卡片：固定在底部 */}
      <div className="fixed bottom-0 left-0 right-0 z-[3001] flex justify-center pb-safe">
        <div
          className="w-full max-w-[480px] rounded-t-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, #f3e8ff 0%, #fce7f3 40%, #e0e7ff 100%)',
          }}
        >
          {/* 關閉按鈕 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/10 flex items-center justify-center z-10"
          >
            <X className="w-4 h-4 text-neutral-600" />
          </button>

          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-purple-300 border-t-purple-600 animate-spin" />
            </div>
          ) : !profile ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2">
              <div className="text-4xl">🌟</div>
              <div className="text-[16px] font-black text-neutral-500">虛位以待</div>
              <div className="text-[12px] text-neutral-400">這個位置還沒有人霸佔</div>
            </div>
          ) : (
            <>
              {/* 頂部：頭像 + 稱號 + 名稱 + 膜拜按鈕 */}
              <div className="flex items-center gap-4 px-6 pt-7 pb-4">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-lg">
                    <Image
                      src={profile.avatar_url || '/images/avatar/01.png'}
                      alt={displayName}
                      width={80}
                      height={80}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {profile.title ? (
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold mb-1.5 ${TITLE_STYLES[profile.title.color_key] || TITLE_STYLES.gold}`}>
                      {profile.title.name}
                    </div>
                  ) : (
                    <div className="h-5 mb-1.5" />
                  )}
                  <div className="text-[22px] font-black text-neutral-800 leading-tight truncate">
                    {displayName}
                  </div>
                  <div className="text-[12px] text-neutral-500 mt-0.5">
                    累積 {(profile.total_draws || 0).toLocaleString()} 次轉蛋
                  </div>
                </div>

                <button
                  onClick={onWorship}
                  className="shrink-0 px-4 py-2 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 text-white text-[14px] font-black shadow-lg active:scale-95 transition-transform"
                >
                  膜拜大佬
                </button>
              </div>

              {/* 徽章區：固定最低高度，無徽章時顯示提示 */}
              <div className="px-6 pb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-purple-200" />
                  <span className="text-[14px] font-black text-purple-500 tracking-widest">徽章</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-purple-200" />
                </div>

                {earnedBadges.length === 0 ? (
                  <div className="min-h-[80px] flex items-center justify-center text-[13px] text-neutral-400">
                    尚未獲得徽章
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-2">
                    {earnedBadges.map((badge, idx) => (
                      <div key={badge.id} className="relative group">
                        <div className="aspect-square rounded-xl overflow-hidden">
                          <Image
                            src={getMaskSrc(idx)}
                            alt={badge.name}
                            width={60}
                            height={60}
                            className="w-full h-full object-contain"
                            unoptimized
                          />
                        </div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-neutral-800 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                          {badge.name}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-neutral-800" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
