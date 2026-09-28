import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, FolderKanban, LayoutList, Plus, Search, SquareKanban, Users, X, Flag, CalendarClock, Layers } from 'lucide-react';
import { useClients, useMasterStatuses, usePatchTask, useProjects, useServiceTypes, useTasks, useUsers } from '../../api/hooks';
import { ColorDot } from '../../components/ServiceChip';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { PRIORITIES, PRIORITY_META } from '../../lib/priority';
import { cn } from '../../lib/format';
import { MultiSelect } from '../../components/MultiSelect';
import { KanbanBoard, type KanbanColumn } from '../../components/KanbanBoard';
import { TaskList } from '../../components/TaskList';
import { CreateTaskModal } from '../../components/CreateTaskModal';
import { ErrorState, PageHeader, Skeleton } from '../../components/ui';
import type { Priority, TaskFilters } from '../../types';

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export default function MasterTasksPage() {
  const [params, setParams] = useSearchParams();
  const drawer = useTaskDrawer();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const view = params.get('view') === 'list' ? 'list' : 'kanban';
  const assigneeIds = list(params.get('assignees'));
  const clientIds = list(params.get('clients'));
  const projectIds = list(params.get('projects'));
  const priorities = list(params.get('priorities')) as Priority[];
  const serviceTypeIds = list(params.get('services'));
  const due = (params.get('due') || undefined) as TaskFilters['due'];
  const search = params.get('q') ?? '';
  const includeDone = params.get('done') !== '0';

  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => setSearchDraft(search), [search]);
  useEffect(() => {
    if (searchDraft === search) return;
    const t = window.setTimeout(() => set('q', searchDraft || null), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  function set(key: string, value: string | string[] | null) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        const v = Array.isArray(value) ? value.join(',') : value;
        if (v) n.set(key, v);
        else n.delete(key);
        return n;
      },
      { replace: true },
    );
  }

  const filters: TaskFilters = useMemo(
    () => ({
      assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      clientIds: clientIds.length ? clientIds : undefined,
      projectIds: projectIds.length ? projectIds : undefined,
      priorities: priorities.length ? priorities : undefined,
      serviceTypeIds: serviceTypeIds.length ? serviceTypeIds : undefined,
      due,
      search: search || undefined,
      includeDone,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params],
  );

  const { data: tasks, isLoading, error, refetch, isFetching } = useTasks(filters);
  const { data: masters } = useMasterStatuses();
  const { data: employees } = useUsers('employee');
  const { data: clients } = useClients();
  const { data: projects } = useProjects();
  const { data: services } = useServiceTypes({ includeInactive: true });
  const patch = usePatchTask();

  const visibleProjects = useMemo(
    () => (projects ?? []).filter((p) => !clientIds.length || clientIds.includes(p.clientId)),
    [projects, clientIds],
  );

  const columns: KanbanColumn[] = useMemo(() => {
    const cols = (masters ?? []).filter((m) => includeDone || !m.isDone);
    return cols.map((m) => ({
      id: m.id,
      title: m.name,
      color: m.color,
      subtitle: m.isDone ? 'Done' : undefined,
      tasks: (tasks ?? [])
        .filter((t) => t.masterStatusId === m.id)
        .sort((a, b) => PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank),
    }));
  }, [masters, tasks, includeDone]);

  const activeFilterCount = [assigneeIds.length, clientIds.length, projectIds.length, priorities.length, serviceTypeIds.length, due ? 1 : 0, search ? 1 : 0].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Master Tasks"
        subtitle={
          <span>
            {tasks ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}` : 'Loading…'} across the agency
            {isFetching && !isLoading && <span className="ml-2 inline-block size-1.5 animate-pulse rounded-full bg-brand-500 align-middle" />}
          </span>
        }
        actions={
          <>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(['kanban', 'list'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => set('view', v === 'kanban' ? null : v)}
                  className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                >
                  {v === 'kanban' ? <SquareKanban className="size-4" /> : <LayoutList className="size-4" />}
                  {v === 'kanban' ? 'Kanban' : 'List'}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New task
            </button>
          </>
        }
      />

      {/* Filters — any combination, mirrored in the URL */}
      <div className="card mb-5 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 !py-0 !pl-9" placeholder="Search tasks…" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          </div>
          <MultiSelect
            label="Members"
            allLabel="Entire team"
            icon={<Users className="size-4" />}
            options={(employees ?? []).map((u) => ({ value: u.id, label: u.name + (u.isActive ? '' : ' (inactive)') }))}
            value={assigneeIds}
            onChange={(v) => set('assignees', v)}
          />
          <MultiSelect
            label="Services"
            allLabel="All services / teams"
            icon={<Layers className="size-4" />}
            options={(services ?? []).map((s) => ({ value: s.id, label: s.name + (s.isActive ? '' : ' (inactive)'), icon: <ColorDot color={s.color} /> }))}
            value={serviceTypeIds}
            onChange={(v) => set('services', v)}
          />
          <MultiSelect
            label="Clients"
            allLabel="All clients"
            icon={<Building2 className="size-4" />}
            options={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={clientIds}
            onChange={(v) => set('clients', v)}
          />
          <MultiSelect
            label="Projects"
            allLabel="All projects"
            icon={<FolderKanban className="size-4" />}
            options={visibleProjects.map((p) => ({ value: p.id, label: p.name }))}
            value={projectIds}
            onChange={(v) => set('projects', v)}
          />
          <MultiSelect
            label="Priorities"
            allLabel="Any priority"
            icon={<Flag className="size-4" />}
            options={PRIORITIES.map((p) => {
              const M = PRIORITY_META[p];
              return { value: p, label: M.label, icon: <M.icon className={cn('size-4 rounded', M.className, 'bg-transparent ring-0')} strokeWidth={2.5} /> };
            })}
            value={priorities}
            onChange={(v) => set('priorities', v)}
          />
          <MultiSelect
            single
            label="Due"
            allLabel="Any due date"
            icon={<CalendarClock className="size-4" />}
            options={[
              { value: 'overdue', label: 'Overdue' },
              { value: 'today', label: 'Due today' },
              { value: 'week', label: 'Due this week' },
            ]}
            value={due ? [due] : []}
            onChange={(v) => set('due', v[0] ?? null)}
          />
          <label className="flex items-center gap-2 px-1 text-sm text-slate-600">
            <input type="checkbox" className="size-4 accent-brand-600" checked={includeDone} onChange={(e) => set('done', e.target.checked ? null : '0')} />
            Show done
          </label>
          {activeFilterCount > 0 && (
            <button
              className="btn-ghost !py-1.5 text-xs sm:ml-auto"
              onClick={() =>
                setParams((p) => {
                  const n = new URLSearchParams();
                  if (p.get('view')) n.set('view', p.get('view')!);
                  return n;
                })
              }
            >
              <X className="size-3.5" /> Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          columns={columns}
          onOpen={(t) => drawer.open(t.id)}
          onMove={(task, to) => {
            const m = masters?.find((x) => x.id === to);
            patch.mutate(
              { id: task.id, masterStatusId: to, optimistic: { masterStatusName: m?.name ?? task.masterStatusName } },
              { onError: (e) => toast(errorMessage(e), 'error') },
            );
          }}
        />
      ) : (
        <TaskList tasks={tasks ?? []} onOpen={(t) => drawer.open(t.id)} statusColor={(t) => masters?.find((m) => m.id === t.masterStatusId)?.color} />
      )}

      <CreateTaskModal open={creating} onClose={() => setCreating(false)} projectId={projectIds.length === 1 ? projectIds[0] : undefined} />
    </div>
  );
}
