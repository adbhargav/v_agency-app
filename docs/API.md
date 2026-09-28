# V Agency API Contract

Base URL: `/api`. All request/response bodies are JSON, keys in **camelCase**.
Auth: `Authorization: Bearer <jwt>` on every route except `POST /auth/login`.

Errors: `{ "error": { "message": "Human readable", "code": "VALIDATION|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|CONFLICT|NOT_CONFIGURED|INTERNAL", "details"?: any } }`
with matching HTTP status (400/401/403/404/409/503/500).

IDs are UUID strings. Timestamps are ISO-8601 strings. Money is a string with 2 decimals (e.g. `"1500.00"`).

## Enums

| Name | Values |
|---|---|
| `role` | `admin`, `employee`, `client` |
| `employmentType` | `project_based`, `salary_based` (employees only, else `null`) |
| `priority` | `very_urgent`, `high`, `medium`, `low` |
| `approvalState` | `none`, `internal_review`, `client_review`, `approved`, `revision_requested` |
| `commentKind` | `comment`, `submission`, `revision_request`, `approval`, `sent_to_client` |
| `walletStatus` | `pending`, `settled` |
| `salaryStatus` | `pending`, `sent`, `settled` |

## Role visibility rules (enforced server-side)

- **admin**: everything.
- **employee**: only tasks where `assigneeId = me`; only projects in which they have ≥1 assigned task (project list returns name/client only, no timeline of other tasks). Never sees other users' tasks, wallets or time.
- **client**: only projects of their client org. Task objects are **client-safe**: no `assignee`, no `timeSpentSeconds`, no `activeTimer`, no internal comments, no draft files. Comment authors who are not the client are shown as `"V Agency"`. Never sees finance, time tracking, EOD.

## Shared object shapes

```ts
User        { id, name, email, role, employmentType, clientId, isActive, googleCalendarConnected, createdAt }
Client      { id, name, company, email, phone, createdAt, projectCount }
MasterStatus{ id, name, position, color, isDone }
CustomStatus{ id, name, masterStatusId, position }        // belongs to current employee
Project     { id, clientId, clientName, name, description, startDate, endDate, status: 'active'|'completed'|'archived',
              driveFolderId, progress /* 0-100 int */, taskCount, doneCount, createdAt }
Task (admin/employee) {
  id, projectId, projectName, clientId, clientName, title, description, dueDate, priority,
  masterStatusId, masterStatusName, customStatusId, percentDone, approvalState,
  assignee: { id, name } | null, createdBy: { id, name },
  timeSpentSeconds /* excludes the requester's own running segment */, activeTimer: { startedAt } | null,   // requester's running timer only
  isOverdue, completedAt, createdAt, updatedAt }
Task (client) { id, projectId, projectName, title, description, dueDate, priority, masterStatusName, percentDone,
  approvalState, isOverdue, completedAt, createdAt, updatedAt }
Comment     { id, taskId, kind, body, isInternal, author: { id|null, name, role }, files: File[], createdAt }
File        { id, projectId, taskId, folderId, driveFileId, name, mimeType, size, isFinal, webViewLink, createdAt, uploadedBy?: {id,name} }
Folder      { id, projectId, parentId, driveFolderId, name, createdAt }
Notification{ id, type, title, body, taskId, projectId, priority: 'normal'|'high', readAt, createdAt }
```

## Auth
- `POST /auth/login` `{ email, password }` → `{ token, user }`
- `GET /auth/me` → `{ user }`
- `POST /auth/change-password` `{ currentPassword, newPassword }` → `{ ok: true }`

## Users (admin)
- `GET /users?role=employee|client|admin` → `{ users }`
- `POST /users` `{ name, email, password, role, employmentType?, clientId? }` → `{ user }` (client users require `clientId`; employees require `employmentType`)
- `PATCH /users/:id` `{ name?, employmentType?, isActive?, clientId?, password? }` → `{ user }`

## Clients (admin)
- `GET /clients` → `{ clients }`
- `POST /clients` `{ name, company?, email?, phone? }` → `{ client }`
- `PATCH /clients/:id` → `{ client }`

## Statuses
- `GET /statuses/master` → `{ statuses: MasterStatus[] }` (any role)
- `POST /statuses/master` (admin) `{ name, color?, isDone? }`; `PATCH /statuses/master/:id`; `DELETE /statuses/master/:id` (409 if in use)
- `GET /statuses/custom` (employee) → `{ statuses: CustomStatus[] }` — if the employee has none yet, the server creates defaults mirroring the master statuses.
- `POST /statuses/custom` `{ name, masterStatusId }` → `{ status }` — **mapping to a master status is mandatory**
- `PATCH /statuses/custom/:id` `{ name?, masterStatusId?, position? }` → `{ status }`
- `DELETE /statuses/custom/:id` → `{ ok: true }` (tasks in it fall back to `customStatusId: null`)

