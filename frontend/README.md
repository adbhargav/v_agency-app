# V Agency — Web Frontend

React + Vite (TypeScript) single-page app for the V Agency Operations & Project Management System.
Tailwind CSS v4, React Router, TanStack Query (caching + optimistic updates), dnd-kit (touch-friendly Kanban), lucide-react icons.

## Getting started

```bash
cd frontend
npm install
cp .env.example .env      # optional — defaults work for local dev
npm run dev               # http://localhost:5173
```

The dev server proxies `/api` → `http://localhost:4000`, so start the backend (`backend/`) first.

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR and the `/api` proxy  |
| `npm run build`     | Type-check (`tsc -b`) and build to `dist/`     |
| `npm run typecheck` | Type-check only                                |
| `npm run preview`   | Serve the production build locally             |

## Configuration

| Variable       | Default | Description                                                            |
| -------------- | ------- | ---------------------------------------------------------------------- |
| `VITE_API_URL` | `/api`  | Base URL of the backend API. Use a full URL if the API is on another origin. |

In production, serve `dist/` with an SPA fallback (all unknown paths → `index.html`) and route `/api` to the backend
(or set `VITE_API_URL` at build time). The Google Calendar OAuth flow returns to `/settings?calendar=connected|error`.

## Structure

```
src/
  api/          client.ts (fetch wrapper, JWT, 401 → logout), hooks.ts (typed React Query hooks), upload.ts (Drive resumable upload)
  components/   Layout, KanbanBoard, TaskCard/TaskList, TaskDetail drawer, TimerControl, FileManager, PriorityBadge, UI primitives…
  context/      AuthContext (JWT in localStorage), ToastContext
  lib/          formatting, priority meta, hooks (useTaskDrawer, useNow)
  pages/
    admin/      Dashboard, Master Tasks (list/kanban + URL filters), Team, Clients, Finance, EOD reports, Master statuses
    employee/   Universal board (custom columns), EOD update, Wallet
    client/     Overview, Action Required, Active Tasks, Approved Assets
    shared/     Login, Projects (list/detail/files), Notifications, Settings, 404
  types.ts      Mirrors docs/API.md
```

Role areas are lazy-loaded (`React.lazy`) so each user only downloads the code they can use.
The open task is kept in the `?task=<id>` query param, so task drawers are linkable from anywhere (notifications, dashboards, boards).
