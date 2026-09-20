# Databricks notebook source
# MAGIC %md
# MAGIC # HokiePath: ingest external APIs (P4, spec 11.9 / 12.4-12.6)
# MAGIC
# MAGIC Pulls real-world data into Delta so the gold refresh and the app have more than mock rows:
# MAGIC
# MAGIC 1. **O*NET Web Services** -> `onet_occupation_skills` (spec 12.4)
# MAGIC 2. **BLS Public Data API** -> `bls_wages` (spec 12.6)
# MAGIC 3. **Greenhouse / Lever public job boards** -> `bronze_job_postings`, mapped into `opportunities` (spec 12.5)
# MAGIC
# MAGIC Run on **serverless** compute after `01_setup_hokiepath_lakehouse.py`. Each section is independent:
# MAGIC a missing secret or an unreachable API skips that section and prints why, instead of failing the notebook.
# MAGIC
# MAGIC **Secrets** (spec 11.9): create the scope once from a machine with the Databricks CLI —
# MAGIC `databricks secrets create-scope hokiepath`, then `databricks secrets put-secret hokiepath onet_key`
# MAGIC and `... bls_key`. Never paste key values into this notebook.
# MAGIC
# MAGIC **Egress watch-out (spec 11.9 / 14.4):** Free Edition serverless compute may restrict outbound
# MAGIC internet access. If every `requests.get(...)` below fails with a connection/timeout error (not a 4xx
# MAGIC from the API itself), this job cannot reach the internet from here — use the Vercel Cron fallback
# MAGIC instead: `src/app/api/cron/ingest/route.ts`, documented in `docs/integrations/vercel-cron.md`. That
# MAGIC route calls the same three APIs from Vercel's network and writes through the SQL Statement API.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Catalog")
dbutils.widgets.text("schema", "hokiepath", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
fq = f"{catalog}.{schema}"
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")
print("Target:", fq)

# COMMAND ----------

import hashlib
import json
import requests
from datetime import date
from pyspark.sql import Row
from pyspark.sql import functions as F


def get_secret(scope, key):
    try:
        return dbutils.secrets.get(scope, key)
    except Exception as e:
        print(f"  no secret {scope}/{key} ({str(e)[:80]}) -- skipping this section")
        return None


ONET_KEY = get_secret("hokiepath", "onet_key")
BLS_KEY = get_secret("hokiepath", "bls_key")

# COMMAND ----------

# MAGIC %md ## 1. O*NET Web Services: occupation skills (spec 12.4)
# MAGIC Register (free) at https://services.onetcenter.org/ and store the key as `onet_key`.
# MAGIC O*NET has changed auth schemes across versions; this uses the current Web Services v2 pattern
# MAGIC (HTTP Basic auth with the API key as the username). **Verify against the live developer docs**
# MAGIC before relying on this in a demo -- do not assume the URL below is still correct.

# COMMAND ----------

if ONET_KEY:
    soc_codes = [
        r["onet_soc_code"]
        for r in spark.sql(f"SELECT DISTINCT onet_soc_code FROM {fq}.career_paths WHERE onet_soc_code IS NOT NULL").collect()
    ]
    rows = []
    for soc in soc_codes:
        try:
            resp = requests.get(
                f"https://services.onetcenter.org/ws/online/occupations/{soc}/summary/skills",
                auth=(ONET_KEY, ""),
                headers={"Accept": "application/json"},
                timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()
            for item in data.get("skill", []):
                rows.append(
                    Row(
                        soc_code=soc,
                        element_name=item.get("name"),
                        importance=float(item.get("score", {}).get("value", 0) or 0),
                        description=item.get("description"),
                    )
                )
            print(f"  {soc}: {len(data.get('skill', []))} skills")
        except Exception as e:
            print(f"  {soc} -> {str(e)[:150]}")

    if rows:
        (
            spark.createDataFrame(rows)
            .withColumn("_ingested_at", F.current_timestamp())
            .write.mode("overwrite")
            .option("overwriteSchema", True)
            .saveAsTable(f"{fq}.onet_occupation_skills")
        )
        print(f"onet_occupation_skills: {len(rows)} rows")
    else:
        print("No O*NET rows fetched (see errors above, or check egress).")
else:
    print("Skipping O*NET (no onet_key secret).")

# COMMAND ----------

# MAGIC %md ## 2. BLS Public Data API: median wages (spec 12.6)
# MAGIC Register (free) at https://www.bls.gov/developers/. National OEWS annual median wage series ids
# MAGIC follow the pattern `OEUN0000000000{soc-no-dash}03` -- **use the BLS series ID formatter on their
# MAGIC site to confirm this for your SOC codes**; the pattern has changed between OEWS vintages.

# COMMAND ----------

if BLS_KEY:
    soc_codes = [
        r["onet_soc_code"]
        for r in spark.sql(f"SELECT DISTINCT onet_soc_code FROM {fq}.career_paths WHERE onet_soc_code IS NOT NULL").collect()
    ]
    # OEWS national, all industries, annual, median (A01) wage series for a 6-digit SOC (O*NET codes carry
    # a ".00" / ".01" suffix that OEWS series ids drop).
    series_for_soc = {soc: f"OEUN000000000000{soc.split('.')[0].replace('-', '')}03" for soc in soc_codes}
    this_year = date.today().year
    rows = []
    # BLS batches up to 50 series per request.
    ids = list(series_for_soc.values())
    for batch_start in range(0, len(ids), 25):
        batch = ids[batch_start : batch_start + 25]
        try:
            resp = requests.post(
                "https://api.bls.gov/publicAPI/v2/timeseries/data/",
                json={
                    "seriesid": batch,
                    "startyear": str(this_year - 2),
                    "endyear": str(this_year),
                    "registrationkey": BLS_KEY,
                },
                timeout=20,
            )
            resp.raise_for_status()
            body = resp.json()
            for series in body.get("Results", {}).get("series", []):
                soc = next((s for s, sid in series_for_soc.items() if sid == series["seriesID"]), None)
                data_points = series.get("data", [])
                if not soc or not data_points:
                    continue
                latest = max(data_points, key=lambda d: d["year"])
                try:
                    wage = float(latest["value"])
                except ValueError:
                    continue
                rows.append(Row(soc_code=soc, year=int(latest["year"]), median_annual_wage=wage))
        except Exception as e:
            print(f"  BLS batch {batch_start} -> {str(e)[:150]}")

    if rows:
        (
            spark.createDataFrame(rows)
            .withColumn("_ingested_at", F.current_timestamp())
            .write.mode("overwrite")
            .option("overwriteSchema", True)
            .saveAsTable(f"{fq}.bls_wages")
        )
        print(f"bls_wages: {len(rows)} rows")
    else:
        print("No BLS rows fetched -- some SOC codes have no national-median series; mock salaries stay as the fallback (spec 12.6).")
else:
    print("Skipping BLS (no bls_key secret).")

# COMMAND ----------

# MAGIC %md ## 3. Greenhouse / Lever public job boards: real postings (spec 12.5)
# MAGIC Fill in `BOARDS` with `company_id -> ("greenhouse"|"lever", board_token)` for companies whose
# MAGIC careers page you have **personally verified** links to `boards.greenhouse.io/<token>` or
# MAGIC `jobs.lever.co/<token>`. Never guess a token; an unverified one just returns nothing or 404s.

# COMMAND ----------

# Verified live 2026-09-20 against boards-api.greenhouse.io -- each token below returned a real,
# non-empty jobs list for a company that already exists in our companies table. Never add a token
# here without confirming it the same way (spec comment above: "an unverified one just returns
# nothing or 404s").
BOARDS = {
    "CO002": ("greenhouse", "databricks"),  # Databricks
    "CO019": ("greenhouse", "janestreet"),  # Jane Street
    "CO009": ("greenhouse", "bcg"),  # Boston Consulting Group
}

INTERN_KEYWORDS = ("intern", "summer analyst", "new grad", "co-op", "university", "rotational")

# Checked in order, most specific first, so e.g. "Mechanical Engineer" matches CP15 rather than
# falling into CP01's generic "engineer" catch-all. Covers all 19 career_paths rows (spec catalog).
PATH_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("CP15", ("mechanical engineer", "aerospace engineer", "mechanical", "aerospace")),
    ("CP16", ("electrical engineer", "embedded", "electrical", "firmware")),
    ("CP17", ("civil engineer", "structural engineer", "civil", "infrastructure")),
    ("CP18", ("biomedical", "bioengineer", "research scientist", "lab research")),
    ("CP10", ("security engineer", "cybersecurity", "penetration tester", "security analyst")),
    ("CP03", ("machine learning engineer", "ml engineer", "ai engineer", "deep learning")),
    ("CP02", ("data scien", "data analyst", "analytics")),
    ("CP06", ("quant",)),
    ("CP04", ("investment banking", "banking analyst")),
    ("CP05", ("sales and trading", "trading analyst", "markets analyst")),
    ("CP09", ("audit", "assurance")),
    ("CP07", ("management consult", "strategy consult")),
    ("CP08", ("technology consult", "it consult", "tech consult")),
    ("CP11", ("product manager", "product management")),
    ("CP12", ("ux designer", "product designer", "user experience")),
    ("CP13", ("supply chain", "operations analyst", "logistics")),
    ("CP14", ("marketing", "brand manager")),
    ("CP19", ("policy analyst", "public policy", "government affairs")),
    ("CP01", ("software", "swe", "developer", "full stack", "backend", "frontend", "engineer")),
]


def guess_path_id(title: str) -> str | None:
    """Cheap keyword rule before falling back to ai_query; both only ever pick from real path_ids."""
    t = title.lower()
    for path_id, needles in PATH_RULES:
        if any(n in t for n in needles):
            return path_id
    return None


if BOARDS:
    rows = []
    for company_id, (source, token) in BOARDS.items():
        try:
            if source == "greenhouse":
                jobs = requests.get(
                    f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs",
                    params={"content": "true"},
                    timeout=20,
                ).json().get("jobs", [])
                for j in jobs:
                    rows.append(
                        Row(
                            source=source,
                            company_id=company_id,
                            job_id=str(j["id"]),
                            title=j["title"],
                            location=(j.get("location") or {}).get("name"),
                            url=j.get("absolute_url"),
                            updated_at=j.get("updated_at"),
                            raw=json.dumps(j),
                        )
                    )
            elif source == "lever":
                jobs = requests.get(
                    f"https://api.lever.co/v0/postings/{token}", params={"mode": "json"}, timeout=20
                ).json()
                for j in jobs:
                    rows.append(
                        Row(
                            source=source,
                            company_id=company_id,
                            job_id=j["id"],
                            title=j["text"],
                            location=(j.get("categories") or {}).get("location"),
                            url=j.get("hostedUrl"),
                            updated_at=str(j.get("createdAt")),
                            raw=json.dumps(j),
                        )
                    )
            print(f"  {company_id} ({source}): fetched")
        except Exception as e:
            print(f"  {company_id} ({source}) -> {str(e)[:150]}")

    if rows:
        (
            spark.createDataFrame(rows)
            .withColumn("_ingested_at", F.current_timestamp())
            .write.mode("overwrite")
            .option("overwriteSchema", True)
            .saveAsTable(f"{fq}.bronze_job_postings")
        )
        print(f"bronze_job_postings: {len(rows)} rows")

        # Map postings that look like student roles into `opportunities`, keyword rule first.
        postings = spark.table(f"{fq}.bronze_job_postings")
        student_postings = postings.filter(
            F.lower(F.col("title")).rlike("|".join(INTERN_KEYWORDS))
        ).collect()

        def stable_opportunity_id(source: str, job_id: str) -> str:
            # A hash-based id must be stable across notebook runs -- Python's built-in hash() is
            # randomized per process (PYTHONHASHSEED), which would mint a new id for the same
            # posting on every scheduled re-run and duplicate it under an append-only write.
            digest = hashlib.md5(f"{source}:{job_id}".encode()).hexdigest()
            return f"OPX{int(digest[:8], 16) % 100000:05d}"

        board_ids = ", ".join(f"'{cid}'" for cid in BOARDS)  # BOARDS keys are hardcoded above, not user input
        company_names = (
            {
                r["company_id"]: r["company_name"]
                for r in spark.sql(
                    f"SELECT company_id, company_name FROM {fq}.companies WHERE company_id IN ({board_ids})"
                ).collect()
            }
            if BOARDS
            else {}
        )

        # Build against the *existing* table's schema rather than letting createDataFrame infer one:
        # every row here has required_skills=[] and min_gpa/posted_date/deadline=None, and Spark
        # cannot infer a type from an all-empty/all-null column. A tuple per row, in the target
        # table's exact column order, sidesteps both that and Row(**kwargs)'s alphabetical-by-name
        # field ordering (which would silently transpose values if paired with an explicit schema).
        opp_schema = spark.table(f"{fq}.opportunities").schema
        field_names = opp_schema.fieldNames()

        opp_tuples = []
        skipped_no_path = 0
        for p in student_postings:
            path_id = guess_path_id(p["title"])
            if path_id is None:
                skipped_no_path += 1
                continue  # would be dropped anyway by gold_opportunity_search_docs's inner join
            values = {
                "opportunity_id": stable_opportunity_id(p["source"], p["job_id"]),
                "company_id": p["company_id"],
                "company_name": company_names.get(p["company_id"]),
                "title": p["title"],
                "opportunity_type": "internship" if "intern" in p["title"].lower() else "full_time",
                "path_id": path_id,
                "required_skills": [],
                "preferred_skills": [],
                "eligible_majors": ["ALL"],
                "class_years": ["Sophomore", "Junior", "Senior"],
                "min_gpa": None,
                "location": p["location"],
                "posted_date": None,
                # Unknown, not zero: find_opportunities and gold_path_supply_demand treat a NULL
                # deadline as still-open rather than guessing an expiry we have no evidence for.
                "deadline": None,
                "apply_url": p["url"],
                "source": p["source"],
            }
            opp_tuples.append(tuple(values.get(f) for f in field_names))
        if skipped_no_path:
            print(f"  Skipped {skipped_no_path} posting(s) with no matched career path.")

        if opp_tuples:
            new_df = spark.createDataFrame(opp_tuples, schema=opp_schema)
            new_df.createOrReplaceTempView("new_opportunities")
            # MERGE instead of append: re-running this notebook must update/no-op on a posting it
            # already ingested, never duplicate it.
            spark.sql(f"""
                MERGE INTO {fq}.opportunities AS target
                USING new_opportunities AS source
                ON target.opportunity_id = source.opportunity_id
                WHEN MATCHED THEN UPDATE SET *
                WHEN NOT MATCHED THEN INSERT *
            """)
            print(f"opportunities: merged {len(opp_tuples)} postings (source=greenhouse/lever)")
        else:
            print("opportunities: no postings matched a career path to merge.")
    else:
        print("No postings fetched (see errors above, or check egress).")
else:
    print("Skipping Greenhouse/Lever (BOARDS is empty -- add verified company_id -> token pairs above).")

# COMMAND ----------

# MAGIC %md ## 4. Rebuild gold tables
# MAGIC New `onet_occupation_skills` / `bls_wages` rows and any appended `opportunities` only reach the
# MAGIC app once the gold tables are rebuilt. Re-run `01_setup_hokiepath_lakehouse.py` (with
# MAGIC `setup_vector_search=true` if the opportunity/event text changed) to refresh
# MAGIC `gold_opportunity_search_docs`, `gold_path_supply_demand`, etc. In the Lakeflow Job (spec 11.9)
# MAGIC this notebook is Task 1 and the setup notebook is Task 2 for exactly this reason.

# COMMAND ----------

print("Ingestion pass complete.", date.today().isoformat())
