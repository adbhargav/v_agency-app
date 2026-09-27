import { useState, type FormEvent } from 'react';
import { Briefcase, CalendarCheck2, KeyRound, Search, UserPlus, Users } from 'lucide-react';
import { useCreateUser, useUpdateUser, useUsers } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { cn, formatDate } from '../../lib/format';
import { Avatar, EmptyState, ErrorState, Field, Modal, PageHeader, SkeletonList, Spinner, Toggle } from '../../components/ui';
import type { EmploymentType, User } from '../../types';

const TYPE_LABEL: Record<EmploymentType, string> = { project_based: 'Project-based', salary_based: 'Salary-based' };

export default function TeamPage() {
  const { data: users, isLoading, error, refetch } = useUsers('employee');
  const update = useUpdateUser();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<User | null>(null);

  const filtered = (users ?? []).filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Onboard employees and manage how they're paid"
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" /> Onboard employee
          </button>
        }
      />
      <div className="relative mb-4 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input !pl-9" placeholder="Search team…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="No team members yet" description="Onboard your first employee to start assigning tasks." />
      ) : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((u) => (
            <div key={u.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !u.isActive && 'opacity-60')}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={u.name} className="size-10 text-sm" />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-900">
                    {u.name}
                    {u.googleCalendarConnected && <CalendarCheck2 className="size-3.5 text-emerald-500" aria-label="Google Calendar connected" />}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {u.email} · joined {formatDate(u.createdAt, { month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="size-4 text-slate-400" />
                  <select
                    className="input !w-auto !py-1.5"
                    value={u.employmentType ?? ''}
                    onChange={(e) =>
                      update.mutate(
                        { id: u.id, employmentType: e.target.value as EmploymentType },
                        { onSuccess: () => toast(`${u.name} is now ${TYPE_LABEL[e.target.value as EmploymentType]}`), onError: (err) => toast(errorMessage(err), 'error') },
                      )
                    }
                  >
                    <option value="project_based">Project-based</option>
                    <option value="salary_based">Salary-based</option>
                  </select>
                </div>
                <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => setResetFor(u)}>
                  <KeyRound className="size-3.5" /> Reset password
                </button>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  {u.isActive ? 'Active' : 'Inactive'}
                  <Toggle
                    checked={u.isActive}
                    label={`Toggle ${u.name} active`}
                    onChange={(v) =>
                      update.mutate(
                        { id: u.id, isActive: v },
                        { onSuccess: () => toast(v ? `${u.name} reactivated` : `${u.name} deactivated`), onError: (err) => toast(errorMessage(err), 'error') },
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      <OnboardModal open={adding} onClose={() => setAdding(false)} />
      <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function OnboardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const empty = { name: '', email: '', password: '', employmentType: 'project_based' as EmploymentType };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) return setError('Temporary password must be at least 8 characters.');
    create.mutate(
      { ...form, name: form.name.trim(), email: form.email.trim(), role: 'employee' },
      {
        onSuccess: (u) => {
          toast(`${u.name} onboarded`);
          setForm(empty);
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Onboard employee"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="onboard" className="btn-primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create account
          </button>
        </>
      }
    >
      <form id="onboard" onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Temporary password" hint="Share it securely; they can change it in Settings.">
          <input type="text" className="input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div>
          <span className="label">Employment type</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_LABEL) as EmploymentType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, employmentType: t })}
                className={cn(
                  'rounded-xl border p-3 text-left transition',
                  form.employmentType === t ? 'border-brand-400 bg-brand-50 ring-4 ring-brand-100' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{TYPE_LABEL[t]}</p>
                <p className="mt-0.5 text-xs text-slate-500">{t === 'project_based' ? 'Earnings wallet, credited per task' : 'Monthly salary ledger'}</p>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}

export function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const update = useUpdateUser();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    update.mutate(
      { id: user.id, password },
      {
        onSuccess: () => {
          toast(`Password reset for ${user.name}`);
          setPassword('');
          setError(null);
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Reset password${user ? ` · ${user.name}` : ''}`}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="reset-pw" className="btn-primary" disabled={update.isPending}>
            {update.isPending && <Spinner />} Reset
          </button>
        </>
      }
    >
      <form id="reset-pw" onSubmit={submit} className="space-y-3">
        <Field label="New password">
          <input autoFocus type="text" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}