## Projects
- `GET /projects` → `{ projects }` (role scoped)
- `GET /projects/:id` → `{ project }`
- `POST /projects` (admin) `{ clientId, name, description?, startDate?, endDate? }` → `{ project }` (creates Drive root folder if Drive configured)
- `PATCH /projects/:id` (admin) → `{ project }`

## Tasks
- `GET /tasks` query (all optional, comma-separated lists allowed):
  `assigneeIds, clientIds, projectIds, masterStatusIds, priorities, approvalStates, due=overdue|today|week, search, includeDone=true|false (default true)`
  Admin: filters across agency (Master Kanban). Employee: always limited to own tasks. Client: own projects, client-safe shape.
  → `{ tasks }`
- `GET /tasks/:id` → `{ task }`
- `POST /tasks` (admin, employee) `{ projectId, title, description?, dueDate?, priority, assigneeId?, masterStatusId?, customStatusId? }`
  Employees can only create in projects they already work on and the task is auto-assigned to themselves.
- `PATCH /tasks/:id` `{ title?, description?, dueDate?, priority?, assigneeId? (admin only), percentDone?, masterStatusId?, customStatusId? }`
  Setting `customStatusId` (employee) sets `masterStatusId` to its mapped master status.
- `DELETE /tasks/:id` (admin)

### Approval pipeline
- `POST /tasks/:id/submit` (assignee) `{ comment? }` → task `approvalState: internal_review`, notifies admins
- `POST /tasks/:id/approve` (admin when `internal_review` → `client_review`, notifies client with app notification + email; client when `client_review` → `approved`, task moved to done master status, percentDone 100) `{ comment? }`
- `POST /tasks/:id/request-revision` (admin or client) `{ comment /* required */, fileIds? }` → `approvalState: revision_requested`, notifies assignee

### Comments
- `GET /tasks/:id/comments` → `{ comments }` (client gets only non-internal)
- `POST /tasks/:id/comments` `{ body, fileIds? }` → `{ comment }` (admin/employee comments are internal; client comments are not)

### Time tracking (admin/employee only; never exposed to clients)
- `POST /tasks/:id/timer/start` — starts (or resumes) timer; 409 if user has another running timer (response includes `details.taskId`)
- `POST /tasks/:id/timer/pause`
- `GET /timer/active` → `{ timer: { taskId, taskTitle, startedAt } | null }`
- `GET /tasks/:id/time-entries` → `{ entries: [{ id, user: {id,name}, startedAt, endedAt, seconds }], totalSeconds }`
No manual time entry endpoint exists by design.

## Dashboard
- `GET /dashboard/admin` → `{ pendingApprovals: Task[] /* internal_review */, awaitingClient: Task[], overdueTasks: Task[], todaysTasks: Task[], counts: {...}, finance: FinanceSummary }`
- `GET /dashboard/employee` → `{ overdueTasks, todaysTasks, revisionRequests, activeTimer, wallet?: { pending, settled } }`
- `GET /dashboard/client` → `{ projects: Project[], actionRequired: Task[] /* client_review */, activeTasks: Task[], approvedAssets: File[] }`

## EOD (employee)
- `GET /eod?date=YYYY-MM-DD` → `{ date, completedToday: Task[], report: { blockers, tomorrowPriority, updatedAt } | null }`
- `PUT /eod` `{ date?, blockers, tomorrowPriority }` → `{ report }`
- `GET /eod/team?date=` (admin) → `{ reports: [{ user, completedToday: Task[], report }] }`

## Notifications
- `GET /notifications?unread=true` → `{ notifications, unreadCount }`
- `POST /notifications/:id/read`, `POST /notifications/read-all`

## Files (Google Drive; server stores nothing)
- `GET /projects/:id/folders?parentId=` → `{ folders, files, breadcrumb: [{ id, name }] }` (client: final files + their own uploads only)
- `POST /projects/:id/folders` `{ name, parentId? }` → `{ folder }` (admin, assigned employee, client)
- `POST /files/upload-session` `{ projectId, folderId?, taskId?, name, mimeType, size }` → `{ uploadUrl, uploadToken }` — the app PUTs bytes directly to `uploadUrl` (Google resumable upload), then:
- `POST /files/complete` `{ uploadToken, driveFileId }` → `{ file }`
- `PATCH /files/:id` (admin) `{ isFinal }` — marks a deliverable as an Approved Asset visible to the client
- `GET /files/approved` (client) → `{ files }` Approved Assets library
Returns 503 `NOT_CONFIGURED` if Drive credentials are absent.

