'use client';

import { useState } from 'react';
import Link from 'next/link';
import { normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 常見問題
 *
 * 這一頁的職責：玩家實際會卡住的操作問題。
 *
 * 刻意不放的東西：
 * - 「什麼是 GGB」—— 那在關於我們，兩邊各寫一次的話第二次沒人會讀
 * - 規則的完整條文 —— 那在會員條款與退換貨資訊，這裡只講一句話結論再連過去
 *
 * 答案用 ReactNode 而不是字串，才連得到對應的頁面。與其把退換貨規則
 * 在這裡再抄一份（然後兩邊遲早不一致），不如講重點並指過去。
 */

type Faq = { q: string; a: React.ReactNode };

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-primary font-bold underline underline-offset-2">{children}</Link>
);

const faqs: { category: string; items: Faq[] }[] = [
  {
    category: '新手上路',
    items: [
      {
        q: '第一次來，要怎麼開始？',
        a: <>註冊登入之後，先到<L href="/topup">儲值</L>買代幣，再挑一檔喜歡的商品按下去就開始了。儲值面額 NT$100 起，想先小額試試看也可以。</>,
      },
      {
        q: '有哪些玩法？',
        a: <>一番賞、轉蛋、盒玩、抽卡、自製賞，另外還有每日<L href="/mission">簽到</L>與任務可以拿回饋。首頁上方的分類頁籤就是目前有開放的玩法，沒開放的不會顯示。</>,
      },
      {
        q: '代幣是什麼？跟積分一樣嗎？',
        a: <>不一樣。代幣是儲值換來的，用來抽獎；積分是簽到、任務、活動送的回饋，部分商品可以折抵。抽獎前的確認視窗會顯示這一次可不可以用積分。</>,
      },
    ],
  },
  {
    category: '抽獎與公平性',
    items: [
      {
        q: '怎麼知道抽獎沒有被動手腳？',
        a: <>一番賞、抽卡、自製賞這類有籤號的玩法，我們在開賣前就把每一支籤對應到哪個獎品排定並封存，同時在商品頁公布一組驗證碼。這一檔結束後對照表會完整公開，你可以自己算一次核對 —— 中途改過一個字，算出來就對不上。商品頁的「公平驗證」區塊按進去就看得到。</>,
      },
      {
        q: '轉蛋和盒玩也可以這樣驗嗎？',
        a: <>不行，那兩種沒有籤號。轉蛋與盒玩是每一抽即時決定結果，所以走的是另一套：每一檔的獎品內容與剩餘數量都公開在商品頁上，抽掉幾隻就少幾隻，即時更新。</>,
      },
      {
        q: '怎麼知道還剩下什麼？',
        a: <>商品頁的獎品列表會列出這一檔全部的獎項，每個獎項旁邊標著總數與剩餘數，被抽走一個就少一個，即時更新。剩幾個、總共剩幾個，抽中的機會就是這樣算出來的 —— 不用另外找數字，看著列表抽就好。</>,
      },
      {
        q: '抽完可以反悔嗎？',
        a: <>不行。按下去的那一刻結果就定了，斷線也算你的。這也是為什麼我們把驗證方法一起公開 —— 結果不能反悔，至少要能查。詳見<L href="/return-policy">退換貨資訊</L>。</>,
      },
    ],
  },
  {
    category: '倉庫與出貨',
    items: [
      {
        q: '抽到的東西放在哪裡？',
        a: <>會自動存進你的倉庫，在<L href="/profile">會員</L>頁面裡。可以留著慢慢湊、一次申請出貨省運費，或是換回代幣繼續抽。</>,
      },
      {
        q: '倉庫可以放多久？',
        a: <>提供 30 天免費寄存。第 31 天起，還沒申請出貨的品項會自動換回代幣退到你的帳戶，不另行通知，所以記得在期限內申請出貨。</>,
      },
      {
        q: '運費怎麼算？',
        a: <>超商取貨 60–65 元、宅配 60 元（大型商品 120 元）。<strong>超商滿 7 件、宅配滿 15 件免運。</strong>申請出貨時會直接顯示這一單的費用，確認後才送出。</>,
      },
      {
        q: '多久會收到？',
        a: <>一般約 3–7 個工作天（不含例假日）。遇到大檔期或連假可能稍慢，出貨後會給你物流單號可以自己追。</>,
      },
      {
        q: '換回代幣是什麼意思？',
        a: <>倉庫裡的品項可以選擇不出貨，換回代幣繼續抽。換回之後就沒辦法還原了，操作前會再確認一次。</>,
      },
      {
        q: '地址填錯了怎麼辦？',
        a: <>還沒出貨的話盡快用 LINE 聯繫客服改。已經出貨就改不了了，退件後重寄的運費要自己負擔，詳見<L href="/return-policy">退換貨資訊</L>。</>,
      },
    ],
  },
  {
    category: '付款與代幣',
    items: [
      {
        q: '有哪些付款方式？',
        a: <>信用卡、網路 ATM、ATM 轉帳（虛擬帳號）、超商代碼繳費。全部透過綠界處理，我們不會碰到你的卡號。</>,
      },
      {
        q: '代幣有使用期限嗎？',
        a: <>儲值買的代幣沒有期限。活動送的回饋可能有期限，會寫在該活動的說明裡。</>,
      },
      {
        q: '代幣可以退款嗎？',
        a: <>儲值完成後不接受退款，也不能換回現金。唯一的例外是金流異常（例如重複扣款），請在 24 小時內用 LINE 聯繫客服並附上付款記錄。詳見<L href="/return-policy">退換貨資訊</L>。</>,
      },
      {
        q: '付款完代幣沒進來？',
        a: <>超商代碼與 ATM 轉帳有時候會延遲幾分鐘。超過 30 分鐘還沒入帳，請用 LINE 聯繫客服並附上付款證明，我們查得到那筆交易。</>,
      },
    ],
  },
  {
    category: '商品問題',
    items: [
      {
        q: '收到的東西缺件或寄錯，怎麼辦？',
        a: <>請在收到商品 7 日內用 LINE 聯繫客服，附上訂單編號、<strong>完整開箱錄影</strong>（從外包裝還沒拆到內容物取出，全程不中斷）與問題照片。沒有錄影很難認定是運送途中還是拆封後發生的。完整規則見<L href="/return-policy">退換貨資訊</L>。</>,
      },
      {
        q: '外盒有壓痕算瑕疵嗎？',
        a: <>不算。外盒在運送途中出現輕微壓痕、擦痕是常態，內容物完好就不在補件範圍內。原廠出廠本身的細微瑕疵（印刷偏移、輕微色差）同樣不適用。</>,
      },
      {
        q: '照片跟實品顏色有差？',
        a: <>螢幕顯示的色彩本來就跟實品有落差，這個不視為瑕疵。如果是明顯的內容物損壞或型號不符，那就是可以處理的範圍。</>,
      },
    ],
  },
  {
    category: '帳號',
    items: [
      {
        q: '一個人可以開幾個帳號？',
        a: <>一個。多帳號會影響活動與排行的公平性，發現會處理，詳見<L href="/terms">會員條款</L>。</>,
      },
      {
        q: '忘記密碼？',
        a: <>登入頁點「忘記密碼」，系統會寄重設連結到你註冊的信箱。收不到的話先看一下垃圾郵件匣。</>,
      },
      {
        q: '可以刪除帳號嗎？我的資料怎麼處理？',
        a: <>可以，請用 LINE 聯繫客服。個資的保存與刪除規則寫在<L href="/privacy">隱私權政策</L>裡，交易記錄依稅法規定必須保留的部分不在刪除範圍內。</>,
      },
    ],
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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20">
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
                      {/* max-h 要留夠：答案改成可以帶連結的內容之後有幾題比原本長，
                          抓 96 會把最後一兩行切掉 */}
                      <div className={cn('overflow-hidden transition-all duration-200', isOpen ? 'max-h-[32rem]' : 'max-h-0')}>
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
                      inputMode="numeric"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      onBlur={e => setForm(f => ({ ...f, phone: normalizePhone(e.target.value) }))}
                      disabled={!user || submitting}
                      required
                      placeholder={PHONE_PLACEHOLDER}
                      pattern="^09\d{8}$"
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
