import { native } from '@/lib/native/bridge';
import { openInAppBrowser } from '@/lib/native/browser';

/**
 * 開綠界的超商選店地圖（老闆 2026-08-24：不要跳轉出去 Safari）
 *
 * 為什麼要分兩條路：
 *   **App**（Capacitor）：以前是「動態建 form + target=_blank」，而 `_blank` 在 Capacitor
 *     會被交給系統瀏覽器 —— 玩家被丟到 Safari，選完店停在一片空白、回不來（老闆實機回報）。
 *     改用 in-app browser 開一個網址（後端的 map route 已支援 GET）：它是蓋在 App 上的一層，
 *     選完店由呼叫端輪詢到結果後 `closeInAppBrowser()` 收掉，玩家自動回到原本的畫面。
 *   **網頁**：`_blank` 開新分頁本來就正常（回呼頁會 postMessage 給 opener 再自己關），
 *     維持原樣不動 —— 那條路已經在跑，沒必要一起改。
 *
 * 地圖必須開在**後台網域**（NEXT_PUBLIC_API_URL）：綠界的 CheckMacValue 與
 * ServerReplyURL 都在後端算與收，前台沒有金鑰。
 */
export interface StoreMapOptions {
  /**
   * 品牌代號 UNIMART / FAMI / HILIFE。**不要在這裡加 C2C 後綴** ——
   * 要送 B2C 還是 C2C 由後端 `toEcpayCvsSubType()` 依廠商編號決定，
   * 前台猜錯綠界只會回「找不到加密金鑰」一片白。
   */
  logisticsSubType: string;
  /** 這一趟的識別碼，回呼寫進 cvs_pending_selections，前台靠它輪詢 */
  requestId: string;
}

export async function openStoreMap({ logisticsSubType, requestId }: StoreMapOptions): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const url = `${baseUrl}/api/logistics/map?logisticsSubType=${encodeURIComponent(logisticsSubType)}&requestId=${encodeURIComponent(requestId)}`;

  if (native.isNativePlatform()) {
    const ok = await openInAppBrowser(url);
    if (ok) return;
    // 外掛不在（理論上不會）就退回開新視窗，至少玩家選得到門市
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.target = '_blank';
  form.action = `${baseUrl}/api/logistics/map`;
  const add = (name: string, value: string) => {
    const i = document.createElement('input');
    i.type = 'hidden';
    i.name = name;
    i.value = value;
    form.appendChild(i);
  };
  add('logisticsSubType', logisticsSubType);
  add('requestId', requestId);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** 這一趟的識別碼 */
export function newStoreMapRequestId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
