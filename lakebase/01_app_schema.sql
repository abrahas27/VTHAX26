-- =====================================================================
-- HireUp - Lakebase Application Database
-- =====================================================================
-- Purpose:
-- Stores live, user-specific state for the HireUp web application.
--
-- Lakebase:
--   - User profiles
--   - Resume data / extracted skills
--   - Agent conversations
--   - Dynamic dashboard state
--   - Saved resources
--   - Personalized roadmaps
--   - Event preparation
--
-- Unity Catalog:
--   - Skills / career paths
--   - VT events
--   - VT clubs
--   - VT courses
--   - Companies
--   - Job opportunities
-- =====================================================================


-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS app;

SET search_path TO app, public;


-- =====================================================================
-- USERS
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);


-- =====================================================================
-- STUDENT PROFILE
-- =====================================================================

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id UUID PRIMARY KEY
        REFERENCES app_users(user_id)
        ON DELETE CASCADE,

    major_code TEXT,

    class_year TEXT CHECK (
        class_year IN (
            'Freshman',
            'Sophomore',
            'Junior',
            'Senior',
            'Graduate'
        )
    ),

    -- Resume
    resume_file_name TEXT,
    resume_text TEXT,

    -- AI-extracted / normalized skills
    parsed_skills TEXT[] NOT NULL DEFAULT '{}',

    -- Evidence explaining where skills came from
    skill_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Current career target
    target_path_id TEXT,
    target_path_name TEXT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =====================================================================
