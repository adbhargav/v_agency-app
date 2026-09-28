// Mirrors docs/API.md (the backend contract). Keys are camelCase, IDs are UUID strings,
// timestamps are ISO-8601 strings and money is a 2-decimal string.

export type Role = 'admin' | 'employee' | 'client';
export type EmploymentType = 'project_based' | 'salary_based';
export type Priority = 'very_urgent' | 'high' | 'medium' | 'low';
export type ApprovalState = 'none' | 'internal_review' | 'client_review' | 'approved' | 'revision_requested';
export type CommentKind = 'comment' | 'submission' | 'revision_request' | 'approval' | 'sent_to_client';
export type WalletStatus = 'pending' | 'settled';
export type SalaryStatus = 'pending' | 'sent' | 'settled';
export type ProjectStatus = 'active' | 'completed' | 'archived';
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NOT_CONFIGURED'
  | 'INTERNAL';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  employmentType: EmploymentType | null;
  clientId: string | null;
  isActive: boolean;
  googleCalendarConnected: boolean;
  /** Service teams the employee belongs to. */
  serviceTypeIds?: string[];
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  projectCount: number;
  /** Services the client buys. */
  serviceTypeIds?: string[];
}

export interface MasterStatus {
  id: string;
  name: string;
  position: number;
  color: string | null;
  isDone: boolean;
}

export interface CustomStatus {
  id: string;
  name: string;
  masterStatusId: string;
  position: number;
}

export interface Project {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ProjectStatus;
  driveFolderId: string | null;
  progress: number;
  taskCount: number;
  doneCount: number;
  createdAt: string;
}

export interface UserRef {
  id: string;
  name: string;
}

/** Task shape for admin/employee. Client-safe tasks omit the optional internal fields. */
export interface Task {
  id: string;
  projectId: string;
  projectName: string;
  clientId?: string;
  clientName?: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: Priority;
  masterStatusId?: string;
  masterStatusName: string;
  customStatusId?: string | null;
  percentDone: number;
  approvalState: ApprovalState;
  assignee?: UserRef | null;
  createdBy?: UserRef;
  timeSpentSeconds?: number;
  activeTimer?: { startedAt: string } | null;
  isOverdue: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  serviceType?: ServiceTypeRef | null;
  requirementId?: string | null;
}

export interface DriveFile {
  id: string;
  projectId: string;
  taskId: string | null;
  folderId: string | null;
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number;
  isFinal: boolean;
  webViewLink: string | null;
  /** Streams the file through the app (no Google account needed). Expires after ~12h. */
  contentUrl?: string | null;
  createdAt: string;
  uploadedBy?: UserRef;
}

export interface Folder {
  id: string;
  projectId: string;
  parentId: string | null;
  driveFolderId: string | null;
  name: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  kind: CommentKind;
  body: string;
  isInternal: boolean;
  author: { id: string | null; name: string; role: Role };
  files: DriveFile[];
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  taskId: string | null;
  projectId: string | null;
  priority: 'normal' | 'high';
  readAt: string | null;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  user: UserRef;
  startedAt: string;
  endedAt: string | null;
  seconds: number;
}

export interface ActiveTimer {
  taskId: string;
  taskTitle: string;
  startedAt: string;
}

export interface FinanceSummary {
  totalEarnings: string;
  pendingSettlement: string;
  totalSettled: string;
}

export interface SalaryRecord {
  id: string;
  employeeId?: string;
  periodMonth: string; // YYYY-MM
  amount: string;
  status: SalaryStatus;
  sentAt?: string | null;
  settledAt?: string | null;
  createdAt?: string;
}

export interface WalletTransaction {
  id: string;
  employeeId?: string;
  taskId: string | null;
  taskTitle?: string | null;
  amount: string;
  description: string | null;
  status: WalletStatus;
  settledAt: string | null;
  createdAt: string;
}

export interface FinanceEmployeeRow {
  user: Pick<User, 'id' | 'name' | 'email' | 'employmentType' | 'isActive'>;
  pending: string;
  settled: string;
  lastSalary: Pick<SalaryRecord, 'periodMonth' | 'amount' | 'status'> | null;
}

export interface EodReport {
  blockers: string;
  tomorrowPriority: string;
  updatedAt: string;
}

export interface AdminDashboard {
  pendingApprovals: Task[];
  awaitingClient: Task[];
  overdueTasks: Task[];
  todaysTasks: Task[];
  counts: {
    pendingApprovals?: number;
    awaitingClient?: number;
    overdue?: number;
    today?: number;
    activeProjects?: number;
    openTasks?: number;
    employees?: number;
    clients?: number;
    [k: string]: number | undefined;
  };
  finance: FinanceSummary;
}

export interface EmployeeDashboard {
  overdueTasks: Task[];
  todaysTasks: Task[];
  revisionRequests: Task[];
  activeTimer: ActiveTimer | null;
  wallet?: { pending: string; settled: string };
}

export interface ClientDashboard {
  projects: Project[];
  actionRequired: Task[];
  activeTasks: Task[];
  approvedAssets: DriveFile[];
}

export interface TaskFilters {
  assigneeIds?: string[];
  clientIds?: string[];
  projectIds?: string[];
  masterStatusIds?: string[];
  priorities?: Priority[];
  approvalStates?: ApprovalState[];
  due?: 'overdue' | 'today' | 'week';
  search?: string;
  includeDone?: boolean;
  serviceTypeIds?: string[];
}

// ---------------------------------------------------------------- services & requirements
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'url' | 'file';

export interface ServiceField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  helpText: string | null;
  position: number;
}

/** What PUT /service-types/:id/fields accepts. */
export interface ServiceFieldInput {
  id?: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  helpText?: string | null;
}

export interface ServiceTypeRef {
  id: string;
  name: string;
  color: string;
}

export interface ServiceType extends ServiceTypeRef {
  description: string | null;
  isActive: boolean;
  position: number;
  fields: ServiceField[];
  memberCount?: number;
  requirementCount?: number;
  createdAt: string;
}

export type RequirementStatus = 'new' | 'accepted' | 'declined';
export type RequirementDisplayStatus = 'new' | 'in_progress' | 'completed' | 'declined';

/** Answer value by field type: string | number | string[] | boolean | fileId[]. */
export type AnswerValue = string | number | boolean | string[] | null;

export interface RequirementAnswer {
  fieldId: string;
  label: string;
  type: FieldType;
  value: AnswerValue;
  files?: DriveFile[];
}

export interface Requirement {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  serviceType: ServiceTypeRef;
  priority: Priority;
  desiredDate: string | null;
  status: RequirementStatus;
  displayStatus: RequirementDisplayStatus;
  declineReason: string | null;
  answers: RequirementAnswer[];
  files: DriveFile[];
  taskCount: number;
  doneCount: number;
  progress: number;
  submittedBy?: UserRef | null;
  createdAt: string;
  reviewedAt: string | null;
  tasks?: Task[];
}

export interface RequirementFilters {
  statuses?: RequirementStatus[];
  serviceTypeIds?: string[];
  clientIds?: string[];
  projectIds?: string[];
}
