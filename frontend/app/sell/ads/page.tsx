'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { cn } from '@/lib/utils';

/*
 * 廣告中心 —— 賣家花 G幣買曝光。
 *
 * 只列 self_serve 的版位。供應商版位（官方頁那幾個）不會出現在這裡，
 * 而且就算有人自己打 RPC 也會被 DB 的 sell_ad_purchase() 擋掉 ——
 * 那是公司對公司的生意，價格要談，不能自助下單。
 *
 * 席次與報價一律問 DB：sell_ad_availability / sell_ad_quote。
 * 折扣規則放在 platform_settings，前台自己算會跟後端對不起來。
 */

type Slot = {
  id: string;
  name: string;
  description: string;
  price_per_day: number;
  seats_per_day: number;
  needs_keyword: boolean;
};

type MyListing = { id: number; title: string };

const DAY_OPTIONS = [1, 3, 7];

export default function SellAdsPage() {
  useFeatureGate('sell');

  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [listings, setListings] = useState<MyListing[]>([]);
  const [tokens, setTokens] = useState(0);
  const [keywords, setKeywords] = useState<string[]>([]);

  const [slotId, setSlotId] = useState('');
  const [listingId, setListingId] = useState<number | null>(null);
  const [days, setDays] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [availability, setAvailability] = useState<{ d: string; seats_left: number }[]>([]);
  const [quote, setQuote] = useState<number | null>(null);
  const [isBuying, setIsBuying] = useState(false);

  const slot = useMemo(() => slots.find((s) => s.id === slotId) || null, [slots, slotId]);

  useEffect(() => {
    if (!isLoading && !user?.id) router.replace('/login');
  }, [isLoading, router, user?.id]);

  // 版位型錄 + 我的上架中商品 + G幣餘額
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: slotRows }, { data: mine }, { data: dash }, { data: kwRow }] = await Promise.all([
        supabase
          .from('sell_ad_slots')
          .select('id, name, description, price_per_day, seats_per_day, needs_keyword')
          .eq('self_serve', true)
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('sell_listings')
          .select('id, title')
          .eq('seller_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase.rpc('sell_my_dashboard'),
        supabase.from('platform_settings').select('value').eq('key', 'sell_category_whitelist').maybeSingle(),
      ]);
      if (cancelled) return;

      const s = (slotRows || []) as Slot[];
      setSlots(s);
      if (s[0]) setSlotId(s[0].id);
      const l = (mine || []) as MyListing[];
      setListings(l);
      if (l[0]) setListingId(l[0].id);
      if ((dash as any)?.success) setTokens(Number((dash as any).tokens) || 0);

      // 關鍵字選單借用類別白名單 —— 玩家搜的多半就是這幾個詞，
      // 另外維護一份清單只會忘記更新
      try {
        const parsed = JSON.parse(String((kwRow as any)?.value || '[]'));
        if (Array.isArray(parsed)) setKeywords(parsed.map(String).filter(Boolean));
      } catch {
        setKeywords([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // 席次表
  const loadAvailability = useCallback(async () => {
    if (!slotId) return;
    const { data } = await createClient().rpc('sell_ad_availability', { p_slot_id: slotId, p_days: 7 });
    const rows = ((data || []) as { d: string; seats_left: number }[]).map((r) => ({
      d: String(r.d),
      seats_left: Number(r.seats_left) || 0,
    }));
    setAvailability(rows);
    // 預設挑第一個還有席次的日子，不要停在已額滿的那天
    const first = rows.find((r) => r.seats_left > 0);
    setStartDate((prev) => (prev && rows.some((r) => r.d === prev && r.seats_left > 0) ? prev : first?.d || ''));
  }, [slotId]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  // 報價
  useEffect(() => {
    if (!slotId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient().rpc('sell_ad_quote', { p_slot_id: slotId, p_days: days });
      if (!cancelled) setQuote(data === null || data === undefined ? null : Number(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [slotId, days]);

  const buy = async () => {
    if (!slotId || !listingId || !startDate) return;
    setIsBuying(true);
    try {
      const { data, error } = await createClient().rpc('sell_ad_purchase', {
        p_slot_id: slotId,
        p_listing_id: listingId,
        p_start_date: startDate,
        p_days: days,
        p_keyword: slot?.needs_keyword ? keyword : null,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) {
        showToast(r?.message || '購買失敗', 'plain');
        return;
      }
      showToast(`已買下 ${slot?.name}，花費 ${Number(r.cost).toLocaleString('zh-TW')}G`, 'plain');
      setTokens((t) => t - Number(r.cost || 0));
      await loadAvailability();
    } catch (e: any) {
      showToast(e?.message || '購買失敗', 'plain');
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28">
      <div className="sticky top-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
        <div className="max-w-3xl mx-auto px-2 h-[57px] flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-full text-neutral-700 dark:text-neutral-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[16px] font-black text-neutral-900 dark:text-white">廣告中心</h1>
          <span className="ml-auto text-[13px] font-black text-primary">
            {tokens.toLocaleString('zh-TW')} G
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 pt-3 space-y-3">
        {listings.length === 0 && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-[12.5px] font-black text-amber-700 dark:text-amber-300 leading-relaxed">
            你目前沒有上架中的商品。商品要先通過審核並上架，才能買廣告推廣。
          </div>
        )}

        {/* 版位 */}
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 text-[14px] font-black text-neutral-900 dark:text-white">選擇版位</div>
          {slots.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSlotId(s.id)}
              className={cn(
                'w-full px-4 py-3 flex items-center gap-3 text-left border-t border-neutral-100 dark:border-neutral-800',
                slotId === s.id && 'bg-primary/5'
              )}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-black text-neutral-900 dark:text-white">{s.name}</span>
                <span className="block text-[11px] font-black text-neutral-400">{s.description}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[15px] font-black text-primary">{s.price_per_day}G</span>
                <span className="block text-[10.5px] font-black text-neutral-400">
                  ／天 · 每日 {s.seats_per_day} 席
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* 商品 */}
        {listings.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 px-4 py-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white mb-2">推廣哪一件</div>
            <select
              value={String(listingId ?? '')}
              onChange={(e) => setListingId(Number(e.target.value) || null)}
              className="w-full h-10 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[13.5px] font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 檔期 */}
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 px-4 py-3">
          <div className="text-[14px] font-black text-neutral-900 dark:text-white mb-2">選擇檔期</div>
          <div className="grid grid-cols-7 gap-1.5">
            {availability.map((a) => {
              const full = a.seats_left <= 0;
              const active = startDate === a.d;
              return (
                <button
                  key={a.d}
                  type="button"
                  disabled={full}
                  onClick={() => setStartDate(a.d)}
                  className={cn(
                    'rounded-xl py-2 text-center transition-colors',
                    full
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-300 dark:text-neutral-600'
                      : active
                        ? 'bg-primary/10 ring-2 ring-primary text-primary'
                        : 'bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300'
                  )}
                >
                  <span className="block text-[11.5px] font-black">{a.d.slice(5).replace('-', '/')}</span>
                  <span className="block text-[9px] font-black opacity-70">
                    {full ? '額滿' : `剩 ${a.seats_left}`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {DAY_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={cn(
                  'rounded-xl py-2 text-center transition-colors',
                  days === n
                    ? 'bg-primary/10 ring-2 ring-primary text-primary'
                    : 'bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300'
                )}
              >
                <span className="block text-[13px] font-black">{n} 天</span>
                {n > 1 && (
                  <span className="block text-[10px] font-black opacity-70">{n === 3 ? '9 折' : '8 折'}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 關鍵字（只有搜尋置頂需要） */}
        {slot?.needs_keyword && (
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 px-4 py-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white mb-2">綁定關鍵字</div>
            <div className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKeyword(k)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[12.5px] font-black border transition-colors',
                    keyword === k
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 px-4 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-black text-neutral-500">應付</span>
            <span className="text-[24px] font-black text-primary">
              {quote === null ? '—' : `${quote.toLocaleString('zh-TW')} G`}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] font-black text-neutral-400">
            {startDate ? `${startDate.slice(5).replace('-', '/')} 起連續 ${days} 天` : '請先選檔期'}
            {slot?.needs_keyword && keyword ? `　關鍵字「${keyword}」` : ''}
          </p>
        </div>
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-40 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            disabled={
              isBuying ||
              !slotId ||
              !listingId ||
              !startDate ||
              (slot?.needs_keyword && !keyword) ||
              quote === null
            }
            onClick={buy}
            className="w-full h-12 rounded-2xl bg-primary text-white text-[15px] font-black disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {isBuying ? '購買中…' : '確認購買'}
          </button>
        </div>
      </div>
    </div>
  );
}
