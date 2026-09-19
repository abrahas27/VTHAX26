# HokiePath: mock data + Databricks setup

AI career navigator for Virginia Tech (VTHacks, Deloitte x Databricks challenge, *Campus Career Navigator* track).

```
hokiepath/
├── data/                                  13 CSVs (mock, deterministic)
├── databricks/01_setup_hokiepath_lakehouse.py   Databricks notebook (import into your workspace)
├── lakebase/01_app_schema.sql             Postgres schema for the live app (Lakebase)
└── generate_mock_data.py                  regenerates data/ (seeded, so everyone gets identical rows)
```

## Setup (about 10 minutes)

1. **Get the files into Databricks.** Easiest: push this folder to GitHub, then in Databricks go to
   Workspace → Create → Git folder. Otherwise, import the notebook (Workspace → Import) and upload the
   CSVs to the Volume after step 2 creates it.
2. **Run `01_setup_hokiepath_lakehouse.py`** on serverless compute. Defaults: catalog `workspace`, schema `hokiepath`.
   It creates the Volume, bronze → silver → gold Delta tables, PK/FK constraints, comments, and the agent tool functions.
3. **(Optional) Vector Search:** set the `setup_vector_search` widget to `true` and rerun the last cells.
4. **Lakebase:** create a Lakebase database (Compute → Lakebase / Database instances), open its SQL editor,
   and run `lakebase/01_app_schema.sql`. Then create synced tables from `gold_events_enriched`, `companies`,
   and `career_paths` if you want the app to read catalog data from Postgres.
5. **Genie:** create a Genie space over the gold tables (sample questions are in the notebook's last cell).

Free Edition has daily quotas on compute, model serving, Vector Search, Lakebase, and Apps. If something
fails to create, check the quota first.

## Tables in Unity Catalog (`workspace.hokiepath`)

| Layer | Tables | Used by |
|---|---|---|
| Silver | `majors`, `skills`, `career_paths`, `path_skills`, `companies`, `clubs`, `courses`, `events`, `recruiter_visits`, `opportunities` | Agent tools, app |
| Silver (synthetic analytics) | `students` (1,200), `student_skills`, `event_registrations` | Genie admin view |
| Gold | `gold_events_enriched`, `gold_recruiter_visits_enriched` | App dashboard, tools |
| Gold (CDF on) | `gold_event_search_docs`, `gold_opportunity_search_docs` | Vector Search |
| Gold | `gold_student_skill_gaps`, `gold_skill_gap_summary`, `gold_path_supply_demand` | Genie / Career Services insights |

## Agent tools (Unity Catalog SQL functions)

| Function | What the agent uses it for |
|---|---|
| `list_career_paths()` | Map a vague goal ("finance stuff") to a path |
| `get_skill_gap(target_path, student_skills)` | What's missing from the resume |
| `build_gap_roadmap(target_path, student_skills, days_ahead)` | Events, clubs, and courses that close each gap |
| `find_events(target_path, major, days_ahead)` | Upcoming VT events |
| `companies_visiting(target_path, days_ahead)` | Recruiter Radar |
| `find_opportunities(target_path, opp_type)` | Internships, full-time, research |

Add them as tools in **AI Playground** to prototype the agent with no code, then move to the Mosaic AI Agent
Framework with MLflow tracing for the real app.

## Story baked into the data

- About 25% of synthetic students are **pivoting** outside their major, skewed toward AI/ML, product, IB, and tech consulting.
  `gold_path_supply_demand` shows those paths have the most students per upcoming event: a ready-made insight for your pitch.
- Agent-recommended registrations attend more often than self-found ones (82% vs 64% weighting), so Genie can
  "prove" the agent's impact.
- The demo resume (CS: Python, Java, DSA, Git, SQL) is missing all eight IB skills, so the pivot demo produces a dramatic dashboard change.

## Honesty notes (say these if judges ask)

- Company names are real; every visit, date, posting, and URL is **mock**. Students and registrations are fully **synthetic**.
- Club and course names mix real VT orgs with plausible ones. Verify against GobblerConnect and the VT timetable before the demo.
- O*NET codes are the closest matching occupations; salaries are mock.
- Events run Aug 24 – Dec 11, 2026, and the tools filter on `current_date()`. To shift dates, edit `TERM_START`/`TERM_END`/`TODAY`
  in `generate_mock_data.py` and rerun it.
