'use client';

import Link from 'next/link';

/**
 * 退換貨資訊
 *
 * 這一頁的職責：什麼情況可以退、怎麼申請、要附什麼、多久內要說。
 * 也就是玩家出問題時實際要照著做的那一頁。
 *
 * 會員條款寫的是法律效果（「完成抽獎即為服務完成」），這裡寫的是操作
 *（「7 日內、附開箱錄影、用 LINE 找客服」）。兩邊只在必要處互相連結，
 * 不重述對方的內容 —— 同一條規則抄兩份，改了一邊就變成互相矛盾的文件。
 */

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-primary font-bold underline underline-offset-2">{children}</Link>
);

export default function ReturnPolicyPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20">
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-4">

        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">退換貨資訊</h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-bold">RETURN POLICY</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">

          <div className="p-5 bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-400 dark:border-amber-600 rounded-t-xl">
            <h2 className="text-sm font-black text-amber-800 dark:text-amber-400 mb-1.5">先講最重要的一件事</h2>
            <p className="text-sm text-amber-700 dark:text-amber-400/90 leading-relaxed">
              抽獎是一經執行即完成的線上服務。依消費者保護法第十九條第一項但書及
              「通訊交易解除權合理例外情事適用準則」第二條第五款，
              經您事先同意後執行之抽獎，<strong>不適用七日猶豫期</strong>，不能以「不滿意結果」為由要求退費。
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400/90 leading-relaxed mt-2">
              但這不影響您在商品有瑕疵、缺件或寄錯時的權利 —— 那部分見下方第四點，我們照樣處理。
            </p>
          </div>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">一、代幣儲值</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>代幣一經儲值即不接受退款，也不能換回現金。</li>
              <li>唯一例外是金流異常：重複扣款、扣款成功但代幣未入帳等。請於發現後 <strong className="text-neutral-700 dark:text-neutral-300">24 小時內</strong> 用 LINE 聯繫客服，並附上付款記錄截圖。</li>
              <li>超商代碼與 ATM 轉帳入帳可能延遲數分鐘。超過 30 分鐘仍未入帳再回報即可。</li>
              <li>活動贈送的積分屬平台回饋，不計入任何退款計算。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">二、抽獎結果</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>按下抽獎的那一刻結果就定了，斷線也算。不接受以「不滿意結果」或「沒中大獎」為由申請退換。</li>
              <li>如果你懷疑結果有問題：一番賞、抽卡、自製賞這類有籤號的玩法，該檔結束後會公開完整對照表，你可以自己算一次核對。方法在商品頁的「公平驗證」區塊。</li>
              <li>若因系統錯誤導致扣款卻沒拿到對應獎品，請聯繫客服，我們查得到那筆記錄，會補發代幣或該獎品。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">三、倉庫與出貨</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>倉庫提供 <strong className="text-neutral-700 dark:text-neutral-300">30 天免費寄存</strong>。第 31 天起還沒申請出貨的品項會自動換回代幣退還，不另行通知。</li>
              <li>換回代幣的操作不可撤銷，不論是你主動換的還是逾期自動處理的。</li>
              <li>訂單一經確認出貨即不能取消，也不能改收件資訊。還沒出貨的話盡快用 LINE 聯繫客服。</li>
              <li>因地址填寫錯誤、無人收件或拒收而退回者，重新寄送的運費由你負擔。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">四、收到的東西有問題</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mb-3">
              以下情況請於 <strong className="text-neutral-700 dark:text-neutral-300">收到商品 7 日內</strong> 用 LINE 聯繫客服：
            </p>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mb-4">
              <li className="flex gap-2"><span className="text-primary shrink-0">—</span>收到的商品與中獎項目不符</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">—</span>內容物有明顯製造瑕疵或破損</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">—</span>缺件</li>
            </ul>

            <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 p-4">
              <p className="text-sm font-black text-neutral-700 dark:text-neutral-300 mb-2">申請時請準備這三樣</p>
              <ul className="space-y-1.5 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                <li>1. 訂單編號</li>
                <li>2. 完整開箱錄影 —— 從外包裝還沒拆開始，到商品取出為止，全程不中斷</li>
                <li>3. 問題部位的清楚照片</li>
              </ul>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed mt-3">
                錄影不是刁難。缺件與破損多半分不出是運送途中還是拆封後發生的，
                有錄影我們才有辦法直接認定並處理，沒有的話雙方都只能各說各話。
                建議養成拆箱前先按下錄影的習慣。
              </p>
            </div>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">五、這些情況不受理</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>外盒壓痕、擦痕，而內容物完好 —— 運送途中的正常現象。</li>
              <li>原廠出廠本身的細微瑕疵，例如印刷偏移、輕微色差、細微刮痕。</li>
              <li>螢幕顯示與實品的顏色落差。</li>
              <li>超過 7 日才回報。</li>
              <li>沒有完整開箱錄影，或無法提供足以判斷的佐證。</li>
              <li>商品已拆封使用、組裝或改裝。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">六、我們怎麼補償</h2>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <li>確認屬平台責任者，優先<strong className="text-neutral-700 dark:text-neutral-300">補寄同款商品</strong>；該品項已無庫存時，改以補發等值代幣處理。</li>
              <li>屬金流錯誤（重複扣款等）者，依實際情況退還金錢。</li>
              <li>本條之處理方式，不排除您依消費者保護法及其他法律所享有之權利。</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">七、怎麼找到我們</h2>
            <div className="space-y-1 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <p>官方 LINE：<span className="font-bold text-neutral-900 dark:text-white">@ggb.tw</span>（服務時間 週一至週六 12:00 – 22:00）</p>
              <p>
                也可以到
                <L href="/faq">常見問題</L>
                頁面填表單回報。相關規則另見
                <L href="/terms">會員條款</L>。
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
