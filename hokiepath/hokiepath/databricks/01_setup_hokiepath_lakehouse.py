# Databricks notebook source
# MAGIC %md
# MAGIC # HokiePath: Lakehouse setup (Unity Catalog + Delta)
# MAGIC
# MAGIC Run this notebook top to bottom on **serverless** compute (Databricks Free Edition). It will:
# MAGIC
# MAGIC 1. Create a schema and a Unity Catalog **Volume** for raw files
# MAGIC 2. Load the mock CSVs into **bronze** Delta tables (raw strings)
# MAGIC 3. Build typed **silver** tables (arrays, dates, booleans) with primary/foreign keys and comments
# MAGIC 4. Build **gold** tables for the app, the agent, Vector Search, and Genie
# MAGIC 5. Register **Unity Catalog SQL functions** that your AI agent can call as tools
# MAGIC 6. (Optional) Create a **Vector Search** index over events and opportunities
# MAGIC
# MAGIC **Before running:** upload every CSV from the `data/` folder into the Volume created in step 1
# MAGIC (Catalog Explorer → your schema → Volumes → `raw` → *Upload to this volume*), **or** put this repo in a
# MAGIC Git folder and the notebook will copy `../data/*.csv` into the Volume for you.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Catalog")
dbutils.widgets.text("schema", "hokiepath", "Schema")
dbutils.widgets.dropdown("setup_vector_search", "false", ["true", "false"], "Create Vector Search index")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
SETUP_VS = dbutils.widgets.get("setup_vector_search") == "true"
fq = f"{catalog}.{schema}"
VOLUME_PATH = f"/Volumes/{catalog}/{schema}/raw"
print("Target:", fq, "| raw files:", VOLUME_PATH)

# COMMAND ----------

# MAGIC %md ## 1. Schema + Volume

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {fq} COMMENT 'HokiePath: AI career navigator for Virginia Tech students (VTHacks Deloitte x Databricks challenge)'")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {fq}.raw COMMENT 'Raw CSV drops for HokiePath'")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# If the repo lives in a Git folder, copy ../data/*.csv into the Volume automatically.
import os, shutil, glob
repo_data = os.path.abspath(os.path.join(os.getcwd(), "..", "data"))
if os.path.isdir(repo_data):
    for f in glob.glob(os.path.join(repo_data, "*.csv")):
        shutil.copy(f, os.path.join(VOLUME_PATH, os.path.basename(f)))
    print("Copied CSVs from", repo_data)
print(sorted(os.listdir(VOLUME_PATH)))

# COMMAND ----------

# MAGIC %md ## 2–3. Bronze → Silver
# MAGIC Each entry declares the table's primary key and how to type its columns. Pipe-delimited list
# MAGIC columns (`a|b|c`) become `ARRAY<STRING>`.

# COMMAND ----------

from pyspark.sql import functions as F

TABLES = {
    "majors":              {"pk": "major_code"},
    "skills":              {"pk": "skill_id"},
    "career_paths":        {"pk": "path_id", "arrays": ["core_skills", "typical_majors"], "ints": ["median_salary_usd_mock"]},
    "path_skills":         {"doubles": ["importance"]},
    "companies":           {"pk": "company_id", "arrays": ["career_paths", "target_majors"],
                            "ints": ["avg_vt_hires_per_year_mock"], "bools": ["hires_vt_students"]},
    "clubs":               {"pk": "club_id", "arrays": ["career_paths", "majors", "skills_developed"],
                            "ints": ["members_mock"], "bools": ["application_required"]},
    "courses":             {"pk": "course_code", "arrays": ["skills_taught", "offered_terms"]},
    "events":              {"pk": "event_id", "arrays": ["career_paths", "target_majors", "related_skills"],
                            "ints": ["capacity"], "bools": ["registration_required", "is_virtual"],
                            "timestamps": ["start_ts", "end_ts"]},
    "recruiter_visits":    {"pk": "visit_id", "arrays": ["roles_recruiting", "majors_targeted"],
                            "ints": ["recruiter_count_mock"], "bools": ["vt_alumni_attending", "on_campus_interviews"],
                            "dates": ["visit_date"]},
    "opportunities":       {"pk": "opportunity_id", "arrays": ["required_skills", "preferred_skills", "eligible_majors", "class_years"],
                            "doubles": ["min_gpa"], "dates": ["posted_date", "deadline"]},
    "students":            {"pk": "student_id", "bools": ["is_pivoting", "is_synthetic"], "dates": ["created_at"]},
    "student_skills":      {},
    "event_registrations": {"pk": "registration_id", "bools": ["recommended_by_agent"], "ints": ["rating_1_5"],
                            "timestamps": ["registered_at"]},
}


