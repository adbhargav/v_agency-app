import { Pause, Play } from 'lucide-react';
import { useActiveTimer, useTimerControl } from '../api/hooks';
import { ApiError, errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useNow } from '../lib/useNow';
import { cn, formatDuration } from '../lib/format';
import type { Task } from '../types';

/**
 * Strict Start / Pause / Resume timer with a live ticking display.
 * There is deliberately no manual time entry anywhere in the app.
 * The API's `timeSpentSeconds` excludes the viewer's own running segment, which is added here live.
 */
export function TimerControl({ task, compact }: { task: Task; compact?: boolean }) {
  const { data: active } = useActiveTimer();
  const { start, pause } = useTimerControl();
  const toast = useToast();

  const startedAt = active?.taskId === task.id ? active.startedAt : task.activeTimer?.startedAt;
  const running = !!startedAt && (active === undefined || active?.taskId === task.id);
  const now = useNow(running);
  const base = task.timeSpentSeconds ?? 0;
  const liveSeconds = base + (running && startedAt ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0);
  const otherRunning = active && active.taskId !== task.id ? active : null;
  const busy = start.isPending || pause.isPending;

  const onStart = () =>
    start.mutate(
      { id: task.id, title: task.title },
      {
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) {
            toast('Another timer is already running. Pause it first.', 'error');
          } else toast(errorMessage(e), 'error');
        },
      },
    );

  const onPause = () => pause.mutate({ id: task.id }, { onError: (e) => toast(errorMessage(e), 'error') });

  if (compact) {
    return (
      <button onClick={running ? onPause : onStart} disabled={busy} className={cn('btn !px-2.5 !py-1.5 text-xs', running ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
        {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        <span className="font-mono tabular-nums">{formatDuration(liveSeconds, true)}</span>
      </button>
    );
  }

  return (
    <div className={cn('rounded-2xl border p-4 transition', running ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50' : 'border-slate-200 bg-slate-50')}>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{running ? 'Tracking time' : 'Time tracked'}</p>
          <p className={cn('font-mono text-3xl font-semibold tabular-nums tracking-tight', running ? 'text-emerald-700' : 'text-slate-800')}>
            {formatDuration(liveSeconds, true)}
          </p>
        </div>
        {running ? (
          <button onClick={onPause} disabled={busy} className="btn h-12 bg-amber-500 px-5 text-white shadow-sm hover:bg-amber-600">
            <Pause className="size-5" /> Pause
          </button>
        ) : (
          <button onClick={onStart} disabled={busy || !!otherRunning} className="btn h-12 bg-emerald-600 px-5 text-white shadow-sm hover:bg-emerald-700">
            <Play className="size-5" /> {base > 0 ? 'Resume' : 'Start'}
          </button>
        )}
      </div>
      {otherRunning && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
          <span className="truncate">
            Timer running on <b>{otherRunning.taskTitle}</b>
          </span>
          <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => pause.mutate({ id: otherRunning.taskId })}>
            <Pause className="size-3" /> Pause it
          </button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">Manual time entry is disabled — only live tracking counts.</p>
    </div>
  );
}
