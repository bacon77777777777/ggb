'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned: boolean;
  earned_at: string | null;
  sort_order: number;
}

interface Title {
  id: string;
  name: string;
  color_key: string;
  earned: boolean;
  is_selected: boolean;
}

const TITLE_STYLES: Record<string, string> = {
  gold:   'from-yellow-400 to-amber-500',
  purple: 'from-purple-500 to-violet-600',
  red:    'from-rose-500 to-pink-600',
  blue:   'from-blue-500 to-cyan-500',
  green:  'from-emerald-500 to-teal-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  draw:   '🎰 抽蛋人生',
  active: '📅 活躍玩家',
  spend:  '💳 課長之路',
  social: '🤝 揪團高手',
  lucky:  '🍀 歐皇傳說',
  hidden: '☠️ 隱藏成就',
};

export default function AchievementsTab() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingTitle, setSelectingTitle] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch badges
      const { data: allBadges } = await supabase
        .from('badges')
        .select('id, name, description, icon, category, sort_order')
        .order('sort_order');

      const { data: userBadges } = await supabase
        .from('user_badges')
        .select('badge_id, earned_at')
        .eq('user_id', user.id);

      const earnedSet = new Set((userBadges || []).map((ub: any) => ub.badge_id));
      const earnedAtMap = Object.fromEntries((userBadges || []).map((ub: any) => [ub.badge_id, ub.earned_at]));

      setBadges((allBadges || []).map((b: any) => ({
        ...b,
        earned: earnedSet.has(b.id),
        earned_at: earnedAtMap[b.id] || null,
      })));

      // Fetch titles
      const { data: allTitles } = await supabase
        .from('titles')
        .select('id, name, color_key, sort_order')
        .order('sort_order');

      const { data: userTitles } = await supabase
        .from('user_titles')
        .select('title_id, is_selected')
        .eq('user_id', user.id);

      const earnedTitleMap = Object.fromEntries((userTitles || []).map((ut: any) => [ut.title_id, ut.is_selected]));

      setTitles((allTitles || []).map((t: any) => ({
        ...t,
        earned: t.id in earnedTitleMap,
        is_selected: earnedTitleMap[t.id] === true,
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleSelectTitle = async (titleId: string, alreadySelected: boolean) => {
    if (!user || selectingTitle) return;
    setSelectingTitle(titleId);
    try {
      if (alreadySelected) {
        // 取消選擇
        await supabase
          .from('user_titles')
          .update({ is_selected: false })
          .eq('user_id', user.id)
          .eq('title_id', titleId);
      } else {
        // 先清除其他選取
        await supabase
          .from('user_titles')
          .update({ is_selected: false })
          .eq('user_id', user.id);
        // 再選取新的
        await supabase
          .from('user_titles')
          .update({ is_selected: true })
          .eq('user_id', user.id)
          .eq('title_id', titleId);
      }
      await fetchData();
    } finally {
      setSelectingTitle(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12 text-neutral-400">請先登入</div>
    );
  }

  const earnedCount = badges.filter(b => b.earned).length;
  const ownedTitles = titles.filter(t => t.earned);
  const selectedTitle = titles.find(t => t.is_selected);

  // Group badges by category
  const grouped = Object.entries(CATEGORY_LABELS).map(([cat, label]) => ({
    cat,
    label,
    badges: badges.filter(b => b.category === cat),
  }));

  return (
    <div className="space-y-6">
      {/* 稱號選擇 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-sm border border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-neutral-900 dark:text-white text-base">我的稱號</h3>
          {selectedTitle && (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black text-white bg-gradient-to-r ${TITLE_STYLES[selectedTitle.color_key] || TITLE_STYLES.gold}`}>
              {selectedTitle.name}
            </span>
          )}
        </div>

        {ownedTitles.length === 0 ? (
          <p className="text-sm text-neutral-400">尚未獲得任何稱號，完成成就即可解鎖！</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ownedTitles.map(title => (
              <button
                key={title.id}
                onClick={() => handleSelectTitle(title.id, title.is_selected)}
                disabled={selectingTitle === title.id}
                className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black
                  transition-all duration-200 active:scale-95
                  ${title.is_selected
                    ? `bg-gradient-to-r ${TITLE_STYLES[title.color_key] || TITLE_STYLES.gold} text-white shadow-md`
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }
                `}
              >
                {title.is_selected && <CheckCircle2 className="w-3 h-3" />}
                {title.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 勳章牆 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-sm border border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-neutral-900 dark:text-white text-base">勳章牆</h3>
          <span className="text-sm text-neutral-500">
            已獲得 <span className="font-black text-purple-500">{earnedCount}</span> / {badges.length} 枚
          </span>
        </div>

        {grouped.map(({ cat, label, badges: catBadges }) => (
          <div key={cat} className="mb-5 last:mb-0">
            <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 mb-2">{label}</p>
            <div className="grid grid-cols-7 gap-2">
              {catBadges.map(badge => (
                <div key={badge.id} className="relative group">
                  <div
                    className={`
                      aspect-square rounded-xl flex items-center justify-center text-xl
                      transition-all duration-200
                      ${badge.earned
                        ? 'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 shadow-sm hover:scale-105'
                        : 'bg-neutral-100 dark:bg-neutral-800 opacity-40'
                      }
                    `}
                  >
                    <span className={badge.earned ? '' : 'grayscale'}>{badge.icon}</span>
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-neutral-900 dark:bg-white dark:text-neutral-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                    <div className="font-black">{badge.name}</div>
                    {badge.description && <div className="text-[9px] opacity-70">{badge.description}</div>}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-neutral-900 dark:border-t-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
