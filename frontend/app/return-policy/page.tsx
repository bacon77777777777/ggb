'use client';

export default function ReturnPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20">
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-4">

        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">退換貨資訊</h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-bold">RETURN POLICY</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">

          {/* Legal Notice */}
          <div className="p-5 bg-red-50 dark:bg-red-900/10 border-l-4 border-red-400 dark:border-red-600 rounded-t-xl">
            <h2 className="text-sm font-black text-red-700 dark:text-red-400 mb-1">特別聲明</h2>
            <p className="text-[13px] text-red-600 dark:text-red-400 leading-relaxed">
              一番賞、轉蛋、盒玩、抽卡等商品屬「機會中獎商品」，依消費者保護法第十九條，本平台所提供之數位抽獎服務，經消費者事先同意並執行抽獎後，即為服務完成，<strong>不適用七日鑑賞期</strong>。
            </p>
          </div>

          <section className="p-5">
            <h2 className="text-sm font-black text-neutral-900 dark:text-white mb-3">一、代幣儲值</h2>
            <ul className="space-y-2 text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>代幣一經儲值，不接受退款或兌換為現金。</li>
              <li>若因金流系統異常導致重複扣款，請於 <strong className="text-neutral-700 dark:text-neutral-300">24 小時內</strong> 透過 LINE 聯繫客服，並提供付款記錄截圖，本平台將查明後協助處理。</li>
              <li>儲值時附贈之紅利代幣屬平台回饋，不納入退款計算。</li>
            </ul>
          </section>

          <section className="p-5">
            <h2 className="text-sm font-black text-neutral-900 dark:text-white mb-3">二、抽獎結果</h2>
            <ul className="space-y-2 text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>執行抽獎動作後，獎項即視為確定並交付，不接受以「不滿意結果」或「未中大賞」為由申請退換。</li>
              <li>所有抽獎結果可於「公平驗證」頁面以哈希值驗算，確保結果公正無後台操控。</li>
              <li>若因本平台系統錯誤導致抽獎結果異常（如顯示錯誤、扣幣未中獎），請聯繫客服，本平台將補發代幣。</li>
            </ul>
          </section>

          <section className="p-5">
            <h2 className="text-sm font-black text-neutral-900 dark:text-white mb-3">三、倉庫商品出貨</h2>
            <ul className="space-y-2 text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>倉庫提供 <strong className="text-neutral-700 dark:text-neutral-300">30 天免費寄存</strong>，請於期限內申請出貨。</li>
              <li>第 31 天起，逾期未申請出貨之品項將自動分解，按原抽獎代幣價格退回帳戶，不另行通知。</li>
              <li>申請出貨後，訂單一經確認出貨即不可取消或修改收件地址。</li>
              <li>若因填寫地址錯誤、無人收件或拒收導致退件，再次出貨之運費由會員自行負擔。</li>
            </ul>
          </section>

          <section className="p-5">
            <h2 className="text-sm font-black text-neutral-900 dark:text-white mb-3">四、實體商品問題</h2>
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-3">
              收到商品如有以下情形，請於 <strong className="text-neutral-700 dark:text-neutral-300">收到商品 7 日內</strong> 透過 LINE 聯繫客服：
            </p>
            <ul className="space-y-2 text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-3">
              <li className="flex gap-2"><span className="text-primary shrink-0">—</span>收到之商品與中獎項目不符（寄錯品）</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">—</span>商品有明顯製造瑕疵或內容物損壞</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">—</span>商品缺件（確認開箱錄影完整）</li>
            </ul>
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2 font-bold text-neutral-700 dark:text-neutral-300">申請時需提供：</p>
            <ul className="space-y-1 text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>① 訂單編號</li>
              <li>② 完整開箱錄影（從外包裝未拆封至商品取出，全程不中斷）</li>
              <li>③ 問題商品清楚照片</li>
            </ul>
          </section>

          <section className="p-5">
            <h2 className="text-sm font-black text-neutral-900 dark:text-white mb-3">五、不適用退換之情況</h2>
            <ul className="space-y-2 text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>原廠出廠之細微瑕疵（如印刷偏移、輕微刮痕）。</li>
              <li>外盒盒損、壓痕（內容物完好者）。</li>
              <li>逾 7 日回報期限。</li>
              <li>無完整開箱錄影或無法提供完整佐證資料。</li>
              <li>商品已使用、拆封、組裝或改裝。</li>
            </ul>
          </section>

          <section className="p-5">
            <h2 className="text-sm font-black text-neutral-900 dark:text-white mb-3">六、異常補償方式</h2>
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              本平台對於確認屬平台責任之異常，<strong className="text-neutral-700 dark:text-neutral-300">優先以補發代幣</strong>方式進行補償（等同商品抽獎價值）。僅在確認為重複扣款等金流錯誤時，才依實際情況退還金錢。
            </p>
          </section>

          <div className="p-5">
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
              客服聯繫：LINE 官方帳號 <strong className="text-neutral-700 dark:text-neutral-300">@ggb.tw</strong>
            </p>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">最後更新：2026 年 7 月</p>
          </div>

        </div>
      </div>
    </div>
  );
}
