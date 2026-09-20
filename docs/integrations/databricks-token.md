# Databricks access token integration

## Purpose in HireUp

One bearer token authenticates the Vercel server to every Databricks surface: the SQL Statement Execution
API, Foundation Model APIs, Vector Search, Lakebase credential minting, and Genie (spec 11.4).

## Cost / free tier limits

Free. A personal access token (PAT) is acceptable for the hackathon; production would use a service
principal with OAuth M2M.

## Human steps (do these in order)

1. Databricks → **Settings → Developer → Access tokens → Generate new token**.
2. Comment `hireup-vercel`, lifetime 30 days.
3. Copy it once into `.env.local` as `DATABRICKS_TOKEN`, and into Vercel → Settings → Environment Variables
   (Production + Preview).
4. Never paste it into code, commits, chat, or the browser.

## Environment variables

| Name               | Example   | Where used                          | Secret? |
| ------------------ | --------- | ----------------------------------- | ------- |
| `DATABRICKS_TOKEN` | `dapi...` | every server-side Databricks client | yes     |

## Code touchpoints

`src/lib/databricks/sql.ts` (`dbx()`), `src/lib/db/lakebase.ts` (mints Postgres credentials), later
`llm.ts`, `vector.ts`, `genie.ts`.

## Verify

```bash
grep -r dapi src/    # must print nothing
curl -s localhost:3000/api/health   # warehouse RUNNING
```

## Failure modes and fallback

- 401/403: token expired or revoked → generate a new one and update both `.env.local` and Vercel.
- PAT creation disabled in the workspace: use `databricks auth login` locally and ask the workspace owner to
  enable tokens, or create a service principal with OAuth M2M (verify availability in Free Edition).

## Security notes

The token grants everything the creating user can do. It must never reach the browser: it is only read
inside `server-only` modules. Rotate after the hackathon and delete the token when the demo is over.
