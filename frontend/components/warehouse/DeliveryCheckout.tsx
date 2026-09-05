'use client';

/*
 * 倉庫配送結帳 —— 跟「購買確認」彈窗同一套外觀（老闆 2026-09-02：
 * 「彈窗要保持一樣、不要創新，只有裡面欄位變，主按鈕也是要跟確認購買一樣」）。
 *
 * 外殼、灰底圓角列、小計區塊、紅色確認鈕全都照抄
 * components/shop/PurchaseConfirmationModal.tsx；子頁（配送方式／運費優惠券）
 * 走跟優惠券選擇一樣的 view 切換，不另開彈層。開著時鎖 body 捲動。
 *
 * 欄位對照：配送商品（可展開，預設收起）→ 配送方式 → 收件資訊 → 備註
 * → 運費優惠券 → 小計（件數／運費＋免運提示／折抵／實付金額）→ 按住確認支付。
 *
 * 這支只管畫面與互動；資料與提交都在 profile（單一資料源：users 的收件欄位，
 * 跟設定頁同一份，這裡改了設定頁跟著變）。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, ChevronDown, Ticket, Loader2, Check } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { asset } from '@/lib/asset';
import { GAmount } from '@/components/shop/PurchaseConfirmationModal';
import { HoldToConfirmButton } from '@/components/ui/HoldToConfirmButton';
import { AddressInfo } from '@/components/ui/AddressInfo';
import { calcShippingDiscount, shippingCouponLabel, type ShippingDiscountType } from '@/lib/shippingCoupon';

export type ShippingCoupon = {
  id: string;            // user_coupons.id（uuid）
  title: string;
  discountType: ShippingDiscountType; // fixed 折抵 G 上限｜percentage 運費 N%｜free_shipping 整筆免運（migration 696）
  discountValue: number;
  expiryDate: string | null;
};

export type DeliveryMethod = { type: 'HOME' | 'CVS'; subtype: 'UNIMART' | 'FAMI' | 'HILIFE' | 'OKMART' | null };

export type DeliveryItem = { name: string; image: string; grade: string };

const METHOD_OPTIONS: { key: string; type: 'HOME' | 'CVS'; subtype: DeliveryMethod['subtype']; label: string; sub: string }[] = [
  { key: 'UNIMART', type: 'CVS', subtype: 'UNIMART', label: '7-11 交貨便', sub: '取貨門市' },
  { key: 'FAMI',    type: 'CVS', subtype: 'FAMI',    label: '全家店到店', sub: '取貨門市' },
  { key: 'HILIFE',  type: 'CVS', subtype: 'HILIFE',  label: '萊爾富店到店', sub: '取貨門市' },
  { key: 'OKMART',  type: 'CVS', subtype: 'OKMART',  label: 'OK 超商店到店', sub: '取貨門市' },
  { key: 'HOME',    type: 'HOME', subtype: null,      label: '宅配到府', sub: '收件地址' },
];

export type AddressOption = { id: string; name: string; phone: string; address: string; isDefault: boolean };

export function DeliveryCheckout({
  open, onClose,
  items = [], itemCount, freeHint,
  method, methodLabel,
  feeOf, grossFee, discount, lotteryTotal, payable,
  address, store,
  addressOptions = [], addressId = null, onPickAddress, canAddAddress = true,
  note, onNoteChange,
  coupons, couponId, onCouponSelect,
  submitting,
  onPickMethod, onEditAddress, onChangeStore,
  onSubmit, onAbort,
}: {
  open: boolean;
  onClose: () => void;
  /** 這次要配送的品項（展開列表用；同名同賞等會合併計數） */
  items: DeliveryItem[];
  itemCount: number;
  /** 「再加 N 件可免運」；null 不顯示 */
  freeHint: string | null;
  method: DeliveryMethod;
  methodLabel: string;
  /** 各選項的運費（顯示在選項列右側；免運回 0） */
  feeOf: (opt: DeliveryMethod) => number;
  grossFee: number;
  discount: number;
  lotteryTotal: number;
  payable: number;
  address: { name: string; phone: string; address: string };
  store: { id: string; name: string; address: string } | null;
  /** 地址簿（最多三筆）；空陣列時只剩「新增」 */
  addressOptions?: AddressOption[];
  /** 本次配送選用的那筆（user_addresses.id） */
  addressId?: string | null;
  onPickAddress?: (id: string) => void;
  canAddAddress?: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  coupons: ShippingCoupon[];
  couponId: string | null;
  onCouponSelect: (id: string | null) => void;
  submitting: boolean;
  onPickMethod: (m: DeliveryMethod) => void;
  onEditAddress: () => void;
  onChangeStore: () => void;
  onSubmit: () => void;
  onAbort: () => void;
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [view, setView] = useState<'confirm' | 'method' | 'address' | 'coupon'>('confirm');
  const [itemsOpen, setItemsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [lockedH, setLockedH] = useState<number | null>(null);

  // 開啟時重置＋鎖 body 捲動（照購買確認）：彈窗開著後面頁面不准跟著捲
  useEffect(() => {
    if (!open) return;
    setView('confirm');
    setItemsOpen(false);
    // html＋body 一起鎖：iOS 只鎖 body 時，觸控捲動會鏈到 html 繼續帶動整頁
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 開啟後量一次高度鎖住（手機版）：展開配送商品往「下」長、彈窗內捲動，
  // 頂邊不動（老闆 2026-09-02：「展開商品不要往上，彈窗就固定高度了」）
  useEffect(() => {
    if (!open || isDesktop) { setLockedH(null); return; }
    const id = requestAnimationFrame(() => {
      const el = sheetRef.current;
      if (el) setLockedH(el.getBoundingClientRect().height);
    });
    return () => cancelAnimationFrame(id);
  }, [open, isDesktop]);

  // 同名同賞等合併成一列 ×N（商城結帳的品項列就是這樣）
  const grouped = useMemo(() => {
    const map = new Map<string, DeliveryItem & { qty: number }>();
    for (const it of items) {
      const key = `${it.name}|${it.grade}|${it.image}`;
      const g = map.get(key);
      if (g) g.qty += 1;
      else map.set(key, { ...it, qty: 1 });
    }
    return [...map.values()];
  }, [items]);

  const hasAddress = method.type === 'HOME'
    ? !!(address.name && address.phone && address.address)
    : !!store?.id;
  const chosenOpt = addressOptions.find(a => a.id === addressId) ?? null;
  const selectedCoupon = coupons.find(c => c.id === couponId) ?? null;

  const rowCls = cn('bg-neutral-50 dark:bg-neutral-800/50 rounded-xl', isDesktop ? 'p-4' : 'p-3');
  const labelCls = cn('font-bold text-neutral-700 dark:text-neutral-300', isDesktop ? 'text-[15px]' : 'text-[13px]');
  const pickCls = 'flex items-center gap-1 text-[13px] md:text-[15px] font-bold text-neutral-400 hover:text-neutral-600 transition-colors group';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!submitting) onClose(); }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] touch-none"
          />
          <motion.div
            initial={{ opacity: 0, y: isDesktop ? 0 : '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isDesktop ? 0 : '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            ref={sheetRef}
            style={!isDesktop && lockedH ? { height: lockedH } : undefined}
            className={cn(
              'fixed z-[81] bg-white dark:bg-[#1a1b1e] flex flex-col max-h-[90vh] overflow-hidden',
              isDesktop
                ? 'inset-0 m-auto w-[480px] h-fit rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl'
                : 'left-0 right-0 bottom-0 rounded-t-2xl border-t border-neutral-200 dark:border-white/10'
            )}
          >
            {/* Header —— 同購買確認 */}
            <div className={cn(
              'flex justify-between items-center border-b border-neutral-100 dark:border-neutral-800',
              isDesktop ? 'px-6 py-4' : 'px-4 py-3'
            )}>
              <div className="flex items-center gap-2">
                {view !== 'confirm' && (
                  <button
                    onClick={() => setView('confirm')}
                    className="p-1 -ml-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <h3 className={cn('font-black text-neutral-900 dark:text-white', isDesktop ? 'text-xl' : 'text-base')}>
                  {view === 'method' ? '配送方式' : view === 'address' ? '收件地址' : view === 'coupon' ? '運費優惠券' : '結帳'}
                </h3>
              </div>
              <button
                onClick={() => { if (!submitting) onClose(); }}
                className="p-1 -mr-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-transform"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content：overscroll-contain 擋捲動鏈，捲到底不會把後面頁面帶著捲 */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {view === 'confirm' && (
                <div className={cn('space-y-2', isDesktop ? 'p-6 space-y-4' : 'p-3')}>
                  {/* 配送商品：預設收起，點開看品項列 */}
                  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setItemsOpen(v => !v)}
                      className={cn('w-full flex items-center justify-between', isDesktop ? 'p-4' : 'p-3')}
                    >
                      <span className={labelCls}>配送商品</span>
                      <span className="flex items-center gap-1 text-[13px] md:text-[15px] font-bold text-neutral-400">
                        {itemCount} 件
                        <ChevronDown className={cn('w-4 h-4 transition-transform', itemsOpen && 'rotate-180')} />
                      </span>
                    </button>
                    {itemsOpen && (
                      <div className={cn('space-y-3', isDesktop ? 'px-4 pb-4' : 'px-3 pb-3')}>
                        {grouped.map((g, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="relative w-12 h-12 bg-white dark:bg-neutral-800 rounded-lg overflow-hidden shrink-0 border border-neutral-100 dark:border-neutral-700">
                              <Image
                                src={g.image || asset('/images/item_defaulet.webp')}
                                alt={g.name}
                                fill
                                className="object-contain"
                                unoptimized
                                onError={(e) => {
                                  const t = e.target as HTMLImageElement;
                                  t.srcset = asset('/images/item_defaulet.webp');
                                  t.src = asset('/images/item_defaulet.webp');
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              {/* line-clamp 是 overflow:hidden，行高不足時 ⑪ 這類全高字符會被削頭削腳 */}
                              <p className="text-[13px] font-bold text-neutral-900 dark:text-white leading-relaxed line-clamp-2">{g.name}</p>
                              {g.grade && (
                                <span className="mt-1 inline-block px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                                  {g.grade}
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 text-[12px] font-bold text-neutral-400">×{g.qty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 配送方式 */}
                  <div className={cn(rowCls, 'flex items-center justify-between')}>
                    <span className={labelCls}>配送方式</span>
                    <button type="button" onClick={() => setView('method')} className={pickCls}>
                      {methodLabel}
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  {/* 收件資訊（跟設定頁同一份資料） */}
                  <div className={rowCls}>
                    <div className="flex items-center justify-between">
                      <span className={labelCls}>{method.type === 'HOME' ? '收件地址' : '取貨門市'}</span>
                      <button
                        type="button"
                        onClick={
                          method.type === 'CVS' ? onChangeStore
                            : hasAddress ? () => setView('address')
                            : onEditAddress
                        }
                        className={pickCls}
                      >
                        {hasAddress ? '變更' : method.type === 'HOME' ? '新增收件地址' : '選擇取貨門市'}
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                    {hasAddress && (
                      <AddressInfo
                        className="mt-2"
                        name={address.name}
                        phone={address.phone}
                        address={method.type === 'HOME' ? address.address : `${store!.name}－${store!.address}`}
                        isDefault={method.type === 'HOME' && !!chosenOpt?.isDefault}
                      />
                    )}
                  </div>

                  {/* 備註 */}
                  <div className={cn(rowCls, 'flex items-center justify-between gap-3')}>
                    <span className={cn(labelCls, 'shrink-0')}>備註</span>
                    <input
                      value={note}
                      maxLength={100}
                      placeholder="留言給出貨人員（選填）"
                      onChange={e => onNoteChange(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-right text-[13px] md:text-[15px] font-bold text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none"
                    />
                  </div>

                  {/* 運費優惠券 */}
                  <div className={cn(rowCls, 'flex items-center justify-between')}>
                    <span className={labelCls}>運費優惠券</span>
                    <button type="button" onClick={() => setView('coupon')} className={pickCls}>
                      {selectedCoupon ? (
                        <span className="text-accent-red">−{discount.toLocaleString()} G</span>
                      ) : coupons.length > 0 ? '選擇優惠券' : '無可用'}
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  {/* 小計 —— 同購買確認的 Subtotal Block */}
                  <div className={cn('bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-2 mb-3', isDesktop ? 'p-6 space-y-4' : 'p-3')}>
                    <div className={cn('flex justify-between items-center font-bold text-neutral-500 dark:text-neutral-400', isDesktop ? 'text-[15px]' : 'text-[13px]')}>
                      <span>配送件數</span>
                      <span className="text-neutral-900 dark:text-neutral-100">{itemCount} 件</span>
                    </div>
                    <div className={cn('flex justify-between items-center font-bold text-neutral-500 dark:text-neutral-400', isDesktop ? 'text-[15px]' : 'text-[13px]')}>
                      <span className="flex min-w-0 items-center gap-2">
                        運費
                        {freeHint && (
                          <span className="min-w-0 truncate text-[11px] md:text-[12px] font-bold text-accent-red">{freeHint}</span>
                        )}
                      </span>
                      {grossFee > 0
                        ? <GAmount value={grossFee} plain className="text-neutral-900 dark:text-neutral-100" />
                        : <span className="text-emerald-600 font-black">免運費</span>}
                    </div>
                    {discount > 0 && (
                      <div className={cn('flex justify-between items-center font-bold text-accent-red', isDesktop ? 'text-[15px]' : 'text-[13px]')}>
                        <span>優惠折抵</span>
                        <GAmount value={discount} negative />
                      </div>
                    )}
                    {lotteryTotal > 0 && (
                      <div className={cn('flex justify-between items-center font-bold text-neutral-500 dark:text-neutral-400', isDesktop ? 'text-[15px]' : 'text-[13px]')}>
                        <span>抽籤價金</span>
                        <GAmount value={lotteryTotal} plain className="text-neutral-900 dark:text-neutral-100" />
                      </div>
                    )}

                    <div className="h-px bg-neutral-200 dark:bg-neutral-700 border-dashed w-full my-1" />

                    <div className="flex justify-between items-end text-base font-black text-accent-red">
                      <span className={cn('font-bold', isDesktop ? 'text-[15px]' : 'text-[13px]')}>實付金額</span>
                      <GAmount value={payable} iconSize={isDesktop ? 24 : 18} strong className={cn('leading-none', isDesktop ? 'text-3xl' : 'text-xl')} />
                    </div>
                  </div>
                </div>
              )}

              {/* 配送方式子頁 —— 同優惠券選擇的卡片列 */}
              {view === 'method' && (
                <div className="p-4 space-y-3">
                  {METHOD_OPTIONS.map(o => {
                    const fee = feeOf({ type: o.type, subtype: o.subtype });
                    const active = o.type === method.type && (o.type === 'HOME' || o.subtype === method.subtype);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => { onPickMethod({ type: o.type, subtype: o.subtype }); setView('confirm'); }}
                        className={cn(
                          'w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden',
                          active
                            ? 'border-accent-red bg-accent-red/5'
                            : 'border-neutral-200 bg-white md:hover:border-accent-red/50 dark:border-neutral-800 dark:bg-neutral-900'
                        )}
                      >
                        <div className="flex items-center justify-between pr-8">
                          <div>
                            <span className={cn('font-black', active ? 'text-accent-red' : 'text-neutral-900 dark:text-white')}>{o.label}</span>
                            <div className="text-xs text-neutral-400 mt-0.5 font-bold">{o.sub}</div>
                          </div>
                          {fee > 0
                            ? <GAmount value={fee} plain className="text-[13px] font-bold text-neutral-500" />
                            : <span className="text-[13px] font-black text-emerald-600">免運費</span>}
                        </div>
                        {active && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-accent-red text-white rounded-full p-1">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 收件地址子頁 —— 地址簿（最多三筆）當選項卡，跟配送方式同一套 */}
              {view === 'address' && (
                <div className="p-4 space-y-3">
                  {addressOptions.map(a => {
                    const active = a.id === addressId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => { onPickAddress?.(a.id); setView('confirm'); }}
                        className={cn(
                          'w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden',
                          active
                            ? 'border-accent-red bg-accent-red/5'
                            : 'border-neutral-200 bg-white md:hover:border-accent-red/50 dark:border-neutral-800 dark:bg-neutral-900'
                        )}
                      >
                        <div className="pr-8">
                          <AddressInfo name={a.name} phone={a.phone} address={a.address} isDefault={a.isDefault} />
                        </div>
                        {active && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-accent-red text-white rounded-full p-1">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {canAddAddress && (
                    <button
                      type="button"
                      onClick={onEditAddress}
                      className="w-full p-4 rounded-xl border-2 border-dashed text-center transition-all border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 font-bold text-neutral-500"
                    >
                      ＋ 新增收件地址
                    </button>
                  )}
                </div>
              )}

              {/* 運費優惠券子頁 —— 同購買確認的優惠券選擇 */}
              {view === 'coupon' && (
                <div className="p-4 space-y-3">
                  {coupons.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <Ticket className="w-12 h-12 mb-3 opacity-20" />
                      <span className="text-sm font-bold">暫無可用運費優惠券</span>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { onCouponSelect(null); setView('confirm'); }}
                        className={cn(
                          'w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden',
                          couponId === null
                            ? 'border-neutral-900 bg-neutral-50 dark:bg-neutral-800 dark:border-white'
                            : 'border-neutral-200 bg-white md:hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
                        )}
                      >
                        <span className="font-bold text-neutral-900 dark:text-white">不使用優惠券</span>
                        {couponId === null && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full p-1">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                      {coupons.map(c => {
                        const isSelected = couponId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { onCouponSelect(c.id); setView('confirm'); }}
                            className={cn(
                              'w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden',
                              isSelected
                                ? 'border-accent-red bg-accent-red/5'
                                : 'border-neutral-200 bg-white md:hover:border-accent-red/50 dark:border-neutral-800 dark:bg-neutral-900'
                            )}
                          >
                            <div className={cn('font-black text-lg mb-1', isSelected ? 'text-accent-red' : 'text-neutral-900 dark:text-white')}>
                              {c.title}
                            </div>
                            <div className={cn('text-sm font-bold', isSelected ? 'text-accent-red/80' : 'text-neutral-500')}>
                              {shippingCouponLabel(c.discountType, c.discountValue)}
                              {c.discountType !== 'fixed' && grossFee > 0
                                ? `（這筆折 ${calcShippingDiscount(c.discountType, c.discountValue, grossFee).toLocaleString()} G）`
                                : ''}
                            </div>
                            {c.expiryDate && (
                              <div className="text-xs text-neutral-400 mt-1">{c.expiryDate.slice(0, 10)} 到期</div>
                            )}
                            {isSelected && (
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-accent-red text-white rounded-full p-1">
                                <Check className="w-4 h-4" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer —— 同購買確認：紅色主鈕，但保留按住集氣防手滑 */}
            {view === 'confirm' && (
              <div className={cn(
                'bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-10 flex items-center justify-center mt-auto',
                isDesktop ? 'h-24 px-6 rounded-b-[24px]' : 'min-h-16 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]'
              )}>
                <HoldToConfirmButton
                  onConfirm={onSubmit}
                  onAbort={onAbort}
                  disabled={submitting || !hasAddress}
                  className={cn(
                    'w-full rounded-xl font-black shadow-xl transition-all flex items-center justify-center',
                    isDesktop ? 'h-[52px] text-lg' : 'h-[44px] text-base',
                    'bg-accent-red text-white shadow-accent-red/20 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none'
                  )}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />處理中...</span>
                  ) : payable > 0 ? (
                    <span className="flex items-center justify-center gap-1.5">確認支付 <GAmount value={payable} iconSize={16} strong /></span>
                  ) : (
                    '確認送出'
                  )}
                </HoldToConfirmButton>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default DeliveryCheckout;
