import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { http } from './client';
import type {
  ActiveTimer,
  AdminDashboard,
  Client,
  ClientDashboard,
  Comment,
  CustomStatus,
  DriveFile,
  EmployeeDashboard,
  EmploymentType,
  EodReport,
  FinanceEmployeeRow,
  FinanceSummary,
  Folder,
  MasterStatus,
  Notification,
  Priority,
  Project,
  Requirement,
  RequirementFilters,
  Role,
  SalaryRecord,
  SalaryStatus,
  ServiceFieldInput,
  ServiceType,
  Task,
  TaskFilters,
  TimeEntry,
  User,
  WalletTransaction,
} from '../types';

// ---------------------------------------------------------------- keys
export const qk = {
  users: (role?: Role, serviceTypeId?: string) =>
    (serviceTypeId ? (['users', role ?? 'all', serviceTypeId] as const) : (['users', role ?? 'all'] as const)),
  clients: ['clients'] as const,
  masterStatuses: ['statuses', 'master'] as const,
  customStatuses: ['statuses', 'custom'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (f?: TaskFilters) => (f ? (['tasks', f] as const) : (['tasks'] as const)),
  task: (id: string) => ['task', id] as const,
  comments: (id: string) => ['comments', id] as const,
  timeEntries: (id: string) => ['timeEntries', id] as const,
  activeTimer: ['timer', 'active'] as const,
  dashboard: (role: Role) => ['dashboard', role] as const,
  eod: (date: string) => ['eod', 'me', date] as const,
  eodTeam: (date: string) => ['eod', 'team', date] as const,
  notifications: ['notifications'] as const,
  folders: (projectId: string, parentId: string | null) => ['folders', projectId, parentId ?? 'root'] as const,
  approvedFiles: ['files', 'approved'] as const,
  financeSummary: ['finance', 'summary'] as const,
  financeEmployees: ['finance', 'employees'] as const,
  wallet: (userId: string) => ['finance', 'wallet', userId] as const,
  salary: (userId: string) => ['finance', 'salary', userId] as const,
  serviceTypes: (includeInactive = false) => ['serviceTypes', includeInactive ? 'all' : 'active'] as const,
  requirements: (f?: RequirementFilters) => (f ? (['requirements', f] as const) : (['requirements'] as const)),
  requirement: (id: string) => ['requirement', id] as const,
};

/** Invalidate everything a task change can affect. */
export function invalidateTaskViews(qc: QueryClient, taskId?: string) {
  qc.invalidateQueries({ queryKey: ['tasks'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['projects'] });
  qc.invalidateQueries({ queryKey: ['project'] });
  if (taskId) qc.invalidateQueries({ queryKey: qk.task(taskId) });
}

// ---------------------------------------------------------------- users & clients
export const useUsers = (role?: Role, enabled = true, serviceTypeId?: string) =>
  useQuery({
    queryKey: qk.users(role, serviceTypeId),
    queryFn: () => http.get<{ users: User[] }>('/users', { role, serviceTypeId }).then((r) => r.users),
    enabled,
  });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      password: string;
      role: Role;
      employmentType?: EmploymentType;
      clientId?: string;
      serviceTypeIds?: string[];
    }) => http.post<{ user: User }>('/users', body).then((r) => r.user),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      employmentType?: EmploymentType;
      isActive?: boolean;
      clientId?: string;
      /** Admin password reset. */
      password?: string;
      serviceTypeIds?: string[];
    }) =>
      http.patch<{ user: User }>(`/users/${id}`, body).then((r) => r.user),
    // Optimistic so toggles and team chips feel instant.
    onMutate: async ({ id, password: _pw, ...changes }) => {
      await qc.cancelQueries({ queryKey: ['users'] });
      const prev = qc.getQueriesData<User[]>({ queryKey: ['users'] });
      for (const [key, data] of prev) if (data) qc.setQueryData(key, data.map((u) => (u.id === id ? { ...u, ...changes } : u)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['serviceTypes'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export const useClients = (enabled = true) =>
  useQuery({
    queryKey: qk.clients,
    queryFn: () => http.get<{ clients: Client[] }>('/clients').then((r) => r.clients),
    enabled,
  });

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; company?: string; email?: string; phone?: string; serviceTypeIds?: string[] }) =>
      http.post<{ client: Client }>('/clients', body).then((r) => r.client),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.clients }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      company?: string;
      email?: string;
      phone?: string;
      serviceTypeIds?: string[];
    }) => http.patch<{ client: Client }>(`/clients/${id}`, body).then((r) => r.client),
    onMutate: async ({ id, ...changes }) => {
      await qc.cancelQueries({ queryKey: qk.clients });
      const prev = qc.getQueryData<Client[]>(qk.clients);
      if (prev) qc.setQueryData(qk.clients, prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.clients, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.clients }),
  });
}

