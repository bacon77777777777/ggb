'use client';

import '../market.css';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';
import MarketTabBar from '@/components/sell/MarketTabBar';
import MarketSheet from '@/components/sell/MarketSheet';
import SellFormContent from '@/components/sell/SellFormContent';
import AdCenterContent from '@/components/sell/AdCenterContent';
import DepositRulesContent from '@/components/sell/DepositRulesContent';
import PayoutSettingsContent from '@/components/sell/PayoutSettingsContent';
import ProUpgradeContent from '@/components/sell/ProUpgradeContent';

/*
 * 我的賣場 —— 照原型 vMe() 的 .mehd / .mecard / .mlist / .mine 結構。
 *
 * 儀表數字（等級、成交率、保證金鎖定）走 sell_my_dashboard RPC 一次拿完：
 * 等級規則與保證金比例都在 DB，前台只負責顯示，不重算。
 */

type Dash = {
  tier: { k: number; name: string; ratio: number; max_price: number };
  done_count: number;
  failed_count: number;
  success_rate: number;
  avg_ship_minutes: number;
  good_rate: number;
  locked_deposit: number;
  is_pro: boolean;
  tokens: number;
};

type MyListing = {
  id: number;
  title: string;
  price: number;
  shipping_fee: number;
  status: string;
  review_note: string | null;
  images: string[] | null;
  items: any;
  view_count: number;
};

const nt = (n: number) => Math.round(n || 0).toLocaleString('zh-TW');

const pickImage = (l: MyListing) => {
  const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
  if (imgs[0]) return imgs[0];
  const items = Array.isArray(l.items) ? l.items : [];
  return items.map((x: any) => String(x?.image || '').trim()).filter(Boolean)[0] || '/images/item_defaulet.webp';
};

const stockOf = (l: MyListing) =>
  (Array.isArray(l.items) ? l.items : []).reduce((a: number, i: any) => a + (Number(i?.quantity) || 0), 0);

