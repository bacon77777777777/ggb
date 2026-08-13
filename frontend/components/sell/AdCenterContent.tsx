'use client';

/*
 * 廣告中心的內容（原型 adCenter() / adBuy()）。
 * 抽成元件供「我的」頁的彈層與 /sell/ads 深連結共用。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';

/*
 * 廣告中心 —— 版型照原型（docs/prototypes/ggb-market-taobao_1.html 的
 * adCenter() / adBuy()），class 名稱與結構照抄，樣式在 ../market.css。
 *
 * 只列 self_serve 的版位。供應商版位（官方頁那幾個）不會出現在這裡，
 * 就算有人自己打 RPC 也會被 DB 的 sell_ad_purchase() 擋掉 ——
 * 那是公司對公司的生意，價格要談，不能自助下單。
 *
 * 席次與報價一律問 DB（sell_ad_availability / sell_ad_quote）：
 * 折扣規則在 platform_settings，前台自己算會跟後端對不起來。
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

// 版位圖示：照原型 SLOT_TYPES 的 ic 路徑
const SLOT_ICON: Record<string, string> = {
  feat: 'M12 3l2.4 5 5.6.8-4 3.9 1 5.5L12 15.6 6.9 18.2l1-5.5-4-3.9 5.6-.8z',
  hero: 'M3 6h18v12H3zM7 18v2h10v-2',
  kw: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  cat: 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z',
  topic: 'M5 4h14v16l-7-3-7 3z',
  done: 'M4 12l5 5L20 6',
};

const nt = (n: number) => Math.round(n || 0).toLocaleString('zh-TW');
const mmdd = (iso: string) => iso.slice(5).replace('-', '/');

export default function AdCenterContent({ onDone }: { onDone?: () => void }) {
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

      // 關鍵字借用類別白名單 —— 玩家搜的多半就是這幾個詞，
      // 另外維護一份只會忘記更新
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

  const loadAvailability = useCallback(async () => {
    if (!slotId) return;
    const { data } = await createClient().rpc('sell_ad_availability', { p_slot_id: slotId, p_days: 7 });
    const rows = ((data || []) as { d: string; seats_left: number }[]).map((r) => ({
      d: String(r.d),
      seats_left: Number(r.seats_left) || 0,
    }));
    setAvailability(rows);
    // 預設挑第一個還有席次的日子，不要停在已額滿那天
    const first = rows.find((r) => r.seats_left > 0);
    setStartDate((prev) => (prev && rows.some((r) => r.d === prev && r.seats_left > 0) ? prev : first?.d || ''));
  }, [slotId]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

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
      showToast(`已買下 ${slot?.name}，花費 ${nt(Number(r.cost))}G`, 'plain');
      setTokens((t) => t - Number(r.cost || 0));
      await loadAvailability();
      onDone?.();
    } catch (e: any) {
      showToast(e?.message || '購買失敗', 'plain');
    } finally {
      setIsBuying(false);
    }
  };

  const canBuy =
    !isBuying && !!slotId && !!listingId && !!startDate && !(slot?.needs_keyword && !keyword) && quote !== null;

  return (
    <>
      {listings.length === 0 && (
        <div className="blk first">
          <div className="admin">
            <b>還沒有可以推廣的商品</b>
            商品要先通過審核並上架，才能買廣告。上架後回到這裡就能選。
          </div>
        </div>
      )}

      {/* ── 版位 ── */}
      <div className="blk first">
        <div className="secttl">可購買版位</div>
        {slots.map((s) => (
          <button
            key={s.id}
            type="button"
            className="slotrow"
            aria-pressed={slotId === s.id}
            onClick={() => setSlotId(s.id)}
            style={slotId === s.id ? { background: '#FFF8F3' } : undefined}
          >
            <span className="ic">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="1.8" strokeLinecap="round">
                <path d={SLOT_ICON[s.id] || SLOT_ICON.feat} />
              </svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{s.name}</b>
              <small>{s.description}</small>
            </span>
            <span className="pr">
              <span className="n">{nt(s.price_per_day)}G</span>
              <span className="s">／天 · 每日 {s.seats_per_day} 席</span>
            </span>
          </button>
        ))}
      </div>

      {/* ── 推廣哪一件 ── */}
      {listings.length > 0 && (
        <div className="blk">
          <div className="secttl">推廣哪一件</div>
          <select
            className="fin"
            value={String(listingId ?? '')}
            onChange={(e) => setListingId(Number(e.target.value) || null)}
          >
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── 檔期 ── */}
      <div className="blk">
        <div className="secttl">選擇檔期</div>
        <div className="days">
          {availability.map((a) => {
            const full = a.seats_left <= 0;
            return (
              <button
                key={a.d}
                type="button"
                className="day"
                disabled={full}
                aria-pressed={startDate === a.d}
                onClick={() => setStartDate(a.d)}
              >
                <div className="dd">{mmdd(a.d)}</div>
                <div className="ds">{full ? '已額滿' : `剩 ${a.seats_left} 席`}</div>
              </button>
            );
          })}
        </div>

        <div className="two" style={{ marginTop: 10 }}>
          {DAY_OPTIONS.map((n) => (
            <button key={n} type="button" className="pick" aria-pressed={days === n} onClick={() => setDays(n)}>
              <span className="ck" />
              {n} 天{n > 1 && <small>{n === 3 ? '9 折' : '8 折'}</small>}
            </button>
          ))}
        </div>

        {slot?.needs_keyword && (
          <div style={{ marginTop: 14 }}>
            <div className="secttl">綁定關鍵字</div>
            <div className="kwchips">
              {keywords.map((k) => (
                <button key={k} type="button" className="kw" aria-pressed={keyword === k} onClick={() => setKeyword(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="calcbox">
          <div className="l">應付</div>
          <div className="v">{quote === null ? '—' : `${nt(quote)} G`}</div>
          <div className="s">
            {startDate ? `${mmdd(startDate)} 起連續 ${days} 天` : '請先選檔期'}
            {slot?.needs_keyword && keyword ? `　關鍵字「${keyword}」` : ''}
          </div>
        </div>

        <button type="button" className="btn" disabled={!canBuy} onClick={buy}>
          {isBuying ? '購買中…' : '確認購買'}
        </button>
        <button type="button" className="btn2" onClick={() => onDone?.()}>
          關閉
        </button>
      </div>

    </>
  );
}
