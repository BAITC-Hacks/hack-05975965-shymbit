CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  title text NOT NULL, short_description text NOT NULL,
  organization text NOT NULL, contact_person text NOT NULL,
  desired_result text, available_data text, constraints text, deadline text,
  skills jsonb NOT NULL DEFAULT '[]', technologies jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL CHECK (status IN ('draft','needs_clarification','ready','published','archived')),
  clarification_questions jsonb NOT NULL DEFAULT '[]', card jsonb,
  readiness_score integer NOT NULL DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  readiness_explanation text NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, published_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);
CREATE TABLE teams (
  id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL,
  members jsonb NOT NULL, skills jsonb NOT NULL, technologies jsonb NOT NULL,
  projects jsonb NOT NULL, github_urls jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE applications (
  id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES teams(id) ON DELETE RESTRICT,
  team_name text NOT NULL, members jsonb NOT NULL, solution_description text NOT NULL,
  technologies jsonb, contact text NOT NULL, comment text,
  status text NOT NULL CHECK (status IN ('submitted','reviewed','accepted','rejected')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE reviews (
  id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  author_name text NOT NULL, normalized_author text NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5), text text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(team_id, task_id, normalized_author)
);
CREATE TABLE assistant_plans (
  id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  plan jsonb NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX tasks_catalog_idx ON tasks(status, published_at DESC, id);
CREATE INDEX applications_task_idx ON applications(task_id);
CREATE INDEX applications_acceptance_idx ON applications(task_id, team_id, status);
CREATE INDEX reviews_team_idx ON reviews(team_id, created_at DESC);
CREATE INDEX plans_history_idx ON assistant_plans(task_id, team_id, created_at DESC);
