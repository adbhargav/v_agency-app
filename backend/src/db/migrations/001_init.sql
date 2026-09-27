CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'employee', 'client');
CREATE TYPE employment_type AS ENUM ('project_based', 'salary_based');
CREATE TYPE task_priority AS ENUM ('very_urgent', 'high', 'medium', 'low');
CREATE TYPE approval_state AS ENUM ('none', 'internal_review', 'client_review', 'approved', 'revision_requested');
CREATE TYPE comment_kind AS ENUM ('comment', 'submission', 'revision_request', 'approval', 'sent_to_client');
CREATE TYPE wallet_status AS ENUM ('pending', 'settled');
CREATE TYPE salary_status AS ENUM ('pending', 'sent', 'settled');
CREATE TYPE project_status AS ENUM ('active', 'completed', 'archived');

-- Client organisations. Client users belong to one.
CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  company     TEXT,
  email       TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  email                  TEXT NOT NULL,
  password_hash          TEXT NOT NULL,
  role                   user_role NOT NULL,
  employment_type        employment_type,
  client_id              UUID REFERENCES clients(id) ON DELETE RESTRICT,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  google_refresh_token   TEXT,
  google_calendar_id     TEXT,
  google_sync_token      TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_users_have_client CHECK (role <> 'client' OR client_id IS NOT NULL),
  CONSTRAINT only_employees_have_employment_type CHECK (role = 'employee' OR employment_type IS NULL)
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

-- Rigid agency-wide statuses used by the Master Kanban.
CREATE TABLE master_statuses (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  position  INT NOT NULL,
  color     TEXT NOT NULL DEFAULT '#6366f1',
  is_done   BOOLEAN NOT NULL DEFAULT false
);

-- Employee-defined column names, each mapped to exactly one master status.
CREATE TABLE custom_statuses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  master_status_id  UUID NOT NULL REFERENCES master_statuses(id) ON DELETE RESTRICT,
  position          INT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX custom_statuses_user_idx ON custom_statuses (user_id, position);

CREATE TABLE projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  description      TEXT,
  start_date       DATE,
  end_date         DATE,
  status           project_status NOT NULL DEFAULT 'active',
  drive_folder_id  TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX projects_client_idx ON projects (client_id);

CREATE TABLE tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  description             TEXT,
  due_date                TIMESTAMPTZ,
  priority                task_priority NOT NULL DEFAULT 'medium',
  master_status_id        UUID NOT NULL REFERENCES master_statuses(id) ON DELETE RESTRICT,
  custom_status_id        UUID REFERENCES custom_statuses(id) ON DELETE SET NULL,
  percent_done            INT NOT NULL DEFAULT 0 CHECK (percent_done BETWEEN 0 AND 100),
  approval_state          approval_state NOT NULL DEFAULT 'none',
  assignee_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at            TIMESTAMPTZ,
  deadline_alert_sent_at  TIMESTAMPTZ,
  calendar_event_id       TEXT,
  calendar_owner_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_idx ON tasks (project_id);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id);
CREATE INDEX tasks_status_idx ON tasks (master_status_id);
CREATE INDEX tasks_due_idx ON tasks (due_date) WHERE completed_at IS NULL;

-- Google Drive folders mirrored locally for fast listing and access control.
CREATE TABLE folders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id        UUID REFERENCES folders(id) ON DELETE CASCADE,
  drive_folder_id  TEXT NOT NULL,
  name             TEXT NOT NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX folders_project_parent_idx ON folders (project_id, parent_id);

CREATE TABLE task_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  kind         comment_kind NOT NULL DEFAULT 'comment',
  body         TEXT NOT NULL,
  is_internal  BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);

-- Metadata only: the bytes live in the Google Shared Drive.
CREATE TABLE files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id       UUID REFERENCES folders(id) ON DELETE SET NULL,
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  comment_id      UUID REFERENCES task_comments(id) ON DELETE SET NULL,
  drive_file_id   TEXT NOT NULL,
  name            TEXT NOT NULL,
  mime_type       TEXT,
  size            BIGINT,
  web_view_link   TEXT,
  is_final        BOOLEAN NOT NULL DEFAULT false,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX files_project_folder_idx ON files (project_id, folder_id);
CREATE INDEX files_task_idx ON files (task_id);

CREATE TABLE time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX time_entries_task_idx ON time_entries (task_id);
-- A user can only have one running timer at a time.
CREATE UNIQUE INDEX time_entries_one_running_idx ON time_entries (user_id) WHERE ended_at IS NULL;

CREATE TABLE eod_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date        DATE NOT NULL,
  blockers           TEXT NOT NULL DEFAULT '',
  tomorrow_priority  TEXT NOT NULL DEFAULT '',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  priority    TEXT NOT NULL DEFAULT 'normal',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE wallet_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      UUID REFERENCES tasks(id) ON DELETE SET NULL,
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description  TEXT NOT NULL,
  status       wallet_status NOT NULL DEFAULT 'pending',
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  settled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_transactions_employee_idx ON wallet_transactions (employee_id, created_at DESC);

CREATE TABLE salary_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month  DATE NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status        salary_status NOT NULL DEFAULT 'pending',
  sent_at       TIMESTAMPTZ,
  settled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_month)
);

-- Keep completed_at / updated_at consistent no matter which code path moves a task.
CREATE FUNCTION tasks_track_completion() RETURNS trigger AS $$
DECLARE
  done BOOLEAN;
BEGIN
  SELECT is_done INTO done FROM master_statuses WHERE id = NEW.master_status_id;
  IF done THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_track_completion_trg
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_track_completion();
