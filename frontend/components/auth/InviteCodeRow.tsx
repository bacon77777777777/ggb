'use client';

import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSettingsStatus } from '@/components/auth/useSettingsStatus';

/**
 * 會員中心「邀請碼」列 —— 事後填寫朋友的邀請碼
 *
 * 邀請碼從註冊頁移到這裡：門口少一個欄位，而且 LINE／Google 進站的玩家
 *（不經過註冊頁）也有機會被推薦。規則在 /api/user/claim-invite：
 * 一次為限、不能填自己的、註冊後 7 天內有效。
 *
 * 超過 7 天又沒填過的帳號整列隱藏 —— 留一顆按了只會報錯的入口沒有意義。
 * 狀態來自 useSettingsStatus（含快取），跟 LINE 列同一趟請求、同時出現。
 */
export function InviteCodeRow() {
  const { showToast } = useToast();
  const { data, refresh } = useSettingsStatus();
  const invite = data?.invite ?? null;
  const [open, setOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 送出成功後快取還沒更新前的立即顯示
  const [justClaimed, setJustClaimed] = useState(false);

  const submit = async () => {
    setError(null);
    if (!codeInput.trim()) { setError('請輸入邀請碼'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/user/claim-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || '填寫失敗，請重試一次'); return; }
      setJustClaimed(true);
      setOpen(false);
      showToast('邀請碼填寫成功', 'success');
      void refresh();
    } catch {
      setError('填寫失敗，請重試一次');
    } finally {
      setBusy(false);
    }
  };

  const claimed = justClaimed || Boolean(invite?.claimed);
  // 已知不符資格又沒填過 → 整列收掉
  if (invite && !claimed && !invite.eligible) return null;

  return (
    <>
      <div
        className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
        onClick={() => { if (invite && !claimed) setOpen(true); }}
      >
        <label className="text-[15px] text-neutral-800 dark:text-neutral-200">邀請碼</label>
        <div className="flex items-center gap-2">
          {invite === null ? (
            <span className="h-3.5 w-14 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          ) : claimed ? (
            <span className="text-[14px] text-neutral-400">已填寫</span>
          ) : (
            <>
              <span className="text-[14px] text-accent-red">立即填寫</span>
              <ChevronRight className="w-4 h-4 text-neutral-300" />
            </>
          )}
        </div>
      </div>

      <Modal compact isOpen={open} onClose={() => { if (!busy) { setOpen(false); setError(null); } }} title="填寫邀請碼">
        <div className="mb-2">
          <input
            type="text"
            placeholder="例：AB12CD34"
            className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium uppercase tracking-widest text-neutral-900 dark:text-white placeholder:text-neutral-400 placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            autoFocus
          />
        </div>
        <p className="text-xs text-neutral-400 mb-6">
          {error ? <span className="text-red-500">{error}</span> : '朋友邀請你來的嗎？填上他的邀請碼，他會收到邀請獎勵。'}
        </p>
        <button
          onClick={submit}
          disabled={busy || !codeInput.trim()}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : '送出'}
        </button>
      </Modal>
    </>
  );
}
