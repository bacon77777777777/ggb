'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Mail } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { translateAuthError } from '@/lib/authErrors';
import { isSyntheticEmail } from '@/lib/syntheticEmail';

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
 * 彈窗的流程與樣式照登入頁那套（老闆指定）：底線輸入框、
 * 「驗證碼已寄至」、大字驗證碼框、60 秒重新傳送倒數。
 * modal 裡預留「用 Google 綁定」按鈕（尚未串接，先看介面感覺）。
 */

const inputBase =
  'w-full border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent ' +
  'focus:outline-none focus:border-primary h-12 text-base placeholder:text-neutral-400 dark:text-white';

export function EmailBindRow({ email }: { email: string | null | undefined }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  // 綁完 Supabase 的 session 事件要一點時間才回流，先用本地狀態立即顯示
  const [boundEmail, setBoundEmail] = useState<string | null>(null);

  const synthetic = !boundEmail && isSyntheticEmail(email);
  const display = boundEmail || (synthetic ? null : email);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const sendCode = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) { setError('請輸入有效的電子信箱'); return; }
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setStep('code');
    setCode('');
    setCountdown(60);
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
          <div className="pt-1">
            <div className="relative mb-2">
              <Mail className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                inputMode="email"
                placeholder="請輸入電子信箱"
                className={`${inputBase} pl-8`}
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                autoFocus
              />
            </div>
            <p className="mb-6 text-xs text-neutral-400">
              {error
                ? <span className="text-red-500">{error}</span>
                : '綁定後可用信箱收驗證碼登入，換手機或 LINE 出狀況時帳號都找得回來。'}
            </p>
            <Button variant="solid" fullWidth size="lg" onClick={sendCode} isLoading={busy}>
              寄送驗證碼
            </Button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-200 dark:border-neutral-800" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white px-4 text-neutral-400 dark:bg-neutral-900">或</span></div>
            </div>

            {/* Google 綁定：介面先到位，串接等統編下來 */}
            <button
              onClick={() => showToast('Google 綁定即將開放', 'info')}
              className="h-11 w-full rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              使用 Google 帳號綁定
            </button>
          </div>
        ) : (
          <div className="pt-1">
            <p className="mb-6 text-center text-sm text-neutral-500">
              驗證碼已寄至<br />
              <span className="font-medium text-neutral-900 dark:text-neutral-200">{newEmail}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="mb-2 h-14 w-full border-b-2 border-neutral-200 bg-transparent text-center text-3xl font-bold tracking-[0.5em] focus:border-primary focus:outline-none dark:text-white"
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              autoFocus
            />
            {error && <p className="mb-2 text-center text-sm text-red-500">{error}</p>}
            <div className="mb-5 mt-3">
              <Button variant="solid" fullWidth size="lg" onClick={verify} isLoading={busy}>
                完成綁定
              </Button>
            </div>
            <div className="text-center">
              {countdown > 0 ? (
                <span className="text-sm text-neutral-400">請稍等 {countdown} 秒重新傳送</span>
              ) : (
                <button onClick={sendCode} disabled={busy} className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
                  重新傳送驗證碼
                </button>
              )}
            </div>
            <button
              onClick={() => { setStep('input'); setCode(''); setError(null); }}
              className="mt-3 w-full text-center text-xs text-neutral-400 underline"
            >
              重填信箱
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
