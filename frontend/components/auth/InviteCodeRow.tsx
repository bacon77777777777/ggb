'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/**
 * 個人設定的「邀請碼」列 —— 事後填寫朋友的邀請碼
 *
 * 邀請碼從註冊頁移到這裡：門口少一個欄位，而且 LINE／Google 進站的玩家
 *（不經過註冊頁）也有機會被推薦。規則在 /api/user/claim-invite：
 * 一次為限、不能填自己的、註冊後 7 天內有效。
 *
 * 超過 7 天又沒填過的帳號整列隱藏 —— 留一顆按了只會報錯的入口沒有意義。
 */
export function InviteCodeRow() {
  const { showToast } = useToast();
  const [state, setState] = useState<{ claimed: boolean; eligible: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user/claim-invite')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setState(d); })
      .catch(() => {});
  }, []);

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
      setState({ claimed: true, eligible: true });
      setOpen(false);
      showToast('邀請碼填寫成功', 'success');
    } catch {
      setError('填寫失敗，請重試一次');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  if (!state.claimed && !state.eligible) return null;

  return (
    <>
      <div
        className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
        onClick={() => { if (!state.claimed) setOpen(true); }}
      >
        <label className="text-[15px] text-neutral-800 dark:text-neutral-200">邀請碼</label>
        <div className="flex items-center gap-2">
          {state.claimed ? (
            <span className="text-[14px] text-neutral-400">已填寫</span>
          ) : (
            <>
              <span className="text-[14px] text-primary">填寫</span>
              <ChevronRight className="w-4 h-4 text-neutral-300" />
            </>
          )}
        </div>
      </div>

      <Modal isOpen={open} onClose={() => { if (!busy) { setOpen(false); setError(null); } }} title="填寫邀請碼">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-neutral-500">
            朋友邀請你來的嗎？填上他的邀請碼，他會收到邀請獎勵。
          </p>
          <input
            type="text"
            placeholder="請輸入邀請碼"
            className="h-12 w-full border-b border-neutral-200 bg-transparent text-base uppercase tracking-widest focus:border-primary focus:outline-none dark:border-neutral-700 dark:text-white"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? '送出中…' : '送出'}
          </button>
        </div>
      </Modal>
    </>
  );
}
