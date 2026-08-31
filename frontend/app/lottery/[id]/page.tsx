'use client';

/**
 * 抽籤販售內頁（老闆 2026-08-31：要像活動頁，視覺好看一點）
 *
 * 版面：滿版主視覺 → 檔期資訊卡 → 玩法三步驟 → 公平性（承諾值）→ 名單（開獎後）
 * → 商品內容。底部固定操作欄放一顆大按鈕「立即登記　[積分] XX」。
 *
 * ## 為什麼不用 LpRenderer
 *
 * 那支是把後台編好的 section 陣列畫出來，適合「內容每檔都不一樣」的活動頁。
 * 這頁的骨架每一檔都一樣（倒數、名額、玩法、名單），變的只有圖與文案 ——
 * 用 section 表達的話，每建一檔都要在後台重排一次版，而且倒數與名單這種
 * 會動的東西塞不進靜態 section。檔期自訂的圖文走 `content` 欄位另外掛。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useToast } from '@/components/ui/Toast';
import { hapticLight, hapticNotify } from '@/lib/haptics';
import { asset } from '@/lib/asset';
import { phaseOf, phaseMeta, countdownText, type LotteryEventRow, ctaText } from '@/lib/lottery';

interface Winner {
  rank: number; entry_no: number; nickname: string; avatar_url: string | null; status: string;
}

export default function LotteryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = Number(params?.id);
  const [supabase] = useState(() => createClient());
  const { user, isAuthenticated } = useAuth();
  const { states: flagStates } = useFeatureFlags();
  const { showToast } = useToast();

  const [ev, setEv] = useState<LotteryEventRow | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [myEntries, setMyEntries] = useState<{ entry_no: number; status: string; rank: number | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0);

  const flag = flagStates.lottery ?? 'on';

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lottery_events')
      .select('*, product:products(id, name, image_url, type, price)')
      .eq('id', eventId)
      .single();
    if (!data) { setIsLoading(false); return; }
    setEv(data as LotteryEventRow);

    /*
     * Supabase 的查詢建構器是 thenable 而不是真正的 Promise（沒有 catch/finally），
     * 直接丟進 Promise.all 型別會不合 —— 用 Promise.resolve() 包一層轉成真的 Promise。
     */
    const jobs: Promise<unknown>[] = [
      Promise.resolve(supabase.rpc('get_lottery_entry_counts', { p_event_ids: [eventId] }))
        .then(({ data: c }) => setEntryCount((c as { entries?: number }[] | null)?.[0]?.entries ?? 0)),
    ];
    if (data.drawn_at) {
      jobs.push(Promise.resolve(supabase.rpc('get_lottery_winners', { p_event_id: eventId }))
        .then(({ data: w }) => setWinners((w ?? []) as Winner[])));
    }
    /* 自己的登記：RLS 只讓你讀自己的，所以這條不必也不能加 user_id 條件 */
    if (user?.id) {
      jobs.push(Promise.resolve(supabase.from('lottery_entries')
        .select('entry_no, status, rank')
        .eq('event_id', eventId)
        .order('entry_no'))
        .then(({ data: m }) => setMyEntries(m ?? [])));
    }
    await Promise.all(jobs);
    setIsLoading(false);
  }, [supabase, eventId, user?.id]);

  useEffect(() => { if (eventId) load(); }, [eventId, load]);

  const phase = useMemo(() => (ev ? phaseOf(ev) : 'draft'), [ev]);
  const meta = phaseMeta(phase);
  const used = myEntries.filter(m => m.status !== 'refunded').length;
  const canEnterMore = ev ? used < ev.per_user_entries : false;
  const myPoints = Number((user as { points?: number } | null)?.points ?? 0);

  const register = async () => {
    if (!ev) return;
    if (!isAuthenticated) { router.push('/login'); return; }
    if (myPoints < ev.entry_points) {
      showToast(`積分不足，還差 ${ev.entry_points - myPoints} 積分。到簽到頁做任務可以賺積分`, 'error');
      return;
    }
    setSubmitting(true);
    hapticLight();
    try {
      const { data, error } = await supabase.rpc('enter_lottery', { p_event_id: eventId });
      if (error) throw new Error(error.message);
      if (!data?.success) { showToast(data?.message ?? '登記失敗', 'error'); return; }
      hapticNotify('SUCCESS');
      showToast(`登記成功！你的登記序號 #${data.entry_no}`, 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '登記失敗', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <ProductLoadingScreen />;
  if (!ev || (ev.status !== 'published')) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] font-bold text-neutral-400">
        找不到這個抽籤活動
      </div>
    );
  }

  const cover = ev.cover_image_url || ev.product?.image_url || asset('/images/banner_defaulet.png');
  /* 維護中照樣看得到內容，只有按鈕停用 —— 藏掉會讓玩家以為活動被取消了 */
  const blocked = flag === 'maintenance';
  /*
   * 基本文案跟列表卡片共用 `ctaText`（lib/lottery.ts）—— 兩邊各寫一份的話，
   * 玩家會在列表看到「立即登記」、點進來卻是別的字。
   * 這裡再疊兩個只有內頁知道的狀態：維護中、以及這個人已達個人上限。
   */
  const buttonState =
    blocked ? { text: '維護中，暫停登記', disabled: true }
    : phase === 'registering' && !canEnterMore
      ? { text: `已登記（上限 ${ev.per_user_entries} 次）`, disabled: true }
      : ctaText(phase);

  return (
    <div className="min-h-screen bg-neutral-50 pb-32 dark:bg-neutral-950">

      {/* 主視覺 */}
      <div className="relative aspect-[4/3] bg-neutral-100 dark:bg-neutral-800">
        <Image src={cover} alt={ev.title || ''} fill className="object-cover" unoptimized priority />
        {/*
          漸層要吃到 80% 且中段就開始壓黑：主視覺常常是滿版金色／亮色的商業圖，
          只有 from-black/70 的話標題壓在亮處還是讀不出來（實測用日系一番賞主視覺）。
          再加一層文字陰影，遇到白底圖也保得住。
        */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 pt-20">
          <span className={`mb-2 inline-block rounded-full px-3 py-1 text-[12px] font-black text-white ${meta.cls}`}>
            {meta.label}
          </span>
          <h1 className="text-[20px] font-black leading-tight text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
            {ev.title || ev.product?.name}
          </h1>
          {ev.subtitle && (
            <p className="mt-1 text-[13px] font-bold text-white/85" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
              {ev.subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {/* 檔期資訊 */}
        <section className="rounded-2xl bg-white p-4 shadow-card dark:bg-neutral-900">
          <div className={`mb-3 text-center text-[15px] font-black ${meta.urgent ? 'text-accent-red' : 'text-neutral-700 dark:text-neutral-300'}`}>
            {countdownText(ev, phase)}
          </div>
          <div className="grid grid-cols-3 divide-x divide-neutral-100 text-center dark:divide-neutral-800">
            <div>
              <div className="text-[11px] font-bold text-neutral-400">名額</div>
              <div className="text-[17px] font-black text-neutral-900 dark:text-neutral-50">{ev.winners_count}</div>
              <div className="text-[10px] text-neutral-400">備取 {ev.backup_count}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-neutral-400">登記人數</div>
              <div className="text-[17px] font-black text-neutral-900 dark:text-neutral-50">
                {/* 檔期設定不公開時，開獎後才揭曉 —— 那時「N 人搶 M 組」才是要的標題 */}
                {ev.show_entry_count || ev.drawn_at ? entryCount.toLocaleString() : '—'}
              </div>
              <div className="text-[10px] text-neutral-400">
                {ev.show_entry_count || ev.drawn_at ? '人' : '開獎後公布'}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-neutral-400">中籤價</div>
              <div className="text-[17px] font-black text-accent-red">{ev.price_tokens.toLocaleString()}</div>
              <div className="text-[10px] text-neutral-400">G 幣</div>
            </div>
          </div>
        </section>

        {/* 我的登記 */}
        {myEntries.length > 0 && (
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="mb-2 text-[13px] font-black text-primary">我的登記</div>
            <div className="flex flex-wrap gap-2">
              {myEntries.map(m => (
                <span key={m.entry_no} className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  #{m.entry_no}
                  {m.rank && <span className="ml-1 text-neutral-400">第 {m.rank} 順位</span>}
                  {m.status === 'won'    && <b className="ml-1 text-accent-red">中籤</b>}
                  {m.status === 'backup' && <b className="ml-1 text-amber-600">備取</b>}
                  {m.status === 'paid'   && <b className="ml-1 text-green-600">已付款</b>}
                  {m.status === 'lost'   && <span className="ml-1 text-neutral-400">未中籤</span>}
                  {m.status === 'expired'&& <span className="ml-1 text-neutral-400">逾期</span>}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 玩法 */}
        <section className="rounded-2xl bg-white p-4 shadow-card dark:bg-neutral-900">
          <h2 className="mb-3 text-[15px] font-black text-neutral-900 dark:text-neutral-50">怎麼玩</h2>
          <ol className="space-y-3">
            {[
              [`花 ${ev.entry_points} 積分登記`, `一人最多 ${ev.per_user_entries} 次。積分靠簽到、任務、邀請好友賺，不能用錢買。`],
              ['到時間統一開獎', `所有登記的人一起抽，跟你什麼時候登記無關。正取 ${ev.winners_count} 名、備取 ${ev.backup_count} 名，名單公開。`],
              ['中籤後付款', `用 ${ev.price_tokens.toLocaleString()} G 幣付款，期限 ${ev.pay_deadline_hours} 小時。逾期就讓給備取。`],
            ].map(([title, desc], i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-black text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-black text-neutral-900 dark:text-neutral-50">{title}</div>
                  <p className="mt-0.5 text-[12px] font-bold leading-relaxed text-neutral-400">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 公平性 */}
        {ev.commitment && (
          <section className="rounded-2xl bg-white p-4 shadow-card dark:bg-neutral-900">
            <h2 className="mb-2 flex items-center gap-2 text-[15px] font-black text-neutral-900 dark:text-neutral-50">
              <Image src={asset('/images/ic.png')} alt="" width={24} height={24} className="h-6 w-6" unoptimized />
              這一檔怎麼驗
            </h2>
            <p className="text-[12px] font-bold leading-relaxed text-neutral-500 dark:text-neutral-400">
              開放登記前就把抽選用的種子封存，並公布下方驗證碼。開獎後公開種子與完整名單，
              你可以自己算一次核對 —— 中途改過一個字就對不上。
            </p>
            <div className="mt-3 space-y-2">
              <Field label="開放登記時公布的驗證碼" value={ev.commitment} />
              {ev.seed && <Field label="開獎後公開的種子" value={ev.seed} />}
            </div>
          </section>
        )}

        {/* 名單 */}
        {ev.drawn_at && winners.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-card dark:bg-neutral-900">
            <h2 className="mb-3 text-[15px] font-black text-neutral-900 dark:text-neutral-50">
              中籤名單
              <span className="ml-2 text-[12px] font-bold text-neutral-400">
                {entryCount.toLocaleString()} 人搶 {ev.winners_count} 組
              </span>
            </h2>
            <div className="space-y-1.5">
              {winners.map(w => (
                <div key={w.rank} className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
                  <span className={`w-8 shrink-0 text-center text-[13px] font-black ${
                    w.status === 'backup' ? 'text-neutral-400' : 'text-accent-red'}`}>
                    {w.rank}
                  </span>
                  <Image src={w.avatar_url ? asset(w.avatar_url) : asset('/images/avatar/01.webp')}
                         alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" unoptimized />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-neutral-700 dark:text-neutral-200">
                    {w.nickname}
                  </span>
                  <span className="shrink-0 text-[11px] font-black text-neutral-400">
                    {w.status === 'backup' ? '備取' : w.status === 'paid' ? '已付款' : w.status === 'expired' ? '逾期' : '正取'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 底部固定操作欄。data-testid 給「N 人正在看」膠囊掛上去用 */}
      <div data-testid="bottom-action-bar"
           className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-100 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-modal backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
          <button
            onClick={register}
            disabled={buttonState.disabled || submitting}
            className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-accent-red text-[15px] font-black text-white shadow-lg shadow-accent-red/30 transition-all active:scale-[0.98] disabled:bg-neutral-300 disabled:shadow-none dark:disabled:bg-neutral-700"
          >
            {buttonState.text}
            {!buttonState.disabled && (
              <>
                <Image src={asset('/images/coin.png')} alt="積分" width={18} height={18}
                       className="h-[18px] w-[18px]" unoptimized />
                {ev.entry_points}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 驗證碼欄位：長字串一定要能整串複製，截斷顯示但複製給全文 */
function Field({ label, value }: { label: string; value: string }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(value); showToast('已複製', 'success'); }}
      className="w-full rounded-xl bg-neutral-50 px-3 py-2 text-left dark:bg-neutral-800"
    >
      <div className="text-[11px] font-bold text-neutral-400">{label}</div>
      <div className="truncate font-mono text-[12px] text-neutral-700 dark:text-neutral-300">{value}</div>
    </button>
  );
}
