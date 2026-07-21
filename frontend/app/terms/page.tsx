'use client';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20">
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-4">

        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">會員條款</h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-bold">TERMS OF SERVICE</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">

          <div className="p-5 bg-neutral-50 dark:bg-neutral-800/50">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              歡迎使用 GGB 吉吉比（以下簡稱「本平台」）。當您完成會員註冊或開始使用本平台服務，即表示您已閱讀、理解並同意本條款全部內容。本平台保留隨時修改條款之權利，修改後將公告於網站，繼續使用即視為同意修改後條款。
            </p>
          </div>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">一、會員資格</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>會員需年滿 18 歲或依所在地法律規定之成年年齡。未成年者需經法定代理人同意方可使用。</li>
              <li>註冊時須提供真實、正確、完整之個人資料，並於資料變更時自行更新。</li>
              <li>每人限申請一個帳號，禁止以任何方式持有多個帳號。</li>
              <li>帳號不得出借、轉讓或轉售，帳號下所有行為由會員自行負責。</li>
              <li>若發現帳號遭未授權使用，應立即通知本平台並配合處理。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">二、代幣制度與付款</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台採代幣制，1 代幣 = 1 元台幣，代幣無使用期限。</li>
              <li>代幣透過本平台指定之金流系統儲值，儲值完成後不接受退款，亦不可兌換為現金或其他有價憑證。</li>
              <li>平台活動贈送之紅利代幣屬平台回饋，退款時不予退還，並可能附有使用期限。</li>
              <li>若因金流系統錯誤導致重複扣款，請於 24 小時內聯繫客服，本平台將查明後協助處理。</li>
              <li>嚴禁利用本平台進行任何形式之洗錢、套現或詐欺行為，一經發現將立即凍結帳號並保留法律追訴權。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">三、抽獎服務</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台提供一番賞、轉蛋、盒玩、抽卡等多種抽獎服務，各商品之機率於商品頁面公開揭示。</li>
              <li>抽獎結果採哈希值驗證機制，隨機種子（Seed）於商品上架時封存，結果可供任何人在「公平驗證」頁面自行驗算。</li>
              <li>一旦執行抽獎動作，即視為服務已完成交付，不接受以「不喜歡結果」或「未中大賞」為由要求退款或換獎。</li>
              <li>本平台保留依法律規定或商業合理需要調整商品內容及機率之權利，調整前將於平台公告。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">四、倉庫寄存與自動分解</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>中獎商品將自動存入會員帳號之「倉庫」，平台提供 <span className="font-bold text-neutral-900 dark:text-white">30 天免費寄存期</span>。</li>
              <li>商品存入倉庫後第 31 天起，系統將自動執行分解，並以原抽獎代幣價格退還代幣至會員帳戶，不另行通知。</li>
              <li>會員應自行留意寄存期限，逾期自動分解後不受理還原或補償申請。</li>
              <li>會員亦可主動申請分解，退還代幣金額與自動分解相同。分解操作不可撤銷。</li>
              <li>每次申請出貨以同一廠商商品為一批次，如有多廠商商品請分批申請。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">五、禁止行為</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>利用技術手段干擾、破壞或規避平台系統正常運作。</li>
              <li>以自動化程式、爬蟲或機器人方式操作帳號或進行抽獎。</li>
              <li>散布不實資訊、惡意評論或從事任何損害本平台商譽之行為。</li>
              <li>利用系統漏洞取得不正當利益；一經發現將追回差額並可能終止帳號。</li>
              <li>頻繁異常退款申請或疑似濫用客服資源之行為。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">六、帳號暫停與終止</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台得依會員違規情節，採取警告、功能限制、暫停帳號或永久終止等措施，無需事先通知。</li>
              <li>帳號終止後，帳戶內剩餘代幣及倉庫商品依本條款規定處理，本平台不另行補償。</li>
              <li>帳號終止不影響本平台依法追究相關責任之權利。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">七、免責聲明</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>因天災、戰爭、政府命令、系統維護、網路障礙或其他不可抗力因素導致服務中斷，本平台不負賠償責任。</li>
              <li>商品實際顏色、細節因螢幕顯示差異，可能與實際商品略有不同，不視為瑕疵。</li>
              <li>本平台對第三方連結網站之內容不負任何責任。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">八、適用法律與爭議解決</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              本條款依中華民國法律解釋及適用。如發生爭議，雙方同意以台灣台北地方法院為第一審管轄法院。
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
