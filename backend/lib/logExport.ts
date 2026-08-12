/**
 * 匯出檔案時寫一筆稽核紀錄
 *
 * 後台各報表的「匯出」都是前端把資料組成檔案直接下載，不經過任何 API ——
 * 所以 `action_logs` 上完全看不到誰在什麼時候把哪一份名單帶走。
 * 對象又剛好都是最敏感的那幾類（會員清單、儲值紀錄、抽獎明細、廠商結算），
 * 沒有紀錄等於出事時查不到人。
 *
 * 身分與 IP 由 `/api/admin/logs` 從 session 取，這裡只描述「匯出了什麼」。
 *
 * 寫紀錄失敗不擋下載：稽核是附帶行為，不該讓管理員因為 log 掛了就匯不出報表。
 */
export async function logExport(target: string, details: string): Promise<void> {
  try {
    await fetch('/api/admin/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: '匯出報表', target, details }),
    })
  } catch {
    // 忽略：見上方說明
  }
}
