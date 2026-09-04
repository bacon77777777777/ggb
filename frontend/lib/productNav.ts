/**
 * 商品頁「返回」要去哪：跟 Navbar 的規則同一套。
 *
 * 從搜尋／首頁點進商品時會把來源寫進 sessionStorage（gachago:return_to），
 * 30 分鐘內按返回就回到那一頁（保留捲動位置與篩選）；沒有就回首頁。
 * 電腦版把返回鈕做進舞台裡（老闆 2026-09-04：照 packs），所以這段邏輯抽出來共用。
 */
export function resolveProductBackUrl(): string {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('gachago:return_to') : null;
    if (raw) {
      const parsed = JSON.parse(raw) as { url?: string; timestamp?: number };
      const url = typeof parsed.url === 'string' ? parsed.url : '';
      const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (url.startsWith('/') && Date.now() - ts <= 30 * 60 * 1000) {
        sessionStorage.removeItem('gachago:return_to');
        return url;
      }
    }
  } catch {}
  return '/';
}
