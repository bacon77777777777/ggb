'use client';

/**
 * 維護頁的重新整理鈕
 *
 * 用整頁重載而不是 next/link：維護結束與否是 middleware 在伺服器端判斷的，
 * 硬重載最不會受到任何前端快取影響 —— 這一頁存在的前提就是「其他東西可能都壞了」。
 * （寫成獨立的 client component 是因為維護頁本身是 server component，
 *   而且 ESLint 的 no-html-link-for-pages 不接受直接寫 <a href="/">。）
 */
export default function MaintenanceReloadButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.assign('/')}
      className="mt-2 px-6 py-3 rounded-2xl bg-primary text-white text-sm font-black hover:bg-primary-dark transition-colors"
    >
      重新整理看看
    </button>
  );
}