def to_array(c):
    return F.when(F.col(c).isNull() | (F.trim(F.col(c)) == ""), F.array().cast("array<string>")) \
            .otherwise(F.split(F.col(c), r"\|"))


for name, spec in TABLES.items():
    raw = (spark.read.option("header", True).option("multiLine", True)
           .option("quote", '"').option("escape", '"')
           .csv(f"{VOLUME_PATH}/{name}.csv"))
    raw.write.mode("overwrite").option("overwriteSchema", True).saveAsTable(f"{fq}.bronze_{name}")

    df = spark.table(f"{fq}.bronze_{name}")
    for c in spec.get("arrays", []):     df = df.withColumn(c, to_array(c))
    for c in spec.get("ints", []):       df = df.withColumn(c, F.col(c).cast("int"))
    for c in spec.get("doubles", []):    df = df.withColumn(c, F.col(c).cast("double"))
    for c in spec.get("bools", []):      df = df.withColumn(c, F.col(c).cast("boolean"))
    for c in spec.get("dates", []):      df = df.withColumn(c, F.to_date(c))
    for c in spec.get("timestamps", []): df = df.withColumn(c, F.to_timestamp(c))
    df = df.withColumn("_ingested_at", F.current_timestamp())
    df.write.mode("overwrite").option("overwriteSchema", True).saveAsTable(f"{fq}.{name}")
    print(f"{name:22s} {df.count():6d} rows")

# COMMAND ----------

# MAGIC %md ### Keys + comments
# MAGIC Informational PK/FK constraints and comments make **Genie** and the **agent** much better at writing correct joins.

# COMMAND ----------

def try_sql(stmt):
    try:
        spark.sql(stmt)
    except Exception as e:
        msg = str(e).split("\n")[0]
        if "already exists" not in msg.lower():
            print("skipped:", stmt[:80], "->", msg[:120])

for name, spec in TABLES.items():
    if "pk" in spec:
        try_sql(f"ALTER TABLE {fq}.{name} ALTER COLUMN {spec['pk']} SET NOT NULL")
        try_sql(f"ALTER TABLE {fq}.{name} ADD CONSTRAINT {name}_pk PRIMARY KEY ({spec['pk']})")

FKS = [
    ("path_skills", "path_id", "career_paths"), ("path_skills", "skill_id", "skills"),
    ("events", "company_id", "companies"), ("events", "club_id", "clubs"),
    ("recruiter_visits", "company_id", "companies"), ("recruiter_visits", "event_id", "events"),
    ("opportunities", "company_id", "companies"), ("opportunities", "path_id", "career_paths"),
    ("students", "major_code", "majors"), ("students", "target_path_id", "career_paths"),
    ("student_skills", "student_id", "students"), ("student_skills", "skill_id", "skills"),
    ("event_registrations", "student_id", "students"), ("event_registrations", "event_id", "events"),
]
for tbl, col, ref in FKS:
    try_sql(f"ALTER TABLE {fq}.{tbl} ADD CONSTRAINT {tbl}_{col}_fk FOREIGN KEY ({col}) REFERENCES {fq}.{ref}")

COMMENTS = {
    "majors": "Virginia Tech undergraduate majors and their colleges.",
    "skills": "Canonical skill taxonomy used to normalize resume skills, event topics, and job requirements.",
    "career_paths": "Career paths students can target. onet_soc_code links to O*NET occupations. Salaries are mock.",
    "path_skills": "Bridge table: skills required for each career path, with importance 0-1 (1 = most important).",
    "companies": "Employers that recruit at Virginia Tech. Names are real; recruiting details are mock.",
    "clubs": "Student organizations with the career paths and skills they help develop.",
    "courses": "VT courses mapped to the skills they teach. Verify codes against the VT timetable.",
    "events": "Fall 2026 campus events: career fairs, info sessions, workshops, club meetings, hackathons. Mock dates.",
    "recruiter_visits": "Company visits to campus (info sessions, coffee chats, career fair booths). Links to events.",
    "opportunities": "Internships, full-time roles, and undergraduate research positions (mock postings).",
    "students": "SYNTHETIC student profiles used for analytics and demos. No real student data.",
    "student_skills": "Skills parsed from synthetic student resumes.",
    "event_registrations": "Synthetic event registrations and attendance. status: registered | attended | no_show.",
}
for t, c in COMMENTS.items():
    try_sql(f"COMMENT ON TABLE {fq}.{t} IS '{c}'")

