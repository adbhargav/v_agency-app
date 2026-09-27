import { useState } from 'react';
import { CalendarDays, Check, CheckCheck, RotateCcw } from 'lucide-react';
import { useApproveTask, useClientDashboard } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { formatDate } from '../../lib/format';
import { PriorityBadge } from '../../components/PriorityBadge';
import { RevisionModal } from '../../components/TaskDetail';
import { EmptyState, ErrorState, PageHeader, SkeletonList, Spinner } from '../../components/ui';
import type { Task } from '../../types';

export default function ActionRequiredPage() {
  const { data, isLoading, error, refetch } = useClientDashboard();
  const tasks = data?.actionRequired ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Action Required" subtitle="Deliverables waiting for your final approval" />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : !tasks.length ? (
        <EmptyState icon={<CheckCheck className="size-5" />} title="You're all caught up" description="We'll notify you when something needs your review." />
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <ActionCard key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionCard({ task }: { task: Task }) {
  const approve = useApproveTask();
  const toast = useToast();
  const drawer = useTaskDrawer();
  const [revising, setRevising] = useState(false);
  return (
    <li className="card overflow-hidden">
      <button onClick={() => drawer.open(task.id)} className="block w-full p-4 text-left transition hover:bg-slate-50 sm:p-5">
        <div className="flex items-start gap-3">
          <PriorityBadge priority={task.priority} variant="icon" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{task.title}</p>
            <p className="text-sm text-slate-500">{task.projectName}</p>
            {task.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{task.description}</p>}
          </div>
          {task.dueDate && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
              <CalendarDays className="size-3.5" /> {formatDate(task.dueDate)}
            </span>
          )}
        </div>
      </button>
      <div className="flex gap-2 border-t border-slate-100 bg-slate-50/60 p-3">
        <button
          className="btn-success flex-1"
          disabled={approve.isPending}
          onClick={() => approve.mutate({ id: task.id }, { onSuccess: () => toast('Approved — thank you!'), onError: (e) => toast(errorMessage(e), 'error') })}
        >
          {approve.isPending ? <Spinner /> : <Check className="size-4" />} Approve
        </button>
        <button className="btn-secondary flex-1 !text-rose-700" onClick={() => setRevising(true)}>
          <RotateCcw className="size-4" /> Request revision
        </button>
      </div>
      <RevisionModal task={task} open={revising} onClose={() => setRevising(false)} />
    </li>
  );
}