// ---------------------------------------------------------------- statuses
export const useMasterStatuses = () =>
  useQuery({
    queryKey: qk.masterStatuses,
    queryFn: () =>
      http
        .get<{ statuses: MasterStatus[] }>('/statuses/master')
        .then((r) => [...r.statuses].sort((a, b) => a.position - b.position)),
    staleTime: 5 * 60_000,
  });

export function useMasterStatusMutations() {
  const qc = useQueryClient();
  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: qk.masterStatuses });
  };
  return {
    create: useMutation({
      mutationFn: (body: { name: string; color?: string; isDone?: boolean }) => http.post('/statuses/master', body),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; color?: string; isDone?: boolean; position?: number }) =>
        http.patch(`/statuses/master/${id}`, body),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => http.del(`/statuses/master/${id}`), onSuccess }),
  };
}

export const useCustomStatuses = (enabled = true) =>
  useQuery({
    queryKey: qk.customStatuses,
    queryFn: () =>
      http
        .get<{ statuses: CustomStatus[] }>('/statuses/custom')
        .then((r) => [...r.statuses].sort((a, b) => a.position - b.position)),
    enabled,
    staleTime: 5 * 60_000,
  });

export function useCustomStatusMutations() {
  const qc = useQueryClient();
  const settle = () => {
    qc.invalidateQueries({ queryKey: qk.customStatuses });
  };
  return {
    create: useMutation({
      mutationFn: (body: { name: string; masterStatusId: string }) =>
        http.post<{ status: CustomStatus }>('/statuses/custom', body).then((r) => r.status),
      onSettled: settle,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; masterStatusId?: string; position?: number }) =>
        http.patch<{ status: CustomStatus }>(`/statuses/custom/${id}`, body).then((r) => r.status),
      onSettled: () => {
        settle();
        qc.invalidateQueries({ queryKey: ['tasks'] });
      },
    }),
    /** Persist a new column order optimistically. */
    reorder: useMutation({
      mutationFn: async (ordered: CustomStatus[]) => {
        await Promise.all(
          ordered.map((s, i) => (s.position !== i ? http.patch(`/statuses/custom/${s.id}`, { position: i }) : null)),
        );
      },
      onMutate: async (ordered) => {
        await qc.cancelQueries({ queryKey: qk.customStatuses });
        const prev = qc.getQueryData<CustomStatus[]>(qk.customStatuses);
        qc.setQueryData(
          qk.customStatuses,
          ordered.map((s, i) => ({ ...s, position: i })),
        );
        return { prev };
      },
      onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.customStatuses, ctx.prev),
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (id: string) => http.del(`/statuses/custom/${id}`),
      onSettled: () => {
        settle();
        qc.invalidateQueries({ queryKey: ['tasks'] });
      },
    }),
  };
}

// ---------------------------------------------------------------- projects
export const useProjects = () =>
  useQuery({
    queryKey: qk.projects,
    queryFn: () => http.get<{ projects: Project[] }>('/projects').then((r) => r.projects),
  });

