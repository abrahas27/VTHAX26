-- lakebase/02_migrations.sql  (spec Section 8.3). Run after 01_app_schema.sql. Idempotent.
SET search_path TO app, public;

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS preferences  JSONB NOT NULL DEFAULT '{}'::jsonb;  -- questionnaire answers (F3)
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS skill_levels JSONB NOT NULL DEFAULT '{}'::jsonb;  -- {"Python":3,...}
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS fit_scores   JSONB NOT NULL DEFAULT '{}'::jsonb;  -- {"CP04":41,...}
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Event Prep Mode (F9) returns talking points as well as pitch + questions.
ALTER TABLE event_prep ADD COLUMN IF NOT EXISTS talking_points TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS readiness_snapshots (
    user_id     UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    path_id     TEXT NOT NULL,
    score       INT  NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, path_id, captured_at)
);

CREATE TABLE IF NOT EXISTS agent_turns (                 -- lightweight trace log for evaluation (10.8, 15.3)
    turn_id     BIGSERIAL PRIMARY KEY,
    user_id     UUID,
    session_id  UUID,
    question    TEXT,
    answer      TEXT,
    tool_calls  JSONB,
    latency_ms  INT,
    model       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
