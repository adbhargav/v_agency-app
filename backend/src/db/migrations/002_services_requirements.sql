-- Service types (e.g. Development, Marketing, Video Editing) with admin-designed requirement forms.
CREATE TYPE field_type AS ENUM ('text', 'textarea', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url', 'file');
CREATE TYPE requirement_status AS ENUM ('new', 'accepted', 'declined');

CREATE TABLE service_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  color        TEXT NOT NULL DEFAULT '#df2f25',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  position     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX service_types_name_idx ON service_types (lower(name));

-- Fields are never hard-deleted once used; removing one from the form just deactivates it.
CREATE TABLE service_fields (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id  UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,
  type             field_type NOT NULL,
  required         BOOLEAN NOT NULL DEFAULT false,
  options          JSONB NOT NULL DEFAULT '[]',
  help_text        TEXT,
  position         INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX service_fields_type_idx ON service_fields (service_type_id, position);

-- Which teams an employee works in, and which services a client buys.
CREATE TABLE user_service_types (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type_id  UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, service_type_id)
);
CREATE TABLE client_service_types (
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_type_id  UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, service_type_id)
);

-- A client's brief for a piece of work. Answers are keyed by field id; the field definitions at
-- submission time are snapshotted so later form edits never change what the client submitted.
CREATE TABLE requirements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_type_id  UUID NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
  title            TEXT NOT NULL,
  answers          JSONB NOT NULL DEFAULT '{}',
  field_snapshot   JSONB NOT NULL DEFAULT '[]',
  priority         task_priority NOT NULL DEFAULT 'medium',
  desired_date     DATE,
  status           requirement_status NOT NULL DEFAULT 'new',
  decline_reason   TEXT,
  submitted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX requirements_client_idx ON requirements (client_id, created_at DESC);
CREATE INDEX requirements_status_idx ON requirements (status, created_at DESC);

ALTER TABLE tasks ADD COLUMN service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL;
CREATE INDEX tasks_requirement_idx ON tasks (requirement_id);
CREATE INDEX tasks_service_type_idx ON tasks (service_type_id);

ALTER TABLE files ADD COLUMN requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN requirement_field_id UUID;
CREATE INDEX files_requirement_idx ON files (requirement_id);
