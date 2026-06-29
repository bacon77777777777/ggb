import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-neutral-900 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-neutral-700 mb-4">頁面不存在</h2>
        <p className="text-neutral-600 mb-8">抱歉，您訪問的頁面不存在</p>
        <Link
          href="/dashboard"
          className="inline-block bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-dark transition-colors"
        >
          返回儀表板
        </Link>
      </div>
    </div>
  )
}
