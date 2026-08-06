'use client';

import Link from 'next/link';

/**
 * 隱私權政策
 *
 * 這一頁的職責：我們蒐集什麼、拿來做什麼、給了誰、留多久、你可以要求什麼。
 *
 * 條列的第三方服務要跟實際用的一致 —— 寫得含糊（「可能與合作夥伴分享」）
 * 等於什麼都沒說，而且真的出事時反而更難解釋。
 */

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-primary font-bold underline underline-offset-2">{children}</Link>
);

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20">
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-4">

        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">隱私權政策</h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-bold">PRIVACY POLICY</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">

          <div className="p-5 bg-neutral-50 dark:bg-neutral-800/50">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              吉吉比（GGB，以下簡稱「本平台」）依個人資料保護法及相關法令處理您的個人資料。
              使用本平台服務即表示您同意本政策。本政策為<L href="/terms">會員條款</L>之一部分，
              更新時將於本頁公告。
            </p>
          </div>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">一、我們蒐集什麼</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">帳號資料：</span>電子郵件、暱稱、密碼（加密儲存，我們看不到明文）、手機號碼（如您提供）。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">交易資料：</span>儲值記錄、抽獎記錄、倉庫內容、訂單與物流資訊。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">收件資料：</span>申請出貨時填寫的收件人姓名、電話、地址或門市。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">使用行為：</span>瀏覽的頁面、停留時間、點擊與搜尋記錄，用於改善服務與偵測異常。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">裝置資料：</span>IP 位址、瀏覽器與裝置類型、Cookie 識別碼。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">客服往來：</span>您提供的問題描述、附件與聯絡方式。</li>
            </ul>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed mt-3">
              我們不會蒐集您的信用卡號。線上付款由金流服務商處理，卡號不會經過本平台的系統。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">二、拿來做什麼</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>提供服務本身：註冊登入、抽獎、倉庫、出貨、客服。</li>
              <li>寄送與交易直接相關的通知：訂單確認、出貨通知、系統公告。</li>
              <li>分析使用狀況以改善介面與服務流程。</li>
              <li>偵測並防止盜刷、洗錢、多帳號濫用與其他違規行為。</li>
              <li>依法律規定或主管機關要求提供。</li>
            </ul>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mt-3">
              行銷訊息以您可自行關閉的方式提供，關閉後仍會收到與交易直接相關的通知
              （例如出貨進度）—— 那些不是行銷，是服務的一部分。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">三、會給誰</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mb-3">
              <strong className="text-neutral-700 dark:text-neutral-300">我們不會販售您的個人資料。</strong>
              為了把服務跑起來，以下情況會分享必要的最小範圍：
            </p>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">金流服務商（綠界科技）：</span>付款所需之交易資訊。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">物流業者與超商：</span>收件人姓名、電話、地址或取貨門市。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">雲端與資料庫服務商：</span>資料儲存與運算。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">通訊軟體（LINE）：</span>您主動透過官方帳號聯繫時的往來內容。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">供貨廠商：</span>僅於出貨必要範圍內提供收件資訊，不含您的帳號、儲值或抽獎記錄。</li>
              <li>依法律規定、法院命令或主管機關要求時，依規定揭露。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">四、Cookie</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              我們使用 Cookie 維持登入狀態、記住你的偏好設定（例如深色模式）並統計使用情形。
              可以在瀏覽器設定中拒絕，但拒絕之後保持登入等功能會無法正常運作。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">五、留多久</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">帳號資料：</span>帳號存續期間保存；刪除帳號後，除法令要求保留者外一併刪除。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">交易與金流記錄：</span>依商業會計法與稅法規定至少保存 5 年，此部分不因帳號刪除而移除。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">收件資料：</span>訂單完成後保留一段合理期間以處理售後爭議，之後定期清除。</li>
              <li><span className="font-bold text-neutral-700 dark:text-neutral-300">使用行為：</span>以彙總統計形式保存，個別記錄定期清除。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">六、你可以要求什麼</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2">
              依個人資料保護法，您可以要求：
            </p>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>查詢或閱覽您的個人資料，並取得複製本。</li>
              <li>更正或補充不正確的資料。</li>
              <li>停止蒐集、處理或利用。</li>
              <li>刪除您的個人資料（法令要求保留者除外）。</li>
            </ul>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mt-3">
              請透過官方 LINE 或
              <L href="/faq">常見問題</L>
              頁面的表單提出，我們會在確認身分後處理。
              請注意：停止利用或刪除資料後，部分服務（例如出貨、客服查詢）將無法繼續提供。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">七、資料安全</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>網站全站使用加密連線傳輸。</li>
              <li>密碼以單向雜湊儲存，任何人（包含我們）都無法還原成明文。</li>
              <li>後台採權限分級，工作人員只看得到職務所需的資料，且所有操作留有記錄。</li>
              <li>若發生足以危害您權益的資料外洩，我們將依法通知您並向主管機關陳報。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">八、未成年人</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              本服務對象為 18 歲以上。未滿 18 歲者須經法定代理人同意方得使用。
              我們不會主動蒐集未成年人的個人資料；如發現有未經同意而蒐集之情形，將立即刪除。
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
