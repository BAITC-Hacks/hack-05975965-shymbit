CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  role text NOT NULL CHECK (role IN ('business', 'student')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
ALTER TABLE tasks ADD COLUMN owner_id uuid REFERENCES users(id);
ALTER TABLE teams ADD COLUMN owner_id uuid REFERENCES users(id);
ALTER TABLE applications ADD COLUMN owner_id uuid REFERENCES users(id);
ALTER TABLE reviews ADD COLUMN author_id uuid REFERENCES users(id);
CREATE INDEX tasks_owner_idx ON tasks(owner_id);
CREATE INDEX teams_owner_idx ON teams(owner_id);
CREATE INDEX applications_owner_idx ON applications(owner_id);
CREATE UNIQUE INDEX reviews_author_idx ON reviews(team_id, task_id, author_id) WHERE author_id IS NOT NULL;
CREATE TABLE ownership_migrations (
  collection text NOT NULL CHECK (collection IN ('tasks','teams','applications')),
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL,
  PRIMARY KEY(collection,id)
);
