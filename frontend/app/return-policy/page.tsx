'use client';

import { AlertTriangle, PackageX, RefreshCw } from 'lucide-react';

export default function ReturnPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20 transition-colors">
      <div className="max-w-3xl mx-auto md:pt-6 md:px-4">
        
        {/* Header */}
        <div className="px-4 py-4 md:hidden bg-white dark:bg-neutral-900 sticky top-0 z-10 shadow-sm">
           <h1 className="text-lg font-bold text-neutral-900 dark:text-white text-center">退換貨資訊</h1>
        </div>

        <div className="hidden md:flex items-baseline gap-4 mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">退換貨資訊</h1>
          <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            RETURN POLICY
          </span>
        </div>

        <div className="px-4 md:px-0 mt-4 md:mt-0">
          
          {/* Special Notice Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 p-6 mb-4">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white mb-2">特別聲明</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
                  一番賞線上抽獎屬於「機會中獎商品」，依據消費者保護法第十九條規定，本服務所提供之數位內容或一經提供即為完成之線上服務，經消費者事先同意始提供，<span className="text-red-500 font-bold">不適用七日鑑賞期之規定</span>。
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 p-6 md:p-8">
            
            <div className="space-y-8">
              
              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <PackageX className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  一、退換貨規範
                </h3>
                <div className="pl-10 space-y-4">
                  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white mb-1">代幣購買</h4>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      代幣一經購買及使用，恕不接受退費。若有誤買情形且代幣尚未由系統扣除，請於購買後 24 小時內聯繫客服處理。
                    </p>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white mb-1">抽獎商品</h4>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      因抽獎性質特殊，一旦執行抽獎動作，即視為商品已交付，恕不接受退貨或更換其他獎項。
                    </p>
                  </div>
                </div>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  二、瑕疵商品處理
                </h3>
                <div className="pl-10">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed mb-3">
                    若您收到的實體商品有以下情形，請於收到商品後 7 日內（含例假日），保持商品完整包裝並聯繫客服，我們將盡速為您處理：
                  </p>
                  <ul className="space-y-2 mb-4">
                    <li className="flex gap-2 text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                      <span className="w-1 h-1 rounded-full bg-neutral-400 mt-1.5 shrink-0" />
                      收到之商品與中獎項目不符
                    </li>
                    <li className="flex gap-2 text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                      <span className="w-1 h-1 rounded-full bg-neutral-400 mt-1.5 shrink-0" />
                      商品有明顯缺件、斷裂或嚴重塗裝瑕疵（不含一般大量生產之細微溢色）
                    </li>
                    <li className="flex gap-2 text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                      <span className="w-1 h-1 rounded-full bg-neutral-400 mt-1.5 shrink-0" />
                      商品運送過程中造成之損壞
                    </li>
                  </ul>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/50 rounded-lg p-3 text-xs text-yellow-800 dark:text-yellow-300 font-medium leading-relaxed">
                    注意：外盒損傷（如壓痕、折角）不屬於商品瑕疵範圍，若您對盒況有完美要求，建議您斟酌使用本服務。
                  </div>
                </div>
              </section>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              <section>
                <h3 className="flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white mb-4">
                  <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </span>
                  三、換貨流程
                </h3>
                <div className="pl-10 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 font-black text-sm">1</div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white text-sm mb-1">聯繫客服</h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">提供訂單編號、中獎明細及瑕疵照片</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 font-black text-sm">2</div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white text-sm mb-1">確認狀況</h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">客服人員確認符合換貨標準</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 font-black text-sm">3</div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white text-sm mb-1">商品回收</h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">我們將安排物流回收瑕疵商品</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 font-black text-sm">4</div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white text-sm mb-1">寄送新品</h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">確認回收商品無誤後，寄出新品</p>
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
