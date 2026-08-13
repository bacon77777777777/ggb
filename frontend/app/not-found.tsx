
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    /*
     * 高度不能用 min-h-screen（100vh）：
     *   · iOS Safari 的 100vh 是「網址列收起來」的大視口，網址列還在時就會多出一截
     *   · 上面還有 sticky 的 Navbar（57px）佔文件高度
     * 兩個加起來，內容明明很少 iPhone 卻要往下滑。改用 100dvh 扣掉 Navbar，
     * 再留 pb 給固定在底部的 MobileTabbar，讓內容視覺上置中在導覽列之間。
     */
    <div className="min-h-[calc(100dvh-57px)] bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] text-center transition-colors">
      <h1 className="text-9xl font-bold text-primary/20">404</h1>
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mt-4 mb-2">頁面找不到</h2>
      <p className="text-neutral-500 dark:text-neutral-400 mb-8 max-w-md">
        您所尋找的頁面可能已被移除、名稱已更改或暫時無法使用。
      </p>
      <Link href="/">
        <Button size="lg">回首頁</Button>
      </Link>
    </div>
  );
}
