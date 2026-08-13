
'use client';
 
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'plain';

interface Toast {
  id: string;
  /** 去重用的鍵（type + 訊息文字）。非字串訊息為 null，不參與去重 */
  key: string | null;
  message: React.ReactNode;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: React.ReactNode, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/** 同一則訊息最多只留一個；不同訊息最多同時顯示這麼多則 */
const MAX_TOASTS = 3;
const DURATION_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  /** id → 自動關閉的計時器。同一則重複觸發時要能把舊的取消掉重新計時 */
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** 目前畫面上的訊息鍵 → id。去重查這個，不查 state */
  const activeKeys = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setMounted(true);
    const t = timers.current;
    const k = activeKeys.current;
    return () => { t.forEach(clearTimeout); t.clear(); k.clear(); };
  }, []);

  const dismiss = useCallback((id: string, key: string | null) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    if (key && activeKeys.current.get(key) === id) activeKeys.current.delete(key);
  }, []);

  /**
   * 顯示提示。
   *
   * ── 為什麼要去重 ──
   * 原本每呼叫一次就 append 一個，玩家連點維護中的入口十下，畫面就疊十個
   * 一模一樣的黑框（2026-08-13 老闆回報）。同一則訊息改成「只留一個、
   * 重新計時」—— 使用者仍看得到有反應（消失時間被延後），但不會被洗版。
   *
   * ⚠️ 去重與計時器都放在 `setToasts` 的 updater **外面**。
   * 第一版把 `setTimeout` 寫進 updater 裡，那是不純的 —— React 嚴格模式會把
   * updater 跑兩次，結果連點十下還是會冒出兩個。狀態查 ref 不查 state。
   *
   * 只對字串訊息去重：ReactNode 沒辦法穩定比較，那種維持原本行為。
   * 另外壓一個 MAX_TOASTS 上限，擋住「不同訊息連環觸發」。
   */
  const showToast = useCallback((message: React.ReactNode, type: ToastType = 'info') => {
    const key = typeof message === 'string' ? `${type}:${message}` : null;

    // 已經在畫面上：只把消失時間往後推
    if (key) {
      const existingId = activeKeys.current.get(key);
      if (existingId) {
        const old = timers.current.get(existingId);
        if (old) clearTimeout(old);
        timers.current.set(existingId, setTimeout(() => dismiss(existingId, key), DURATION_MS));
        return;
      }
    }

    const id = Math.random().toString(36).substring(2, 9);
    if (key) activeKeys.current.set(key, id);
    timers.current.set(id, setTimeout(() => dismiss(id, key), DURATION_MS));

    setToasts((prev) => {
      const next = [...prev, { id, key, message, type }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted && createPortal(
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-20 md:right-4 md:left-auto md:translate-x-0 md:translate-y-0 z-[100] flex flex-col gap-3 pointer-events-none items-center md:items-end">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200",
                "bg-neutral-900/90 backdrop-blur text-white px-4 py-4 rounded-xl shadow-lg border-none min-w-[200px] max-w-[80vw]",
                "md:bg-white md:text-neutral-900 md:min-w-[260px] md:p-5 md:rounded-2xl md:shadow-modal md:border md:border-neutral-100 md:slide-in-from-top-4 md:duration-300",
                toast.type === 'success' && "md:text-accent-emerald",
                toast.type === 'error' && "md:text-accent-red",
                toast.type === 'info' && "md:text-primary"
              )}
            >
              <p className="text-sm font-black text-center">{toast.message}</p>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
