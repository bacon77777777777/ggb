import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 transition-colors">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 pt-4 pb-20 md:py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/faq" className="hover:text-primary dark:hover:text-primary-light">常見問題</Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <Link href="/about" className="hover:text-primary dark:hover:text-primary-light">關於我們</Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <Link href="/terms" className="hover:text-primary dark:hover:text-primary-light">會員條款</Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <Link href="/privacy" className="hover:text-primary dark:hover:text-primary-light">隱私權政策</Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <Link href="/return-policy" className="hover:text-primary dark:hover:text-primary-light">退換貨資訊</Link>
          </div>
          <div className="text-sm">
            客服信箱：<a href="mailto:support@gachago.shop" className="hover:text-primary dark:hover:text-primary-light">support@gachago.shop</a>
          </div>
        </div>
        <div className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-600">
          © 2025 GGB. All Rights Reserved.
        </div>
      </div>
    </footer>
  )
}
