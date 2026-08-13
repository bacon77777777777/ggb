'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import MarketSheet from './MarketSheet';

/*
 * 訂單詳情彈層 —— 照原型 openOrder()：.steps 步驟條 + 匯款資訊 + 依狀態的操作鈕。
 *
 * 原型的 C2C 是四步，站上是五步（多一個「賣家確認收款」）——
 * 平台不碰錢，錢有沒有到只有賣家知道，這一步不能省。
 *
 * 匯款資訊只在**訂單成立後**才會出現：sell_seller_public 這支 view 只露收款
 * 「方式」不露帳號，帳號要從賣家檔案讀，而那是 SECURITY DEFINER 的函式在管。
 */

export type OrderLite = {
  id: number;
  type: 'c2c' | 'b2c';
  orderNo: string;
  shop: string;
  title: string;
  image: string;
  amount: number;
  step: number;
  cancelled: boolean;
  paymentStatus?: string;
  depositAmount?: number;
  overdueNotified?: boolean;
  trackingNumber?: string | null;
  isBuyer: boolean;
  payMethod?: string | null;
  createdAt: string;
  payDeadlineHours?: number;
};

const C2C_STEPS = ['待付款', '待確認收款', '待出貨', '待收貨', '完成'];
const B2C_STEPS = ['已付款', '備貨中', '已出貨', '完成'];

const nt = (n: number) => Math.round(n || 0).toLocaleString('zh-TW');

