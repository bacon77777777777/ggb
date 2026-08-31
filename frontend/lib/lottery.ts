/**
 * 抽籤販售的共用型別與階段判斷。
 *
 * 階段一律由時間現算，前後端各算各的但用同一套規則（後端在
 * `backend/app/api/admin/lottery/route.ts` 的 phaseOf，DB 在 lottery_phase()）。
 * 三份必須一致，改規則要三邊一起改 —— 存成資料庫欄位就不用同步了，
 * 但那樣 cron 漏跑一次狀態就跟時鐘對不上，兩害相權取這個。
 */

export interface LotteryEventRow {
  id: number;
  product_id: number;
  title: string | null;
  subtitle: string | null;
  /** 品牌／IP（migration 665）。前台列表的分類頁籤照這欄分組；空值歸「其他」 */
  brand: string | null;
  cover_image_url: string | null;
  content: unknown;
  entry_points: number;
  per_user_entries: number;
  winners_count: number;
  backup_count: number;
  price_tokens: number;
  pay_deadline_hours: number;
  register_start_at: string;
  register_end_at: string;
  draw_at: string;
  drawn_at: string | null;
  /** 列表「最新」排序用 */
  created_at: string;
  commitment: string | null;
  seed: string | null;
  show_entry_count: boolean;
  status: string;
  product: { id: number; name: string; image_url: string | null; type: string; price: number } | null;
}

export type LotteryPhase =
  | 'draft' | 'upcoming' | 'registering' | 'pending_draw' | 'drawn' | 'cancelled';

export function phaseOf(e: Pick<LotteryEventRow,
  'status' | 'drawn_at' | 'register_start_at' | 'register_end_at'>): LotteryPhase {
  if (e.status === 'cancelled') return 'cancelled';
  if (e.status !== 'published') return 'draft';
  if (e.drawn_at) return 'drawn';
  const now = Date.now();
  if (now < new Date(e.register_start_at).getTime()) return 'upcoming';
  if (now < new Date(e.register_end_at).getTime()) return 'registering';
  return 'pending_draw';
}

/** `urgent` 是給倒數文字上紅色用的：只有登記中才有「快沒時間了」可言 */
export function phaseMeta(p: LotteryPhase): { label: string; cls: string; urgent: boolean } {
  switch (p) {
    case 'registering':  return { label: '登記中',   cls: 'bg-accent-red', urgent: true };
    case 'upcoming':     return { label: '即將開始', cls: 'bg-blue-500',   urgent: false };
    case 'pending_draw': return { label: '待開獎',   cls: 'bg-amber-500',  urgent: false };
    case 'drawn':        return { label: '已開獎',   cls: 'bg-neutral-500', urgent: false };
    case 'cancelled':    return { label: '已取消',   cls: 'bg-neutral-400', urgent: false };
    default:             return { label: '準備中',   cls: 'bg-neutral-400', urgent: false };
  }
}

/**
 * 卡片底部那顆按鈕的字。
 *
 * 列表卡片與內頁底部操作欄用同一套文案，不要各寫一份 —— 兩邊講不一樣的話，
 * 玩家在列表看到「立即登記」點進去卻是「尚未開放登記」。
 * 內頁還會另外疊上「維護中」與「已達個人上限」兩種狀態（那兩個要拿到玩家資料才知道）。
 */
export function ctaText(p: LotteryPhase): { text: string; disabled: boolean } {
  switch (p) {
    case 'registering':  return { text: '立即登記',             disabled: false };
    case 'upcoming':     return { text: '尚未開放登記',         disabled: true  };
    case 'pending_draw': return { text: '登記已截止，等待開獎', disabled: true  };
    /* 內頁的中獎名單就在同一頁上，所以這裡是停用的說明字，不是可按的動作。
       列表卡片會自己把字換成「查看中獎名單」—— 那張卡整片都是連結，點得進來 */
    case 'drawn':        return { text: '已開獎',                 disabled: true  };
    case 'cancelled':    return { text: '此檔期已取消',         disabled: true  };
    default:             return { text: '準備中',               disabled: true  };
  }
}

/**
 * 卡片上那一行倒數。
 *
 * 每個階段要回答的問題不一樣：登記中問「還剩多久可以登記」、即將開始問
 * 「什麼時候開放」、待開獎問「什麼時候公布」。全部寫成同一句「剩 X」的話，
 * 待開獎的卡片會變成「剩 0 天」，看起來像壞掉。
 */
export function countdownText(
  e: Pick<LotteryEventRow, 'register_start_at' | 'register_end_at' | 'draw_at' | 'drawn_at'>,
  p: LotteryPhase,
): string {
  const now = Date.now();
  const left = (iso: string) => new Date(iso).getTime() - now;
  const human = (ms: number) => {
    if (ms <= 0) return '即將';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (d > 0) return `${d} 天 ${h} 小時`;
    if (h > 0) return `${h} 小時 ${m} 分`;
    // 最後一小時才給到秒 —— 平常顯示秒會讓整頁每秒都在動，很吵
    return `${m} 分 ${s} 秒`;
  };
  const at = (iso: string) =>
    new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  switch (p) {
    case 'upcoming':     return `${at(e.register_start_at)} 開放登記`;
    case 'registering':  return `距登記截止 ${human(left(e.register_end_at))}`;
    case 'pending_draw': return `${at(e.draw_at)} 公布名單`;
    case 'drawn':        return `${at(e.drawn_at ?? e.draw_at)} 已公布名單`;
    case 'cancelled':    return '此檔期已取消';
    default:             return '';
  }
}
