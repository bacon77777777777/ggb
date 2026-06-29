
import Link from 'next/link';
import { Calendar, ChevronRight } from 'lucide-react';

interface NewsCardProps {
  id: string;
  title: string;
  date: string;
  category: string;
  content: string;
}

export default function NewsCard({ id, title, date, category, content }: NewsCardProps) {
  return (
    <Link href={`/news/${id}`} className="block group h-full">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 p-6 hover:border-primary/30 transition-all h-full flex flex-col shadow-card hover:shadow-modal relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <span className="px-3 py-1.5 text-[13px] font-black text-primary bg-primary/5 rounded-xl border border-primary/10 uppercase tracking-widest">
            {category}
          </span>
          <div className="flex items-center text-[13px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            {date}
          </div>
        </div>
        
        <h3 className="text-lg font-black text-neutral-900 dark:text-white mb-3 line-clamp-1 group-hover:text-primary transition-colors tracking-tight">
          {title}
        </h3>
        
        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-6 flex-1 leading-relaxed">
          {content}
        </p>
        
        <div className="flex items-center text-sm font-black text-primary mt-auto uppercase tracking-widest group-hover:gap-3 transition-all gap-2">
          閱讀更多
          <ChevronRight className="w-4 h-4 stroke-[3] transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}
