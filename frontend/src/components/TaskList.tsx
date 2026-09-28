import type { ReactNode } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { PriorityBadge } from './PriorityBadge';
import { ApprovalBadge, Avatar, EmptyState, ProgressBar, StatusPill } from './ui';
import { cn, formatDate, formatDuration } from '../lib/format';
import { ServiceChip } from './ServiceChip';
import type { Task } from '../types';

interface Props {
  tasks: Task[];
  onOpen: (t: Task) => void;
  clientSafe?: boolean;
  statusColor?: (t: Task) => string | null | undefined;
  empty?: string;
}

export function TaskList({ tasks, onOpen, clientSafe, statusColor, empty = 'No tasks match these filters' }: Props) {
  if (!tasks.length) return <EmptyState title={empty} />;
  return (
    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_8rem_7rem_7rem_6rem] gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 lg:grid">
        <span>Task</span>
        <span>Status</span>
        <span>Priority</span>
        <span>Due</span>
        <span>Progress</span>
        <span className="text-right">{clientSafe ? '' : 'Owner'}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onOpen(t)}
              className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition hover:bg-slate-50 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_8rem_7rem_7rem_6rem] lg:items-center lg:gap-4"
            >
              <div className="flex min-w-0 items-start gap-2">
                <PriorityBadge priority={t.priority} variant="icon" className="shrink-0 lg:hidden" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {t.projectName}
                    {!clientSafe && t.clientName ? ` · ${t.clientName}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {t.serviceType && <ServiceChip service={t.serviceType} size="sm" />}
                <StatusPill name={t.masterStatusName} color={statusColor?.(t)} />
                <ApprovalBadge state={t.approvalState} />
              </div>
              <div className="hidden lg:block">
                <PriorityBadge priority={t.priority} />
              </div>
              <span className={cn('flex items-center gap-1 text-xs text-slate-500', t.isOverdue && 'font-medium text-rose-600')}>
                <CalendarDays className="size-3.5 lg:hidden" />
                {t.dueDate ? formatDate(t.dueDate) : 'No due date'}
                {t.isOverdue && ' · overdue'}
              </span>
              <div className="flex items-center gap-2">
                <ProgressBar value={t.percentDone} size="sm" className="max-w-[10rem]" />
                <span className="w-8 text-right text-xs text-slate-500">{t.percentDone}%</span>
              </div>
              <div className="flex items-center gap-2 lg:justify-end">
                {!clientSafe && !!t.timeSpentSeconds && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="size-3.5" />
                    {formatDuration(t.timeSpentSeconds)}
                  </span>
                )}
                {!clientSafe && (t.assignee ? <Avatar name={t.assignee.name} /> : <span className="text-xs text-slate-400">Unassigned</span>)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dense row used on dashboards. */
export function CompactTaskRow({ task, onOpen, clientSafe, trailing }: { task: Task; onOpen: (t: Task) => void; clientSafe?: boolean; trailing?: ReactNode }) {
  return (
    <li>
      <button onClick={() => onOpen(task)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
        <PriorityBadge priority={task.priority} variant="icon" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
          <p className="truncate text-xs text-slate-500">
            {task.projectName}
            {!clientSafe && task.clientName ? ` · ${task.clientName}` : ''}
          </p>
        </div>
        {trailing}
        {task.dueDate && (
          <span className={cn('hidden shrink-0 text-xs sm:inline', task.isOverdue ? 'font-medium text-rose-600' : 'text-slate-500')}>{formatDate(task.dueDate)}</span>
        )}
        {!clientSafe && task.assignee && <Avatar name={task.assignee.name} className="size-6 text-[10px]" />}
      </button>
    </li>
  );
}
