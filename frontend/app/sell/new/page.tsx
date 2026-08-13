'use client';

import '../market.css';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ImagePlus, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';

export const dynamic = 'force-dynamic';

/*
 * 我要上架 —— 版型照原型 sellForm()：.blk / .secttl / .f / .fin / .two /
 * .pick + .ck / .calcbox / .btn / .btn2，樣式在 ../market.css。
 *
 * 原型的表單只有「名稱／售價／數量／運費／收款方式／保證金／推廣」，
 * 但站上的 DB 還要求**類別**（sell_guard_listing 會擋白名單外的值）、
 * 而多圖與多規格是既有功能不能砍。這些欄位一律沿用原型的元件語彙
 * （.blk + .secttl + .fin），不另外發明樣式。
 *
 * 編輯模式（`?edit=<id>`）沿用：商城管理的「修改後重新送審」會帶這個參數進來。
 */

type ListingItem = { name: string; series: string; grade: string; image: string; quantity: string };

const DRAFT_KEY = 'sell:new:draft:v2';

const nt = (n: number) => Math.round(n || 0).toLocaleString('zh-TW');

export default function SellNewPage() {
  useFeatureGate('sell');

  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const editId = (() => {
    const n = Number(searchParams.get('edit'));
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  const [originalStatus, setOriginalStatus] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [shippingFee, setShippingFee] = useState(60);
  const [images, setImages] = useState<string[]>([]);
  const [items, setItems] = useState<ListingItem[]>([
    { name: '', series: '', grade: '', image: '', quantity: '1' },
  ]);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [payMethod, setPayMethod] = useState<'bank' | 'linepay'>('bank');
  const [tier, setTier] = useState<{ name: string; ratio: number; max_price: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ kind: 'cover' } | { kind: 'item'; index: number } | null>(null);

  useEffect(() => {
    if (!isLoading && !user?.id) router.replace('/login');
  }, [isLoading, router, user?.id]);

  // 類別白名單來自後台「商城設定」。DB trigger 會擋白名單外的值 ——
  // 前台一定要用同一份清單，不然玩家填完整頁才被拒絕，而且看不出哪裡錯
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from('platform_settings')
        .select('value')
        .eq('key', 'sell_category_whitelist')
        .maybeSingle();
      if (cancelled) return;
      try {
        const parsed = JSON.parse(String((data as any)?.value || '[]'));
        if (Array.isArray(parsed)) setCategories(parsed.map(String).filter(Boolean));
      } catch {
        setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 等級決定保證金比例與單件售價上限，兩者都要在送出前先講清楚
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: d }, { data: p }] = await Promise.all([
        supabase.rpc('sell_my_dashboard'),
        supabase.from('sell_seller_profiles').select('payout_method').eq('seller_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if ((d as any)?.success) {
        const t = (d as any).tier || {};
        setTier({
          name: String(t.name || '新手'),
          ratio: Number(t.ratio) || 100,
          max_price: Number(t.max_price) || 3000,
        });
      }
      const pm = String((p as any)?.payout_method || '');
      if (pm === 'bank' || pm === 'linepay') setPayMethod(pm);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // 草稿：填一半跳走回來不能歸零
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY) || '';
      if (!raw) return;
      const d = JSON.parse(raw);
      if ((Number(d?.editId) || null) !== editId) return;
      setTitle(String(d.title || ''));
      setPrice(String(d.price || ''));
      setNote(String(d.note || ''));
      setCategory(String(d.category || ''));
      setShippingFee(Number(d.shippingFee ?? 60));
      if (Array.isArray(d.images)) setImages(d.images.map(String));
      if (Array.isArray(d.items) && d.items.length) setItems(d.items);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ editId, title, price, note, category, shippingFee, images, items })
      );
    } catch {}
  }, [editId, title, price, note, category, shippingFee, images, items]);

  // 編輯模式載入
  useEffect(() => {
    if (!editId || !user?.id) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY) || '';
      if (raw && (Number(JSON.parse(raw)?.editId) || null) === editId) return;
    } catch {}
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from('sell_listings')
        .select('title, price, shipping_fee, note, category, status, images, items')
        .eq('id', editId)
        .eq('seller_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        showToast('找不到這筆上架', 'plain');
        router.replace('/sell/manage');
        return;
      }
      const d = data as any;
      setTitle(String(d.title || ''));
      setPrice(String(d.price ?? ''));
      setShippingFee(Number(d.shipping_fee ?? 60));
      setNote(String(d.note || ''));
      setCategory(String(d.category || ''));
      setOriginalStatus(String(d.status || ''));
      setImages((Array.isArray(d.images) ? d.images : []).map((x: any) => String(x || '')).filter(Boolean));
      const its = Array.isArray(d.items) ? d.items : [];
      setItems(
        its.length
          ? its.map((x: any) => ({
              name: String(x?.name || ''),
              series: String(x?.series || ''),
              grade: String(x?.grade || ''),
              image: String(x?.image || ''),
              quantity: String(x?.quantity ?? '1'),
            }))
          : [{ name: '', series: '', grade: '', image: '', quantity: '1' }]
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, router, showToast, user?.id]);

  const uploadImage = async (file: File) => {
    if (!user?.id) throw new Error('請先登入');
    if (file.size > 8 * 1024 * 1024) throw new Error('圖片太大（上限 8MB）');
    if (!file.type.startsWith('image/')) throw new Error('只能上傳圖片');

    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    const form = new FormData();
    form.append('file', file);
    form.append('bucket', 'marketplace');
    form.append('path', `${user.id}/sell/${Date.now()}-${id}`);
    const res = await fetch('/api/upload/image', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '上傳失敗');
    const { publicUrl } = await res.json();
    if (!publicUrl) throw new Error('上傳失敗');
    return publicUrl as string;
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || !uploadTarget) return;
    setIsUploading(true);
    try {
      const url = await uploadImage(file);
      if (uploadTarget.kind === 'cover') setImages((prev) => [...prev, url].slice(0, 8));
      else setItems((prev) => prev.map((it, i) => (i === uploadTarget.index ? { ...it, image: url } : it)));
    } catch (e: any) {
      showToast(e?.message || '上傳失敗', 'plain');
    } finally {
      setIsUploading(false);
      setUploadTarget(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openPicker = (t: { kind: 'cover' } | { kind: 'item'; index: number }) => {
    setUploadTarget(t);
    fileRef.current?.click();
  };

  const p = Number(price) || 0;
  const deposit = tier ? Math.ceil((p * tier.ratio) / 100) : 0;
  const overCap = !!tier && p > tier.max_price;

  const canSubmit = useMemo(() => {
    if (!user?.id || isSaving) return false;
    if (!title.trim() || !category.trim()) return false;
    if (!(p > 0) || overCap) return false;
    return items.some((it) => it.name.trim() && Number(it.quantity) >= 1);
  }, [user?.id, isSaving, title, category, p, overCap, items]);

  const submit = async () => {
    if (!canSubmit || !user?.id) return;
    setIsSaving(true);
    try {
      const supabase = createClient();
      const cleanItems = items
        .map((it) => ({
          name: it.name.trim(),
          series: it.series.trim(),
          grade: it.grade.trim(),
          image: it.image.trim(),
          quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
          price: Math.round(p),
        }))
        .filter((it) => it.name);

      const payload = {
        price: Math.round(p),
        shipping_fee: shippingFee,
        title: title.trim(),
        note: note.trim(),
        category: category.trim(),
        images,
        items: cleanItems,
      };

      if (editId) {
        const patch: Record<string, unknown> = { ...payload, updated_at: new Date().toISOString() };
        // 被退回／已下架的改完要重新送審；上架中的不帶 status ——
        // DB 防換餌 trigger 看到內容變了會自己退回待審
        if (originalStatus === 'rejected' || originalStatus === 'removed') patch.status = 'pending';
        const { error } = await supabase
          .from('sell_listings')
          .update(patch as any)
          .eq('id', editId)
          .eq('seller_id', user.id);
        if (error) throw error;
        try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
        showToast('已重新送審，審核通過後就會恢復上架', 'plain');
        router.replace('/sell/manage');
        return;
      }

      const { error } = await supabase.from('sell_listings').insert({ seller_id: user.id, ...payload } as any);
      if (error) throw error;
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      showToast('已送出審核，通過後就會上架', 'plain');
      router.replace('/sell/manage');
    } catch (e: any) {
      showToast(e?.message || '送出失敗', 'plain');
    } finally {
      setIsSaving(false);
    }
  };

  const SHIP_OPTIONS: { v: number; label: string; sub: string }[] = [
    { v: 60, label: '交貨便 60', sub: '買家付' },
    { v: 80, label: '宅配 80', sub: '買家付' },
    { v: 0, label: '免運費', sub: '你自己吸收' },
    { v: -1, label: '自訂金額', sub: '下方輸入' },
  ];
  const isCustomShip = shippingFee !== 0 && shippingFee !== 60 && shippingFee !== 80;

  return (
    <div className="mk min-h-screen pb-6">
      <div className="hdr plain sticky top-0 z-40 flex items-center gap-2">
        <button type="button" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1">{editId ? '修改上架' : '我要上架'}</h1>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPickFile(e.target.files?.[0])}
      />

      {/* ── 基本資料 ── */}
      <div className="blk first">
        <label className="f">商品名稱</label>
        <input
          className="fin"
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：航海王 一番賞 B賞 魯夫 五檔"
        />

        <div className="two" style={{ marginTop: 14 }}>
          <div>
            <label className="f">售價 NT$</label>
            <input
              className="fin"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="3200"
            />
          </div>
          <div>
            <label className="f">數量</label>
            <input
              className="fin"
              inputMode="numeric"
              value={items[0]?.quantity ?? '1'}
              onChange={(e) =>
                setItems((prev) =>
                  prev.map((it, i) => (i === 0 ? { ...it, quantity: e.target.value.replace(/[^\d]/g, '') } : it))
                )
              }
            />
          </div>
        </div>
      </div>

      {/* ── 類別（DB 必填，原型沒有，用同一套元件補）── */}
      <div className="blk">
        <div className="secttl">類別</div>
        <div className="kwchips">
          {categories.map((c) => (
            <button key={c} type="button" className="kw" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── 商品圖 ── */}
      <div className="blk">
        <div className="secttl">商品圖</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {images.map((url, i) => (
            <div
              key={`${url}-${i}`}
              style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#F5F5F5' }}
            >
              <Image src={url} alt="" fill style={{ objectFit: 'cover' }} sizes="80px" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, xi) => xi !== i))}
                aria-label="移除"
                style={{
                  position: 'absolute', right: 2, top: 2, width: 18, height: 18, borderRadius: '50%',
                  background: 'rgba(0,0,0,.5)', color: '#fff', display: 'grid', placeItems: 'center',
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {images.length < 8 && (
            <button
              type="button"
              onClick={() => openPicker({ kind: 'cover' })}
              disabled={isUploading}
              style={{
                width: 80, height: 80, borderRadius: 8, border: '1px dashed #E5E5E5',
                display: 'grid', placeItems: 'center', color: '#BFBFBF', background: '#F7F7F7',
              }}
            >
              <ImagePlus className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="hint">第一張會當作商品主圖，建議 1:1 比例。</p>
      </div>

      {/* ── 商品描述 ── */}
      <div className="blk">
        <div className="secttl">商品描述</div>
        <textarea
          className="fin"
          rows={4}
          value={note}
          maxLength={3000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="卡況、保存方式、出貨時間…"
          style={{ resize: 'none' }}
        />
      </div>

      {/* ── 規格（站上既有功能，原型沒有）── */}
      <div className="blk">
        <div className="secttl">規格</div>
        {items.map((it, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div className="two">
              <input
                className="fin"
                value={it.name}
                onChange={(e) => setItems((prev) => prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                placeholder={`規格名稱${i === 0 ? '（必填）' : ''}`}
              />
              <input
                className="fin"
                inputMode="numeric"
                value={it.quantity}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((x, xi) => (xi === i ? { ...x, quantity: e.target.value.replace(/[^\d]/g, '') } : x))
                  )
                }
                placeholder="數量"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => openPicker({ kind: 'item', index: i })}
                disabled={isUploading}
                style={{
                  width: 56, height: 56, borderRadius: 8, border: '1px dashed #E5E5E5', background: '#F7F7F7',
                  display: 'grid', placeItems: 'center', color: '#BFBFBF', position: 'relative', overflow: 'hidden',
                }}
              >
                {it.image ? (
                  <Image src={it.image} alt="" fill style={{ objectFit: 'cover' }} sizes="56px" />
                ) : (
                  <ImagePlus className="w-4 h-4" />
                )}
              </button>
              {items.length > 1 && (
                <button
                  type="button"
                  className="btn2"
                  style={{ margin: 0, width: 'auto', padding: '8px 14px' }}
                  onClick={() => setItems((prev) => prev.filter((_, xi) => xi !== i))}
                >
                  移除
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn2"
          onClick={() => setItems((prev) => [...prev, { name: '', series: '', grade: '', image: '', quantity: '1' }])}
        >
          + 加一個規格
        </button>
      </div>

      {/* ── 運費 ── */}
      <div className="blk">
        <div className="secttl">運費</div>
        <div className="two">
          {SHIP_OPTIONS.map((o) => {
            const active = o.v === -1 ? isCustomShip : shippingFee === o.v;
            return (
              <button
                key={o.v}
                type="button"
                className="pick"
                aria-pressed={active}
                onClick={() => setShippingFee(o.v === -1 ? 100 : o.v)}
              >
                <span className="ck" />
                {o.label}
                <small>{o.sub}</small>
              </button>
            );
          })}
        </div>
        {isCustomShip && (
          <input
            className="fin"
            style={{ marginTop: 9 }}
            inputMode="numeric"
            value={String(shippingFee)}
            onChange={(e) => setShippingFee(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
            placeholder="自訂運費金額"
          />
        )}
        <p className="sumline">
          {p > 0
            ? `買家結帳 NT$${nt(p + shippingFee)}（售價 ${nt(p)}${shippingFee ? ` + 運費 ${nt(shippingFee)}` : '，免運費'}）`
            : '買家結帳金額 = 售價 + 運費'}
        </p>
      </div>

      {/* ── 收款方式 ── */}
      <div className="blk">
        <div className="secttl">收款方式</div>
        <div className="two">
          {(
            [
              ['bank', '銀行轉帳', '在收款設定填帳號'],
              ['linepay', 'LINE Pay', '在收款設定填 ID'],
            ] as const
          ).map(([v, label, sub]) => (
            <button
              key={v}
              type="button"
              className="pick"
              aria-pressed={payMethod === v}
              onClick={() => setPayMethod(v)}
            >
              <span className="ck" />
              {label}
              <small>{sub}</small>
            </button>
          ))}
        </div>
        <p className="hint">
          只能選一種，買家不能自己挑。改這裡不會存檔，請到{' '}
          <button
            type="button"
            onClick={() => router.push('/sell/settings')}
            style={{ color: 'var(--red)', fontWeight: 700 }}
          >
            收款設定
          </button>{' '}
          填寫帳號。
        </p>
      </div>

      {/* ── 保證金 ── */}
      <div className="blk">
        <div className="secttl">保證金</div>
        <div className="calcbox">
          <div className="l">賣出時收取</div>
          <div className="v" style={overCap ? { color: 'var(--red)' } : undefined}>
            {!p ? '填售價後顯示' : overCap ? '超過可賣價格' : `${nt(deposit)} G`}
          </div>
          <div className="s">
            {overCap && tier
              ? `「${tier.name}」單件最高賣 ${nt(tier.max_price)}，多賣幾單升級後解鎖`
              : tier
                ? `你是「${tier.name}」賣家，保證金為售價 ${tier.ratio}%。運費不計入，買家確認收貨後全額退還`
                : '載入中'}
          </div>
        </div>
      </div>

      {/* ── 推廣 ── */}
      <div className="blk">
        <div className="secttl">推廣（選填）</div>
        <button type="button" className="btn2" style={{ marginTop: 0 }} onClick={() => router.push('/sell/ads')}>
          前往廣告中心 ›
        </button>
        <button type="button" className="btn" disabled={!canSubmit} onClick={submit}>
          {isSaving ? '送出中…' : editId ? '重新送審' : '送出審核'}
        </button>
      </div>
    </div>
  );
}