COLUMN_COMMENTS = [
    ("events", "career_paths", "Array of career_paths.path_id this event is relevant to"),
    ("events", "target_majors", "Array of majors.major_code; ['ALL'] means open to every major"),
    ("events", "related_skills", "Array of skills.skill_name this event helps develop"),
    ("students", "is_pivoting", "True if target career path is outside the typical paths for the student's major"),
    ("event_registrations", "recommended_by_agent", "True if the HokiePath agent recommended this event to the student"),
]
for t, col, c in COLUMN_COMMENTS:
    try_sql(f"ALTER TABLE {fq}.{t} ALTER COLUMN {col} COMMENT '{c}'")

# COMMAND ----------

# MAGIC %md ## 4. Gold tables

# COMMAND ----------

GOLD = {}

GOLD["gold_events_enriched"] = f"""
WITH ep AS (
  SELECT x.event_id, collect_list(cp.path_name) AS path_names
  FROM (SELECT event_id, explode(career_paths) AS pid FROM {fq}.events) x
  JOIN {fq}.career_paths cp ON cp.path_id = x.pid
  GROUP BY x.event_id
),
reg AS (
  SELECT event_id,
         count(*)                                  AS registrations,
         count_if(status = 'attended')             AS attended,
         count_if(status IN ('attended','no_show')) AS closed_registrations
  FROM {fq}.event_registrations GROUP BY event_id
)
SELECT e.event_id, e.title, e.event_type, e.start_ts, e.end_ts, e.location, e.is_virtual,
       e.host_type, e.host_name, e.company_id, co.company_name, co.industry,
       e.club_id, cl.club_name,
       e.career_paths, coalesce(ep.path_names, array()) AS path_names,
       e.target_majors, e.related_skills, e.capacity, e.registration_required, e.description,
       coalesce(reg.registrations, 0) AS registrations,
       round(coalesce(reg.registrations, 0) / e.capacity, 3) AS fill_rate,
       CASE WHEN reg.closed_registrations > 0 THEN round(reg.attended / reg.closed_registrations, 3) END AS attendance_rate,
       e.start_ts >= current_timestamp() AS is_upcoming
FROM {fq}.events e
LEFT JOIN ep  ON ep.event_id = e.event_id
LEFT JOIN reg ON reg.event_id = e.event_id
LEFT JOIN {fq}.companies co ON co.company_id = e.company_id
LEFT JOIN {fq}.clubs cl     ON cl.club_id = e.club_id
"""

# Text docs for Vector Search (semantic matching of "valuation" -> "DCF workshop", etc.)
GOLD["gold_event_search_docs"] = f"""
SELECT event_id, title, event_type, start_ts, location, host_name, company_name,
       path_names, target_majors, related_skills, is_virtual,
       concat_ws(' | ',
         title, event_type, concat('Host: ', host_name),
         concat('Career paths: ', array_join(path_names, ', ')),
         concat('Skills: ', array_join(related_skills, ', ')),
         concat('Majors: ', array_join(target_majors, ', ')),
         description) AS search_text
FROM {fq}.gold_events_enriched
"""

GOLD["gold_opportunity_search_docs"] = f"""
SELECT o.opportunity_id, o.title, o.opportunity_type, o.company_name, o.path_id, cp.path_name,
       o.required_skills, o.preferred_skills, o.eligible_majors, o.class_years, o.location, o.deadline,
       concat_ws(' | ',
         o.title, o.opportunity_type, o.company_name, cp.path_name, o.location,
         concat('Required: ', array_join(o.required_skills, ', ')),
         concat('Preferred: ', array_join(o.preferred_skills, ', ')),
         concat('Majors: ', array_join(o.eligible_majors, ', ')),
         concat('Years: ', array_join(o.class_years, ', '))) AS search_text
FROM {fq}.opportunities o
JOIN {fq}.career_paths cp ON cp.path_id = o.path_id
"""

