'use client';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20">
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-4">

        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">隱私權政策</h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-bold">PRIVACY POLICY</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">

          <div className="p-5 bg-neutral-50 dark:bg-neutral-800/50">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              GGB 吉吉比（以下簡稱「本平台」）重視您的個人資料隱私，並依個人資料保護法及相關法令妥善處理。使用本平台服務，即表示您同意本隱私權政策。本政策可能隨業務需求更新，更新後將公告於網站。
            </p>
          </div>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">一、蒐集的個人資料類型</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">帳號資料：</span>電子郵件信箱、會員暱稱、密碼（加密儲存）。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">交易資料：</span>儲值記錄、抽獎紀錄、訂單內容、物流資訊。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">收件資料：</span>申請出貨時填寫之收件人姓名、電話、地址。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">行為資料：</span>瀏覽頁面、點擊行為、停留時間等匿名化使用統計，用於改善服務體驗。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">裝置資料：</span>IP 位址、瀏覽器類型、Cookie 識別碼。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">二、資料使用目的</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>提供、維護及改善本平台服務。</li>
              <li>處理交易、出貨及客服事宜。</li>
              <li>寄送訂單確認、出貨通知、平台公告等服務性通知。</li>
              <li>分析服務使用狀況以優化使用體驗。</li>
              <li>偵測及防範詐欺、濫用或違規行為。</li>
              <li>依法律規定或主管機關要求進行揭露。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">三、資料分享與揭露</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台不會出售您的個人資料給第三方。</li>
              <li>為提供服務，可能與以下第三方分享必要資料：物流業者（收件地址）、金流服務商（綠界 ECPay，支付相關資料）、雲端服務供應商（資料儲存）。</li>
              <li>如依法律規定、法院命令或主管機關要求，本平台將依規定揭露您的資料。</li>
              <li>上述第三方服務商均有其隱私保護義務，本平台將要求其遵守。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">四、Cookie 使用</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              本平台使用 Cookie 維持登入狀態、記憶使用偏好及統計使用情形。您可透過瀏覽器設定拒絕 Cookie，但部分功能（如保持登入）可能因此無法正常運作。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">五、資料保存期限</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>帳號資料：帳號存續期間持續保存，帳號刪除後依法定期限保留必要資料。</li>
              <li>交易記錄：依商業帳簿及稅法規定至少保存 5 年。</li>
              <li>收件資料：訂單完成後 6 個月內定期清除非必要資料。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">六、您的權利</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2">
              依個人資料保護法，您可向本平台行使以下權利：
            </p>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>查詢或閱覽您的個人資料。</li>
              <li>要求更正不正確的個人資料。</li>
              <li>要求停止蒐集、處理或利用您的個人資料。</li>
              <li>要求刪除個人資料（依法律規定需保留之資料除外）。</li>
            </ul>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mt-2">
              如需行使上述權利，請透過 LINE 官方帳號聯繫客服。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">七、未成年人保護</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              本平台服務對象為 18 歲以上成年人。若未成年人使用本服務，須取得法定代理人同意。本平台不會主動蒐集未成年人之個人資料，如發現有誤，將立即刪除。
            </p>
          </section>

          <div className="p-6">
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">最後更新：2026 年 7 月｜聯絡客服：LINE @ggb.tw</p>
          </div>

        </div>
      </div>
    </div>
  );
}
