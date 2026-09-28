# V Agency — Operations & Project Management System

A lightweight operations and task management web app for a Virtual Assistant / Creative agency.
It does not include CRM, HR, payroll or chat. Communication happens through task-based comments.

| Layer    | Stack |
|----------|-------|
| Frontend | React + Vite (TypeScript), Tailwind CSS, React Router, TanStack Query (single-page app, works in mobile browsers) |
| Backend  | Node.js, Express.js |
| Database | PostgreSQL |
| Integrations | Google Drive API (Shared Drive, resumable uploads), Google Calendar (two-way sync), SMTP email |

```
backend/    Express REST API, SQL migrations, background jobs, integration tests
frontend/   React + Vite + Tailwind SPA
docs/API.md API contract (endpoints, shapes, role visibility rules)
```

## Quick start

Prerequisites: Node 20+ and PostgreSQL 14+.

```bash
# 1. Database
createdb v_agency

# 2. API  (http://localhost:4000/api)
cd backend
cp .env.example .env         # set DATABASE_URL, JWT_SECRET, ...
npm install
npm run seed:demo            # migrations + master statuses + admin + demo data
npm run dev

# 3. Web app  (http://localhost:5173, proxies /api to :4000)
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

Demo logins (after `seed:demo`):

| Role | Email | Password |
|---|---|---|
| Admin / Manager | admin@vagency.com | admin12345 |
| Employee (project-based editor) | editor@vagency.com | password123 |
| Employee (salary-based designer) | designer@vagency.com | password123 |
| Client | client@skyline.test | password123 |

Use `npm run seed` in production. It only creates the master statuses and the first admin, taken from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Deploying (single service)

In production one Node process serves both the API (`/api`) and the built React app, so there is one URL and no CORS setup.

```bash
npm run install:all
npm run build                # builds frontend/dist
npm run seed                 # once: runs migrations, creates master statuses and the first admin
npm start                    # serves the web app and /api on $PORT
```

**Render + Vercel:** `render.yaml` is a Render Blueprint for the API (Render → New → Blueprint), and `frontend/vercel.json` deploys the web app on Vercel with `/api` proxied to Render. The Blueprint generates `JWT_SECRET` and asks for the rest in the dashboard. In production the first admin is only created when `ADMIN_PASSWORD` (8+ characters) is set.

Migrations also run automatically each time the server starts. The app works with any PostgreSQL host, including Neon: set `DATABASE_URL` to the Neon connection string, keeping `sslmode=require`.

Set these environment variables on the host (see `backend/.env.example`):

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | PostgreSQL / Neon |
| `JWT_SECRET` | Login sessions. Use a long random string. |
| `APP_URL` | Your public URL, used in email links and after Google sign-in |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin account, created by `npm run seed` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Deadline and approval emails |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHARED_DRIVE_ID` | File manager (Google Drive). Add the service account's email to the Shared Drive as a Content manager. |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | Google Calendar sync. The redirect URI is `https://<your-domain>/api/calendar/oauth/callback`. |

## How the key requirements are implemented

- **Strict silos.** Every task and project query goes through one role-scoped query builder (`backend/src/services/tasks.js`).
  - Employees only get tasks assigned to them.
  - Clients get a client-safe task shape: no assignee, no time tracking, no internal comments, no draft files. Agency comment authors are shown to them as "V Agency".
- **Status mapping.** Admins define rigid master statuses: To-Do, In Progress, Review and Done. Employees rename or add their own columns, and each one must map to a master status. The Master Kanban only groups tasks by master status.
- **Approval pipeline.** The employee submits the task, which starts internal review. The manager approves it, and the client gets an in-app notification and an email. The client then approves the task or requests a revision. A revision request needs a comment and can include files, and it goes to the assignee.
- **Time tracking.** Tasks only have Start, Pause and Resume, and there is no endpoint for entering time by hand. The database allows one running timer per user.
- **Deadline alerts.** A job runs every minute. When a task's deadline passes, it sends a high-priority notification and an email to the assignee and all managers, once per deadline.
- **Google Drive.** When a project is created, its folder is created in the Shared Drive. The browser uploads files directly to Google using a resumable session, so the server never stores the file contents. Subfolders are mirrored in PostgreSQL so listings are fast.
- **Google Calendar.** Employees connect their calendar with OAuth. Assigned tasks with deadlines create, move or remove calendar events. A job every 5 minutes copies deadline changes made in Google Calendar back to the tasks.
- **Finance.** Admins choose whether each employee is project-based or salary-based. Project-based employees have a wallet the admin credits and marks as settled. Salary-based employees have a monthly salary ledger with Sent and Settled states. The admin dashboard shows total earnings, pending settlement and total settled. Clients cannot see any of this.

## Tests

```bash
createdb v_agency_test
cd backend && npm test      # integration tests against a real PostgreSQL database
```
