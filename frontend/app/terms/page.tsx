'use client';

import { ShieldCheck } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20 transition-colors">
      <div className="max-w-3xl mx-auto md:pt-6 md:px-4">
        
        {/* Header */}
        <div className="px-4 py-4 md:hidden bg-white dark:bg-neutral-900 sticky top-0 z-10 shadow-sm">
           <h1 className="text-lg font-bold text-neutral-900 dark:text-white text-center">會員條款</h1>
        </div>

        <div className="hidden md:flex items-baseline gap-4 mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">會員條款</h1>
          <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            TERMS OF SERVICE
          </span>
        </div>

        <div className="px-4 md:px-0 mt-4 md:mt-0">
          <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 p-6 md:p-8">
            
            <div className="flex items-start gap-4 mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50">
              <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-1" />
              <div className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed font-medium">
                歡迎您加入一番賞線上抽（以下簡稱「本服務」）。為了保障您的權益，請詳細閱讀本服務條款。當您註冊成為會員或開始使用本服務時，即表示您已閱讀、瞭解並同意遵守本條款之所有內容。
              </div>
            </div>

            <div className="space-y-8">
              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500">1</span>
                  會員註冊與帳號安全
                </h3>
                <ul className="space-y-3 pl-2">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    註冊時應提供正確、最新及完整的個人資料，若有變更應立即更新。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    會員應妥善保管帳號與密碼，不得將帳號出借、轉讓或與他人共用。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    若發現帳號遭盜用或有安全疑慮，應立即通知本服務。
                  </li>
                </ul>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500">2</span>
                  服務內容與規範
                </h3>
                <ul className="space-y-3 pl-2">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    本服務提供線上抽獎、商品購買及配送等相關服務。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    會員進行抽獎時，應確認商品資訊、價格及機率等內容。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    本服務所提供之抽獎結果為隨機產生，會員不得以未中獎或不滿意結果為由要求退費或賠償。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    嚴禁利用本服務進行任何非法、詐欺或干擾系統運作之行為。
                  </li>
                </ul>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500">3</span>
                  代幣與付款
                </h3>
                <ul className="space-y-3 pl-2">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    會員可透過本服務提供之付款方式購買代幣。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    代幣一經購買及使用，除法律另有規定外，不得要求退費。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    若因系統錯誤導致代幣扣除異常，本服務將於查證後進行補償或調整。
                  </li>
                </ul>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500">4</span>
                  商品配送
                </h3>
                <ul className="space-y-3 pl-2">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    中獎商品將暫存於會員之「盒櫃」中，會員可隨時申請出貨。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    申請出貨時需支付運費，運費標準依當時公告為準。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    商品寄送地址僅限本服務公告之配送範圍。
                  </li>
                </ul>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500">5</span>
                  服務中斷與免責聲明
                </h3>
                <ul className="space-y-3 pl-2">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    若因天災、系統維護、網路壅塞或其他不可抗力因素導致服務中斷，本服務不負賠償責任。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    本服務保留隨時修改、暫停或終止部分或全部服務之權利。
                  </li>
                </ul>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500">6</span>
                  其他
                </h3>
                <ul className="space-y-3 pl-2">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    本條款如有未盡事宜，依中華民國法律及相關法令辦理。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    若因本服務發生爭議，雙方同意以台灣台北地方法院為第一審管轄法院。
                  </li>
                </ul>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
