'use client';

import { Shield, Lock, Eye, Cookie, FileText, Link } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20 transition-colors">
      <div className="max-w-3xl mx-auto md:pt-6 md:px-4">
        
        {/* Header */}
        <div className="px-4 py-4 md:hidden bg-white dark:bg-neutral-900 sticky top-0 z-10 shadow-sm">
           <h1 className="text-lg font-bold text-neutral-900 dark:text-white text-center">隱私權政策</h1>
        </div>

        <div className="hidden md:flex items-baseline gap-4 mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">隱私權政策</h1>
          <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            PRIVACY POLICY
          </span>
        </div>

        <div className="px-4 md:px-0 mt-4 md:mt-0">
          <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 p-6 md:p-8">
            
            <div className="flex items-start gap-4 mb-8 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/50">
              <Shield className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0 mt-1" />
              <div className="text-sm text-green-800 dark:text-green-300 leading-relaxed font-medium">
                一番賞線上抽（以下簡稱「本服務」）非常重視您的隱私權。為了讓您能安心使用本服務，特此向您說明本服務的隱私權保護政策，以保障您的權益。
              </div>
            </div>

            <div className="space-y-8">
              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  一、隱私權保護政策的適用範圍
                </h3>
                <p className="pl-10 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                  隱私權保護政策內容，包括本服務如何處理在您使用網站服務時收集到的個人識別資料。隱私權保護政策不適用於本服務以外的相關連結網站，也不適用於非本服務所委託或參與管理的人員。
                </p>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  二、個人資料的蒐集、處理及利用方式
                </h3>
                <ul className="space-y-3 pl-12">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed -ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    當您造訪本服務或使用本服務所提供之功能服務時，我們將視該服務功能性質，請您提供必要的個人資料，並在該特定目的範圍內處理及利用您的個人資料。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed -ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    本服務在您註冊帳號、使用服務、參加活動時，會收集您的姓名、電子郵件地址、聯絡電話、收件地址等個人資料。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed -ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    本服務所蒐集之個人資料，主要用於身分確認、客戶管理、商品寄送、聯絡通知、行銷活動推廣等目的。
                  </li>
                </ul>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  三、資料之保護
                </h3>
                <ul className="space-y-3 pl-12">
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed -ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    本服務主機均設有防火牆、防毒系統等相關的各項資訊安全設備及必要的安全防護措施，加以保護網站及您的個人資料。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed -ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    只由經過授權的人員才能接觸您的個人資料，相關處理人員皆簽有保密合約，如有違反保密義務者，將會受到相關的法律處分。
                  </li>
                  <li className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed -ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-2 shrink-0" />
                    如因業務需要有必要委託其他單位提供服務時，本服務亦會嚴格要求其遵守保密義務，並且採取必要檢查程序以確定其將確實遵守。
                  </li>
                </ul>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Link className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  四、網站對外的相關連結
                </h3>
                <p className="pl-10 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                  本服務的網頁提供其他網站的網路連結，您也可經由本服務所提供的連結，點選進入其他網站。但該連結網站不適用本服務的隱私權保護政策，您必須參考該連結網站中的隱私權保護政策。
                </p>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Cookie className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  五、Cookie 之使用
                </h3>
                <p className="pl-10 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                  為了提供您最佳的服務，本服務會在您的電腦中放置並取用我們的 Cookie，若您不願接受 Cookie 的寫入，您可在您使用的瀏覽器功能項中設定隱私權等級為高，即可拒絕 Cookie 的寫入，但可能會導致網站某些功能無法正常執行。
                </p>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  六、隱私權保護政策之修正
                </h3>
                <p className="pl-10 text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                  本服務隱私權保護政策將因應需求隨時進行修正，修正後的條款將刊登於網站上。
                </p>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
