# MLflow agent evaluation integration

## Purpose in HokiePath

Shows engineering rigor: the agent is measured against the 10-question golden set (spec 15.3), not
only demoed. Scores grounding (does every `[ID]` the model cites come from a real tool result) and a
per-question behavioral check, and logs the run to an MLflow experiment (spec 11.12).

## Cost / free tier limits

MLflow tracking is free on Free Edition (it is a workspace feature, not a separate billed service).
Each run makes one `ai_query` call per golden question against the configured Serving endpoint,
which does consume Foundation Model API tokens like any other chat call.

## Human steps (do these in order)

1. Run `databricks/01_setup_hokiepath_lakehouse.py` and `02_ingest_external_apis.py` first — the
   eval calls the same six UC Functions the app uses, so seed data must exist.
2. Open `databricks/03_agent_eval.py`, set the `llm_endpoint` widget to the same
   `DATABRICKS_LLM_ENDPOINT` the app uses (spec 11.5) — **never hard-code an endpoint name**, verify
   it on the Serving page.
3. **Run all.** It logs one run per execution to the MLflow experiment `/Shared/hokiepath-agent-eval`.
4. **Experiments** (left sidebar) → open `/Shared/hokiepath-agent-eval` → the run has
   `grounding_pass_rate`, `behavior_pass_rate`, `overall_pass_rate` as metrics and a
   `golden_set_results.json` artifact with the per-question detail. Screenshot the metrics table for
   the pitch deck (spec 18.2).

## Environment variables

None new — the notebook reuses the `llm_endpoint` widget (same value as `DATABRICKS_LLM_ENDPOINT`)
rather than an env var, since Databricks notebooks don't read Vercel's `.env`.

## Code touchpoints

- `databricks/03_agent_eval.py` — the whole eval. Re-runs each golden question's tool calls for real
  against the live UC Functions, asks the model to answer from exactly that context under the same
  grounding rule as `src/lib/agent/system-prompt.ts`, then scores grounding + a per-question
  behavioral check (`GOLDEN_SET[i]["check"]`, a small lambda per row matching the "must hold" column
  from spec 15.3).
- Attempts `mlflow.genai.evaluate(...)` for additional LLM-judge scorers (relevance, guideline
  adherence) if the installed MLflow version exposes them; wrapped in try/except since spec 11.12
  flags this API's names as version-dependent, and the run's metrics do not depend on it succeeding.
- Reads `{catalog}.{schema}.agent_turns` (a Unity Catalog table, separate from the Lakebase Postgres
  table of the same name) if present, for a coarse grounding check on live chat traces. **The
  Lakebase → Delta copy this depends on is not built** — see "Failure modes" below.

## Verify

Experiments page shows a run with `overall_pass_rate` and the three sub-metrics; the artifact lists
10 rows, one per golden question, each with `cited_ids`, `invalid_ids`, `grounded`, `behavior_ok`.

## Failure modes and fallback

- A UC Function call for one question fails (bad path match, etc.) → that question's context is
  smaller than expected but the run continues; check the printed per-question line.
- `ai_query` fails for a question (endpoint down, rate limit) → that answer is empty, scored as
  ungrounded and behavior-failed; other questions are unaffected.
- `mlflow.genai.evaluate` unavailable in the installed MLflow version → prints why and continues;
  the grounding/behavior metrics above are still logged (this is the documented fallback in spec
  11.12: "compute the grounding check and a simple rubric with `ai_query`... if GenAI evaluation
  APIs are unavailable").
- **No `agent_turns` Unity Catalog table yet** — the nightly Lakebase → Delta copy that spec 8.1
  describes ("NEW agent_turns... copied from Lakebase nightly for evaluation") is not implemented.
  Bridging a separate Postgres project (Lakebase) into Delta needs either a JDBC pull inside the
  notebook (minting short-lived Lakebase OAuth credentials the same way `src/lib/db/lakebase.ts`
  does, then `spark.read.jdbc(...)`) or an export endpoint on the app side; neither was safe to write
  untested against a live workspace this session did not have credentials for. The notebook detects
  the missing table, says so plainly, and the golden-set evaluation above runs standalone and in
  full regardless — grounding and the golden set are the part of 15.3/11.12 that actually gates the
  demo (`agent_turns` folding-in is additive polish). Revisit once a live workspace is available to
  test the JDBC path end to end.

## Security notes

The golden set uses a hardcoded synthetic CS-sophomore skill profile (`DEMO_SKILLS`), never a real
student's data. `agent_turns` (both the Lakebase table and, once built, its Delta copy) can contain
real student questions; treat it with the same aggregation care as the rest of `/admin` (spec 14.2).
