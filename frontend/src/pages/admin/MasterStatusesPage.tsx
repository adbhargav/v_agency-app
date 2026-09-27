import { useState, type FormEvent } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useMasterStatusMutations, useMasterStatuses } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { ErrorState, PageHeader, SkeletonList, Spinner, Toggle } from '../../components/ui';
import type { MasterStatus } from '../../types';

const SWATCHES = ['#94a3b8', '#6366f1', '#8b5cf6', '#0ea5e9', '#f59e0b', '#f97316', '#ef4444', '#10b981'];

export default function MasterStatusesPage() {
  const { data: statuses, isLoading, error } = useMasterStatuses();
  const { create } = useMasterStatusMutations();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[1]!);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), color },
      { onSuccess: () => { setName(''); toast('Status added'); }, onError: (err) => toast(errorMessage(err), 'error') },
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Master Statuses"
        subtitle="The rigid columns of the Master Kanban. Employees map their own custom column names onto these."
      />
      {error && <ErrorState error={error} />}
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {statuses?.map((s) => (
            <StatusRow key={s.id} status={s} />
          ))}
        </ul>
      )}
      <form onSubmit={add} className="card mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input className="input flex-1" placeholder="New status name, e.g. Review" value={name} onChange={(e) => setName(e.target.value)} />
        <Swatches value={color} onChange={setColor} />
        <button className="btn-primary" disabled={!name.trim() || create.isPending}>
          {create.isPending ? <Spinner /> : <Plus className="size-4" />} Add
        </button>
      </form>
      <p className="mt-3 text-xs text-slate-400">Keep it to 3–5 statuses. A status that still has tasks can't be deleted.</p>
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="size-6 rounded-full ring-offset-2 transition"
          style={{ background: c, boxShadow: value === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}

function StatusRow({ status }: { status: MasterStatus }) {
  const { update, remove } = useMasterStatusMutations();
  const toast = useToast();
  const [name, setName] = useState(status.name);
  const onErr = (e: unknown) => toast(errorMessage(e), 'error');

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-3">
        <span className="size-3 shrink-0 rounded-full" style={{ background: status.color || '#94a3b8' }} />
        <input
          className="input !border-transparent !bg-transparent !px-1 font-medium shadow-none hover:!border-slate-200 focus:!border-brand-300"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== status.name && update.mutate({ id: status.id, name: name.trim() }, { onError: onErr })}
        />
      </div>
      <div className="flex items-center gap-4">
        <Swatches value={status.color ?? ''} onChange={(c) => update.mutate({ id: status.id, color: c }, { onError: onErr })} />
        <label className="flex items-center gap-2 text-xs text-slate-500" title="Tasks in this status count as done">
          <CheckCircle2 className="size-3.5" /> Done
          <Toggle checked={status.isDone} onChange={(v) => update.mutate({ id: status.id, isDone: v }, { onError: onErr })} label="Counts as done" />
        </label>
        <button
          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          aria-label={`Delete ${status.name}`}
          onClick={() => {
            if (!window.confirm(`Delete "${status.name}"?`)) return;
            remove.mutate(status.id, {
              onSuccess: () => toast('Status deleted'),
              onError: (e) => toast((e as { status?: number }).status === 409 ? 'This status still has tasks — move them first.' : errorMessage(e), 'error'),
            });
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
