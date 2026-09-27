import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CircleCheck, CircleAlert, X } from 'lucide-react';
import { cn } from '../lib/format';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((message: string, kind: Kind = 'success') => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3 pr-2 text-sm shadow-lg',
              t.kind === 'error' ? 'border-rose-200' : 'border-slate-200',
            )}
          >
            {t.kind === 'error' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            )}
            <p className="flex-1 text-slate-700">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