GOLD["gold_recruiter_visits_enriched"] = f"""
WITH rn AS (
  SELECT x.visit_id, collect_list(cp.path_name) AS role_names
  FROM (SELECT visit_id, explode(roles_recruiting) AS pid FROM {fq}.recruiter_visits) x
  JOIN {fq}.career_paths cp ON cp.path_id = x.pid
  GROUP BY x.visit_id
)
SELECT rv.visit_id, rv.company_id, co.company_name, co.industry, rv.event_id, e.title AS event_title,
       rv.visit_date, rv.visit_type, rv.roles_recruiting, coalesce(rn.role_names, array()) AS role_names,
       rv.majors_targeted, rv.recruiter_count_mock, rv.vt_alumni_attending, rv.on_campus_interviews
FROM {fq}.recruiter_visits rv
JOIN {fq}.companies co ON co.company_id = rv.company_id
LEFT JOIN {fq}.events e ON e.event_id = rv.event_id
LEFT JOIN rn ON rn.visit_id = rv.visit_id
"""

# One row per (student, missing skill) for their target path
GOLD["gold_student_skill_gaps"] = f"""
SELECT s.student_id, s.major_code, s.class_year, s.is_pivoting,
       s.target_path_id, cp.path_name, ps.skill_name AS missing_skill, ps.importance
FROM {fq}.students s
JOIN {fq}.career_paths cp ON cp.path_id = s.target_path_id
JOIN {fq}.path_skills ps  ON ps.path_id = s.target_path_id
LEFT ANTI JOIN {fq}.student_skills ss
  ON ss.student_id = s.student_id AND ss.skill_id = ps.skill_id
"""

# Admin / Career Services view: which gaps are most common per path
GOLD["gold_skill_gap_summary"] = f"""
WITH path_students AS (
  SELECT target_path_id, count(*) AS n_students FROM {fq}.students GROUP BY target_path_id
)
SELECT g.path_name, g.missing_skill,
       count(DISTINCT g.student_id) AS students_missing,
       ps.n_students                 AS students_targeting_path,
       round(count(DISTINCT g.student_id) / ps.n_students, 3) AS pct_missing,
       max(g.importance)             AS importance
FROM {fq}.gold_student_skill_gaps g
JOIN path_students ps ON ps.target_path_id = g.target_path_id
GROUP BY g.path_name, g.missing_skill, ps.n_students
"""

# Supply vs demand per career path: are we running enough events for what students want?
GOLD["gold_path_supply_demand"] = f"""
WITH demand AS (
  SELECT target_path_id AS path_id, count(*) AS students_targeting,
         count_if(is_pivoting) AS students_pivoting_in
  FROM {fq}.students GROUP BY target_path_id
),
ev AS (
  SELECT pid AS path_id,
         count_if(is_upcoming)                  AS upcoming_events,
         round(avg(attendance_rate), 3)         AS avg_attendance_rate,
         round(avg(fill_rate), 3)               AS avg_fill_rate
  FROM (SELECT explode(career_paths) AS pid, is_upcoming, attendance_rate, fill_rate
        FROM {fq}.gold_events_enriched)
  GROUP BY pid
),
co AS (
  SELECT pid AS path_id, count(DISTINCT company_id) AS recruiting_companies
  FROM (SELECT company_id, explode(career_paths) AS pid FROM {fq}.companies) GROUP BY pid
),
op AS (
  SELECT path_id, count_if(deadline >= current_date()) AS open_opportunities
  FROM {fq}.opportunities GROUP BY path_id
)
SELECT cp.path_id, cp.path_name, cp.career_family,
       coalesce(d.students_targeting, 0)   AS students_targeting,
       coalesce(d.students_pivoting_in, 0) AS students_pivoting_in,
       coalesce(ev.upcoming_events, 0)     AS upcoming_events,
       coalesce(co.recruiting_companies, 0) AS recruiting_companies,
       coalesce(op.open_opportunities, 0)  AS open_opportunities,
       ev.avg_fill_rate, ev.avg_attendance_rate,
       round(coalesce(d.students_targeting, 0) / greatest(coalesce(ev.upcoming_events, 0), 1), 1) AS students_per_upcoming_event
FROM {fq}.career_paths cp
LEFT JOIN demand d ON d.path_id = cp.path_id
LEFT JOIN ev       ON ev.path_id = cp.path_id
LEFT JOIN co       ON co.path_id = cp.path_id
LEFT JOIN op       ON op.path_id = cp.path_id
"""

