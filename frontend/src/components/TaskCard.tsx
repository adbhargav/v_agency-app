import { CalendarDays, Clock, MessageSquareWarning, Timer } from 'lucide-react';
import { PriorityBadge } from './PriorityBadge';
import { ApprovalBadge, Avatar, ProgressBar } from './ui';
import { cn, formatDate, formatDuration } from '../lib/format';
import type { Task } from '../types';

interface Props {
  task: Task;
  onClick?: () => void;
  /** Hide internal information (assignee, time) – always true for clients. */
  clientSafe?: boolean;
  showProject?: boolean;
  dragging?: boolean;
}

export function TaskCard({ task, onClick, clientSafe, showProject = true, dragging }: Props) {
  const revision = task.approvalState === 'revision_requested';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // Enter opens the task; Space is left to the Kanban keyboard sensor for dragging.
        if (e.key === 'Enter') {
          e.stopPropagation();
          onClick?.();
        }
      }}
      className={cn(
        'group relative select-none rounded-xl border bg-white p-3 text-left shadow-card outline-none transition focus-visible:ring-4 focus-visible:ring-brand-100',
        revision ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-200/80',
        dragging ? 'rotate-[1.5deg] shadow-xl ring-2 ring-brand-300' : 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md',
      )}
    >
      <div className="flex items-start gap-2">
        <PriorityBadge priority={task.priority} variant="icon" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-900">{task.title}</p>
          {showProject && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {task.projectName}
              {!clientSafe && task.clientName ? ` · ${task.clientName}` : ''}
            </p>
          )}
        </div>
        {!clientSafe && task.activeTimer && (
          <span className="flex size-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600" title="Timer running">
            <Timer className="size-3.5 animate-pulse" />
          </span>
        )}
      </div>

      {revision && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
          <MessageSquareWarning className="size-3.5" /> Revision requested
        </p>
      )}

      <div className="mt-2.5">
        <ProgressBar value={task.percentDone} size="sm" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        {task.dueDate && (
          <span className={cn('flex items-center gap-1', task.isOverdue && 'font-medium text-rose-600')}>
            <CalendarDays className="size-3.5" />
            {formatDate(task.dueDate)}
          </span>
        )}
        <span>{task.percentDone}%</span>
        {!clientSafe && !!task.timeSpentSeconds && (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatDuration(task.timeSpentSeconds)}
          </span>
        )}
        {!revision && <ApprovalBadge state={task.approvalState} />}
        {!clientSafe && task.assignee && <Avatar name={task.assignee.name} className="ml-auto size-6 text-[10px]" />}
      </div>
    </div>
  );
}
