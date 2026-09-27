import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCheck,
  Clock,
  FolderKanban,
  MessageSquare,
  MessageSquareWarning,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  useAddComment,
  useApproveTask,
  useComments,
  useCustomStatuses,
  useDeleteTask,
  useMasterStatuses,
  usePatchTask,
  useRequestRevision,
  useSubmitTask,
  useTask,
  useTimeEntries,
  useUsers,
} from '../api/hooks';
import { errorMessage } from '../api/client';
import { useUser } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { cn, formatDate, formatDateTime, formatDuration, relativeTime, toDateInput } from '../lib/format';
import { PriorityBadge, PrioritySelect } from './PriorityBadge';
import { TimerControl } from './TimerControl';
import { AttachmentPicker, FileChip } from './Attachments';
import { ApprovalBadge, Avatar, Drawer, ErrorState, Field, Modal, ProgressBar, Skeleton, Spinner, StatusPill, Tabs } from './ui';
import type { Comment, CommentKind, DriveFile, Priority, Task } from '../types';

export function TaskDrawer({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  return (
    <Drawer open={!!taskId} onClose={onClose} label="Task details">
      {taskId && <TaskDetail taskId={taskId} onClose={onClose} />}
    </Drawer>
  );
}

function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const user = useUser();
  const { data: task, isLoading, error, refetch } = useTask(taskId);
  const [tab, setTab] = useState<'comments' | 'time'>('comments');
  const isClient = user.role === 'client';

  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
        <FolderKanban className="size-4 text-slate-400" />
        <p className="flex-1 truncate text-sm text-slate-500">{task?.projectName ?? 'Loading…'}</p>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {task && (
          <div className="space-y-6">
            <Header task={task} />
            <RevisionBanner task={task} />
            <ActionBar task={task} />
            {user.role === 'employee' && <TimerControl task={task} />}
            {isClient ? <ClientReadOnly task={task} /> : <EditForm task={task} onDeleted={onClose} />}
            <div>
              {isClient ? (
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <MessageSquare className="size-4" /> Comments
                </h3>
              ) : (
                <Tabs
                  className="mb-4"
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { value: 'comments', label: 'Comments', icon: <MessageSquare className="size-4" /> },
                    { value: 'time', label: 'Time entries', icon: <Clock className="size-4" /> },
                  ]}
                />
              )}
              {tab === 'comments' || isClient ? <CommentsSection task={task} /> : <TimeEntries taskId={task.id} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Header({ task }: { task: Task }) {
  const user = useUser();
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <StatusPill name={task.masterStatusName} />
        <ApprovalBadge state={task.approvalState} />
        {task.isOverdue && <span className="chip bg-rose-50 text-rose-700">Overdue</span>}
      </div>
      <h2 className="text-xl font-semibold leading-tight text-slate-900">{task.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-4" /> Due {formatDate(task.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        {user.role !== 'client' && task.assignee && (
          <span className="flex items-center gap-1.5">
            <Avatar name={task.assignee.name} className="size-5 text-[9px]" /> {task.assignee.name}
          </span>
        )}
        {user.role !== 'client' && task.clientName && <span>{task.clientName}</span>}
      </div>
    </div>
  );
}

