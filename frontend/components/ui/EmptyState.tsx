
import { ShoppingBag } from 'lucide-react';
import Button from './Button';
import Link from 'next/link';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  actionLink?: string;
  onAction?: () => void;
}

export function EmptyState({
  title = '暫無資料',
  description = '目前沒有任何資料顯示',
  actionLabel = '去逛逛',
  actionLink = '/',
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="bg-neutral-100 p-4 rounded-full mb-4">
        <ShoppingBag className="w-8 h-8 text-neutral-400" />
      </div>
      <h3 className="text-lg font-medium text-neutral-900 mb-2">{title}</h3>
      <p className="text-neutral-500 max-w-sm mb-6">{description}</p>
      {onAction ? (
        <Button onClick={onAction}>{actionLabel}</Button>
      ) : (
        <Link href={actionLink}>
          <Button>{actionLabel}</Button>
        </Link>
      )}
    </div>
  );
}
