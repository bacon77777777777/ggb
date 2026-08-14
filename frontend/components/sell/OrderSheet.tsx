'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
  /** 規格名（原型 orow 第二行：`規格 · 數量 N`），沒有就只顯示數量 */
  spec?: string;
  qty?: number;
  isBuyer: boolean;
  payMethod?: string | null;
  createdAt: string;
  payDeadlineHours?: number;
};

const C2C_STEPS = ['待付款', '待確認收款', '待出貨', '待收貨', '完成'];
const B2C_STEPS = ['已付款', '備貨中', '已出貨', '完成'];

const nt = (n: number) => Math.round(n || 0).toLocaleString('zh-TW');

/**
 * 訂單詳情的內容與底欄（不含 MarketSheet 外殼）。
 *
 * 拆出來是因為原型的交互是**同一個彈層換內容**：
 * 商品詳情 → 選擇規格 → 訂單詳情都發生在同一片 sheet 裡（sheet() 直接換 innerHTML），
 * /sell 頁要嵌這份內容，/sell/orders 的獨立彈層也用同一份 —— 訂單 UI 永遠只有一份。
 */
export function useOrderSheetParts({
  order,
  onClose,
  onChanged,
}: {
  order: OrderLite | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const { user } = useAuth();
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

  const canPay = !!order && order.type === 'c2c' && order.isBuyer && order.step === 1 && !order.cancelled;

  const payFooter = canPay ? (
    <div className="abar">
      <button
        type="button"
        className="buy"
        disabled={busy}
        onClick={() => call('sell_order_mark_paid', '已回報匯款，等賣家確認')}
      >
        我已完成匯款
      </button>
    </div>
  ) : undefined;

  const body = order ? (
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
                  {order.spec ? `${order.spec} · ` : ''}數量 {order.qty || 1}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--sub)', marginTop: 2 }}>
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

                  {/* 收件資訊：預設帶「個人設定」填的收件人（老闆指定）。
                      賣家要照這裡出貨，下單後付款前就要讓買家確認 */}
                  {order.isBuyer && (
                    <div className="blk">
                      <div className="secttl">
                        收件資訊
                        <button
                          type="button"
                          onClick={() => router.push('/profile?tab=settings')}
                          style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--sub)', border: '1px solid var(--line2)', borderRadius: 8, padding: '4px 10px', background: '#fff' }}
                        >
                          更改
                        </button>
                      </div>
                      {(user as any)?.recipient_name || (user as any)?.recipient_phone || (user as any)?.recipient_address ? (
                        <>
                          <div className="kv">
                            <span>收件人</span>
                            <span>{String((user as any)?.recipient_name || '—')}</span>
                          </div>
                          <div className="kv">
                            <span>收件電話</span>
                            <span>{String((user as any)?.recipient_phone || '—')}</span>
                          </div>
                          <div className="kv">
                            <span>地址</span>
                            <span style={{ textAlign: 'right' }}>{String((user as any)?.recipient_address || '—')}</span>
                          </div>
                        </>
                      ) : (
                        <div className="kv">
                          <span style={{ color: 'var(--sub)' }}>尚未設定收件資訊，點「更改」到個人設定填寫</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {(order.depositAmount ?? 0) > 0 && (
                <div className="blk">
                  <div className="kv">
                    <span>賣家保證金</span>
                    <span style={{ color: order.step >= 5 ? '#3FA34D' : 'var(--red)' }}>
                      {order.step >= 5
                        ? '已退還'
                        : order.step === 1
                          ? `已收 ${nt(order.depositAmount!)}G`
                          : `鎖定中 ${nt(order.depositAmount!)}G`}
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

              {/* 取消訂單放內容最底（老闆指定）：次要且帶風險的動作不跟主要動作擠同一排 */}
              {canPay && (
                <div className="blk">
                  <button
                    type="button"
                    className="btn2"
                    style={{ margin: 0, width: '100%' }}
                    disabled={busy}
                    onClick={() => call('cancel_sell_order', '已取消訂單')}
                  >
                    取消訂單
                  </button>
                </div>
              )}
            </>
          )}

        </>
  ) : null;

  return { body, footer: payFooter };
}

export default function OrderSheet({
  order,
  onClose,
  onChanged,
}: {
  order: OrderLite | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { body, footer } = useOrderSheetParts({ order, onClose, onChanged });
  return (
    <MarketSheet open={!!order} title="訂單詳情" onClose={onClose} footer={footer}>
      {body}
    </MarketSheet>
  );
}
