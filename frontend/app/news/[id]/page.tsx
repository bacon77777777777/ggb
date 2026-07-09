'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/Skeleton';
import { Clock, Tag, Send, ChevronLeft, Share2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  source_url: string | null;
  category: string | null;
  tags: string[] | null;
  created_at: string;
  view_count: number;
}

interface Comment {
  id: string;
  news_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: { name: string; avatar_url: string | null };
  likes_count: number;
  is_liked: boolean;
  is_own: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  ichiban: '一番賞', gacha: '轉蛋', blindbox: '盒玩', tcg: '卡牌', general: '綜合',
};

const CATEGORY_COLORS: Record<string, string> = {
  ichiban: 'bg-blue-500', gacha: 'bg-orange-500', blindbox: 'bg-purple-500',
  tcg: 'bg-amber-500', general: 'bg-neutral-400',
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={cn(
      'inline-flex items-center h-[18px] px-1.5 text-[10px] font-bold text-white rounded-[4px]',
      CATEGORY_COLORS[category] ?? 'bg-neutral-400'
    )}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return '剛剛';
  if (diff < 3600)  return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(dateStr).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

// ─── 讚圖標 ─────────────────────────────────────────────────────────────────
function ThumbUpIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={filled ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

// ─── 頭像 ────────────────────────────────────────────────────────────────────
function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initials = (name ?? '?').slice(0, 1).toUpperCase();
  if (src) {
    return (
      <div style={{ width: size, height: size }} className="rounded-full overflow-hidden flex-shrink-0 relative">
        <img src={src} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size }}
      className="rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-black text-sm">
      {initials}
    </div>
  );
}