CDF_TABLES = {"gold_event_search_docs", "gold_opportunity_search_docs"}  # Vector Search Delta Sync needs Change Data Feed
for name, q in GOLD.items():
    props = " TBLPROPERTIES (delta.enableChangeDataFeed = true)" if name in CDF_TABLES else ""
    spark.sql(f"CREATE OR REPLACE TABLE {fq}.{name}{props} AS {q}")
    print(f"{name:32s} {spark.table(f'{fq}.{name}').count():6d} rows")

for t, pk in [("gold_event_search_docs", "event_id"), ("gold_opportunity_search_docs", "opportunity_id")]:
    try_sql(f"ALTER TABLE {fq}.{t} ALTER COLUMN {pk} SET NOT NULL")
    try_sql(f"ALTER TABLE {fq}.{t} ADD CONSTRAINT {t}_pk PRIMARY KEY ({pk})")

# COMMAND ----------

# MAGIC %md ## 5. Agent tools as Unity Catalog functions
# MAGIC These SQL table functions are the agent's "hands". Register them once, then add them as tools in
# MAGIC **AI Playground** (to prototype with no code) or in your agent code via the Mosaic AI Agent Framework.
# MAGIC The `COMMENT`s matter: the LLM reads them to decide when to call each tool.

# COMMAND ----------

PATH_MATCH = "lower(cp.path_name) LIKE lower(concat('%', target_path, '%'))"
HAS_SKILL = "array_contains(transform(split(lower(student_skills), ','), x -> trim(x)), lower({col}))"