export const useProject = (id: string | undefined) =>
  useQuery({
    queryKey: qk.project(id ?? ''),
    queryFn: () => http.get<{ project: Project }>(`/projects/${id}`).then((r) => r.project),
    enabled: !!id,
  });

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { clientId: string; name: string; description?: string; startDate?: string; endDate?: string }) =>
      http.post<{ project: Project }>('/projects', body).then((r) => r.project),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects });
      qc.invalidateQueries({ queryKey: qk.clients });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Omit<Project, 'id'>> & { id: string }) =>
      http.patch<{ project: Project }>(`/projects/${id}`, body).then((r) => r.project),
    onSuccess: (p) => {
      qc.setQueryData(qk.project(p.id), p);
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

// ---------------------------------------------------------------- tasks
function filtersToQuery(f: TaskFilters) {
  return {
    assigneeIds: f.assigneeIds,
    clientIds: f.clientIds,
    projectIds: f.projectIds,
    masterStatusIds: f.masterStatusIds,
    priorities: f.priorities,
    approvalStates: f.approvalStates,
    due: f.due,
    search: f.search,
    includeDone: f.includeDone === undefined ? undefined : String(f.includeDone),
    serviceTypeIds: f.serviceTypeIds,
  };
}

export const useTasks = (filters: TaskFilters = {}, enabled = true) =>
  useQuery({
    queryKey: qk.tasks(filters),
    queryFn: () => http.get<{ tasks: Task[] }>('/tasks', filtersToQuery(filters)).then((r) => r.tasks),
    enabled,
    placeholderData: (prev) => prev,
  });

export const useTask = (id: string | undefined) =>
  useQuery({
    queryKey: qk.task(id ?? ''),
    queryFn: () => http.get<{ task: Task }>(`/tasks/${id}`).then((r) => r.task),
    enabled: !!id,
  });

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: Priority;
  assigneeId?: string;
  masterStatusId?: string;
  customStatusId?: string;
  serviceTypeId?: string;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskInput) => http.post<{ task: Task }>('/tasks', body).then((r) => r.task),
    onSuccess: () => invalidateTaskViews(qc),
  });
}

export interface PatchTaskInput {
  id: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: Priority;
  assigneeId?: string | null;
  percentDone?: number;
  masterStatusId?: string;
  customStatusId?: string | null;
  serviceTypeId?: string | null;
}

/**
 * PATCH /tasks/:id with optimistic updates across every cached task list and the task detail.
 * `optimistic` lets callers supply extra derived fields (e.g. masterStatusName) for instant UI.
 */
export function usePatchTask() {
  const qc = useQueryClient();
  return useMutation({
    // `optimistic` is UI-only and never sent to the server.
    mutationFn: ({ id, optimistic: _optimistic, ...body }: PatchTaskInput & { optimistic?: Partial<Task> }) =>
      http.patch<{ task: Task }>(`/tasks/${id}`, body).then((r) => r.task),
    onMutate: async (vars) => {
      const { id, optimistic, ...changes } = vars;
      await qc.cancelQueries({ queryKey: ['tasks'] });
      await qc.cancelQueries({ queryKey: qk.task(id) });
      const lists = qc.getQueriesData<Task[]>({ queryKey: ['tasks'] });
      const detail = qc.getQueryData<Task>(qk.task(id));
      const apply = (t: Task): Task => (t.id === id ? ({ ...t, ...changes, ...optimistic } as Task) : t);
      for (const [key, data] of lists) if (data) qc.setQueryData(key, data.map(apply));
      if (detail) qc.setQueryData(qk.task(id), apply(detail));
      return { lists, detail };
    },
    onError: (_e, vars, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.detail) qc.setQueryData(qk.task(vars.id), ctx.detail);
    },
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      for (const [key, data] of qc.getQueriesData<Task[]>({ queryKey: ['tasks'] }))
        if (data) qc.setQueryData(key, data.map((t) => (t.id === task.id ? task : t)));
    },
    onSettled: (_d, _e, vars) => invalidateTaskViews(qc, vars.id),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del(`/tasks/${id}`),
    onSuccess: () => invalidateTaskViews(qc),
  });
}

