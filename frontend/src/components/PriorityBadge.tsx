import { PRIORITY_META } from '../lib/priority';
import { cn } from '../lib/format';
import type { Priority } from '../types';

interface Props {
  priority: Priority;
  /** `icon` renders just the symbol (with tooltip) – handy on dense cards. */
  variant?: 'badge' | 'icon';
  className?: string;
}

export function PriorityBadge({ priority, variant = 'badge', className }: Props) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  const Icon = meta.icon;
  if (variant === 'icon') {
    return (
      <span
        title={`${meta.label} priority`}
        aria-label={`${meta.label} priority`}
        className={cn('inline-flex size-6 items-center justify-center rounded-lg ring-1 ring-inset', meta.className, className)}
      >
        <Icon className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className={cn('chip ring-1 ring-inset', meta.className, className)} title={`${meta.label} priority`}>
      <Icon className="size-3.5" strokeWidth={2.5} />
      {meta.label}
    </span>
  );
}

export function PrioritySelect({ value, onChange, disabled }: { value: Priority; onChange: (p: Priority) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Priority">
      {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
        const meta = PRIORITY_META[p];
        const Icon = meta.icon;
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(p)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition',
              active ? cn(meta.className, 'border-transparent ring-2 ring-inset') : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            )}
          >
            <Icon className="size-4" strokeWidth={2.5} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