// ─── 留言列表項目 ─────────────────────────────────────────────────────────────
function CommentItem({
  comment, onLike, onDelete,
}: {
  comment: Comment;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const [swiped, setSwiped] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dist = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (!comment.is_own) return;
    if (dist > 60) setSwiped(true);
    if (dist < -30) setSwiped(false);
  };

  const handleLike = () => {
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 400);
    onLike(comment.id);
  };

  return (
    <div className="relative overflow-hidden">
      {/* 刪除按鈕（左滑顯示）*/}
      {comment.is_own && (
        <button
          onClick={() => { setSwiped(false); onDelete(comment.id); }}
          className={cn(
            'absolute right-0 top-0 bottom-0 w-20 bg-red-500 text-white text-xs font-black flex items-center justify-center transition-transform duration-200',
            swiped ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          刪除
        </button>
      )}

      {/* 留言主體 */}
      <div
        className={cn(
          'flex items-start gap-2.5 px-4 py-2 transition-transform duration-200',
          swiped && comment.is_own ? '-translate-x-20' : 'translate-x-0'
        )}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => swiped && setSwiped(false)}
      >
        <Avatar src={comment.user.avatar_url} name={comment.user.name} size={30} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-black text-neutral-900 dark:text-white">{comment.user.name}</span>
            <span className="text-[11px] text-neutral-400">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="text-[13px] text-neutral-700 dark:text-neutral-300 leading-[1.45] break-words mt-0.5">
            {comment.content}
          </p>
        </div>
        {/* 留言按讚 */}
        <button
          onClick={handleLike}
          className={cn('flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5',
            comment.is_liked ? 'text-primary' : 'text-neutral-400'
          )}
        >
          <ThumbUpIcon filled={comment.is_liked}
            className={cn('w-4 h-4 transition-transform', likeAnim && 'scale-[1.5]')} />
          {comment.likes_count > 0 && (
            <span className="text-[10px] font-black leading-none">{comment.likes_count}</span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── 留言抽屜 ─────────────────────────────────────────────────────────────────
function SendCircle() {
  return (
    <div className="w-[26px] h-[26px] rounded-full bg-primary flex items-center justify-center flex-shrink-0">
      <Send className="w-3 h-3 text-white" />
    </div>
  );
}

function CommentSheet({
  open, onClose, comments, totalCount,
  onLike, onDelete, onSubmit, submitting, isLoggedIn,
  articleLiked, articleLikeCount, onArticleLike, articleLikeAnim,
}: {
  open: boolean;
  onClose: () => void;
  comments: Comment[];
  totalCount: number;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  onSubmit: (text: string) => Promise<void>;
  submitting: boolean;
  isLoggedIn: boolean;
  articleLiked: boolean;
  articleLikeCount: number;
  onArticleLike: () => void;
  articleLikeAnim: boolean;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (isLoggedIn) setTimeout(() => inputRef.current?.focus(), 350);
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      }, 400);
    }
  }, [open, isLoggedIn]);

  const handleSend = async () => {
    const t = text.trim();
    if (!t || submitting) return;
    setText('');
    await onSubmit(t);
    setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 100);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className={cn('fixed inset-0 bg-black/40 z-40 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        onClick={onClose}
      />

      {/* 抽屜 */}
      <div className={cn(
        'fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-neutral-900 rounded-t-2xl shadow-xl',
        'flex flex-col transition-transform duration-300',
        open ? 'translate-y-0' : 'translate-y-full'
      )} style={{ maxHeight: '65vh' }}>

        {/* 標題列 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-neutral-100 dark:border-neutral-800 flex-shrink-0">
          <span className="text-[15px] font-black text-neutral-900 dark:text-white">
            留言 <span className="text-neutral-400 font-bold">{totalCount}</span>
          </span>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 留言列表 */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain divide-y divide-neutral-50 dark:divide-neutral-800">
          {comments.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm font-bold">還沒有留言，來搶沙發！</div>
          ) : (
            comments.map(c => (
              <CommentItem key={c.id} comment={c} onLike={onLike} onDelete={onDelete} />
            ))
          )}
        </div>

        {/* 輸入列（與底部 bar 一致）*/}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-t border-neutral-100 dark:border-neutral-800 pb-[max(10px,env(safe-area-inset-bottom))]">
          {/* 文章按讚 */}
          <button
            onClick={onArticleLike}
            className={cn('flex items-center gap-1.5 flex-shrink-0 transition-colors',
              articleLiked ? 'text-primary' : 'text-neutral-400 dark:text-neutral-500'
            )}
          >
            <ThumbUpIcon filled={articleLiked}
              className={cn('w-6 h-6 transition-transform duration-200', articleLikeAnim && 'scale-[1.4]')} />
            <span className="text-[14px] font-black tabular-nums">{articleLikeCount}</span>
          </button>

          {/* 輸入框 */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={e => isLoggedIn && setText(e.target.value)}
              onKeyDown={handleKey}
              maxLength={300}
              readOnly={!isLoggedIn}
              placeholder={isLoggedIn ? '說點什麼...' : '請先登入才能留言唷'}
              className={cn(
                'w-full rounded-full pl-4 pr-10 py-2 text-[13px] placeholder-neutral-400 outline-none',
                isLoggedIn
                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
              )}
            />
            <button
              onClick={handleSend}
              disabled={!isLoggedIn || !text.trim() || submitting}
              className="absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-150 disabled:opacity-25"
            >
              <SendCircle />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── 主頁 ─────────────────────────────────────────────────────────────────────
export default function NewsDetailPage() {
  const params  = useParams();
  const newsId  = params.id as string;
  const supabase = createClient();
  const { user } = useAuth();

  const [item, setItem]           = useState<NewsItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 按讚
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked]         = useState(false);
  const [likeAnim, setLikeAnim]   = useState(false);

  // 留言
  const [comments, setComments]       = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);

  // 載入文章
  useEffect(() => {
    if (!newsId) return;
    supabase
      .from('news')
      .select('*')
      .eq('id', newsId)
      .single()
      .then(({ data }) => {
        setItem(data);
        setIsLoading(false);
        if (data) supabase.from('news').update({ view_count: (data.view_count ?? 0) + 1 }).eq('id', data.id);
      });
  }, [newsId]);

  // 載入按讚 + 留言數（快速）+ 完整留言（背景）
  useEffect(() => {
    if (!newsId) return;

    // 快速撈：按讚狀態 + 留言數（直接用 supabase client，不走 API route）
    Promise.all([
      fetch(`/api/news/${newsId}/like`).then(r => r.json()),
      supabase.from('news_comments').select('*', { count: 'exact', head: true }).eq('news_id', newsId),
    ]).then(([likeData, { count }]) => {
      setLikeCount(likeData.count ?? 0);
      setLiked(likeData.liked ?? false);
      setCommentCount(count ?? 0);
    });

    // 背景載入完整留言列表（供打開抽屜用）
    fetch(`/api/news/${newsId}/comments`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        setComments(d);
        setCommentCount(d.length);
      }
    });
  }, [newsId]);

  const handleLike = async () => {
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 400);
    // Optimistic update
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount(c => c + (nextLiked ? 1 : -1));
    const res = await fetch(`/api/news/${newsId}/like`, { method: 'POST' });
    if (res.ok) {
      const d = await res.json();
      setLiked(d.liked);
      setLikeCount(d.count);
    } else {
      // Rollback
      setLiked(!nextLiked);
      setLikeCount(c => c + (nextLiked ? -1 : 1));
    }
  };

  const handleCommentLike = useCallback(async (commentId: string) => {
    setComments(prev => prev.map(c => c.id === commentId
      ? { ...c, is_liked: !c.is_liked, likes_count: c.likes_count + (c.is_liked ? -1 : 1) }
      : c
    ));
    await fetch(`/api/news/comments/${commentId}/like`, { method: 'POST' });
  }, []);

  const handleCommentDelete = useCallback(async (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    await fetch(`/api/news/comments/${commentId}`, { method: 'DELETE' });
  }, []);

  const handleSubmit = async (text: string) => {
    if (!user) { alert('請先登入才能留言'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/news/${newsId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments(prev => [...prev, newComment]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = () => {
    if (navigator.share && item) {
      navigator.share({ title: item.title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => alert('連結已複製'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">
        <Skeleton className="w-full aspect-[4/3]" />
        <div className="px-4 pt-4 space-y-3">
          <Skeleton className="h-6 w-full rounded" />
          <Skeleton className="h-6 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
          <div className="pt-4 space-y-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 p-8">
        <p className="text-5xl mb-4">😢</p>
        <h1 className="text-lg font-black text-neutral-900 dark:text-white mb-2">找不到這篇文章</h1>
        <Link href="/news" className="text-primary font-bold text-sm">回到情報首頁</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-[80px]">

      {/* ── 頂部操作列（絕對定位在圖片上方）── */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-2 pt-[env(safe-area-inset-top)] pointer-events-none">
        <Link href="/news"
          className="pointer-events-auto m-2 w-9 h-9 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
          <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
        </Link>
        <button onClick={handleShare}
          className="pointer-events-auto m-2 w-9 h-9 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* ── 主圖 ── */}
      {item.image_url && (
        <div className="w-full bg-neutral-100 dark:bg-neutral-900">
          <Image src={item.image_url} alt={item.title} width={800} height={600} className="w-full h-auto" unoptimized />
        </div>
      )}

      <article className="px-4 pt-4">
        {/* 分類 + 時間 */}
        <div className="flex items-center gap-2 mb-3">
          {item.category && <CategoryBadge category={item.category} />}
          <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            <Clock className="w-3 h-3" />
            <span>{formatDate(item.created_at)}</span>
          </div>
        </div>

        {/* 標題 */}
        <h1 className="text-[20px] font-black text-neutral-900 dark:text-white leading-[1.3] mb-4">
          {item.title}
        </h1>

        {/* 文章內容 */}
        {item.content ? (
          <div className="news-content text-[15px] text-neutral-700 dark:text-neutral-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: item.content }} />
        ) : (
          <p className="text-neutral-400 text-sm">暫無內容</p>
        )}

        {/* 標籤 */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Tag className="w-3.5 h-3.5 text-neutral-400 mt-0.5" />
            {item.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-[11px] font-bold rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>

      {/* ── 固定底部 bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-3 px-4 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
        {/* 按讚 */}
        <button
          onClick={handleLike}
          className={cn('flex items-center gap-1.5 flex-shrink-0 transition-colors',
            liked ? 'text-primary' : 'text-neutral-400 dark:text-neutral-500'
          )}
        >
          <ThumbUpIcon filled={liked}
            className={cn('w-6 h-6 transition-transform duration-200',
              likeAnim && 'scale-[1.4]'
            )} />
          <span className="text-[14px] font-black tabular-nums">{likeCount}</span>
        </button>

        {/* 留言輸入框（點擊開啟抽屜）*/}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex-1 relative flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-full text-left"
        >
          <span className="flex-1 text-[13px] text-neutral-400 px-4 py-2 pr-10">
            {commentCount ? `${commentCount} 則留言` : '則留言'}
          </span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            <SendCircle />
          </span>
        </button>
      </div>

      {/* ── 留言抽屜 ── */}
      <CommentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        comments={comments}
        totalCount={commentCount ?? comments.length}
        onLike={handleCommentLike}
        onDelete={handleCommentDelete}
        onSubmit={handleSubmit}
        submitting={submitting}
        isLoggedIn={!!user}
        articleLiked={liked}
        articleLikeCount={likeCount}
        onArticleLike={handleLike}
        articleLikeAnim={likeAnim}
      />
    </div>
  );
}
