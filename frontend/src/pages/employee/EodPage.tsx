import { useEffect, useState, type FormEvent } from 'react';
import { AlertOctagon, CheckCircle2, ChevronLeft, ChevronRight, Save, Target } from 'lucide-react';
import { useEod, useSaveEod } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { formatDate, relativeTime, todayISO } from '../../lib/format';
import { PriorityBadge } from '../../components/PriorityBadge';
import { ErrorState, PageHeader, Skeleton, Spinner } from '../../components/ui';

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export default function EodPage() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading, error } = useEod(date);
  const save = useSaveEod();
  const toast = useToast();
  const drawer = useTaskDrawer();
  const [form, setForm] = useState({ blockers: '', tomorrowPriority: '' });
  const isToday = date === todayISO();

  useEffect(() => {
    setForm({ blockers: data?.report?.blockers ?? '', tomorrowPriority: data?.report?.tomorrowPriority ?? '' });
  }, [data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ date, ...form }, { onSuccess: () => toast('EOD update saved'), onError: (err) => toast(errorMessage(err), 'error') });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Daily Work Update"
        subtitle={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <div className="flex items-center gap-1">
            <button className="btn-secondary !px-2" onClick={() => setDate(shift(date, -1))} aria-label="Previous day">
              <ChevronLeft className="size-4" />
            </button>
            <button className="btn-secondary" disabled={isToday} onClick={() => setDate(todayISO())}>
              Today
            </button>
            <button className="btn-secondary !px-2" disabled={isToday} onClick={() => setDate(shift(date, 1))} aria-label="Next day">
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />
      {error && <ErrorState error={error} />}

      <section className="card mb-5 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CheckCircle2 className="size-4 text-emerald-500" /> Tasks Completed {isToday ? 'Today' : 'This Day'}
          {data && <span className="chip bg-emerald-50 text-emerald-700">{data.completedToday.length}</span>}
        </h2>
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : !data?.completedToday.length ? (
          <p className="text-sm text-slate-400">No tasks completed yet. Finished tasks appear here automatically.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.completedToday.map((t) => (
              <li key={t.id}>
                <button onClick={() => drawer.open(t.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <PriorityBadge priority={t.priority} variant="icon" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{t.title}</span>
                  <span className="truncate text-xs text-slate-400">{t.projectName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={submit} className="card space-y-5 p-5">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <AlertOctagon className="size-4 text-rose-500" /> Blockers / Problems
          </span>
          <textarea
            className="input min-h-28"
            placeholder="Anything slowing you down? Missing assets, feedback needed, access issues…"
            value={form.blockers}
            onChange={(e) => setForm({ ...form, blockers: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Target className="size-4 text-brand-500" /> Tomorrow's Priority
          </span>
          <textarea
            className="input min-h-28"
            placeholder="What will you focus on first tomorrow?"
            value={form.tomorrowPriority}
            onChange={(e) => setForm({ ...form, tomorrowPriority: e.target.value })}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">{data?.report ? `Last saved ${relativeTime(data.report.updatedAt)}` : 'Not submitted yet'}</p>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : <Save className="size-4" />} Save update
          </button>
        </div>
      </form>
    </div>
  );
}
