'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { translateAuthError } from '@/lib/authErrors';

/**
 * 個人設定的「電子郵件」列
 *
 * 三態：
 *   一般帳號     顯示信箱（過長截斷）
 *   純 LINE 帳號  顯示「前往綁定」—— 合成信箱是內部代號，不給玩家看。
 *                點開走 Supabase 的 email change 流程：填信箱 → 收 6 位驗證碼
 *                → 綁定完成。綁完帳號就有第二把鑰匙（信箱驗證碼登入），
 *                LINE 那列的「解除」也會自動解鎖
 *   綁定完成     顯示新信箱
 *
 * modal 裡預留了「用 Google 綁定」按鈕（尚未串接，先看介面感覺）。
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
              <span className="text-[14px] text-accent-red">前往綁定</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-neutral-300" />
            </>
          )}
        </div>
      </div>

      <Modal isOpen={open} onClose={close} title="綁定電子郵件">
        {step === 'input' ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-neutral-500">
              綁定後可以用信箱收驗證碼登入，換手機或 LINE 出狀況時帳號都找得回來。
            </p>
            <input
              type="email"
              inputMode="email"
              placeholder="請輸入電子信箱"
              className="h-12 w-full border-b border-neutral-200 bg-transparent text-base focus:border-primary focus:outline-none dark:border-neutral-700 dark:text-white"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? '寄送中…' : '寄送驗證碼'}
            </button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-100 dark:border-neutral-800" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-neutral-400 dark:bg-neutral-900">或</span></div>
            </div>

            {/* Google 綁定：介面先到位，串接等統編下來 */}
            <button
              type="button"
              onClick={() => showToast('Google 綁定即將開放', 'info')}
              className="h-11 w-full rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200"
            >
              使用 Google 帳號綁定
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-neutral-500">
              驗證碼已寄至<br />
              <span className="font-medium text-neutral-900 dark:text-neutral-200">{newEmail}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="h-14 w-full border-b-2 border-neutral-200 bg-transparent text-center text-3xl font-bold tracking-[0.5em] focus:border-primary focus:outline-none dark:text-white"
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            />
            {error && <p className="text-center text-sm text-red-500">{error}</p>}
            <button
              type="button"
              onClick={verify}
              disabled={busy}
              className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? '確認中…' : '完成綁定'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('input'); setCode(''); setError(null); }}
              className="w-full text-center text-xs text-neutral-400 underline"
            >
              重填信箱
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
