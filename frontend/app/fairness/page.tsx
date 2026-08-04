import { redirect } from 'next/navigation';

/**
 * 公平性說明頁已改用活動頁模組產生（events.slug = 'fairness'），
 * 內容與圖片都能在後台改。這裡保留轉址，是因為 FAQ、服務條款、退換貨
 * 三頁的文案都提到「公平驗證頁面」，直接砍掉會讓既有連結與說法失效。
 */
export default function FairnessRedirect() {
  redirect('/events/fairness');
}
