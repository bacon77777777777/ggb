import { Button } from '@/components/ui';
import Image from 'next/image';

export function SocialLoginButtons() {
  return (
    <div className="flex flex-col gap-2.5 w-full">
      <Button
        type="button"
        variant="outline"
        className="w-full relative h-10 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-medium text-sm rounded-lg"
        onClick={() => {}}
      >
        <div className="absolute left-4 w-5 h-5 flex items-center justify-center">
          <Image src="/images/google.png" alt="Google" width={20} height={20} unoptimized />
        </div>
        使用 Google 帳號登入
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full relative h-10 border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-medium text-sm rounded-lg"
        onClick={() => {}}
      >
        <div className="absolute left-4 w-5 h-5 flex items-center justify-center">
          <Image src="/images/line.png" alt="LINE" width={20} height={20} unoptimized />
        </div>
        使用 LINE 帳號登入
      </Button>
    </div>
  );
}
