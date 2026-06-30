'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Mail, Phone, MessageCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const faqs = [
    {
      category: '常見問題',
      items: [
        {
          q: '什麼是一番賞線上抽？',
          a: '一番賞線上抽是讓您隨時隨地都能享受抽獎樂趣的服務。您可以透過網站購買抽獎券，即時開獎，並選擇將獎品寄送到府或暫存於倉庫。'
        },
        {
          q: '如何購買抽獎券？',
          a: '註冊會員並登入後，選擇您喜歡的一番賞商品，點擊「立即抽」或「購買多抽」，完成付款後即可進行抽獎。'
        },
        {
          q: '中獎後如何領取獎品？',
          a: '中獎商品會自動存入您的「盒櫃」中。您可以隨時前往盒櫃選擇要出貨的商品，填寫收件資訊並支付運費後，我們將為您寄出。'
        }
      ]
    },
    {
      category: '帳號與付款',
      items: [
        {
          q: '有哪些付款方式？',
          a: '我們提供信用卡刷卡、LINE Pay、ATM 轉帳等多種付款方式，方便您快速儲值代幣進行抽獎。'
        },
        {
          q: '代幣會過期嗎？',
          a: '購買的代幣沒有使用期限，您可以放心存放與使用。但在特定活動贈送的紅利代幣可能會有使用期限，請留意活動說明。'
        }
      ]
    },
    {
      category: '配送相關',
      items: [
        {
          q: '運費如何計算？',
          a: '單筆出貨運費依物流業者收費標準計算。若單筆申請出貨滿一定數量或金額（依當時活動而定），可享有免運優惠。'
        },
        {
          q: '申請出貨後多久會收到？',
          a: '一般情況下，申請出貨後約 3-7 個工作天內會送達您的指定地址（不含假日）。若遇活動檔期或物流繁忙，可能會稍有延遲。'
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20 transition-colors">
      <div className="max-w-3xl mx-auto md:pt-6 md:px-4">
        
        {/* Mobile Header Title (Hidden on Desktop as Navbar usually handles it or we keep it) */}
        <div className="px-4 py-4 md:hidden">
           <h1 className="text-xl font-black text-neutral-900 dark:text-white">常見問題</h1>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex items-baseline gap-4 mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">常見問題</h1>
          <span className="text-xs font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            <span className="font-amount">{faqs.reduce((acc, curr) => acc + curr.items.length, 0)}</span> 個問題
          </span>
        </div>

        <div className="space-y-4">
          {/* FAQ Sections */}
          {faqs.map((section, sIndex) => (
            <div key={sIndex} className="bg-white dark:bg-neutral-900 md:rounded-xl overflow-hidden shadow-sm border-y md:border border-neutral-100 dark:border-neutral-800">
              <div className="px-4 py-3 bg-neutral-50/50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800">
                <h2 className="text-sm font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{section.category}</h2>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {section.items.map((item, iIndex) => {
                  const globalIndex = sIndex * 100 + iIndex;
                  const isOpen = openIndex === globalIndex;
                  
                  return (
                    <div key={iIndex} className="bg-white dark:bg-neutral-900">
                      <button
                        onClick={() => toggleFAQ(globalIndex)}
                        className="w-full px-4 py-4 flex items-start justify-between text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors gap-4"
                      >
                        <span className={cn("text-[15px] font-bold text-neutral-900 dark:text-white leading-relaxed", isOpen && "text-primary")}>
                          {item.q}
                        </span>
                        {isOpen ? (
                          <ChevronUp className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
                        )}
                      </button>
                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-300 ease-in-out bg-neutral-50/30 dark:bg-neutral-800/20",
                          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                        )}
                      >
                        <div className="px-4 pb-4 pt-2 text-[14px] text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
                          {item.a}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Contact Section */}
          <div className="bg-white dark:bg-neutral-900 md:rounded-xl shadow-sm border-y md:border border-neutral-100 dark:border-neutral-800 p-6 mt-6">
            <h2 className="text-lg font-black text-neutral-900 dark:text-white mb-6">聯絡我們</h2>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-neutral-700 flex items-center justify-center shrink-0 shadow-sm text-primary">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-0.5">服務時間</h3>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">週一至週五 10:00 - 18:00</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-neutral-700 flex items-center justify-center shrink-0 shadow-sm text-primary">
                  <Phone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-0.5">客服專線</h3>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white font-mono">02-1234-5678</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-neutral-700 flex items-center justify-center shrink-0 shadow-sm text-primary">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-0.5">電子信箱</h3>
                  <a href="mailto:support@gachago.shop" className="text-sm font-bold text-neutral-900 dark:text-white hover:text-primary transition-colors truncate block">
                    support@gachago.shop
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-neutral-700 flex items-center justify-center shrink-0 shadow-sm text-primary">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-0.5">官方 LINE</h3>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white font-mono">@吉吉比</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
