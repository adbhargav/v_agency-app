import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Ban, Building2, CalendarDays, ClipboardList, FolderKanban, Link2, ListPlus, UserRound, X } from 'lucide-react';
import { useCreateRequirementTask, useDeclineRequirement, useRequirement, useUsers } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useUser } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTaskDrawer } from '../lib/useTaskDrawer';
import { cn, dateInputToISO, formatDate, formatDateTime, relativeTime } from '../lib/format';
import { PriorityBadge, PrioritySelect } from './PriorityBadge';
import { RequirementStatusBadge, ServiceChip } from './ServiceChip';
import { FilePreviewGrid } from './FilePreview';
import { CompactTaskRow } from './TaskList';
import { Drawer, ErrorState, Field, Modal, ProgressBar, Skeleton, Spinner } from './ui';
import type { Priority, Requirement, RequirementAnswer } from '../types';

// ---------------------------------------------------------------- read-only answers

function AnswerValueView({ answer }: { answer: RequirementAnswer }) {
  const v = answer.value;
  const empty = <span className="text-slate-400">—</span>;
  switch (answer.type) {
    case 'file':
      return answer.files?.length ? <FilePreviewGrid files={answer.files} /> : Array.isArray(v) && v.length ? <span className="text-slate-400">Files unavailable</span> : empty;
    case 'checkbox':
      return v === true ? <span className="chip bg-emerald-50 text-emerald-700">Yes</span> : v === false ? <span className="chip bg-slate-100 text-slate-600">No</span> : empty;
    case 'multiselect':
      return Array.isArray(v) && v.length ? (
        <div className="flex flex-wrap gap-1.5">
          {(v as string[]).map((o) => (
            <span key={o} className="chip bg-slate-100 text-slate-700">
              {o}
            </span>
          ))}
        </div>
      ) : (
        empty
      );
    case 'url':
      return typeof v === 'string' && v ? (
        <a href={v} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 break-all text-brand-600 hover:underline">
          <Link2 className="size-3.5 shrink-0" />
          {v}
        </a>
      ) : (
        empty
      );
    case 'date':
      return typeof v === 'string' && v ? <span>{formatDate(v, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span> : empty;
    default:
      return v === null || v === undefined || v === '' ? empty : <p className="whitespace-pre-wrap break-words">{String(v)}</p>;
  }
}

export function RequirementAnswers({ requirement, className }: { requirement: Pick<Requirement, 'answers'>; className?: string }) {
  if (!requirement.answers.length) return <p className="text-sm text-slate-400">No form answers.</p>;
  return (
    <dl className={cn('divide-y divide-slate-100', className)}>
      {requirement.answers.map((a) => (
        <div key={a.fieldId} className="py-3 first:pt-0 last:pb-0">
          <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{a.label}</dt>
          <dd className="text-sm text-slate-800">
            <AnswerValueView answer={a} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- header

export function RequirementHeader({ requirement: r, clientView }: { requirement: Requirement; clientView?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ServiceChip service={r.serviceType} />
        <RequirementStatusBadge status={r.displayStatus} clientView={clientView} />
        <PriorityBadge priority={r.priority} />
      </div>
      <h2 className="text-xl font-semibold leading-tight text-slate-900">{r.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
        {!clientView && (
          <span className="flex items-center gap-1.5">
            <Building2 className="size-4" /> {r.clientName}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <FolderKanban className="size-4" /> {r.projectName}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-4" /> {r.desiredDate ? `Wanted by ${formatDate(r.desiredDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No desired date'}
        </span>
        {!clientView && r.submittedBy && (
          <span className="flex items-center gap-1.5">
            <UserRound className="size-4" /> {r.submittedBy.name}
          </span>
        )}
        <span title={formatDateTime(r.createdAt)}>Submitted {relativeTime(r.createdAt)}</span>
      </div>
      {r.taskCount > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-500">
            <span>
              Progress · {r.doneCount}/{r.taskCount} task{r.taskCount === 1 ? '' : 's'} done
            </span>
            <span>{r.progress}%</span>
          </div>
          <ProgressBar value={r.progress} />
        </div>
      )}
    </div>
  );
}

export function DeclinedNotice({ requirement: r }: { requirement: Requirement }) {
  if (r.displayStatus !== 'declined') return null;
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
        <Ban className="size-4" /> Declined{r.reviewedAt ? ` · ${formatDate(r.reviewedAt)}` : ''}
      </p>
      {r.declineReason && <p className="mt-1.5 whitespace-pre-wrap text-sm text-rose-900">{r.declineReason}</p>}
    </div>
  );
}

export function Section({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <h3 className="flex-1 text-sm font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- drawer (admin & employee)

export function RequirementDrawer({ requirementId, onClose }: { requirementId: string | null; onClose: () => void }) {
  return (
    <Drawer open={!!requirementId} onClose={onClose} label="Requirement details">
      {requirementId && <RequirementDetail requirementId={requirementId} onClose={onClose} />}
    </Drawer>
  );
}

function RequirementDetail({ requirementId, onClose }: { requirementId: string; onClose: () => void }) {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const { data: r, isLoading, error, refetch } = useRequirement(requirementId);
  const drawer = useTaskDrawer();
  const [modal, setModal] = useState<null | 'task' | 'decline'>(null);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
        <ClipboardList className="size-4 text-slate-400" />
        <p className="flex-1 truncate text-sm text-slate-500">{r ? `${r.clientName} · ${r.projectName}` : 'Loading…'}</p>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {r && (
          <div className="space-y-6">
            <RequirementHeader requirement={r} />
            <DeclinedNotice requirement={r} />
            {isAdmin && r.status !== 'declined' && (
              <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                {r.status === 'new' && <p className="w-full text-sm font-medium text-slate-700">Review this requirement: turn it into one or more tasks, or decline it.</p>}
                <button className="btn-primary flex-1 sm:flex-none" onClick={() => setModal('task')}>
                  <ListPlus className="size-4" /> {r.taskCount ? 'Create another task' : 'Create task'}
                </button>
                {r.status === 'new' && (
                  <button className="btn-secondary flex-1 !text-rose-700 sm:flex-none" onClick={() => setModal('decline')}>
                    <Ban className="size-4" /> Decline
                  </button>
                )}
              </div>
            )}
            <Section icon={<ClipboardList className="size-4" />} title="Client brief">
              <div className="rounded-2xl border border-slate-200 p-4">
                <RequirementAnswers requirement={r} />
              </div>
            </Section>
            <Section icon={<ListPlus className="size-4" />} title={`Linked tasks${r.tasks?.length ? ` (${r.tasks.length})` : ''}`}>
              {r.tasks?.length ? (
                <ul className="card divide-y divide-slate-100 overflow-hidden">
                  {r.tasks.map((t) => (
                    <CompactTaskRow
                      key={t.id}
                      task={t}
                      onOpen={() => drawer.open(t.id)}
                      trailing={<span className="chip hidden bg-slate-100 text-slate-600 sm:inline-flex">{t.masterStatusName}</span>}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">No tasks yet.</p>
              )}
            </Section>
          </div>
        )}
      </div>
      {r && isAdmin && (
        <>
          <CreateRequirementTaskModal requirement={r} open={modal === 'task'} onClose={() => setModal(null)} />
          <DeclineModal requirement={r} open={modal === 'decline'} onClose={() => setModal(null)} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- admin actions

function CreateRequirementTaskModal({ requirement: r, open, onClose }: { requirement: Requirement; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateRequirementTask();
  const { data: team } = useUsers('employee', open, r.serviceType.id);
  const { data: everyone } = useUsers('employee', open);
  const blank = () => ({
    title: r.title,
    description: '',
    assigneeId: '',
    dueDate: r.desiredDate?.slice(0, 10) ?? '',
    priority: r.priority as Priority,
  });
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setForm(blank());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, r.id]);

  const teamActive = useMemo(() => (team ?? []).filter((u) => u.isActive), [team]);
  const others = useMemo(() => (everyone ?? []).filter((u) => u.isActive && !teamActive.some((t) => t.id === u.id)), [everyone, teamActive]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('Give the task a name.');
    create.mutate(
      {
        requirementId: r.id,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assigneeId: form.assigneeId || undefined,
        dueDate: dateInputToISO(form.dueDate),
        priority: form.priority,
      },
      {
        onSuccess: (task) => {
          toast(task.assignee ? `Task created for ${task.assignee.name}` : 'Task created');
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
      title="Create task from requirement"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="req-task" className="btn-primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create task
          </button>
        </>
      }
    >
      <form id="req-task" onSubmit={submit} className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Linked to <ServiceChip service={r.serviceType} size="sm" /> · {r.projectName}. The assignee sees the full client brief in the task.
        </p>
        <Field label="Task name">
          <input autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Description (optional)" hint="Internal instructions for the team, in addition to the client brief.">
          <textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assign to">
            <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {teamActive.length > 0 && (
                <optgroup label={`${r.serviceType.name} team`}>
                  {teamActive.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label={teamActive.length ? 'All other employees' : 'All employees'}>
                  {others.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {team && teamActive.length === 0 && <span className="mt-1 block text-xs text-slate-400">Nobody is in the {r.serviceType.name} team yet — showing everyone.</span>}
          </Field>
          <Field label="Due date">
            <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
        </div>
        <div>
          <span className="label">Priority</span>
          <PrioritySelect value={form.priority} onChange={(priority) => setForm({ ...form, priority })} />
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}

function DeclineModal({ requirement: r, open, onClose }: { requirement: Requirement; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const decline = useDeclineRequirement();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);
  const invalid = !reason.trim();
  const send = () => {
    setTouched(true);
    if (invalid) return;
    decline.mutate(
      { id: r.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast('Requirement declined — the client has been notified');
          onClose();
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Decline requirement"
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-danger" disabled={decline.isPending} onClick={send}>
            {decline.isPending && <Spinner />} Decline
          </button>
        </>
      }
    >
      <Field label="Reason (sent to the client)">
        <textarea
          autoFocus
          className={cn('input min-h-28', touched && invalid && 'border-rose-300 focus:border-rose-400 focus:ring-rose-100')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Please add the raw footage and the target platforms, then resubmit."
        />
        {touched && invalid && <span className="mt-1 block text-xs text-rose-600">A reason is required.</span>}
      </Field>
    </Modal>
  );
}

/** Compact list row used by inboxes and lists. */
export function RequirementRow({ requirement: r, onOpen, clientView, showClient = true }: { requirement: Requirement; onOpen: () => void; clientView?: boolean; showClient?: boolean }) {
  return (
    <li>
      <button onClick={onOpen} className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {r.displayStatus === 'new' && !clientView && <span className="size-2 shrink-0 rounded-full bg-brand-500" aria-label="New" />}
            <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {showClient && !clientView ? `${r.clientName} · ` : ''}
            {r.projectName} · {relativeTime(r.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <ServiceChip service={r.serviceType} size="sm" />
          <PriorityBadge priority={r.priority} variant="icon" />
          <RequirementStatusBadge status={r.displayStatus} clientView={clientView} />
          {r.taskCount > 0 && (
            <span className="flex w-28 items-center gap-2">
              <ProgressBar value={r.progress} size="sm" />
              <span className="w-8 text-right text-xs text-slate-500">{r.progress}%</span>
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
