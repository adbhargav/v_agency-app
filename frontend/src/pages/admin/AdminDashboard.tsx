import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, ArrowRight, BadgeCheck, CalendarClock, Clock3, FolderKanban, HandCoins, Hourglass, Landmark, ShieldCheck, Users } from 'lucide-react';
import { useAdminDashboard } from '../../api/hooks';
import { useUser } from '../../context/AuthContext';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { cn, formatMoney } from '../../lib/format';
import { CompactTaskRow } from '../../components/TaskList';
import { ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui';
import type { Task } from '../../types';

export default function AdminDashboard() {
  const user = useUser();
  const { data, isLoading, error, refetch } = useAdminDashboard();
  const drawer = useTaskDrawer();
  const open = (t: Task) => drawer.open(t.id);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        subtitle="Here's what needs your attention today."
        actions={
          <Link to="/admin/tasks" className="btn-secondary">
            Master board <ArrowRight className="size-4" />
          </Link>
        }
      />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {/* 1. Pending client approvals */}
      <section className="mb-6">
        <SectionTitle icon={<ShieldCheck className="size-4" />} title="Pending Client Approvals" tone="brand" count={data ? data.pendingApprovals.length + data.awaitingClient.length : undefined} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Internal review queue"
            hint="Submitted by the team — approve to send to client"
            loading={isLoading}
            tasks={data?.pendingApprovals}
            onOpen={open}
            empty="Nothing waiting for your review"
            accent="border-t-violet-500"
            trailing={() => <span className="chip bg-violet-50 text-violet-700">Review</span>}
          />
          <Panel
            title="Awaiting client"
            hint="Sent to the client for final approval"
            loading={isLoading}
            tasks={data?.awaitingClient}
            onOpen={open}
            empty="No deliverables with clients"
            accent="border-t-sky-500"
          />
        </div>
      </section>

      {/* 2. Overdue */}
      <section className="mb-6">
        <SectionTitle icon={<AlarmClock className="size-4" />} title="Overdue Tasks" tone="rose" count={data?.overdueTasks.length} />
        <Panel loading={isLoading} tasks={data?.overdueTasks} onOpen={open} empty="No overdue tasks — great work!" accent="border-t-rose-500" />
      </section>

      {/* 3. Today */}
      <section className="mb-8">
        <SectionTitle icon={<CalendarClock className="size-4" />} title="Today's Active Tasks" tone="amber" count={data?.todaysTasks.length} />
        <Panel loading={isLoading} tasks={data?.todaysTasks} onOpen={open} empty="Nothing due today" accent="border-t-amber-500" />
      </section>

      {/* Finance summary */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Finance</h2>
          <Link to="/admin/finance" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Open ledger →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {isLoading || !data ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
          ) : (
            <>
              <StatCard label="Total Team Earnings" value={formatMoney(data.finance.totalEarnings)} icon={<HandCoins className="size-5" />} />
              <StatCard label="Wallets to be Settled" value={formatMoney(data.finance.pendingSettlement)} icon={<Hourglass className="size-5" />} tone="amber" />
              <StatCard label="Total Settled" value={formatMoney(data.finance.totalSettled)} icon={<Landmark className="size-5" />} tone="emerald" />
            </>
          )}
        </div>
      </section>

      {data && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MiniStat icon={<FolderKanban className="size-4" />} label="Active projects" value={data.counts.activeProjects} to="/admin/projects" />
          <MiniStat icon={<Clock3 className="size-4" />} label="Open tasks" value={data.counts.openTasks} to="/admin/tasks" />
          <MiniStat icon={<Users className="size-4" />} label="Team members" value={data.counts.employees} to="/admin/team" />
          <MiniStat icon={<BadgeCheck className="size-4" />} label="Clients" value={data.counts.clients} to="/admin/clients" />
        </section>
      )}
    </div>
  );
}

function SectionTitle({ icon, title, count, tone }: { icon: ReactNode; title: string; count?: number; tone: 'brand' | 'rose' | 'amber' }) {
  const tones = { brand: 'bg-brand-100 text-brand-700', rose: 'bg-rose-100 text-rose-700', amber: 'bg-amber-100 text-amber-700' };
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={cn('flex size-7 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {count !== undefined && <span className={cn('chip', count ? tones[tone] : 'bg-slate-100 text-slate-500')}>{count}</span>}
    </div>
  );
}

function Panel({
  title,
  hint,
  loading,
  tasks,
  onOpen,
  empty,
  accent,
  trailing,
}: {
  title?: string;
  hint?: string;
  loading: boolean;
  tasks?: Task[];
  onOpen: (t: Task) => void;
  empty: string;
  accent: string;
  trailing?: (t: Task) => ReactNode;
}) {
  return (
    <div className={cn('card overflow-hidden border-t-4', accent)}>
      {title && (
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
      )}
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : !tasks?.length ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {tasks.map((t) => (
            <CompactTaskRow key={t.id} task={t} onOpen={onOpen} trailing={trailing?.(t)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, to }: { icon: ReactNode; label: string; value?: number; to: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 transition hover:border-brand-200">
      <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{icon}</span>
      <div>
        <p className="text-lg font-semibold leading-none text-slate-900">{value ?? '—'}</p>
        <p className="mt-1 text-xs text-slate-500">{label}</p>
      </div>
    </Link>
  );
}
