
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center px-4 text-center transition-colors">
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
