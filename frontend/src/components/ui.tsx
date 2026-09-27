import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Inbox, LoaderCircle, X } from 'lucide-react';
import { cn, initials } from '../lib/format';
import { APPROVAL_META } from '../lib/priority';
import { errorMessage, isNotConfigured } from '../api/client';
import type { ApprovalState } from '../types';

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-4 animate-spin', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notConfigured = isNotConfigured(error);
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border p-4 text-sm', notConfigured ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-700')}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{notConfigured ? 'Google Drive not configured' : 'Something went wrong'}</p>
        <p className="mt-0.5 opacity-90">{errorMessage(error)}</p>
      </div>
      {onRetry && !notConfigured && (
        <button className="btn-secondary !py-1 text-xs" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ProgressBar({ value, className, size = 'md' }: { value: number; className?: string; size?: 'sm' | 'md' }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-slate-100', size === 'sm' ? 'h-1.5' : 'h-2.5', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', v >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-500 to-violet-500')}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white', className)}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 70% 50%))` }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function ApprovalBadge({ state }: { state: ApprovalState }) {
  if (state === 'none') return null;
  const meta = APPROVAL_META[state];
  return <span className={cn('chip', meta.className)}>{meta.label}</span>;
}

export function StatusPill({ name, color }: { name: string; color?: string | null }) {
  return (
    <span className="chip bg-slate-100 text-slate-700">
      <span className="size-1.5 rounded-full" style={{ background: color || '#94a3b8' }} />
      {name}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="animate-fade-in absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'animate-slide-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl',
          size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="animate-fade-in absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1', className)}>
      <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
              value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[11px]', value === t.value ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'brand', hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'brand' | 'amber' | 'emerald' | 'rose'; hint?: string }) {
  const tones = {
    brand: 'from-brand-500 to-violet-500',
    amber: 'from-amber-400 to-orange-500',
    emerald: 'from-emerald-400 to-teal-500',
    rose: 'from-rose-400 to-red-500',
  };
  return (
    <div className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50', checked ? 'bg-brand-500' : 'bg-slate-300')}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}