export default function OrderSheet({
  order,
  onClose,
  onChanged,
}: {
  order: OrderLite | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState('');
  const [payInfo, setPayInfo] = useState<Record<string, string> | null>(null);

  const steps = order?.type === 'b2c' ? B2C_STEPS : C2C_STEPS;
  const cur = Math.max(0, (order?.step || 1) - 1);

  // 付款倒數：原型寫死 15 分鐘，站上讀商城設定（sell_pay_deadline_hours）
  useEffect(() => {
    if (!order || order.type !== 'c2c' || order.step !== 1 || order.cancelled) return;
    const hours = order.payDeadlineHours ?? 48;
    const due = new Date(order.createdAt).getTime() + hours * 3600 * 1000;
    const tick = () => {
      const s = Math.max(0, Math.round((due - Date.now()) / 1000));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      setLeft(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [order]);

  // 賣家收款帳號（訂單成立後才給看）
  useEffect(() => {
    if (!order || order.type !== 'c2c' || !order.isBuyer) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from('sell_orders')
        .select('seller_id')
        .eq('id', order.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const { data: prof } = await createClient()
        .from('sell_seller_profiles')
        .select('payout_method, transfer_bank, transfer_account, transfer_name, linepay_id')
        .eq('seller_id', (data as any).seller_id)
        .maybeSingle();
      if (cancelled || !prof) return;
      const pm = String((prof as any).payout_method || 'bank');
      setPayInfo(
        pm === 'linepay'
          ? { 收款帳號: String((prof as any).linepay_id || '—'), 備註: order.orderNo }
          : {
              銀行: String((prof as any).transfer_bank || '—'),
              帳號: String((prof as any).transfer_account || '—'),
              戶名: String((prof as any).transfer_name || '—'),
            }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  const call = async (fn: string, label: string) => {
    if (!order || busy) return;
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc(fn, { p_order_id: order.id });
      if (error) throw error;
      const r = data as any;
      if (r && r.success === false) {
        showToast(r.message || '操作失敗', 'plain');
        return;
      }
      showToast(label, 'plain');
      onChanged();
      onClose();
    } catch (e: any) {
      showToast(e?.message || '操作失敗', 'plain');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketSheet open={!!order} title="訂單詳情" onClose={onClose}>
      {order && (
        <>
          <div className="blk first">
            <div className="steps">
              {steps.map((s, i) => (
                <div key={s} className={`stp${i < cur ? ' dn' : i === cur ? ' nw' : ''}`}>
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="blk">
            <div className="orow">
              <div className="th" style={{ background: '#F5F5F5' }}>
                <Image src={order.image} alt={order.title} fill style={{ objectFit: 'cover' }} sizes="62px" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ptitle">{order.title}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--sub)', marginTop: 4 }}>
                  {order.shop} · {order.orderNo}
                </div>
              </div>
              <div className="pprice" style={{ display: 'block' }}>
                <i>NT$</i>
                <b style={{ fontSize: 17 }}>{nt(order.amount)}</b>
              </div>
            </div>
          </div>

          {order.cancelled ? (
            <div className="blk">
              <div className="kv">
                <span>狀態</span>
                <span style={{ color: 'var(--sub)' }}>訂單已結束</span>
              </div>
            </div>
          ) : order.type === 'b2c' ? (
            <div className="blk">
              <div className="kv">
                <span>付款</span>
                <span style={{ color: order.paymentStatus === 'paid' ? '#3FA34D' : 'var(--sub)' }}>
                  {order.paymentStatus === 'paid' ? '已完成' : '確認中'}
                </span>
              </div>
              <div className="kv">
                <span>物流單號</span>
                <span>{order.trackingNumber || '尚未出貨'}</span>
              </div>
              <div className="kv">
                <span>發票</span>
                <span>{order.paymentStatus === 'paid' ? '電子發票已開立' : '付款後開立'}</span>
              </div>
              {order.step === 3 && (
                <button type="button" className="btn" disabled={busy} onClick={() => call('shop_order_confirm_received', '已確認收貨')}>
                  確認收貨
                </button>
              )}
            </div>
          ) : (
            <>
              {order.step === 1 && (
                <>
                  <div className="blk">
                    <div className="cdown">
                      <div className="t">{left || '--:--'}</div>
                      <div className="l">逾時自動取消訂單</div>
                    </div>
                  </div>
                  {order.isBuyer && payInfo && (
                    <div className="blk">
                      <div className="secttl">匯款資訊</div>
                      {Object.entries(payInfo).map(([k, v]) => (
                        <div key={k} className="kv">
                          <span>{k}</span>
                          <span>{v}</span>
                        </div>
                      ))}
                      <div className="kv">
                        <span>應付金額</span>
                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>NT${nt(order.amount)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {(order.depositAmount ?? 0) > 0 && (
                <div className="blk">
                  <div className="kv">
                    <span>賣家保證金</span>
                    <span style={{ color: order.step >= 5 ? '#3FA34D' : 'var(--red)' }}>
                      {order.step >= 5 ? '已退還' : `鎖定中 ${nt(order.depositAmount!)}G`}
                    </span>
                  </div>
                  {order.step === 3 && (
                    <div className="kv">
                      <span>出貨期限</span>
                      <span>{order.overdueNotified ? '已逾時' : '賣家處理中'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 逾時未出貨：由買家自己按下申訴，平台不自動沒收 */}
              {order.isBuyer && order.step === 3 && order.overdueNotified && (
                <div className="blk">
                  <div className="kv">
                    <span>狀態</span>
                    <span style={{ color: 'var(--red)' }}>賣家逾時未出貨</span>
                  </div>
                  <div className="kv">
                    <span>可獲補償</span>
                    <span>{nt(order.depositAmount || 0)}G</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => call('sell_order_claim_compensation', '已申請補償')}
                  >
                    申訴並請求補償
                  </button>
                </div>
              )}

              {order.isBuyer && order.step === 4 && (
                <div className="blk">
                  <div className="kv">
                    <span>物流單號</span>
                    <span>{order.trackingNumber || '賣家未填'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => call('sell_order_confirm_received', '已確認收貨')}
                  >
                    確認收貨
                  </button>
                </div>
              )}

              {order.step === 5 && (
                <div className="blk">
                  <div className="kv">
                    <span>狀態</span>
                    <span style={{ color: '#3FA34D' }}>交易完成</span>
                  </div>
                  <div className="kv">
                    <span>賣家保證金</span>
                    <span>已退還</span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="blk">
            <a className="btn2" href={`/sell-orders/${order.id}`} style={{ display: 'block', textAlign: 'center' }}>
              查看完整訂單頁 ›
            </a>
          </div>
        </>
      )}
    </MarketSheet>
  );
}
