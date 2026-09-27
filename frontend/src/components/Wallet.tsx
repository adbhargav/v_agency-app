import { useState, type FormEvent } from 'react';
import { CheckCircle2, CircleDollarSign, Hourglass, Send } from 'lucide-react';
import { useFinanceMutations, useSalaryRecords, useWallet } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { cn, formatDate, formatMoney } from '../lib/format';
import { EmptyState, Field, Skeleton, Spinner, StatCard } from './ui';
import type { SalaryStatus } from '../types';

export function WalletView({ userId, admin }: { userId: string; admin?: boolean }) {
  const { data, isLoading } = useWallet(userId);
  const { credit, settle } = useFinanceMutations();
  const toast = useToast();
  const [form, setForm] = useState({ amount: '', description: '' });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = parseFloat(form.amount);
    if (!(n > 0) || !form.description.trim()) return toast('Enter an amount and description', 'error');
    credit.mutate(
      { userId, amount: n.toFixed(2), description: form.description.trim() },
      {
        onSuccess: () => {
          toast('Wallet credited');
          setForm({ amount: '', description: '' });
        },
        onError: (err) => toast(errorMessage(err), 'error'),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading || !data ? (
          <>
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </>
        ) : (
          <>
            <StatCard label="Pending balance" value={formatMoney(data.balance.pending)} icon={<Hourglass className="size-5" />} tone="amber" />
            <StatCard label="Settled" value={formatMoney(data.balance.settled)} icon={<CheckCircle2 className="size-5" />} tone="emerald" />
          </>
        )}
      </div>

      {admin && (
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">Credit wallet</p>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
            <Field label="Amount">
              <input inputMode="decimal" className="input" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })} />
            </Field>
            <Field label="Description">
              <input className="input" placeholder="e.g. Property tour video edit" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <button className="btn-primary" disabled={credit.isPending}>
              {credit.isPending ? <Spinner /> : <CircleDollarSign className="size-4" />} Credit
            </button>
          </div>
        </form>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Transactions</p>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !data?.transactions.length ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {data.transactions.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{t.description || t.taskTitle || 'Credit'}</p>
                  <p className="truncate text-xs text-slate-400">
                    {formatDate(t.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {t.taskTitle && t.description ? ` · ${t.taskTitle}` : ''}
                    {t.settledAt ? ` · settled ${formatDate(t.settledAt)}` : ''}
                  </p>
                </div>
                <span className="font-semibold tabular-nums text-slate-900">{formatMoney(t.amount)}</span>
                {t.status === 'settled' ? (
                  <span className="chip bg-emerald-50 text-emerald-700">Settled</span>
                ) : admin ? (
                  <button
                    className="btn-secondary !px-2.5 !py-1 text-xs"
                    disabled={settle.isPending}
                    onClick={() => settle.mutate(t.id, { onSuccess: () => toast('Marked as settled'), onError: (e) => toast(errorMessage(e), 'error') })}
                  >
                    <CheckCircle2 className="size-3.5" /> Settle
                  </button>
                ) : (
                  <span className="chip bg-amber-50 text-amber-700">Pending</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const SALARY_STYLE: Record<SalaryStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  sent: 'bg-sky-50 text-sky-700',
  settled: 'bg-emerald-50 text-emerald-700',
};

export function SalaryView({ userId, admin }: { userId: string; admin?: boolean }) {
  const { data: records, isLoading } = useSalaryRecords(userId);
  const { addSalary, salaryStatus } = useFinanceMutations();
  const toast = useToast();
  const [form, setForm] = useState({ periodMonth: new Date().toISOString().slice(0, 7), amount: '' });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = parseFloat(form.amount);
    if (!(n > 0)) return toast('Enter a valid amount', 'error');
    addSalary.mutate(
      { userId, periodMonth: form.periodMonth, amount: n.toFixed(2) },
      { onSuccess: () => { toast('Salary record added'); setForm({ ...form, amount: '' }); }, onError: (err) => toast(errorMessage(err), 'error') },
    );
  };

  return (
    <div className="space-y-5">
      {admin && (
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">Add monthly salary</p>
          <div className="grid gap-3 sm:grid-cols-[10rem_8rem_auto] sm:items-end">
            <Field label="Month">
              <input type="month" className="input" value={form.periodMonth} onChange={(e) => setForm({ ...form, periodMonth: e.target.value })} />
            </Field>
            <Field label="Amount">
              <input inputMode="decimal" className="input" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })} />
            </Field>
            <button className="btn-primary" disabled={addSalary.isPending}>
              {addSalary.isPending && <Spinner />} Add
            </button>
          </div>
        </form>
      )}
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : !records?.length ? (
        <EmptyState title="No salary records yet" />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {records.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{formatDate(`${r.periodMonth}-01`, { month: 'long', year: 'numeric' })}</p>
                <p className="text-xs text-slate-400">
                  {r.sentAt ? `Sent ${formatDate(r.sentAt)}` : 'Not sent yet'}
                  {r.settledAt ? ` · settled ${formatDate(r.settledAt)}` : ''}
                </p>
              </div>
              <span className="font-semibold tabular-nums text-slate-900">{formatMoney(r.amount)}</span>
              <span className={cn('chip capitalize', SALARY_STYLE[r.status])}>{r.status}</span>
              {admin && r.status !== 'settled' && (
                <div className="flex gap-1">
                  {r.status === 'pending' && (
                    <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => salaryStatus.mutate({ id: r.id, status: 'sent' }, { onError: (e) => toast(errorMessage(e), 'error') })}>
                      <Send className="size-3.5" /> Mark sent
                    </button>
                  )}
                  <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => salaryStatus.mutate({ id: r.id, status: 'settled' }, { onError: (e) => toast(errorMessage(e), 'error') })}>
                    <CheckCircle2 className="size-3.5" /> Settled
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
