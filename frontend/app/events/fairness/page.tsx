import type { Metadata } from 'next'
import FairnessContent from './content'

/*
 * 網址刻意留在 /events/fairness：首頁底部警語列、FAQ／服務條款／退換貨的文案
 * 都指過來，而且 Navbar 在 `/events/` 底下會自己隱藏（LP 有自己的返回與分享列）。
 * 搬到別的路徑要同時改那幾處並補轉址，換來的只是網址好看一點。
 *
 * 靜態路徑優先於同層的 [slug]，所以這個檔案會蓋掉活動頁模組的動態路由。
 */
export const metadata: Metadata = {
  title: '抽獎公平性｜吉吉比',
  description:
    '一番賞、抽卡、自製賞在開賣前就把每支籤對應的獎品排定並封存，同時公布驗證碼。完抽後開獎表整份公開，你可以自己算一次核對。',
  alternates: { canonical: '/events/fairness' },
}

export default function FairnessPage() {
  return <FairnessContent />
}
