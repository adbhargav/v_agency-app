import { useEffect, useState, type FormEvent } from 'react';
import { useCreateTask, useCustomStatuses, useMasterStatuses, useProjects, useServiceTypes, useUsers } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useUser } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTaskDrawer } from '../lib/useTaskDrawer';
import { dateInputToISO } from '../lib/format';
import { PrioritySelect } from './PriorityBadge';
import { Field, Modal, Spinner } from './ui';
import type { Priority } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  customStatusId?: string;
}

export function CreateTaskModal({ open, onClose, projectId, customStatusId }: Props) {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const { data: projects } = useProjects();
  const { data: employees } = useUsers('employee', isAdmin && open);
  const { data: masters } = useMasterStatuses();
  const { data: customs } = useCustomStatuses(user.role === 'employee' && open);
  const { data: services } = useServiceTypes({ enabled: isAdmin && open });
  const create = useCreateTask();
  const toast = useToast();
  const drawer = useTaskDrawer();

  const blank = () => ({
    projectId: projectId ?? '',
    title: '',
    description: '',
    dueDate: '',
    priority: '' as Priority | '',
    assigneeId: '',
    statusId: customStatusId ?? '',
    serviceTypeId: '',
  });
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(blank());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, customStatusId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.projectId) return setError('Choose a project.');
    if (!form.title.trim()) return setError('Give the task a name.');
    if (!form.priority) return setError('Select a priority level.');
    create.mutate(
      {
        projectId: form.projectId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        dueDate: dateInputToISO(form.dueDate),
        priority: form.priority,
        ...(isAdmin
          ? { assigneeId: form.assigneeId || undefined, masterStatusId: form.statusId || undefined, serviceTypeId: form.serviceTypeId || undefined }
          : { customStatusId: form.statusId || undefined }),
      },
      {
        onSuccess: (task) => {
          toast('Task created');
          onClose();
          drawer.open(task.id);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  const activeProjects = projects?.filter((p) => p.status === 'active' || p.id === projectId) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-task" className="btn-primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create task
          </button>
        </>
      }
    >
      <form id="create-task" onSubmit={submit} className="space-y-4">
        <Field label="Project">
          <select className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} disabled={!!projectId}>
            <option value="">Select project…</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {isAdmin ? `· ${p.clientName}` : ''}
              </option>
            ))}
          </select>
          {!isAdmin && activeProjects.length === 0 && (
            <span className="mt-1 block text-xs text-slate-400">You can create tasks in projects you already work on.</span>
          )}
        </Field>
        <Field label="Task name">
          <input autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Edit property tour video" />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div>
          <span className="label">Priority (required)</span>
          <PrioritySelect value={form.priority as Priority} onChange={(priority) => setForm({ ...form, priority })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date">
            <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label={isAdmin ? 'Status' : 'Column'}>
            <select className="input" value={form.statusId} onChange={(e) => setForm({ ...form, statusId: e.target.value })}>
              <option value="">Default</option>
              {isAdmin
                ? masters?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                : customs?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
            </select>
          </Field>
          {isAdmin && (
            <Field label="Assign to">
              <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                <option value="">Unassigned</option>
                {employees
                  ?.filter((u) => u.isActive)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {isAdmin && (
            <Field label="Service / team (optional)">
              <select className="input" value={form.serviceTypeId} onChange={(e) => setForm({ ...form, serviceTypeId: e.target.value })}>
                <option value="">No service</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {!isAdmin && <p className="text-xs text-slate-500">The task will be assigned to you automatically.</p>}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}
