CREATE TABLE tasks (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 400),
  enabled boolean NOT NULL DEFAULT true,
  weekly_frequency smallint NOT NULL CHECK (weekly_frequency BETWEEN 1 AND 7),
  assigned_days smallint[] NOT NULL DEFAULT '{}'::smallint[],
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (cardinality(assigned_days) = 0 OR weekly_frequency <= cardinality(assigned_days)),
  CHECK (assigned_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

CREATE TABLE completions (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date_key date NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE INDEX completions_task_date_idx ON completions (task_id, date_key);
CREATE INDEX completions_date_idx ON completions (date_key);