TOOL_FUNCTIONS = {
    "list_career_paths": dict(
        params="",
        returns="path_id STRING, path_name STRING, career_family STRING, core_skills ARRAY<STRING>",
        comment="Lists every career path HokiePath knows about. Call this first if the student's goal does not obviously match a path name.",
        body=f"SELECT path_id, path_name, career_family, core_skills FROM {fq}.career_paths",
    ),
    "get_skill_gap": dict(
        params="target_path STRING COMMENT 'Career path name or fragment, e.g. investment banking', "
               "student_skills STRING COMMENT 'Comma-separated skills from the student resume'",
        returns="skill_name STRING, importance DOUBLE, has_skill BOOLEAN",
        comment="Compares a student's skills to the skills required for a career path. Rows with has_skill = false are the gaps to close.",
        body=f"""SELECT ps.skill_name, ps.importance, {HAS_SKILL.format(col='ps.skill_name')} AS has_skill
                 FROM {fq}.path_skills ps JOIN {fq}.career_paths cp ON cp.path_id = ps.path_id
                 WHERE {PATH_MATCH}
                 ORDER BY has_skill, ps.importance DESC""",
    ),
    "find_events": dict(
        params="target_path STRING COMMENT 'Career path name or fragment; empty string for any path', "
               "major STRING COMMENT 'Major code such as CS or FIN; empty string for any major', "
               "days_ahead INT COMMENT 'How many days ahead to search, e.g. 30'",
        returns="event_id STRING, title STRING, event_type STRING, start_ts TIMESTAMP, location STRING, "
                "host_name STRING, company_name STRING, path_names ARRAY<STRING>, related_skills ARRAY<STRING>",
        comment="Finds upcoming Virginia Tech events (career fairs, info sessions, workshops, club events, hackathons) for a career path and major.",
        body=f"""SELECT event_id, title, event_type, start_ts, location, host_name, company_name, path_names, related_skills
                 FROM {fq}.gold_events_enriched
                 WHERE start_ts >= current_timestamp()
                   AND start_ts <= date_add(current_date(), days_ahead)
                   AND (target_path = '' OR exists(path_names, p -> lower(p) LIKE lower(concat('%', target_path, '%'))))
                   AND (major = '' OR array_contains(target_majors, upper(major)) OR array_contains(target_majors, 'ALL'))
                 ORDER BY start_ts LIMIT 25""",
    ),
    "companies_visiting": dict(
        params="target_path STRING COMMENT 'Career path name or fragment; empty string for any path', "
               "days_ahead INT COMMENT 'How many days ahead to search'",
        returns="company_name STRING, industry STRING, visit_date DATE, visit_type STRING, event_id STRING, "
                "roles_recruiting ARRAY<STRING>, vt_alumni_attending BOOLEAN, on_campus_interviews BOOLEAN",
        comment="Lists companies with recruiters coming to Virginia Tech soon (info sessions, coffee chats, career fair booths) for a career path.",
        body=f"""SELECT company_name, industry, visit_date, visit_type, event_id, role_names AS roles_recruiting,
                        vt_alumni_attending, on_campus_interviews
                 FROM {fq}.gold_recruiter_visits_enriched
                 WHERE visit_date BETWEEN current_date() AND date_add(current_date(), days_ahead)
                   AND (target_path = '' OR exists(role_names, p -> lower(p) LIKE lower(concat('%', target_path, '%'))))
                 ORDER BY visit_date LIMIT 25""",
    ),
    "find_opportunities": dict(
        params="target_path STRING COMMENT 'Career path name or fragment; empty string for any path', "
               "opp_type STRING COMMENT 'internship, full_time, research, or empty string for all'",
        returns="opportunity_id STRING, title STRING, opportunity_type STRING, company_name STRING, path_name STRING, "
                "required_skills ARRAY<STRING>, class_years ARRAY<STRING>, location STRING, deadline DATE",
        comment="Finds open internships, full-time roles, and undergraduate research positions for a career path, soonest deadline first.",
        body=f"""SELECT opportunity_id, title, opportunity_type, company_name, path_name, required_skills, class_years, location, deadline
                 FROM {fq}.gold_opportunity_search_docs
                 WHERE deadline >= current_date()
                   AND (target_path = '' OR lower(path_name) LIKE lower(concat('%', target_path, '%')))
                   AND (opp_type = '' OR opportunity_type = opp_type)
                 ORDER BY deadline LIMIT 25""",
    ),
    "build_gap_roadmap": dict(
        params="target_path STRING COMMENT 'Career path name or fragment, e.g. investment banking', "
               "student_skills STRING COMMENT 'Comma-separated skills from the student resume', "
               "days_ahead INT COMMENT 'Planning horizon in days, e.g. 90 for the rest of the semester'",
        returns="item_type STRING, item_id STRING, name STRING, when_text STRING, closes_gaps ARRAY<STRING>",
        comment="Builds a Gap-to-Goal roadmap: the upcoming events, clubs, and courses that close the student's missing skills for a target career path. Most gaps closed first.",
        body=f"""WITH gaps AS (
                   SELECT collect_list(ps.skill_name) AS missing
                   FROM {fq}.path_skills ps JOIN {fq}.career_paths cp ON cp.path_id = ps.path_id
                   WHERE {PATH_MATCH} AND NOT {HAS_SKILL.format(col='ps.skill_name')}
                 ),
                 items AS (
                   SELECT 'event' AS item_type, e.event_id AS item_id, e.title AS name,
                          date_format(e.start_ts, 'EEE MMM d, h:mm a') AS when_text,
                          array_intersect(e.related_skills, g.missing) AS closes_gaps, e.start_ts AS sort_ts
                   FROM {fq}.events e CROSS JOIN gaps g
                   WHERE e.start_ts >= current_timestamp() AND e.start_ts <= date_add(current_date(), days_ahead)
                   UNION ALL
                   SELECT 'club', c.club_id, c.club_name, concat('Weekly, ', c.meeting_day, ' ', c.meeting_time),
                          array_intersect(c.skills_developed, g.missing), NULL
                   FROM {fq}.clubs c CROSS JOIN gaps g
                   UNION ALL
                   SELECT 'course', k.course_code, concat(k.course_code, ': ', k.course_title),
                          concat('Offered ', array_join(k.offered_terms, '/')),
                          array_intersect(k.skills_taught, g.missing), NULL
                   FROM {fq}.courses k CROSS JOIN gaps g
                 )
                 SELECT item_type, item_id, name, when_text, closes_gaps
                 FROM items WHERE size(closes_gaps) > 0
                 ORDER BY size(closes_gaps) DESC, sort_ts ASC NULLS LAST
                 LIMIT 30""",
    ),
}

for fname, f in TOOL_FUNCTIONS.items():
    stmt = (f"CREATE OR REPLACE FUNCTION {fq}.{fname}({f['params']})\n"
            f"RETURNS TABLE ({f['returns']})\n"
            f"COMMENT '{f['comment']}'\n"
            f"RETURN {f['body']}")
    spark.sql(stmt)
    print("registered tool:", f"{fq}.{fname}")

# COMMAND ----------

# MAGIC %md ### Try the tools (the "CS student pivoting to investment banking" demo)

# COMMAND ----------

