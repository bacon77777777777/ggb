'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const faqs = [
  {
    category: '平台基本問題',
    items: [
      {
        q: '什麼是 GGB 吉吉比？',
        a: 'GGB 吉吉比是台灣正版潮玩線上平台，提供一番賞、轉蛋、盒玩、抽卡等多元玩法。廠商直接供貨，平台負責出貨，所有商品均為官方正版授權。'
      },
      {
        q: '如何開始抽獎？',
        a: '註冊並登入帳號後，前往「儲值」頁面購買代幣（1 代幣 = 1 元台幣），選擇喜歡的商品點選抽獎即可。代幣可依需求彈性儲值，沒有最低限額。'
      },
      {
        q: '抽獎結果公平嗎？怎麼驗證？',
        a: '每件商品在上架時會公開隨機種子（Seed），您可以在「公平驗證」頁面輸入您的籤號進行驗算，確認結果由數學決定、非人為操控。這是業界少見的完全公開透明機制。'
      },
    ]
  },
  {
    category: '帳號與代幣',
    items: [
      {
        q: '代幣有使用期限嗎？',
        a: '儲值的代幣沒有使用期限，可以長期保存。平台活動贈送的紅利代幣可能有使用期限，請留意活動說明。'
      },
      {
        q: '代幣可以退款嗎？',
        a: '代幣一經儲值即不接受退款。若發生重複扣款等金流異常，請於 24 小時內透過 LINE 官方帳號聯繫客服，我們將查明後協助處理。'
      },
      {
        q: '有哪些付款方式？',
        a: '目前支援信用卡、ATM 轉帳、超商代碼繳費（透過綠界 ECPay 金流處理）。'
      },
    ]
  },
  {
    category: '倉庫與出貨',
    items: [
      {
        q: '抽到的商品放在哪裡？',
        a: '中獎商品會自動存入您帳號的「倉庫（盒櫃）」，您可以在「個人中心 → 倉庫」頁面查看所有品項。'
      },
      {
        q: '倉庫商品可以放多久？',
        a: '倉庫提供 30 天免費寄存。第 31 天起，系統將自動分解未申請出貨的品項，並依原價退還代幣至您的帳戶。請務必在 30 天內申請出貨。'
      },
      {
        q: '運費怎麼算？多久可以收到？',
        a: '出貨運費依物流方式與件數計算，申請出貨時會顯示費用。一般宅配或超商取件約 3–7 個工作天送達（不含假日）。活動檔期可能稍有延遲。'
      },
      {
        q: '可以拆解（分解）商品換回代幣嗎？',
        a: '可以。在倉庫頁面選取品項後可申請分解，系統將退還原價代幣至您的帳戶。分解後無法還原，請確認再操作。'
      },
    ]
  },
  {
    category: '商品問題',
    items: [
      {
        q: '收到商品有缺件或不符，怎麼處理？',
        a: '請於收到商品 7 日內，透過 LINE 官方帳號聯繫客服，並提供訂單編號、完整開箱錄影（從未拆封外包裝到內容物）、缺件/問題照片。客服確認後將安排補寄或補代幣。'
      },
      {
        q: '商品外盒有輕微壓痕或刮痕算瑕疵嗎？',
        a: '商品於運送過程中可能產生輕微盒損，屬正常運送現象，不在補件範圍內。若為內容物損壞或缺件，請提供錄影佐證由客服判定。'
      },
    ]
  },
];

const CATEGORIES = ['代幣問題', '抽獎問題', '商品問題', '出貨問題', '帳號問題', '其他'] as const;

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<string | null>('0-0');
  const { user } = useAuth();

  const [form, setForm] = useState({ category: '', email: '', phone: '', content: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const toggle = (key: string) => setOpenIndex(openIndex === key ? null : key);

  const totalCount = faqs.reduce((acc, s) => acc + s.items.length, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/cs-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失敗');
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20">
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-4">

        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">常見問題</h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-bold">FAQ</p>
        </div>

        <div className="space-y-3">
          {faqs.map((section, si) => (
            <div key={si} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-100 dark:border-neutral-800">
                <h2 className="text-xs font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">{section.category}</h2>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {section.items.map((item, ii) => {
                  const key = `${si}-${ii}`;
                  const isOpen = openIndex === key;
                  return (
                    <div key={ii}>
                      <button
                        onClick={() => toggle(key)}
                        className="w-full px-5 py-4 flex items-start justify-between text-left gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <span className={cn('text-sm font-bold leading-relaxed', isOpen ? 'text-primary' : 'text-neutral-900 dark:text-white')}>
                          {item.q}
                        </span>
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                          : <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />}
                      </button>
                      <div className={cn('overflow-hidden transition-all duration-200', isOpen ? 'max-h-96' : 'max-h-0')}>
                        <p className="px-5 pb-4 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-1">聯絡我們</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">找不到答案？填寫表單，客服將於 1–2 個工作天內回覆。</p>

            {submitted ? (
              <div className="py-6 text-center">
                <p className="text-sm font-bold text-green-600 dark:text-green-400 mb-1">已收到您的回報！</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">客服將於 1–2 個工作天內以信箱或 LINE 回覆您。</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">回報類型</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    disabled={!user || submitting}
                    required
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">請選擇問題類型</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">聯絡信箱</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      disabled={!user || submitting}
                      required
                      placeholder="your@email.com"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">手機門號</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      disabled={!user || submitting}
                      required
                      placeholder="09xx-xxx-xxx"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">內容</label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    disabled={!user || submitting}
                    required
                    rows={4}
                    placeholder={!user ? '使用前請先登入' : '請詳細描述您的問題，包含訂單編號、發生時間等資訊有助於快速處理。'}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>

                {!user && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">請先登入才能提交表單。</p>
                )}
                {submitError && (
                  <p className="text-sm text-red-500 dark:text-red-400">{submitError}</p>
                )}

                <button
                  type="submit"
                  disabled={!user || submitting}
                  className="w-full py-3 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                  {submitting ? '提交中…' : '提交回報'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