function useTaskAction<V extends { id: string }>(path: (v: V) => string, body: (v: V) => unknown) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => http.post<{ task?: Task }>(path(v), body(v)),
    onSuccess: (_r, v) => {
      invalidateTaskViews(qc, v.id);
      qc.invalidateQueries({ queryKey: qk.comments(v.id) });
      qc.invalidateQueries({ queryKey: qk.notifications });
    },
  });
}

export const useSubmitTask = () =>
  useTaskAction<{ id: string; comment?: string }>(
    (v) => `/tasks/${v.id}/submit`,
    (v) => ({ comment: v.comment || undefined }),
  );
export const useApproveTask = () =>
  useTaskAction<{ id: string; comment?: string }>(
    (v) => `/tasks/${v.id}/approve`,
    (v) => ({ comment: v.comment || undefined }),
  );
export const useRequestRevision = () =>
  useTaskAction<{ id: string; comment: string; fileIds?: string[] }>(
    (v) => `/tasks/${v.id}/request-revision`,
    (v) => ({ comment: v.comment, fileIds: v.fileIds?.length ? v.fileIds : undefined }),
  );

// ---------------------------------------------------------------- comments
export const useComments = (taskId: string | undefined) =>
  useQuery({
    queryKey: qk.comments(taskId ?? ''),
    queryFn: () => http.get<{ comments: Comment[] }>(`/tasks/${taskId}/comments`).then((r) => r.comments),
    enabled: !!taskId,
  });

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string; fileIds?: string[] }) =>
      http.post<{ comment: Comment }>(`/tasks/${taskId}/comments`, body).then((r) => r.comment),
    onSuccess: (c) => {
      qc.setQueryData<Comment[]>(qk.comments(taskId), (old) => (old ? [...old, c] : [c]));
    },
  });
}

// ---------------------------------------------------------------- timer
export const useActiveTimer = (enabled = true) =>
  useQuery({
    queryKey: qk.activeTimer,
    queryFn: () => http.get<{ timer: ActiveTimer | null }>('/timer/active').then((r) => r.timer),
    enabled,
    refetchInterval: 120_000,
  });

export const useTimeEntries = (taskId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.timeEntries(taskId ?? ''),
    queryFn: () =>
      http.get<{ entries: TimeEntry[]; totalSeconds: number }>(`/tasks/${taskId}/time-entries`),
    enabled: !!taskId && enabled,
  });

export function useTimerControl() {
  const qc = useQueryClient();
  const settle = (_d: unknown, _e: unknown, v: { id: string }) => {
    qc.invalidateQueries({ queryKey: qk.activeTimer });
    qc.invalidateQueries({ queryKey: qk.task(v.id) });
    qc.invalidateQueries({ queryKey: qk.timeEntries(v.id) });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    start: useMutation({
      mutationFn: (v: { id: string; title?: string }) => http.post(`/tasks/${v.id}/timer/start`),
      onMutate: (v) => {
        const startedAt = new Date().toISOString();
        const prev = qc.getQueryData<ActiveTimer | null>(qk.activeTimer);
        qc.setQueryData(qk.activeTimer, { taskId: v.id, taskTitle: v.title ?? "Task", startedAt } satisfies ActiveTimer as ActiveTimer | null);
        qc.setQueryData<Task>(qk.task(v.id), (t) => (t ? { ...t, activeTimer: { startedAt } } : t));
        return { prev };
      },
      onError: (_e, _v, ctx) => qc.setQueryData(qk.activeTimer, ctx?.prev ?? null),
      onSettled: settle,
    }),
    pause: useMutation({
      mutationFn: (v: { id: string }) => http.post(`/tasks/${v.id}/timer/pause`),
      onMutate: (v) => {
        const prev = qc.getQueryData<ActiveTimer | null>(qk.activeTimer);
        qc.setQueryData(qk.activeTimer, null);
        qc.setQueryData<Task>(qk.task(v.id), (t) => {
          if (!t) return t;
          const started = t.activeTimer ? new Date(t.activeTimer.startedAt).getTime() : Date.now();
          return {
            ...t,
            activeTimer: null,
            timeSpentSeconds: (t.timeSpentSeconds ?? 0) + Math.max(0, Math.floor((Date.now() - started) / 1000)),
          };
        });
        return { prev };
      },
      onError: (_e, _v, ctx) => qc.setQueryData(qk.activeTimer, ctx?.prev ?? null),
      onSettled: settle,
    }),
  };
}

