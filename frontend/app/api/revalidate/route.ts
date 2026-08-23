import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * 讓後台改完設定後，能主動把前台的快取打掉。
 *
 * ── 為什麼需要這支 ──
 * 主題色是在 root layout 的伺服器端算好、直接寫進 `<head>` 的 `<style>`
 *（見 `lib/serverTheme.ts`）。`unstable_cache` 的 60 秒只管「那次資料庫查詢」，
 * 不管**已經把結果烤進 HTML 的整頁快取** —— 靜態產生的頁面會一直吐出舊顏色。
 *
 * 2026-08-23 老闆把主題色改成紫色，結果「幾乎都沒變，只有登入頁面按鈕變」：
 * 登入是全站唯一會呼叫 `revalidatePath('/', 'layout')` 的地方
 *（`app/login/actions.ts`），所以只有它重新渲染、拿到新的 `<style>`。
 *
 * ── 為什麼是 revalidatePath('/', 'layout') 而不是只 revalidateTag ──
 * tag 只讓下一次查詢重跑；已經產生的頁面 HTML 不會重畫。主題色寫在 layout 的
 * `<head>`，所以要連整棵 layout 的頁面快取一起失效，兩個都要做。
 *
 * ── 驗證方式 ──
 * `x-revalidate-secret` 對 `REVALIDATE_SECRET`。沒設 env 就直接拒絕（回 503），
 * 不做「沒設就放行」—— 那等於把清快取的能力開放給全世界。
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'REVALIDATE_SECRET 未設定' }, { status: 503 });
  }
  if (request.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let tag: string | undefined;
  try {
    tag = (await request.json())?.tag;
  } catch {
    /* 沒帶 body 就只清整站 */
  }

  if (tag) revalidateTag(tag);
  revalidatePath('/', 'layout');

  return NextResponse.json({ revalidated: true, tag: tag ?? null });
}
