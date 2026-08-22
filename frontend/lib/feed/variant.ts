/**
 * A/B 變體：v1 = 舊的推薦排序、v2 = 新 feed。
 * 比例由 platform_settings.feed_ab_ratio（分到 v1 的百分比，預設 0 = 全部 v2）決定，
 * 由 /api/public/feed-weights 一起帶回；以 session id 雜湊決定，同一個 session 固定。
 * 報表：SELECT * FROM feed_ab_report(7)。
 */
import { setVariant } from './events';

export function resolveVariant(abRatio: number): 'v1' | 'v2' {
  let v: 'v1' | 'v2' = 'v2';
  try {
    const stored = sessionStorage.getItem('ggb:feed:variant');
    if (stored === 'v1' || stored === 'v2') v = stored;
    else {
      const sid = sessionStorage.getItem('_ggb_sid') || '';
      let h = 0;
      for (let i = 0; i < sid.length; i++) h = (h * 31 + sid.charCodeAt(i)) >>> 0;
      v = (h % 100) < Math.max(0, Math.min(100, abRatio)) ? 'v1' : 'v2';
      sessionStorage.setItem('ggb:feed:variant', v);
    }
  } catch { /* 無痕 */ }
  setVariant(v);
  return v;
}
