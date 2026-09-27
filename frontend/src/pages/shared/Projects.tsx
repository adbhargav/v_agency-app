import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, FolderKanban, FolderOpen, ListTodo, Plus, Search } from 'lucide-react';
import { useClients, useCreateProject, useMasterStatuses, useProject, useProjects, useTasks, useUpdateProject } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useUser } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { cn, formatDate } from '../../lib/format';
import { homeFor } from '../../lib/roles';
import { CreateTaskModal } from '../../components/CreateTaskModal';
import { FileManager } from '../../components/FileManager';
import { TaskList } from '../../components/TaskList';
import { EmptyState, ErrorState, Field, Modal, PageHeader, ProgressBar, Skeleton, Spinner, Tabs } from '../../components/ui';
import type { Project, ProjectStatus } from '../../types';

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-brand-50 text-brand-700',
  archived: 'bg-slate-100 text-slate-500',
};

export function ProjectCard({ project, to }: { project: Project; to: string }) {
  const user = useUser();
  return (
    <Link to={to} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-amber-100 text-brand-600">
          <FolderKanban className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{project.name}</p>
          {user.role !== 'client' && <p className="truncate text-sm text-slate-500">{project.clientName}</p>}
        </div>
        <span className={cn('chip capitalize', STATUS_STYLE[project.status])}>{project.status}</span>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-2xl font-semibold tracking-tight text-slate-900">{project.progress}%</span>
          <span className="text-xs text-slate-500">
            {project.doneCount}/{project.taskCount} tasks done
          </span>
        </div>
        <ProgressBar value={project.progress} />
      </div>
      {(project.startDate || project.endDate) && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays className="size-3.5" />
          {formatDate(project.startDate)} → {formatDate(project.endDate)}
        </p>
      )}
    </Link>
  );
}

export function ProjectsListPage() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const { data: projects, isLoading, error, refetch } = useProjects();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('active');
  const [creating, setCreating] = useState(false);
  const base = homeFor(user.role);

  const filtered = (projects ?? []).filter(
    (p) => (status === 'all' || p.status === status) && `${p.name} ${p.clientName}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={isAdmin ? 'Every campaign across all clients' : 'Projects you are working on'}
        actions={
          isAdmin && (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New project
            </button>
          )
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'archived', label: 'Archived' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FolderKanban className="size-5" />} title="No projects here" description={isAdmin ? 'Create a project for a client to get started.' : undefined} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} to={`${base}/projects/${p.id}`} />
          ))}
        </div>
      )}
      {isAdmin && <CreateProjectModal open={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: clients } = useClients(open);
  const create = useCreateProject();
  const toast = useToast();
  const [form, setForm] = useState({ clientId: '', name: '', description: '', startDate: '', endDate: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.clientId || !form.name.trim()) return setError('Client and project name are required.');
    create.mutate(
      {
        clientId: form.clientId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      },
      {
        onSuccess: () => {
          toast('Project created');
          setForm({ clientId: '', name: '', description: '', startDate: '', endDate: '' });
          setError(null);
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
      title="New project"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-project" className="btn-primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create project
          </button>
        </>
      }
    >
      <form id="create-project" onSubmit={submit} className="space-y-4">
        <Field label="Client">
          <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Select client…</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` · ${c.company}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Real Estate August Campaign" />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date">
            <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="End date">
            <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-slate-500">A Google Drive folder is created automatically when Drive is configured.</p>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const isClient = user.role === 'client';
  const { data: project, isLoading, error } = useProject(id);
  const { data: tasks, isLoading: tasksLoading } = useTasks({ projectIds: id ? [id] : [] }, !!id);
  const { data: masters } = useMasterStatuses();
  const update = useUpdateProject();
  const toast = useToast();
  const drawer = useTaskDrawer();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'tasks' | 'files') || 'tasks';
  const [creating, setCreating] = useState(false);
  const base = homeFor(user.role);

  if (error) return <ErrorState error={error} />;
  if (isLoading || !project)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );

  const setTab = (t: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('tab', t);
      return n;
    });

  return (
    <div>
      <Link to={isClient ? base : `${base}/projects`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> {isClient ? 'Overview' : 'All projects'}
      </Link>
      <div className="card mb-6 overflow-hidden">
        <div className="bg-gradient-to-br from-brand-800 via-brand-600 to-brand-400 p-5 text-white sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {!isClient && <p className="text-sm text-white/70">{project.clientName}</p>}
              <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && <p className="mt-1 max-w-2xl text-sm text-white/80">{project.description}</p>}
            </div>
            {isAdmin ? (
              <select
                className="rounded-xl border border-white/20 bg-white/15 px-3 py-1.5 text-sm text-white outline-none backdrop-blur [&>option]:text-slate-900"
                value={project.status}
                onChange={(e) =>
                  update.mutate(
                    { id: project.id, status: e.target.value as ProjectStatus },
                    { onSuccess: () => toast('Project updated'), onError: (err) => toast(errorMessage(err), 'error') },
                  )
                }
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            ) : (
              <span className="chip w-fit bg-white/15 capitalize text-white">{project.status}</span>
            )}
          </div>
          <div className="mt-5 flex items-end gap-4">
            <div className="flex-1">
              <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${project.progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-white/75">
                {project.doneCount} of {project.taskCount} tasks complete · {formatDate(project.startDate)} → {formatDate(project.endDate)}
              </p>
            </div>
            <p className="text-3xl font-semibold tabular-nums">{project.progress}%</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'tasks', label: isClient ? 'Tasks' : 'Tasks', icon: <ListTodo className="size-4" />, count: tasks?.length },
            { value: 'files', label: 'Files', icon: <FolderOpen className="size-4" /> },
          ]}
        />
        {!isClient && tab === 'tasks' && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add task
          </button>
        )}
      </div>

      {tab === 'tasks' ? (
        tasksLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <TaskList
            tasks={tasks ?? []}
            onOpen={(t) => drawer.open(t.id)}
            clientSafe={isClient}
            statusColor={(t) => masters?.find((m) => m.id === t.masterStatusId || m.name === t.masterStatusName)?.color}
            empty={isClient ? 'No tasks to show yet' : 'No tasks in this project yet'}
          />
        )
      ) : (
        <FileManager projectId={project.id} />
      )}

      {!isClient && <CreateTaskModal open={creating} onClose={() => setCreating(false)} projectId={project.id} />}
    </div>
  );
}