function RevisionBanner({ task }: { task: Task }) {
  const { data: comments } = useComments(task.id);
  if (task.approvalState !== 'revision_requested') return null;
  const last = [...(comments ?? [])].reverse().find((c) => c.kind === 'revision_request');
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
        <MessageSquareWarning className="size-4" /> Revision requested
      </p>
      {last ? (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm text-rose-900">{last.body}</p>
          <p className="mt-1 text-xs text-rose-600">
            {last.author.name} · {relativeTime(last.createdAt)}
          </p>
          {last.files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {last.files.map((f) => (
                <FileChip key={f.id} file={f} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-rose-700">See comments below for details.</p>
      )}
    </div>
  );
}

/** Approval pipeline actions, depending on role and approvalState. */
function ActionBar({ task }: { task: Task }) {
  const user = useUser();
  const toast = useToast();
  const [modal, setModal] = useState<null | 'submit' | 'approve' | 'revision'>(null);
  const submit = useSubmitTask();
  const approve = useApproveTask();

  const canSubmit = user.role === 'employee' && (task.approvalState === 'none' || task.approvalState === 'revision_requested');
  const canApprove =
    (user.role === 'admin' && task.approvalState === 'internal_review') || (user.role === 'client' && task.approvalState === 'client_review');
  const canRevise =
    (user.role === 'admin' && (task.approvalState === 'internal_review' || task.approvalState === 'client_review')) ||
    (user.role === 'client' && task.approvalState === 'client_review');

  if (!canSubmit && !canApprove && !canRevise) {
    if (user.role === 'employee' && task.approvalState === 'internal_review')
      return <Notice tone="violet">Submitted — waiting for manager review.</Notice>;
    if (user.role === 'employee' && task.approvalState === 'client_review') return <Notice tone="sky">Approved internally — waiting for the client.</Notice>;
    if (task.approvalState === 'approved') return <Notice tone="emerald">Approved by the client.</Notice>;
    return null;
  }

  return (
    <>
      <div className={cn('flex flex-wrap gap-2 rounded-2xl p-3', user.role === 'client' ? 'bg-sky-50 ring-1 ring-sky-100' : 'bg-slate-50 ring-1 ring-slate-100')}>
        {user.role === 'client' && <p className="w-full text-sm font-medium text-sky-900">This deliverable is ready for your review.</p>}
        {canSubmit && (
          <button className="btn-primary flex-1 sm:flex-none" onClick={() => setModal('submit')}>
            <Send className="size-4" /> Submit for review
          </button>
        )}
        {canApprove && (
          <button className="btn-success flex-1 sm:flex-none" onClick={() => setModal('approve')}>
            <Check className="size-4" /> {user.role === 'admin' ? 'Approve & send to client' : 'Approve'}
          </button>
        )}
        {canRevise && (
          <button className="btn-secondary flex-1 !text-rose-700 sm:flex-none" onClick={() => setModal('revision')}>
            <RotateCcw className="size-4" /> Request revision
          </button>
        )}
      </div>

      <SimpleCommentModal
        open={modal === 'submit'}
        title="Submit for internal review"
        confirm="Submit"
        pending={submit.isPending}
        onClose={() => setModal(null)}
        onConfirm={(comment) =>
          submit.mutate(
            { id: task.id, comment },
            {
              onSuccess: () => {
                toast('Submitted for review');
                setModal(null);
              },
              onError: (e) => toast(errorMessage(e), 'error'),
            },
          )
        }
      />
      <SimpleCommentModal
        open={modal === 'approve'}
        title={user.role === 'admin' ? 'Approve & send to client' : 'Approve deliverable'}
        confirm="Approve"
        pending={approve.isPending}
        onClose={() => setModal(null)}
        onConfirm={(comment) =>
          approve.mutate(
            { id: task.id, comment },
            {
              onSuccess: () => {
                toast(user.role === 'admin' ? 'Sent to client for approval' : 'Approved — thank you!');
                setModal(null);
              },
              onError: (e) => toast(errorMessage(e), 'error'),
            },
          )
        }
      />
      <RevisionModal task={task} open={modal === 'revision'} onClose={() => setModal(null)} />
    </>
  );
}

function Notice({ tone, children }: { tone: 'violet' | 'sky' | 'emerald'; children: string }) {
  const t = { violet: 'bg-violet-50 text-violet-800 ring-violet-100', sky: 'bg-sky-50 text-sky-800 ring-sky-100', emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-100' };
  return <p className={cn('flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ring-1', t[tone])}><CheckCheck className="size-4" />{children}</p>;
}

function SimpleCommentModal({
  open,
  title,
  confirm,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  confirm: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (open) setComment('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={pending} onClick={() => onConfirm(comment.trim())}>
            {pending && <Spinner />} {confirm}
          </button>
        </>
      }
    >
      <Field label="Comment (optional)">
        <textarea className="input min-h-24" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note…" />
      </Field>
    </Modal>
  );
}

export function RevisionModal({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [touched, setTouched] = useState(false);
  const revise = useRequestRevision();
  const toast = useToast();
  useEffect(() => {
    if (open) {
      setComment('');
      setFiles([]);
      setTouched(false);
    }
  }, [open]);
  const invalid = !comment.trim();
  const send = () => {
    setTouched(true);
    if (invalid) return;
    revise.mutate(
      { id: task.id, comment: comment.trim(), fileIds: files.map((f) => f.id) },
      {
        onSuccess: () => {
          toast('Revision requested');
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
      title="Request revision"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-danger" disabled={revise.isPending} onClick={send}>
            {revise.isPending && <Spinner />} Request revision
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What needs to change? (required)">
          <textarea
            autoFocus
            className={cn('input min-h-28', touched && invalid && 'border-rose-300 focus:border-rose-400 focus:ring-rose-100')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder='e.g. "Make the logo bigger"'
          />
          {touched && invalid && <span className="mt-1 block text-xs text-rose-600">A comment is required to request a revision.</span>}
        </Field>
        <AttachmentPicker projectId={task.projectId} taskId={task.id} files={files} onChange={setFiles} />
      </div>
    </Modal>
  );
}

function ClientReadOnly({ task }: { task: Task }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-500">
          <span>Progress</span>
          <span>{task.percentDone}%</span>
        </div>
        <ProgressBar value={task.percentDone} />
      </div>
      {task.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>}
    </div>
  );
}

function EditForm({ task, onDeleted }: { task: Task; onDeleted: () => void }) {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const patch = usePatchTask();
  const del = useDeleteTask();
  const toast = useToast();
  const { data: masters } = useMasterStatuses();
  const { data: customs } = useCustomStatuses(user.role === 'employee');
  const { data: employees } = useUsers('employee', isAdmin);

  const [form, setForm] = useState(() => toForm(task));
  const [percent, setPercent] = useState(task.percentDone);
  // Re-sync local form state when the server copy changes (not on every optimistic tweak).
  useEffect(() => {
    setForm(toForm(task));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.updatedAt]);
  useEffect(() => setPercent(task.percentDone), [task.percentDone]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toForm(task)), [form, task]);

  const save = () => {
    patch.mutate(
      {
        id: task.id,
        title: form.title.trim(),
        description: form.description,
        dueDate: form.dueDate || null,
        priority: form.priority,
        ...(isAdmin ? { assigneeId: form.assigneeId || null } : {}),
      },
      { onSuccess: () => toast('Task updated'), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  const commitPercent = (v: number) => {
    setPercent(v);
    if (v !== task.percentDone) patch.mutate({ id: task.id, percentDone: v }, { onError: (e) => toast(errorMessage(e), 'error') });
  };

  const setStatus = (id: string) => {
    if (user.role === 'employee') {
      const cs = customs?.find((c) => c.id === id);
      const m = masters?.find((x) => x.id === cs?.masterStatusId);
      patch.mutate({ id: task.id, customStatusId: id, optimistic: { masterStatusId: m?.id, masterStatusName: m?.name ?? task.masterStatusName } });
    } else {
      const m = masters?.find((x) => x.id === id);
      patch.mutate({ id: task.id, masterStatusId: id, optimistic: { masterStatusName: m?.name ?? task.masterStatusName } });
    }
  };

  return (
    <div className="space-y-5">
      {/* status + percent: quick controls */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={user.role === 'employee' ? 'My column' : 'Status'}>
          <select
            className="input"
            value={user.role === 'employee' ? task.customStatusId ?? '' : task.masterStatusId ?? ''}
            onChange={(e) => setStatus(e.target.value)}
          >
            {user.role === 'employee' ? (
              <>
                {!task.customStatusId && <option value="">— {task.masterStatusName} —</option>}
                {customs?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </>
            ) : (
              masters?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            )}
          </select>
        </Field>
        <div>
          <span className="label flex justify-between">
            <span>Percent done</span>
            <span className="font-semibold text-brand-600">{percent}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            onPointerUp={(e) => commitPercent(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => commitPercent(Number((e.target as HTMLInputElement).value))}
            className="h-2 w-full cursor-pointer accent-brand-600"
            aria-label="Percent done"
          />
          <div className="mt-2 flex gap-1">
            {[0, 25, 50, 75, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => commitPercent(v)}
                className={cn('flex-1 rounded-lg py-1 text-xs font-medium transition', percent === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-24" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date">
            <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          {isAdmin && (
            <Field label="Assignee">
              <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                <option value="">Unassigned</option>
                {employees
                  ?.filter((u) => u.isActive || u.id === form.assigneeId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </div>
        <div>
          <span className="label">Priority</span>
          <PrioritySelect value={form.priority} onChange={(priority) => setForm({ ...form, priority })} />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          {isAdmin ? (
            <button
              className="btn-ghost !text-rose-600"
              onClick={() => {
                if (!window.confirm('Delete this task permanently?')) return;
                del.mutate(task.id, {
                  onSuccess: () => {
                    toast('Task deleted');
                    onDeleted();
                  },
                  onError: (e) => toast(errorMessage(e), 'error'),
                });
              }}
            >
              <Trash2 className="size-4" /> Delete
            </button>
          ) : (
            <span />
          )}
          <button className="btn-primary" disabled={!dirty || !form.title.trim() || patch.isPending} onClick={save}>
            {patch.isPending ? <Spinner /> : <Save className="size-4" />} Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function toForm(t: Task) {
  return {
    title: t.title,
    description: t.description ?? '',
    dueDate: toDateInput(t.dueDate),
    priority: t.priority as Priority,
    assigneeId: t.assignee?.id ?? '',
  };
}

const KIND_STYLE: Record<CommentKind, { label?: string; className: string }> = {
  comment: { className: 'bg-white ring-slate-200' },
  submission: { label: 'Submitted for review', className: 'bg-violet-50 ring-violet-200' },
  revision_request: { label: 'Revision requested', className: 'bg-rose-50 ring-rose-200' },
  approval: { label: 'Approved', className: 'bg-emerald-50 ring-emerald-200' },
  sent_to_client: { label: 'Sent to client', className: 'bg-sky-50 ring-sky-200' },
};

function CommentsSection({ task }: { task: Task }) {
  const user = useUser();
  const { data: comments, isLoading } = useComments(task.id);
  const add = useAddComment(task.id);
  const toast = useToast();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<DriveFile[]>([]);

  const send = () => {
    if (!body.trim()) return;
    add.mutate(
      { body: body.trim(), fileIds: files.length ? files.map((f) => f.id) : undefined },
      {
        onSuccess: () => {
          setBody('');
          setFiles([]);
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    );
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : comments?.length ? (
        <ol className="space-y-3">
          {comments.map((c) => (
            <CommentItem key={c.id} c={c} showInternal={user.role !== 'client'} />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-400">No comments yet.</p>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100">
        <textarea
          className="min-h-16 w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder={user.role === 'client' ? 'Write a comment to the V Agency team…' : 'Write an internal comment…'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <div className="flex items-end justify-between gap-2">
          <AttachmentPicker projectId={task.projectId} taskId={task.id} files={files} onChange={setFiles} />
          <button className="btn-primary !py-1.5" disabled={!body.trim() || add.isPending} onClick={send}>
            {add.isPending ? <Spinner /> : <Send className="size-4" />} Send
          </button>
        </div>
      </div>
      {user.role !== 'client' && <p className="text-[11px] text-slate-400">Team comments are internal and never shown to the client.</p>}
    </div>
  );
}

function CommentItem({ c, showInternal }: { c: Comment; showInternal: boolean }) {
  const style = KIND_STYLE[c.kind] ?? KIND_STYLE.comment;
  return (
    <li className="flex gap-3">
      <Avatar name={c.author.name} className="mt-0.5" />
      <div className={cn('min-w-0 flex-1 rounded-2xl rounded-tl-md p-3 ring-1', style.className)}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="font-semibold text-slate-800">{c.author.name}</span>
          {style.label && <span className="font-medium text-slate-600">· {style.label}</span>}
          {showInternal && c.isInternal && <span className="chip bg-slate-100 !py-0 text-[10px] text-slate-500">internal</span>}
          <span className="ml-auto text-slate-400" title={formatDateTime(c.createdAt)}>
            {relativeTime(c.createdAt)}
          </span>
        </div>
        {c.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{c.body}</p>}
        {c.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {c.files.map((f) => (
              <FileChip key={f.id} file={f} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function TimeEntries({ taskId }: { taskId: string }) {
  const { data, isLoading } = useTimeEntries(taskId);
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data?.entries.length) return <p className="text-sm text-slate-400">No time tracked yet.</p>;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm">
        <span className="font-medium text-slate-600">Total</span>
        <span className="font-mono font-semibold tabular-nums text-slate-900">{formatDuration(data.totalSeconds, true)}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {data.entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Avatar name={e.user.name} className="size-6 text-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-slate-700">{e.user.name}</p>
              <p className="text-xs text-slate-400">
                {formatDateTime(e.startedAt)} → {e.endedAt ? formatDateTime(e.endedAt) : <span className="text-emerald-600">running</span>}
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-600">{formatDuration(e.seconds, true)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