// ---------------------------------------------------------------- dashboards
export const useAdminDashboard = () =>
  useQuery({
    queryKey: qk.dashboard('admin'),
    queryFn: () => http.get<AdminDashboard>('/dashboard/admin'),
  });
export const useEmployeeDashboard = () =>
  useQuery({
    queryKey: qk.dashboard('employee'),
    queryFn: () => http.get<EmployeeDashboard>('/dashboard/employee'),
  });
export const useClientDashboard = () =>
  useQuery({
    queryKey: qk.dashboard('client'),
    queryFn: () => http.get<ClientDashboard>('/dashboard/client'),
  });

// ---------------------------------------------------------------- EOD
export const useEod = (date: string) =>
  useQuery({
    queryKey: qk.eod(date),
    queryFn: () =>
      http.get<{ date: string; completedToday: Task[]; report: EodReport | null }>('/eod', { date }),
  });

export function useSaveEod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date?: string; blockers: string; tomorrowPriority: string }) =>
      http.put<{ report: EodReport }>('/eod', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eod'] }),
  });
}

export const useTeamEod = (date: string) =>
  useQuery({
    queryKey: qk.eodTeam(date),
    queryFn: () =>
      http
        .get<{ reports: { user: User; completedToday: Task[]; report: EodReport | null }[] }>('/eod/team', { date })
        .then((r) => r.reports),
  });

// ---------------------------------------------------------------- notifications
export const useNotifications = () =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: () => http.get<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
    refetchInterval: 60_000,
  });

export function useNotificationMutations() {
  const qc = useQueryClient();
  type Data = { notifications: Notification[]; unreadCount: number };
  return {
    markRead: useMutation({
      mutationFn: (id: string) => http.post(`/notifications/${id}/read`),
      onMutate: (id) => {
        qc.setQueryData<Data>(qk.notifications, (d) => {
          if (!d) return d;
          const was = d.notifications.find((n) => n.id === id && !n.readAt);
          return {
            notifications: d.notifications.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
            unreadCount: Math.max(0, d.unreadCount - (was ? 1 : 0)),
          };
        });
      },
      onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
    }),
    readAll: useMutation({
      mutationFn: () => http.post('/notifications/read-all'),
      onMutate: () => {
        const now = new Date().toISOString();
        qc.setQueryData<Data>(qk.notifications, (d) =>
          d ? { notifications: d.notifications.map((n) => ({ ...n, readAt: n.readAt ?? now })), unreadCount: 0 } : d,
        );
      },
      onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
    }),
  };
}

// ---------------------------------------------------------------- files
export const useFolderContents = (projectId: string, parentId: string | null) =>
  useQuery({
    queryKey: qk.folders(projectId, parentId),
    queryFn: () =>
      http.get<{ folders: Folder[]; files: DriveFile[]; breadcrumb?: { id: string; name: string }[] }>(`/projects/${projectId}/folders`, {
        parentId: parentId ?? undefined,
      }),
    retry: (count, e) => !((e as { status?: number }).status === 503) && count < 2,
  });

export function useCreateFolder(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; parentId?: string | null }) =>
      http
        .post<{ folder: Folder }>(`/projects/${projectId}/folders`, { name: body.name, parentId: body.parentId || undefined })
        .then((r) => r.folder),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders', projectId] }),
  });
}

