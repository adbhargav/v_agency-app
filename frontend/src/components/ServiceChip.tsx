import { cn } from '../lib/format';
import type { RequirementDisplayStatus, ServiceTypeRef } from '../types';

export const SERVICE_COLORS = ['#df2f25', '#f2491f', '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#64748b'];

/** Colored pill for a service / team. */
export function ServiceChip({ service, className, size = 'md' }: { service: Pick<ServiceTypeRef, 'name' | 'color'>; className?: string; size?: 'sm' | 'md' }) {
  const color = service.color || '#64748b';
  return (
    <span
      className={cn('chip max-w-full ring-1 ring-inset', size === 'sm' && '!px-1.5 !py-0 text-[10px]', className)}
      style={{ background: `${color}14`, color, boxShadow: `inset 0 0 0 1px ${color}33` }}
      title={service.name}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{service.name}</span>
    </span>
  );
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />;
}

export const REQUIREMENT_STATUS_META: Record<RequirementDisplayStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200' },
  in_progress: { label: 'In progress', className: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200' },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' },
  declined: { label: 'Declined', className: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200' },
};

export function RequirementStatusBadge({ status, clientView }: { status: RequirementDisplayStatus; clientView?: boolean }) {
  const meta = REQUIREMENT_STATUS_META[status] ?? REQUIREMENT_STATUS_META.new;
  // Clients see "Submitted" rather than "New" — it's new to us, not to them.
  const label = clientView && status === 'new' ? 'Submitted' : meta.label;
  return <span className={cn('chip', meta.className)}>{label}</span>;
}
