import { useState } from 'react';
import { AlertOctagon, CheckCircle2, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { useTeamEod } from '../../api/hooks';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { formatDate, relativeTime, todayISO } from '../../lib/format';
import { PriorityBadge } from '../../components/PriorityBadge';
import { Avatar, EmptyState, ErrorState, PageHeader, SkeletonList } from '../../components/ui';

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export default function TeamEodPage() {
  const [date, setDate] = useState(todayISO());
  const { data: reports, isLoading, error, refetch } = useTeamEod(date);
  const drawer = useTaskDrawer();
  const isToday = date === todayISO();

  return (
    <div>
      <PageHeader
        title="Team EOD Reports"
        subtitle="Daily work updates: what got done, blockers, and tomorrow's focus"
        actions={
          <div className="flex items-center gap-1">
            <button className="btn-secondary !px-2" onClick={() => setDate(shift(date, -1))} aria-label="Previous day">
              <ChevronLeft className="size-4" />
            </button>
            <input type="date" className="input !w-auto" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button className="btn-secondary !px-2" disabled={isToday} onClick={() => setDate(shift(date, 1))} aria-label="Next day">
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : !reports?.length ? (
        <EmptyState title={`No reports for ${formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reports.map(({ user, completedToday, report }) => (
            <article key={user.id} className="card p-5">
              <header className="mb-4 flex items-center gap-3">
                <Avatar name={user.name} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{report ? `Updated ${relativeTime(report.updatedAt)}` : 'No written update'}</p>
                </div>
                <span className="chip bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="size-3" /> {completedToday.length}
                </span>
              </header>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Tasks completed
                  </p>
                  {completedToday.length ? (
                    <ul className="space-y-1">
                      {completedToday.map((t) => (
                        <li key={t.id}>
                          <button onClick={() => drawer.open(t.id)} className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-slate-50">
                            <PriorityBadge priority={t.priority} variant="icon" className="!size-5" />
                            <span className="truncate text-slate-700">{t.title}</span>
                            <span className="ml-auto shrink-0 truncate text-xs text-slate-400">{t.projectName}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-400">None</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <AlertOctagon className="size-3.5 text-rose-500" /> Blockers / problems
                  </p>
                  <p className="whitespace-pre-wrap text-slate-700">{report?.blockers || <span className="text-slate-400">—</span>}</p>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Target className="size-3.5 text-brand-500" /> Tomorrow's priority
                  </p>
                  <p className="whitespace-pre-wrap text-slate-700">{report?.tomorrowPriority || <span className="text-slate-400">—</span>}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