demo_skills = "Python, Java, Data Structures & Algorithms, Git, SQL, Teamwork"
display(spark.sql(f"SELECT * FROM {fq}.get_skill_gap('investment banking', '{demo_skills}')"))
display(spark.sql(f"SELECT * FROM {fq}.build_gap_roadmap('investment banking', '{demo_skills}', 90)"))
display(spark.sql(f"SELECT * FROM {fq}.companies_visiting('investment banking', 60)"))
display(spark.sql(f"SELECT * FROM {fq}.find_events('investment banking', 'CS', 45)"))

# COMMAND ----------

# MAGIC %md ## 6. (Optional) Vector Search
# MAGIC Set the `setup_vector_search` widget to `true`. Free Edition limits how many endpoints you can have,
# MAGIC so this reuses one endpoint for both indexes. Check **Compute → Vector Search** if creation fails.
# MAGIC The embedding model endpoint name may differ in your workspace; check **Serving**.

# COMMAND ----------

# MAGIC %pip install -q databricks-vectorsearch

# COMMAND ----------

if SETUP_VS:
    from databricks.vector_search.client import VectorSearchClient
    import time
    vsc = VectorSearchClient(disable_notice=True)
    ENDPOINT = "hokiepath-vs"
    EMBED_MODEL = "databricks-gte-large-en"

    if ENDPOINT not in [e["name"] for e in vsc.list_endpoints().get("endpoints", [])]:
        vsc.create_endpoint(name=ENDPOINT, endpoint_type="STANDARD")
    while vsc.get_endpoint(ENDPOINT).get("endpoint_status", {}).get("state") != "ONLINE":
        print("waiting for endpoint..."); time.sleep(30)

    for src, pk in [("gold_event_search_docs", "event_id"), ("gold_opportunity_search_docs", "opportunity_id")]:
        idx = f"{fq}.{src}_idx"
        try:
            vsc.create_delta_sync_index(
                endpoint_name=ENDPOINT, index_name=idx, source_table_name=f"{fq}.{src}",
                pipeline_type="TRIGGERED", primary_key=pk,
                embedding_source_column="search_text", embedding_model_endpoint_name=EMBED_MODEL)
            print("created", idx)
        except Exception as e:
            print(idx, "->", str(e)[:150])
else:
    print("Skipping Vector Search (widget is false).")

# COMMAND ----------

# MAGIC %md Once the index is ONLINE, semantic search looks like this:

# COMMAND ----------

if SETUP_VS:
    idx = vsc.get_index(ENDPOINT, f"{fq}.gold_event_search_docs_idx")
    res = idx.similarity_search(query_text="learn company valuation and financial modeling",
                                columns=["event_id", "title", "start_ts"], num_results=5)
    display(res)

# COMMAND ----------

# MAGIC %md ## 7. AI Functions: parse a resume straight into your tables
# MAGIC `ai_query` calls a hosted Foundation Model from SQL. Swap the endpoint name for one listed on
# MAGIC your **Serving** page if this one is not available.

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT ai_query(
# MAGIC   'databricks-meta-llama-3-3-70b-instruct',
# MAGIC   concat(
# MAGIC     'Extract skills from this resume. Use ONLY names from this list when they match: ',
# MAGIC     (SELECT array_join(collect_list(skill_name), ', ') FROM skills),
# MAGIC     '. Return JSON only: {"major": string, "class_year": string, "skills": [string]}. Resume: ',
# MAGIC     'Jane Hokie, B.S. Computer Science, Virginia Tech, expected May 2028. Built a Flask + React app; ',
# MAGIC     'Python, Java, SQL, Git. Data Structures TA. Led a 4-person VTHacks team.'
# MAGIC   )
# MAGIC ) AS parsed_resume

# COMMAND ----------

# MAGIC %md ## 8. Genie space (admin insights for Career & Professional Development)
# MAGIC Create a Genie space (**Genie → New**) and add these tables: `gold_path_supply_demand`,
# MAGIC `gold_skill_gap_summary`, `gold_events_enriched`, `students`, `event_registrations`, `career_paths`.
# MAGIC
# MAGIC Sample questions to seed it with:
# MAGIC - Which career paths have the most students per upcoming event?
# MAGIC - What are the top 5 missing skills for students targeting investment banking?
# MAGIC - How many students are pivoting into a path outside their major, by major?
# MAGIC - Which event types have the highest attendance rate?
# MAGIC - Do agent-recommended registrations attend more often than self-found ones?