-- AI CHAT
-- =====================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES app_users(user_id)
        ON DELETE CASCADE,

    title TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS chat_messages (
    message_id BIGSERIAL PRIMARY KEY,

    session_id UUID NOT NULL
        REFERENCES chat_sessions(session_id)
        ON DELETE CASCADE,

    role TEXT NOT NULL CHECK (
        role IN ('user', 'assistant', 'tool')
    ),

    content TEXT NOT NULL,

    -- Agent tool calls
    tool_calls JSONB,

    -- MLflow tracing
    trace_id TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE INDEX IF NOT EXISTS idx_chat_messages_session
ON chat_messages (session_id, created_at);


-- =====================================================================
-- DYNAMIC DASHBOARD
-- =====================================================================
-- The agent updates this after a career pivot.
--
-- Frontend reads this object and renders widgets dynamically.
--
-- Example:
--
-- {
--   "goal": "Investment Banking",
--   "widgets": [
--      {"type": "skill_gap"},
--      {"type": "roadmap"},
--      {"type": "company_radar"},
--      {"type": "event_list"}
--   ]
-- }
-- =====================================================================

CREATE TABLE IF NOT EXISTS dashboard_state (
    user_id UUID PRIMARY KEY
        REFERENCES app_users(user_id)
        ON DELETE CASCADE,

    active_goal TEXT,

    layout JSONB NOT NULL
        DEFAULT '{"widgets":[]}'::jsonb,

    -- Increment whenever dashboard changes.
    -- Frontend can detect this and rerender.
    version INT NOT NULL DEFAULT 1,

    updated_by TEXT NOT NULL DEFAULT 'agent'
        CHECK (updated_by IN ('agent', 'user')),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =====================================================================
-- SAVED RESOURCES
-- =====================================================================

CREATE TABLE IF NOT EXISTS saved_items (
    user_id UUID NOT NULL
        REFERENCES app_users(user_id)
        ON DELETE CASCADE,

    item_type TEXT NOT NULL CHECK (
        item_type IN (
            'event',
            'club',
            'opportunity',
            'company',
            'course'
        )
    ),

    -- ID references the corresponding Unity Catalog resource
    item_id TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'saved'
        CHECK (
            status IN (
                'saved',
                'registered',
                'attended',
                'applied',
                'dismissed'
            )
        ),

    recommended_by_agent BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (
        user_id,
        item_type,
        item_id
    )
);


-- =====================================================================
-- GAP-TO-GOAL ROADMAP
-- =====================================================================

CREATE TABLE IF NOT EXISTS roadmap_items (
    roadmap_item_id BIGSERIAL PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES app_users(user_id)
        ON DELETE CASCADE,

    goal TEXT NOT NULL,

    item_type TEXT NOT NULL CHECK (
        item_type IN (
            'event',
            'club',
            'course',
            'opportunity',
            'action'
        )
    ),

    -- Optional reference to Unity Catalog
    item_id TEXT,

    name TEXT NOT NULL,

    -- Human-readable timing
    -- Example: "October 4"
    when_text TEXT,

    -- Skills this roadmap item helps address
    closes_gaps TEXT[] NOT NULL DEFAULT '{}',

    sort_order INT NOT NULL DEFAULT 0,

    completed BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE INDEX IF NOT EXISTS idx_roadmap_user_goal
ON roadmap_items (
    user_id,
    goal,
    sort_order
);


-- =====================================================================
-- EVENT PREP MODE
-- =====================================================================

CREATE TABLE IF NOT EXISTS event_prep (
    user_id UUID NOT NULL
        REFERENCES app_users(user_id)
        ON DELETE CASCADE,

    event_id TEXT NOT NULL,

    -- AI-generated 30-second introduction
    pitch TEXT NOT NULL,

    -- AI-generated questions for recruiter/event
    questions TEXT[] NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (
        user_id,
        event_id
    )
);


-- =====================================================================
-- DEMO USER
-- =====================================================================

INSERT INTO app_users (
    user_id,
    email,
    display_name
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'jhokie@vt.edu',
    'Jane Hokie'
)
ON CONFLICT (email) DO NOTHING;


-- =====================================================================
-- DEMO PROFILE
-- =====================================================================

INSERT INTO student_profiles (
    user_id,
    major_code,
    class_year,
    resume_file_name,
    parsed_skills,
    skill_evidence,
    target_path_id,
    target_path_name
)
VALUES (
    '11111111-1111-1111-1111-111111111111',

    'CS',

    'Sophomore',

    'jane_hokie_resume.pdf',

    ARRAY[
        'Python',
        'Java',
        'Data Structures & Algorithms',
        'Git',
        'SQL',
        'Teamwork'
    ],

    '[
        {
            "skill": "Python",
            "source": "Resume",
            "evidence": "Python development experience"
        },
        {
            "skill": "Java",
            "source": "Resume",
            "evidence": "Java development experience"
        },
        {
            "skill": "SQL",
            "source": "Resume",
            "evidence": "Database experience"
        }
    ]'::jsonb,

    'CP01',

    'Software Engineering'
)
ON CONFLICT (user_id) DO NOTHING;


-- =====================================================================
-- INITIAL DASHBOARD
-- =====================================================================

INSERT INTO dashboard_state (
    user_id,
    active_goal,
    layout
)
VALUES (
    '11111111-1111-1111-1111-111111111111',

    'Software Engineering',

    '{
        "goal": "Software Engineering",

        "widgets": [

            {
                "type": "event_list",
                "title": "Tech events this month",
                "source": "find_events",
                "args": {
                    "target_path": "software",
                    "major": "CS",
                    "days_ahead": 30
                }
            },

            {
                "type": "company_radar",
                "title": "Tech recruiters coming to VT",
                "source": "companies_visiting",
                "args": {
                    "target_path": "software",
                    "days_ahead": 45
                }
            },

            {
                "type": "opportunity_list",
                "title": "Open SWE internships",
                "source": "find_opportunities",
                "args": {
                    "target_path": "software",
                    "opp_type": "internship"
                }
            }

        ]
    }'::jsonb
)
ON CONFLICT (user_id) DO NOTHING;


-- =====================================================================
-- VERIFICATION
-- =====================================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'app'
ORDER BY table_name;