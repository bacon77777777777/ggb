'use client';

import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { translateAuthError } from '@/lib/authErrors';

/**
 * 個人設定的「電子郵件」列
 *
 * 三態：
 *   一般帳號     顯示信箱（過長截斷）
 *   純 LINE 帳號  顯示「立即綁定」—— 合成信箱是內部代號，不給玩家看。
 *                點開走 Supabase 的 email change 流程：填信箱 → 收 6 位驗證碼
 *                → 綁定完成。綁完帳號就有第二把鑰匙（信箱驗證碼登入），
 *                LINE 那列的「解除」也會自動解鎖
 *   綁定完成     顯示新信箱
 *
 * modal 裡預留了「用 Google 綁定」按鈕（尚未串接，先看介面感覺）。
 * 彈窗樣式照站上標準（編輯暱稱那套：框線輸入框 + 44px 主按鈕）。
 */

const SYNTHETIC_SUFFIX = '@line-login.ggb.internal';

export function EmailBindRow({ email }: { email: string | null | undefined }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 綁完 Supabase 的 session 事件要一點時間才回流，先用本地狀態立即顯示
  const [boundEmail, setBoundEmail] = useState<string | null>(null);

  const synthetic = !boundEmail && String(email ?? '').endsWith(SYNTHETIC_SUFFIX);
  const display = boundEmail || (synthetic ? null : email);

  const sendCode = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) { setError('請輸入有效的電子信箱'); return; }
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setStep('code');
  };

  const verify = async () => {
    setError(null);
    if (code.length < 6) { setError('請輸入 6 位數驗證碼'); return; }
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({
      type: 'email_change',
      email: newEmail.trim(),
      token: code,
    });
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setBoundEmail(newEmail.trim());
    setOpen(false);
    showToast('信箱綁定成功', 'success');
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setStep('input');
    setCode('');
    setError(null);
  };

  return (
    <>
      <div
        className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
        onClick={() => { if (synthetic) setOpen(true); }}
      >
        <label className="text-[15px] text-neutral-800 dark:text-neutral-200 shrink-0">電子郵件</label>
        <div className="flex min-w-0 items-center gap-2 pl-4">
          {display ? (
            // 信箱可以很長，塞不下就 … —— 不能把整列撐到跑版
            <span className="min-w-0 truncate text-[14px] text-neutral-900 dark:text-white">{display}</span>
          ) : (
            <>
              <span className="text-[14px] text-accent-red">立即綁定</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-neutral-300" />
            </>
          )}
        </div>
      </div>

      <Modal compact isOpen={open} onClose={close} title="綁定電子郵件">
        {step === 'input' ? (
          <>
            <div className="mb-2">
              <input
                type="email"
                inputMode="email"
                placeholder="請輸入電子信箱"
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-xs text-neutral-400 mb-6">
              {error
                ? <span className="text-red-500">{error}</span>
                : '綁定後可用信箱收驗證碼登入，換手機或 LINE 出狀況時帳號都找得回來。'}
            </p>
            <button
              onClick={sendCode}
              disabled={busy || !newEmail.trim()}
              className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : '寄送驗證碼'}
            </button>

            {/* Google 綁定：介面先到位，串接等統編下來 */}
            <button
              onClick={() => showToast('Google 綁定即將開放', 'info')}
              className="mt-2.5 w-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 h-[44px] rounded-lg font-bold text-[15px] active:scale-[0.98] transition-all"
            >
              使用 Google 帳號綁定
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-neutral-500 mb-4">
              驗證碼已寄至<br />
              <span className="font-medium text-neutral-900 dark:text-neutral-200">{newEmail}</span>
            </p>
            <div className="mb-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-center text-2xl font-bold tracking-[0.4em] text-neutral-900 dark:text-white placeholder:text-neutral-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                value={code}
                onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                autoFocus
              />
            </div>
            <p className="text-xs text-neutral-400 mb-6 text-center">
              {error ? <span className="text-red-500">{error}</span> : '沒收到的話，檢查一下垃圾信件匣'}
            </p>
            <button
              onClick={verify}
              disabled={busy || code.length < 6}
              className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : '完成綁定'}
            </button>
            <button
              onClick={() => { setStep('input'); setCode(''); setError(null); }}
              className="mt-2.5 w-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 h-[44px] rounded-lg font-bold text-[15px] active:scale-[0.98] transition-all"
            >
              重填信箱
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