export default function SellManagePage() {
  useFeatureGate('sell');

  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [dash, setDash] = useState<Dash | null>(null);
  const [rows, setRows] = useState<MyListing[]>([]);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [payMethod, setPayMethod] = useState('尚未設定');
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  /*
   * 「我的」底下的功能全部走彈層（照原型：這些在原型裡都是 sheet，不是分頁）。
   * 對應的路由仍保留，當深連結與分享用 —— 但站內動線一律不換頁。
   */
  const [sheet, setSheet] = useState<null | { kind: 'sell' | 'ads' | 'deposit' | 'payout' | 'pro'; editId?: number }>(null);
  const closeSheet = () => setSheet(null);

  useEffect(() => {
    if (!authLoading && !user?.id) router.replace('/login');
  }, [authLoading, router, user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const supabase = createClient();
    const [{ data: d }, { data: mine }, { data: me }, { data: profile }] = await Promise.all([
      supabase.rpc('sell_my_dashboard'),
      supabase
        .from('sell_listings')
        .select('id, title, price, shipping_fee, status, review_note, images, items, view_count')
        .eq('seller_id', user.id)
        .eq('is_official', false)
        .order('created_at', { ascending: false }),
      supabase.from('users').select('name, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('sell_seller_profiles').select('payout_method').eq('seller_id', user.id).maybeSingle(),
    ]);

    if ((d as any)?.success) {
      const t = (d as any).tier || {};
      setDash({
        tier: {
          k: Number(t.k) || 1,
          name: String(t.name || '新手'),
          ratio: Number(t.ratio) || 100,
          max_price: Number(t.max_price) || 3000,
        },
        done_count: Number((d as any).done_count) || 0,
        failed_count: Number((d as any).failed_count) || 0,
        success_rate: Number((d as any).success_rate) || 100,
        avg_ship_minutes: Number((d as any).avg_ship_minutes) || 0,
        good_rate: Number((d as any).good_rate) || 100,
        locked_deposit: Number((d as any).locked_deposit) || 0,
        is_pro: !!(d as any).is_pro,
        tokens: Number((d as any).tokens) || 0,
      });
    }
    setRows((mine || []) as MyListing[]);
    setName(String((me as any)?.name || '玩家'));
    setAvatar(String((me as any)?.avatar_url || ''));
    const pm = String((profile as any)?.payout_method || '');
    setPayMethod(pm === 'linepay' ? 'LINE Pay' : pm === 'bank' ? '銀行轉帳' : '尚未設定');
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.status === 'active').length,
      pending: rows.filter((r) => r.status === 'pending').length,
    }),
    [rows]
  );

  // 升到下一級還差幾單（金牌 100 / 銀牌 10，照 platform_settings.sell_tiers）
  const gap = dash ? (dash.tier.k === 3 ? 0 : dash.tier.k === 2 ? 100 - dash.done_count : 10 - dash.done_count) : 0;

  const setStatus = async (l: MyListing, next: 'removed' | 'pending') => {
    if (!user?.id) return;
    setBusyId(l.id);
    try {
      const { error } = await createClient()
        .from('sell_listings')
        .update({ status: next, updated_at: new Date().toISOString() } as any)
        .eq('id', l.id)
        .eq('seller_id', user.id);
      if (error) throw error;
      showToast(next === 'removed' ? '已下架' : '已重新送審', 'plain');
      await load();
    } catch (e: any) {
      showToast(e?.message || '操作失敗', 'plain');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mk min-h-screen pb-[calc(64px+env(safe-area-inset-bottom))]">
      {/* ── 頭部 ── */}
      <div className="mehd">
        <div className="meid">
          <div className="meav">
            {avatar ? (
              <Image src={avatar} alt={name} fill style={{ objectFit: 'cover' }} sizes="46px" />
            ) : (
              (name[0] || 'U').toUpperCase()
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{name}</b>
            <div className="mebadges">
              <span className="bdg gold">{dash?.tier.name || '新手'}賣家</span>
              <span className="bdg verify">實名認證</span>
              {dash?.is_pro && <span className="bdg gold">官方認證商家</span>}
              <span className="bdg">完成 {nt(dash?.done_count || 0)} 單</span>
            </div>
          </div>
        </div>

        <div className="repbar">
          <div className="l">
            <span>信譽分數</span>
            <span>{dash?.good_rate ?? 100} / 100</span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${Math.min(100, Number(dash?.good_rate ?? 100))}%` }} />
          </div>
          <div className="l" style={{ margin: '7px 0 0' }}>
            <span>{dash?.tier.k === 3 ? '已達最高等級' : `再完成 ${Math.max(0, gap)} 單升級`}</span>
            <span>保證金 {dash?.tier.ratio ?? 100}%</span>
          </div>
        </div>
      </div>

      {/* ── 四格統計 ── */}
      <div className="mecard">
        <div>
          <div className="n">{dash?.success_rate ?? 100}%</div>
          <div className="c">成交率</div>
        </div>
        <div>
          <div className="n">{dash?.avg_ship_minutes ?? 0} 分</div>
          <div className="c">平均出貨</div>
        </div>
        <div>
          <div className="n">{dash?.good_rate ?? 100}%</div>
          <div className="c">好評率</div>
        </div>
        <div>
          <div className="n">{nt(dash?.locked_deposit || 0)}</div>
          <div className="c">保證金鎖定</div>
        </div>
      </div>

      {/* ── 升級官方認證商家 ── */}
      {dash && !dash.is_pro && (
        <div className="upsell">
          <b>升級官方認證商家</b>
          <p>認證徽章 · 店鋪頁 · 自家商品置頂 · 單件售價上限提高一級</p>
          <button type="button" className="go" onClick={() => setSheet({ kind: 'pro' })}>
            1,200G／月　立即升級
          </button>
        </div>
      )}

      {/* ── 功能列 ── */}
      <div className="mlist">
        <button type="button" className="mrow" onClick={() => setSheet({ kind: 'sell' })}>
          我要上架
          <span className="ar">上架不扣 ›</span>
        </button>
        <button type="button" className="mrow" onClick={() => setSheet({ kind: 'ads' })}>
          廣告中心
          <span className="hot">6 種版位</span>
          <span className="ar">›</span>
        </button>
        <button type="button" className="mrow" onClick={() => setSheet({ kind: 'deposit' })}>
          保證金規則
          <span className="ar">賣出才收 ›</span>
        </button>
        <button type="button" className="mrow" onClick={() => setSheet({ kind: 'payout' })}>
          收款設定
          <span className="ar">{payMethod} ›</span>
        </button>
      </div>

      {/* ── 我的商品 ── */}
      <div className="mine">
        <div className="minehd">
          <b>我的商品</b>
          {rows.length > 0 && (
            <span className="ar">
              {counts.active} 上架中 · {counts.pending} 待審
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="hint" style={{ padding: '14px 0 18px', textAlign: 'center' }}>
            載入中
          </p>
        ) : rows.length === 0 ? (
          <p className="hint" style={{ padding: '14px 0 18px', textAlign: 'center' }}>
            還沒有上架的商品
          </p>
        ) : (
          rows.map((l) => {
            const deposit = Math.ceil((l.price * (dash?.tier.ratio ?? 100)) / 100);
            return (
              <div key={l.id} className="mrowi">
                <div className="mth" style={{ background: '#F5F5F5' }}>
                  <Image src={pickImage(l)} alt={l.title} fill style={{ objectFit: 'cover' }} sizes="52px" />
                </div>
                <div className="mmeta">
                  {/*
                    原本標題後面接一個狀態徽章（.stpill，原型也有），但 .mt 是
                    line-clamp:1 —— 站上的商品名比原型的假資料長得多，徽章一律被切成
                    「上…」。狀態本來就看得出來（右側按鈕：下架/推廣=上架中、
                    審核中=待審、下方會顯示退回原因），拿掉不會少資訊。
                  */}
                  <div className="mt">{l.title}</div>
                  <div className="mp">NT${nt(l.price)}</div>
                  <div className="ms">
                    {l.shipping_fee ? `運費 ${nt(l.shipping_fee)}` : '免運費'} · 庫存 {stockOf(l)} · 瀏覽{' '}
                    {nt(l.view_count)}
                  </div>
                  <div className="ms">
                    {l.status === 'rejected' && l.review_note
                      ? `退回原因：${l.review_note}`
                      : `賣出收 ${nt(deposit)}G`}
                  </div>
                </div>
                <div className="mact">
                  {l.status === 'pending' ? (
                    <button type="button" disabled>
                      審核中
                    </button>
                  ) : l.status === 'active' ? (
                    <>
                      <button type="button" disabled={busyId === l.id} onClick={() => setStatus(l, 'removed')}>
                        下架
                      </button>
                      <button type="button" className="on" onClick={() => setSheet({ kind: 'ads' })}>
                        推廣
                      </button>
                    </>
                  ) : l.status === 'sold' ? (
                    <button type="button" disabled>
                      已售出
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setSheet({ kind: 'sell', editId: l.id })}>
                        修改
                      </button>
                      <button
                        type="button"
                        className="on"
                        disabled={busyId === l.id}
                        onClick={() => setStatus(l, 'pending')}
                      >
                        重新送審
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <MarketTabBar active="me" />

      {/* ── 「我的」底下的功能全部是彈層（照原型）── */}
      <MarketSheet
        open={sheet?.kind === 'sell'}
        title={sheet?.editId ? '修改上架' : '我要上架'}
        onClose={closeSheet}
      >
        {sheet?.kind === 'sell' && (
          <SellFormContent
            editId={sheet.editId ?? null}
            onDone={() => {
              closeSheet();
              void load();
            }}
          />
        )}
      </MarketSheet>

      <MarketSheet open={sheet?.kind === 'ads'} title="廣告中心" onClose={closeSheet}>
        {sheet?.kind === 'ads' && <AdCenterContent onDone={closeSheet} />}
      </MarketSheet>

      <MarketSheet open={sheet?.kind === 'deposit'} title="保證金規則" onClose={closeSheet}>
        {sheet?.kind === 'deposit' && <DepositRulesContent />}
      </MarketSheet>

      <MarketSheet open={sheet?.kind === 'payout'} title="收款設定" onClose={closeSheet}>
        {sheet?.kind === 'payout' && (
          <PayoutSettingsContent
            onDone={() => {
              closeSheet();
              void load();
            }}
          />
        )}
      </MarketSheet>

      <MarketSheet open={sheet?.kind === 'pro'} title="官方認證商家" onClose={closeSheet}>
        {sheet?.kind === 'pro' && (
          <ProUpgradeContent
            onDone={() => {
              closeSheet();
              void load();
            }}
          />
        )}
      </MarketSheet>
    </div>
  );
}
