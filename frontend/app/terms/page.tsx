'use client';

import Link from 'next/link';

/**
 * 會員條款
 *
 * 這一頁的職責：雙方的權利義務，也就是契約本身。
 *
 * 操作教學不放這裡（那是常見問題），退換貨的申請流程與應備文件也不放
 *（那是退換貨資訊），這裡只寫法律效果並連過去。同一條規則在兩個頁面
 * 各寫一次的話，改了其中一邊就會變成互相矛盾的兩份文件。
 */

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-primary font-bold underline underline-offset-2">{children}</Link>
);

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
              歡迎使用吉吉比（GGB，以下簡稱「本平台」）。當您完成註冊或開始使用本平台服務，
              即表示您已閱讀、理解並同意本條款全部內容。本平台保留修改條款之權利，
              修改後將於本頁公告；如修改內容對您的權益有重大影響，將另於平台公告區通知。
              公告後繼續使用即視為同意。
            </p>
          </div>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">一、會員資格</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>會員應年滿 18 歲。未滿 18 歲者，須經法定代理人閱讀本條款並同意後，方得使用本平台服務。</li>
              <li>註冊時應提供真實、正確、完整之資料，並於資料變更時自行更新。因資料不實或未更新導致無法完成出貨或聯繫，由會員自行負責。</li>
              <li>每人限申請一個帳號。以人頭、分身或其他方式持有多個帳號者，本平台得取消其活動資格並依第七條處理。</li>
              <li>帳號不得出借、轉讓或轉售。帳號下之所有行為視為會員本人所為。</li>
              <li>發現帳號遭未授權使用時，應立即通知本平台並配合處理。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">二、代幣與積分</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台以代幣作為服務對價之計價單位。代幣透過本平台指定之金流服務商儲值。</li>
              <li>儲值取得之代幣無使用期限；一經儲值完成即不接受退款，亦不得兌換為現金或其他有價憑證。退款之例外情形見<L href="/return-policy">退換貨資訊</L>。</li>
              <li>積分為簽到、任務或活動之回饋，非儲值取得，可能附有使用期限與使用範圍限制，並得於各該活動說明中另定。積分不得兌換現金，亦不計入任何退款計算。</li>
              <li>因金流系統錯誤導致重複扣款者，請於 24 小時內聯繫客服並提供付款記錄，本平台查明後協助處理。</li>
              <li>嚴禁利用本平台從事洗錢、套現、盜刷或任何詐欺行為。一經查獲，本平台得立即凍結帳號、保留相關記錄並依法追訴。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">三、抽獎服務</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台提供一番賞、轉蛋、盒玩、抽卡、自製賞等抽獎服務。各檔次之獎品內容、數量與剩餘數量公開揭示於商品頁面。</li>
              <li>設有籤號之玩法（一番賞、抽卡、自製賞），本平台於開賣前將籤號與獎品之對應關係排定並封存，同時於商品頁面公布驗證碼；該檔結束後公開完整對照表，任何人均得自行驗算核對。</li>
              <li>未設籤號之玩法（轉蛋、盒玩）於每次抽獎時即時決定結果，以公開之獎品數量與即時剩餘數量作為揭示方式。</li>
              <li>會員完成抽獎動作時，該次服務即為完成並交付，不接受以「不滿意結果」或「未中大獎」為由要求退款、換獎或撤銷。</li>
              <li>因本平台系統錯誤導致扣款而未取得對應獎品者，本平台將補發等值代幣或該獎品，處理方式見<L href="/return-policy">退換貨資訊</L>。</li>
              <li>本平台得因商品供應、法令要求或營運需要調整上架內容；已開賣之檔次於結束前不變更其獎品內容與數量。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">四、倉庫寄存</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>中獎商品存入會員帳號之倉庫，本平台提供 <span className="font-bold text-neutral-900 dark:text-white">30 天免費寄存</span>。</li>
              <li>存入後第 31 天起，尚未申請出貨之品項將自動換回代幣退還至會員帳戶，不另行通知。會員應自行留意寄存期限，逾期後不受理還原申請。</li>
              <li>會員亦得於期限內主動換回代幣，金額與逾期自動處理相同。該操作不可撤銷。</li>
              <li>倉庫內商品之所有權歸屬會員，本平台僅提供保管與寄送服務。因不可歸責於本平台之事由致商品滅失者，依民法相關規定處理。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">五、出貨與運費</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>出貨方式與運費於申請出貨時揭示，會員確認後始行送出。運費標準得因物流業者調整而變動，並以申請當下顯示之金額為準。</li>
              <li>訂單一經確認出貨即不得取消或變更收件資訊。</li>
              <li>因收件資訊填寫錯誤、無人收件或拒收而退回者，重新寄送之運費由會員負擔。</li>
              <li>本平台將提供物流單號供會員查詢配送進度。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">六、會員間交易</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台得提供會員之間販售、交換或掛單交易之功能。此等功能僅為媒合，交易主體為會員雙方。</li>
              <li>會員應自行確認交易對象與標的。商品之真偽、狀況、交付與售後責任由交易雙方自負。</li>
              <li>由本平台代收貨款之交易，本平台於買方確認收貨後撥款予賣方，並得於爭議時暫緩撥款、介入協調。未由本平台代收貨款之交易，本平台不涉入款項，亦不承擔交付風險。</li>
              <li>嚴禁利用交易功能進行虛假交易、洗錢、規避活動限制或私下交易平台外商品。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">七、禁止行為與帳號處置</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>不得以技術手段干擾、破壞或規避本平台系統之正常運作。</li>
              <li>不得以自動化程式、指令碼或機器人操作帳號、抽獎或參與活動。</li>
              <li>不得利用系統瑕疵取得不正當利益。經查獲者，本平台得追回所得差額。</li>
              <li>不得散布不實資訊或從事損害本平台或其他會員權益之行為。</li>
              <li>違反本條款者，本平台得視情節採取警告、限制功能、暫停或終止帳號等措施。情節重大或有立即危害之虞者，得先行處置後通知。</li>
              <li>帳號經終止時，本平台將先行處理已成立之出貨義務；剩餘代幣與積分依本條款規定不予退還。前述處置不影響本平台依法追究責任之權利。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">八、服務中斷與免責</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>本平台得為系統維護、更新或調整而暫停部分或全部服務，並儘可能事先公告。</li>
              <li>因天災、戰爭、政府命令、電信或網路中斷、第三方服務故障等不可抗力導致服務中斷者，本平台於法律允許之範圍內不負賠償責任。</li>
              <li>商品實際顏色與細節可能因螢幕顯示而與圖片略有差異，不視為瑕疵。</li>
              <li>本平台對第三方網站之內容不負責任。</li>
              <li>本條款之免責約定，不排除本平台依消費者保護法及其他強制規定應負之責任。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">九、個人資料</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              本平台蒐集、處理及利用個人資料之方式，依<L href="/privacy">隱私權政策</L>辦理，該政策為本條款之一部分。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">十、準據法與管轄</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              本條款依中華民國法律解釋及適用。因本條款所生之爭議，雙方同意先行協商；
              協商不成時，以台灣台北地方法院為第一審管轄法院，但不影響消費者依消費者保護法
              向消費者保護團體或主管機關申訴之權利。
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
