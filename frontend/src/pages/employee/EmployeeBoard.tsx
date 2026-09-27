import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  Columns3,
  MessageSquareWarning,
  Plus,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  connectGoogleCalendar,
  useCustomStatusMutations,
  useCustomStatuses,
  useEmployeeDashboard,
  useMasterStatuses,
  usePatchTask,
  useTasks,
} from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useUser } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { PRIORITY_META } from '../../lib/priority';
import { cn, formatMoney } from '../../lib/format';
import { KanbanBoard, type KanbanColumn } from '../../components/KanbanBoard';
import { CreateTaskModal } from '../../components/CreateTaskModal';
import { PriorityBadge } from '../../components/PriorityBadge';
import { ErrorState, Field, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui';
import type { CustomStatus, MasterStatus, Task } from '../../types';

/** ONE universal adaptive dashboard for every employee: a personal Kanban of their own custom columns. */
export default function EmployeeBoard() {
  const user = useUser();
  const toast = useToast();
  const drawer = useTaskDrawer();
  const { data: dash } = useEmployeeDashboard();
  const { data: customs, isLoading: cLoading, error: cError } = useCustomStatuses();
  const { data: masters } = useMasterStatuses();
  const { data: tasks, isLoading: tLoading, error: tError } = useTasks({});
  const patch = usePatchTask();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<{ customStatusId?: string } | null>(null);
  const [managing, setManaging] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const masterById = useMemo(() => new Map((masters ?? []).map((m) => [m.id, m])), [masters]);

  const columns: KanbanColumn[] = useMemo(() => {
    if (!customs?.length) return [];
    const byCol = new Map<string, Task[]>(customs.map((c) => [c.id, []]));
    const needle = q.trim().toLowerCase();
    for (const t of tasks ?? []) {
      if (needle && !`${t.title} ${t.projectName}`.toLowerCase().includes(needle)) continue;
      // Tasks without a custom column fall into the first column mapped to their master status.
      const colId =
        (t.customStatusId && byCol.has(t.customStatusId) && t.customStatusId) ||
        customs.find((c) => c.masterStatusId === t.masterStatusId)?.id ||
        customs[0]!.id;
      byCol.get(colId)!.push(t);
    }
    return customs.map((c) => ({
      id: c.id,
      title: c.name,
      color: masterById.get(c.masterStatusId)?.color,
      subtitle: `→ ${masterById.get(c.masterStatusId)?.name ?? 'Unmapped'}`,
      tasks: byCol.get(c.id)!.sort(
        (a, b) =>
          Number(b.approvalState === 'revision_requested') - Number(a.approvalState === 'revision_requested') ||
          PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank,
      ),
    }));
  }, [customs, tasks, masterById, q]);

  const onMove = (task: Task, to: string) => {
    const cs = customs?.find((c) => c.id === to);
    const m = cs ? masterById.get(cs.masterStatusId) : undefined;
    patch.mutate(
      { id: task.id, customStatusId: to, optimistic: { masterStatusId: m?.id, masterStatusName: m?.name ?? task.masterStatusName } },
      { onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        subtitle="Your tasks, your columns."
        actions={
          <>
            {!user.googleCalendarConnected && (
              <button
                className="btn-secondary"
                disabled={connecting}
                onClick={async () => {
                  setConnecting(true);
                  try {
                    await connectGoogleCalendar();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                    setConnecting(false);
                  }
                }}
              >
                {connecting ? <Spinner /> : <CalendarPlus className="size-4" />} Connect Google Calendar
              </button>
            )}
            <button className="btn-secondary" onClick={() => setManaging(true)}>
              <Columns3 className="size-4" /> Columns
            </button>
            <button className="btn-primary" onClick={() => setCreating({})}>
              <Plus className="size-4" /> New task
            </button>
          </>
        }
      />

      {/* Attention strip */}
      {dash && (
        <div className="no-scrollbar -mx-4 mb-5 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
          <AttentionCard
            icon={<MessageSquareWarning className="size-4" />}
            label="Revision requests"
            tone="rose"
            tasks={dash.revisionRequests}
            onOpen={(t) => drawer.open(t.id)}
          />
          <AttentionCard icon={<AlarmClock className="size-4" />} label="Overdue" tone="amber" tasks={dash.overdueTasks} onOpen={(t) => drawer.open(t.id)} />
          <AttentionCard icon={<CalendarClock className="size-4" />} label="Due today" tone="brand" tasks={dash.todaysTasks} onOpen={(t) => drawer.open(t.id)} />
        </div>
      )}
      {dash?.wallet && user.employmentType === 'project_based' && (
        <Link to="/app/wallet" className="card mb-5 flex items-center gap-3 p-3 text-sm transition hover:border-brand-200 sm:hidden">
          <Wallet className="size-4 text-brand-500" />
          <span className="text-slate-600">Wallet</span>
          <span className="ml-auto font-semibold text-amber-600">{formatMoney(dash.wallet.pending)} pending</span>
        </Link>
      )}

      <div className="relative mb-4 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input !pl-9" placeholder="Search my tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {(cError || tError) && <ErrorState error={cError || tError} />}
      {cLoading || tLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : (
        <KanbanBoard
          columns={columns}
          onMove={onMove}
          onOpen={(t) => drawer.open(t.id)}
          columnAction={(col) => (
            <button
              className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              onClick={() => setCreating({ customStatusId: col.id })}
              aria-label={`Add task to ${col.title}`}
            >
              <Plus className="size-4" />
            </button>
          )}
          trailing={
            <button
              onClick={() => setManaging(true)}
              className="flex h-24 w-60 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-400 transition hover:border-brand-300 hover:text-brand-600"
            >
              <Plus className="size-4" /> Add column
            </button>
          }
        />
      )}

      <CreateTaskModal open={!!creating} onClose={() => setCreating(null)} customStatusId={creating?.customStatusId} />
      <ColumnManager open={managing} onClose={() => setManaging(false)} customs={customs ?? []} masters={masters ?? []} />
    </div>
  );
}

function AttentionCard({
  icon,
  label,
  tone,
  tasks,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  tone: 'rose' | 'amber' | 'brand';
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  const tones = {
    rose: 'from-rose-50 to-white ring-rose-100 text-rose-700',
    amber: 'from-amber-50 to-white ring-amber-100 text-amber-700',
    brand: 'from-brand-50 to-white ring-brand-100 text-brand-700',
  };
  return (
    <div className={cn('w-72 shrink-0 rounded-2xl bg-gradient-to-br p-3 ring-1 sm:w-auto', tones[tone], !tasks.length && 'opacity-70')}>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {icon} {label}
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] shadow-xs">{tasks.length}</span>
      </p>
      {tasks.length ? (
        <ul className="space-y-1">
          {tasks.slice(0, 3).map((t) => (
            <li key={t.id}>
              <button onClick={() => onOpen(t)} className="flex w-full items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-white">
                <PriorityBadge priority={t.priority} variant="icon" className="!size-5" />
                <span className="truncate">{t.title}</span>
              </button>
            </li>
          ))}
          {tasks.length > 3 && <li className="px-2 text-xs text-slate-500">+{tasks.length - 3} more</li>}
        </ul>
      ) : (
        <p className="px-1 text-xs text-slate-500">All clear</p>
      )}
    </div>
  );
}

/** Add / rename / delete / reorder custom columns; each must map to a master status. */
function ColumnManager({ open, onClose, customs, masters }: { open: boolean; onClose: () => void; customs: CustomStatus[]; masters: MasterStatus[] }) {
  const { create, update, reorder, remove } = useCustomStatusMutations();
  const toast = useToast();
  const [name, setName] = useState('');
  const [masterId, setMasterId] = useState('');
  const onErr = (e: unknown) => toast(errorMessage(e), 'error');

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!masterId) return toast('Choose which master status this column maps to', 'error');
    create.mutate(
      { name: name.trim(), masterStatusId: masterId },
      {
        onSuccess: () => {
          setName('');
          setMasterId('');
        },
        onError: onErr,
      },
    );
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= customs.length) return;
    const next = [...customs];
    [next[i], next[j]] = [next[j]!, next[i]!];
    reorder.mutate(next, { onError: onErr });
  };

  return (
    <Modal open={open} onClose={onClose} title="Customise my columns" size="lg">
      <p className="mb-4 text-sm text-slate-500">
        Rename columns to match how you work (e.g. "Editing", "Developing"). Each column maps to a master status so the agency board stays clean.
      </p>
      <ul className="space-y-2">
        {customs.map((c, i) => (
          <ColumnRow
            key={c.id}
            status={c}
            masters={masters}
            first={i === 0}
            last={i === customs.length - 1}
            onMove={(dir) => move(i, dir)}
            onSave={(patch) => update.mutate({ id: c.id, ...patch }, { onError: onErr })}
            onDelete={() => {
              if (customs.length <= 1) return toast('Keep at least one column', 'error');
              if (!window.confirm(`Delete column "${c.name}"? Its tasks will move to their default column.`)) return;
              remove.mutate(c.id, { onError: onErr });
            }}
          />
        ))}
      </ul>
      <form onSubmit={add} className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">Add a column</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <Field label="Column name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Developing" />
          </Field>
          <Field label="Maps to (required)">
            <select className="input" value={masterId} onChange={(e) => setMasterId(e.target.value)} required>
              <option value="">Select…</option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn-primary" disabled={create.isPending || !name.trim() || !masterId}>
            {create.isPending ? <Spinner /> : <Plus className="size-4" />} Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ColumnRow({
  status,
  masters,
  first,
  last,
  onMove,
  onSave,
  onDelete,
}: {
  status: CustomStatus;
  masters: MasterStatus[];
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (p: { name?: string; masterStatusId?: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(status.name);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:flex-nowrap">
      <div className="flex flex-col">
        <button disabled={first} onClick={() => onMove(-1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move left">
          <ArrowUp className="size-3.5" />
        </button>
        <button disabled={last} onClick={() => onMove(1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move right">
          <ArrowDown className="size-3.5" />
        </button>
      </div>
      <input
        className="input min-w-0 flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== status.name && onSave({ name: name.trim() })}
        aria-label="Column name"
      />
      <span className="text-xs text-slate-400">→</span>
      <select className="input !w-40" value={status.masterStatusId} onChange={(e) => onSave({ masterStatusId: e.target.value })} aria-label="Maps to master status">
        {masters.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={onDelete} aria-label={`Delete ${status.name}`}>
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
