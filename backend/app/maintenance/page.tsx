/**
 * 後台維護頁
 *
 * `maintenance_scope` 設成 backend 或 all 時，middleware 會把
 * 超級管理員以外的所有人導到這裡。
 *
 * 刻意不查資料庫、不引任何 context：維護中的時候後台是不是壞了本來就是未知數，
 * 這一頁必須在其他東西都壞掉的情況下還能長出來。
 */
export default function BackendMaintenancePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-5 px-6 text-center bg-neutral-50">
      <div className="text-5xl">🛠️</div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-xl font-black text-neutral-900">後台維護中</h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          系統正在調整，暫時無法操作。維護結束後重新整理就會恢復。
        </p>
        <p className="text-xs text-neutral-400">
          若你是超級管理員，登入後可照常使用。
        </p>
      </div>
      <a
        href="/login"
        className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
      >
        重新登入
      </a>
    </main>
  );
}