export function useSetFileFinal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isFinal }: { id: string; isFinal: boolean }) =>
      http.patch<{ file?: DriveFile }>(`/files/${id}`, { isFinal }),
    onMutate: async ({ id, isFinal }) => {
      for (const [key, data] of qc.getQueriesData<{ folders: Folder[]; files: DriveFile[] }>({ queryKey: ['folders'] }))
        if (data) qc.setQueryData(key, { ...data, files: data.files.map((f) => (f.id === id ? { ...f, isFinal } : f)) });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export const useApprovedFiles = () =>
  useQuery({
    queryKey: qk.approvedFiles,
    queryFn: () => http.get<{ files: DriveFile[] }>('/files/approved').then((r) => r.files),
    retry: (count, e) => !((e as { status?: number }).status === 503) && count < 2,
  });

// ---------------------------------------------------------------- calendar
export async function connectGoogleCalendar() {
  const { url } = await http.get<{ url: string }>('/calendar/connect-url');
  window.location.href = url;
}

export function useDisconnectCalendar() {
  return useMutation({ mutationFn: () => http.post('/calendar/disconnect') });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => http.post<{ ok: true }>('/auth/change-password', body),
  });
}

// ---------------------------------------------------------------- finance
export const useFinanceSummary = () =>
  useQuery({ queryKey: qk.financeSummary, queryFn: () => http.get<FinanceSummary>('/finance/summary') });

export const useFinanceEmployees = () =>
  useQuery({
    queryKey: qk.financeEmployees,
    queryFn: () => http.get<{ employees: FinanceEmployeeRow[] }>('/finance/employees').then((r) => r.employees),
  });

export const useWallet = (userId: string | undefined) =>
  useQuery({
    queryKey: qk.wallet(userId ?? ''),
    queryFn: () =>
      http.get<{ balance: { pending: string; settled: string }; transactions: WalletTransaction[] }>(
        `/finance/wallet/${userId}`,
      ),
    enabled: !!userId,
  });

export const useSalaryRecords = (userId: string | undefined) =>
  useQuery({
    queryKey: qk.salary(userId ?? ''),
    queryFn: () => http.get<{ records: SalaryRecord[] }>(`/finance/salary/${userId}`).then((r) => r.records),
    enabled: !!userId,
  });

export function useFinanceMutations() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: ['finance'] });
  return {
    credit: useMutation({
      mutationFn: ({ userId, ...body }: { userId: string; amount: string; description: string; taskId?: string }) =>
        http.post(`/finance/wallet/${userId}/credit`, body),
      onSuccess,
    }),
    settle: useMutation({
      mutationFn: (txId: string) => http.post(`/finance/wallet/transactions/${txId}/settle`),
      onSuccess,
    }),
    addSalary: useMutation({
      mutationFn: ({ userId, ...body }: { userId: string; periodMonth: string; amount: string }) =>
        http.post(`/finance/salary/${userId}`, body),
      onSuccess,
    }),
    salaryStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: Exclude<SalaryStatus, 'pending'> }) =>
        http.post(`/finance/salary/records/${id}/status`, { status }),
      onSuccess,
    }),
  };
}

// ---------------------------------------------------------------- services
export const useServiceTypes = (opts: { includeInactive?: boolean; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: qk.serviceTypes(!!opts.includeInactive),
    queryFn: () =>
      http
        .get<{ serviceTypes: ServiceType[] }>('/service-types', { includeInactive: opts.includeInactive ? 'true' : undefined })
        .then((r) => r.serviceTypes),
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
  });

