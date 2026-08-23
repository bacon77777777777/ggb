/**
 * 通知前台把快取打掉。
 *
 * 後台改完「會被烤進前台 HTML」的設定（目前是主題色）之後呼叫。
 * 不這樣做的話，前台靜態產生的頁面會一直吐出舊值 —— 2026-08-23 老闆改主題色
 * 只有登入頁變色就是這個原因（見 `frontend/app/api/revalidate/route.ts` 的說明）。
 *
 * **失敗不阻擋主流程**：設定本身已經存進資料庫了，清快取失敗頂多是晚一點生效
 *（`unstable_cache` 的 60 秒到期後、該頁下次重新產生時還是會更新）。
 * 為了清快取讓「儲存」回報失敗，會讓老闆以為沒存到而重存一次。
 */
export async function revalidateFrontend(tag?: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_FRONTEND_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!base || !secret) {
    console.warn('[revalidateFrontend] 缺 NEXT_PUBLIC_FRONTEND_URL 或 REVALIDATE_SECRET，略過');
    return;
  }
  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tag }),
      // 前台掛掉時不要把後台的儲存拖到 timeout
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn('[revalidateFrontend] 前台回', res.status);
  } catch (e) {
    console.warn('[revalidateFrontend] 呼叫失敗', e);
  }
}
