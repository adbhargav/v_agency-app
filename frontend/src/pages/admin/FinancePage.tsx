import { useState } from 'react';
import { ChevronRight, HandCoins, Hourglass, Landmark } from 'lucide-react';
import { useFinanceEmployees, useFinanceSummary } from '../../api/hooks';
import { cn, formatMoney } from '../../lib/format';
import { SalaryView, WalletView } from '../../components/Wallet';
import { Avatar, EmptyState, ErrorState, Modal, PageHeader, Skeleton, SkeletonList, StatCard, Tabs } from '../../components/ui';
import type { FinanceEmployeeRow } from '../../types';

export default function FinancePage() {
  const { data: summary, isLoading: sLoading } = useFinanceSummary();
  const { data: rows, isLoading, error, refetch } = useFinanceEmployees();
  const [filter, setFilter] = useState<'all' | 'project_based' | 'salary_based'>('all');
  const [selected, setSelected] = useState<FinanceEmployeeRow | null>(null);

  const list = (rows ?? []).filter((r) => filter === 'all' || r.user.employmentType === filter);

  return (
    <div>
      <PageHeader title="Finance" subtitle="Lightweight ledger for wallets and salaries — never visible to clients" />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {sLoading || !summary ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : (
          <>
            <StatCard label="Total Team Earnings" value={formatMoney(summary.totalEarnings)} icon={<HandCoins className="size-5" />} />
            <StatCard label="Wallets to be Settled" value={formatMoney(summary.pendingSettlement)} icon={<Hourglass className="size-5" />} tone="amber" />
            <StatCard label="Total Settled" value={formatMoney(summary.totalSettled)} icon={<Landmark className="size-5" />} tone="emerald" />
          </>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Team ledger</h2>
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'project_based', label: 'Project-based' },
            { value: 'salary_based', label: 'Salary-based' },
          ]}
        />
      </div>
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : !list.length ? (
        <EmptyState title="No employees" />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {list.map((r) => (
            <li key={r.user.id}>
              <button onClick={() => setSelected(r)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50', !r.user.isActive && 'opacity-60')}>
                <Avatar name={r.user.name} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{r.user.name}</p>
                  <p className="text-xs text-slate-500">{r.user.employmentType === 'salary_based' ? 'Salary-based' : 'Project-based'}</p>
                </div>
                {r.user.employmentType === 'salary_based' ? (
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{r.lastSalary ? formatMoney(r.lastSalary.amount) : '—'}</p>
                    <p className="text-xs capitalize text-slate-500">{r.lastSalary ? `${r.lastSalary.periodMonth} · ${r.lastSalary.status}` : 'No records'}</p>
                  </div>
                ) : (
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-amber-600">{formatMoney(r.pending)} pending</p>
                    <p className="text-xs tabular-nums text-slate-500">{formatMoney(r.settled)} settled</p>
                  </div>
                )}
                <ChevronRight className="size-4 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.user.name} · ${selected.user.employmentType === 'salary_based' ? 'Salary tracker' : 'Earnings wallet'}` : ''} size="lg">
        {selected &&
          (selected.user.employmentType === 'salary_based' ? <SalaryView userId={selected.user.id} admin /> : <WalletView userId={selected.user.id} admin />)}
      </Modal>
    </div>
  );
}