export function useServiceTypeMutations() {
  const qc = useQueryClient();
  const settle = () => qc.invalidateQueries({ queryKey: ['serviceTypes'] });
  const replace = (st: ServiceType) => {
    for (const [key, data] of qc.getQueriesData<ServiceType[]>({ queryKey: ['serviceTypes'] }))
      if (data) qc.setQueryData(key, data.map((x) => (x.id === st.id ? st : x)));
  };
  return {
    create: useMutation({
      mutationFn: (body: { name: string; description?: string | null; color?: string; fields?: ServiceFieldInput[] }) =>
        http.post<{ serviceType: ServiceType }>('/service-types', body).then((r) => r.serviceType),
      onSettled: settle,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string | null; color?: string; isActive?: boolean; position?: number }) =>
        http.patch<{ serviceType: ServiceType }>(`/service-types/${id}`, body).then((r) => r.serviceType),
      onMutate: async ({ id, ...changes }) => {
        await qc.cancelQueries({ queryKey: ['serviceTypes'] });
        const prev = qc.getQueriesData<ServiceType[]>({ queryKey: ['serviceTypes'] });
        for (const [key, data] of prev) if (data) qc.setQueryData(key, data.map((x) => (x.id === id ? { ...x, ...changes } : x)));
        return { prev };
      },
      onError: (_e, _v, ctx) => ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data)),
      onSuccess: replace,
      onSettled: settle,
    }),
    saveFields: useMutation({
      mutationFn: ({ id, fields }: { id: string; fields: ServiceFieldInput[] }) =>
        http.put<{ serviceType: ServiceType }>(`/service-types/${id}/fields`, { fields }).then((r) => r.serviceType),
      onSuccess: replace,
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (id: string) => http.del(`/service-types/${id}`),
      onSettled: settle,
    }),
  };
}

// ---------------------------------------------------------------- requirements
export const useRequirements = (filters: RequirementFilters = {}, opts: { enabled?: boolean; refetchInterval?: number } = {}) =>
  useQuery({
    queryKey: qk.requirements(filters),
    queryFn: () =>
      http
        .get<{ requirements: Requirement[] }>('/requirements', {
          statuses: filters.statuses,
          serviceTypeIds: filters.serviceTypeIds,
          clientIds: filters.clientIds,
          projectIds: filters.projectIds,
        })
        .then((r) => r.requirements),
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetchInterval,
    placeholderData: (prev) => prev,
  });

export const useRequirement = (id: string | null | undefined) =>
  useQuery({
    queryKey: qk.requirement(id ?? ''),
    queryFn: () => http.get<{ requirement: Requirement }>(`/requirements/${id}`).then((r) => r.requirement),
    enabled: !!id,
  });

export interface CreateRequirementInput {
  projectId: string;
  serviceTypeId: string;
  title: string;
  priority?: Priority;
  desiredDate?: string;
  answers: Record<string, unknown>;
}

export function useCreateRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRequirementInput) =>
      http.post<{ requirement: Requirement }>('/requirements', body).then((r) => r.requirement),
    onSuccess: (r) => {
      qc.setQueryData(qk.requirement(r.id), r);
      qc.invalidateQueries({ queryKey: ['requirements'] });
    },
  });
}

function invalidateRequirement(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: ['requirements'] });
  qc.invalidateQueries({ queryKey: qk.requirement(id) });
  qc.invalidateQueries({ queryKey: ['serviceTypes'] });
}

export function useCreateRequirementTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requirementId,
      ...body
    }: {
      requirementId: string;
      title: string;
      description?: string;
      assigneeId?: string;
      dueDate?: string;
      priority?: Priority;
    }) => http.post<{ task: Task }>(`/requirements/${requirementId}/tasks`, body).then((r) => r.task),
    onSuccess: (task, v) => {
      // Show the new task in the requirement right away, and mark it accepted.
      qc.setQueryData<Requirement>(qk.requirement(v.requirementId), (r) =>
        r
          ? {
              ...r,
              status: 'accepted',
              displayStatus: 'in_progress',
              taskCount: r.taskCount + 1,
              tasks: [...(r.tasks ?? []), task],
            }
          : r,
      );
      invalidateRequirement(qc, v.requirementId);
      invalidateTaskViews(qc);
    },
  });
}

export function useDeclineRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      http.post<{ requirement: Requirement }>(`/requirements/${id}/decline`, { reason }).then((r) => r.requirement),
    onSuccess: (r) => {
      qc.setQueryData<Requirement>(qk.requirement(r.id), (old) => ({ ...r, tasks: old?.tasks ?? r.tasks }));
      invalidateRequirement(qc, r.id);
    },
  });
}
