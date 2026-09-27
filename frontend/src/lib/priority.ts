import { ChevronDown, ChevronsUp, Equal, Flame, type LucideIcon } from 'lucide-react';
import type { ApprovalState, Priority } from '../types';

export const PRIORITIES: Priority[] = ['very_urgent', 'high', 'medium', 'low'];

export const PRIORITY_META: Record<Priority, { label: string; icon: LucideIcon; className: string; dot: string; rank: number }> = {
  very_urgent: { label: 'Very Urgent', icon: Flame, className: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', rank: 0 },
  high: { label: 'High', icon: ChevronsUp, className: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500', rank: 1 },
  medium: { label: 'Medium', icon: Equal, className: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', rank: 2 },
  low: { label: 'Low', icon: ChevronDown, className: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400', rank: 3 },
};

export const APPROVAL_META: Record<ApprovalState, { label: string; className: string }> = {
  none: { label: 'In progress', className: 'bg-slate-100 text-slate-600' },
  internal_review: { label: 'Internal review', className: 'bg-violet-50 text-violet-700' },
  client_review: { label: 'Awaiting client', className: 'bg-sky-50 text-sky-700' },
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700' },
  revision_requested: { label: 'Revision requested', className: 'bg-rose-50 text-rose-700' },
};