## Google Calendar (employee)
- `GET /calendar/connect-url` → `{ url }` (OAuth consent)
- `GET /calendar/oauth/callback?code&state` (browser redirect; lands on `APP_URL/settings?calendar=connected|error`)
- `POST /calendar/disconnect`
Assigned tasks with a due date create/update events automatically; a background sync pulls event time changes back into task due dates.

## Finance (admin; employee may read own wallet)
- `GET /finance/summary` → `{ totalEarnings, pendingSettlement, totalSettled }`
- `GET /finance/employees` → `{ employees: [{ user, pending, settled, lastSalary }] }`
- `GET /finance/wallet/:userId` (admin, or self) → `{ balance: { pending, settled }, transactions }`
- `POST /finance/wallet/:userId/credit` `{ amount, description, taskId? }` (project-based employees only)
- `POST /finance/wallet/transactions/:id/settle`
- `GET /finance/salary/:userId` → `{ records }`; `POST /finance/salary/:userId` `{ periodMonth: 'YYYY-MM', amount }`; `POST /finance/salary/records/:id/status` `{ status: 'sent'|'settled' }`

## Services, custom fields & client requirements

```ts
ServiceField { id, label, type: 'text'|'textarea'|'number'|'date'|'select'|'multiselect'|'checkbox'|'url'|'file',
               required, options: string[] /* select & multiselect */, helpText, position }
ServiceType  { id, name, description, color, isActive, position, fields: ServiceField[], memberCount?, requirementCount?, createdAt }
Requirement  { id, title, clientId, clientName, projectId, projectName, serviceType: { id, name, color },
               priority, desiredDate /* YYYY-MM-DD */, status: 'new'|'accepted'|'declined',
               displayStatus: 'new'|'in_progress'|'completed'|'declined', declineReason,
               answers: [{ fieldId, label, type, value, files?: File[] /* file fields */ }], files: File[],
               taskCount, doneCount, progress, submittedBy?: { id, name } /* not for clients */, createdAt, reviewedAt,
               tasks?: Task[] /* detail only, role-scoped */ }
```

`User` and `Client` also have `serviceTypeIds: string[]`. `Task` also has `serviceType: {id,name,color} | null` and `requirementId`.
`File` also has `contentUrl`. This link opens or streams the file through the app, so no Google account is needed. It works in `<img>`/`<video>` src and expires after 12h. Append `&download=1` to download the file.

- `GET /service-types` → `{ serviceTypes }`. A client gets only the services linked to their account, or every active service if none are linked. Admins can pass `?includeInactive=true`.
- `GET /service-types/:id` → `{ serviceType }`
- `POST /service-types` (admin) `{ name, description?, color?, fields?: FieldInput[] }` → `{ serviceType }`
- `PATCH /service-types/:id` (admin) `{ name?, description?, color?, isActive?, position? }`
- `PUT /service-types/:id/fields` (admin) `{ fields: FieldInput[] }` replaces the whole form in the given order. Pass a field's `id` to keep it; fields you leave out are deactivated. `FieldInput = { id?, label, type, required?, options?, helpText? }`
- `DELETE /service-types/:id` (admin). Returns 409 if the service already has requirements; deactivate it instead.
- `GET /users?role=employee&serviceTypeId=` filters employees by team. `POST/PATCH /users` accept `serviceTypeIds`.
- `POST/PATCH /clients` accept `serviceTypeIds`, the services the client buys.
- `GET /tasks?serviceTypeIds=` filters by team. `POST/PATCH /tasks` accept `serviceTypeId` (admin).
- `GET /requirements?statuses=&serviceTypeIds=&clientIds=&projectIds=` → `{ requirements }`
  - admin: all
  - client: their own
  - employee: only requirements with a task assigned to them
- `GET /requirements/:id` → `{ requirement }` (includes `tasks`)
- `POST /requirements` (client; admin may pass `clientId`) `{ projectId, serviceTypeId, title, priority?, desiredDate?, answers: { [fieldId]: value } }`
  - Value types:
    - text/textarea/url/date/select: string
    - number: number
    - multiselect: string[]
    - checkbox: boolean
    - file: fileId[]
  - To fill a file field, upload each file first with `POST /files/upload-session { projectId, name, mimeType, size, purpose: 'requirement' }`, PUT the bytes to the returned upload URL, then call `POST /files/complete`. Put the resulting file ids in the answer.
- `POST /requirements/:id/tasks` (admin) `{ title, description?, assigneeId?, dueDate?, priority? }` → `{ task }`. Creates a task linked to the requirement and its service, and marks the requirement accepted. Call it more than once to split the work across teams.
- `POST /requirements/:id/decline` (admin) `{ reason }` sends the reason back to the client.
