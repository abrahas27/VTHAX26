-- =====================================================================
-- HokiePath: Lakebase (managed Postgres) schema for the live web app
-- =====================================================================
-- Split of responsibilities:
--   * Unity Catalog Delta tables  = catalog data + analytics + AI (events, companies, gold tables,
--                                   Vector Search, Genie). Built by 01_setup_hokiepath_lakehouse.py
--   * Lakebase Postgres (this file) = fast, per-user app state the UI reads/writes on every click
--                                   (profiles, chat, the agent-driven dashboard, saved events, roadmap)
--
-- Run in the Lakebase SQL editor (or psql) against your Lakebase database.
-- To read catalog data from here with low latency, create read-only *synced tables* from
-- Unity Catalog into this database (Catalog Explorer -> table -> Create -> Synced table), e.g.
-- gold_events_enriched, companies, career_paths. They land in their own schema and stay in sync.

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

-- ---------------------------------------------------------------- users & profiles
CREATE TABLE IF NOT EXISTS app_users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,              -- e.g. pid@vt.edu
    display_name  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id           UUID PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
    major_code        TEXT,                          -- matches Unity Catalog majors.major_code
    class_year        TEXT CHECK (class_year IN ('Freshman','Sophomore','Junior','Senior','Graduate')),
    resume_file_name  TEXT,
    resume_text       TEXT,                          -- extracted text sent to ai_query / the agent
    parsed_skills     TEXT[] NOT NULL DEFAULT '{}',  -- normalized to skills.skill_name
    target_path_id    TEXT,                          -- matches career_paths.path_id
    target_path_name  TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- agent conversation
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    message_id  BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
    content     TEXT NOT NULL,
    tool_calls  JSONB,                               -- which UC functions the agent called + args
    trace_id    TEXT,                                -- MLflow trace id, for debugging in the demo
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at);

-- ---------------------------------------------------------------- the "morphing" dashboard
-- The agent writes here after each answer; the UI polls/subscribes and re-renders.
-- layout example:
-- {"goal": "Investment Banking",
--  "widgets": [
--    {"type": "skill_gap",       "title": "Your gaps for IB",        "data_ref": "get_skill_gap"},
--    {"type": "event_list",      "title": "IB events this month",    "event_ids": ["EV0037","EV0036"]},
--    {"type": "company_radar",   "title": "Banks coming to VT",      "company_ids": ["CO011","CO012"]},
--    {"type": "roadmap",         "title": "Gap-to-Goal plan"}]}
CREATE TABLE IF NOT EXISTS dashboard_state (
    user_id      UUID PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
    active_goal  TEXT,
    layout       JSONB NOT NULL DEFAULT '{"widgets": []}'::jsonb,
    version      INT NOT NULL DEFAULT 1,             -- bump on every agent update; UI animates changes
    updated_by   TEXT NOT NULL DEFAULT 'agent' CHECK (updated_by IN ('agent','user')),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- saved items & roadmap
CREATE TABLE IF NOT EXISTS saved_items (
    user_id     UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    item_type   TEXT NOT NULL CHECK (item_type IN ('event','club','opportunity','company','course')),
    item_id     TEXT NOT NULL,                       -- id from the Unity Catalog table
    status      TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','registered','attended','applied','dismissed')),
    recommended_by_agent BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS roadmap_items (
    roadmap_item_id BIGSERIAL PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    goal         TEXT NOT NULL,
    item_type    TEXT NOT NULL CHECK (item_type IN ('event','club','course','opportunity','action')),
    item_id      TEXT,
    name         TEXT NOT NULL,
    when_text    TEXT,
    closes_gaps  TEXT[] NOT NULL DEFAULT '{}',
    sort_order   INT NOT NULL DEFAULT 0,
    completed    BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roadmap_user_goal ON roadmap_items (user_id, goal, sort_order);

-- "Event Prep Mode": tailored pitch + questions generated before an info session
CREATE TABLE IF NOT EXISTS event_prep (
    user_id     UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    event_id    TEXT NOT NULL,
    pitch       TEXT NOT NULL,
    questions   TEXT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_id)
);

-- ---------------------------------------------------------------- demo seed: CS student pivoting to IB
INSERT INTO app_users (user_id, email, display_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'jhokie@vt.edu', 'Jane Hokie')
ON CONFLICT (email) DO NOTHING;

INSERT INTO student_profiles (user_id, major_code, class_year, resume_file_name, parsed_skills, target_path_id, target_path_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'CS', 'Sophomore', 'jane_hokie_resume.pdf',
        ARRAY['Python','Java','Data Structures & Algorithms','Git','SQL','Teamwork'],
        'CP01', 'Software Engineering')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO dashboard_state (user_id, active_goal, layout)
VALUES ('11111111-1111-1111-1111-111111111111', 'Software Engineering',
        '{"goal":"Software Engineering","widgets":[
            {"type":"event_list","title":"Tech events this month","source":"find_events","args":{"target_path":"software","major":"CS","days_ahead":30}},
            {"type":"company_radar","title":"Tech recruiters coming to VT","source":"companies_visiting","args":{"target_path":"software","days_ahead":45}},
            {"type":"opportunity_list","title":"Open SWE internships","source":"find_opportunities","args":{"target_path":"software","opp_type":"internship"}}]}'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

-- After the student asks "How can I pivot into investment banking?", the agent would run:
-- UPDATE dashboard_state
--    SET active_goal = 'Investment Banking',
--        layout = '{"goal":"Investment Banking","widgets":[
--           {"type":"skill_gap","title":"Your gaps for IB","source":"get_skill_gap","args":{"target_path":"investment banking"}},
--           {"type":"roadmap","title":"Gap-to-Goal plan","source":"build_gap_roadmap","args":{"target_path":"investment banking","days_ahead":90}},
--           {"type":"company_radar","title":"Banks coming to VT","source":"companies_visiting","args":{"target_path":"investment banking","days_ahead":60}},
--           {"type":"event_list","title":"IB events for CS majors","source":"find_events","args":{"target_path":"investment banking","major":"","days_ahead":45}}]}'::jsonb,
--        version = version + 1, updated_by = 'agent', updated_at = now()
--  WHERE user_id = '11111111-1111-1111-1111-111111111111';
