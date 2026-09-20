# Databricks Foundation Model APIs integration

## Purpose in HokiePath

The agent's brain and the resume parser (spec 11.5). Databricks serves OpenAI-compatible chat and
embedding endpoints, so the Vercel AI SDK talks to them directly. Used by F2 (resume extraction),
F5/F6 (agent chat and goal tabs, P3), F9 (Event Prep), and skill normalization fallbacks.

## Status

**Live (verified 2026-09-19).** `DATABRICKS_LLM_ENDPOINT=databricks-gpt-oss-120b`,
`DATABRICKS_EMBEDDING_ENDPOINT=databricks-gte-large-en` (1024 dimensions).
`databricks-llama-4-maverick` is verified as a drop-in alternative.

## Cost / free tier limits

Pay-per-token endpoints, rate limited on Free Edition. Keep prompts compact (trimmed tool results,
short profile JSON), cap tool steps at 6, and cache Event Prep results.

## Human steps (do these in order)

1. Databricks → **Serving** → find the pay-per-token Foundation Model endpoints (names start with
   `databricks-`). Pick a chat model that supports tool/function calling, and note an embedding endpoint.
2. Try the model in **Playground** to sanity-check quality.
3. Set `DATABRICKS_LLM_ENDPOINT` and `DATABRICKS_EMBEDDING_ENDPOINT`. Never hard-code endpoint names.
4. Run the smoke test below before building on it.

## Environment variables

| Name                                   | Example                   | Where used              | Secret?    |
| -------------------------------------- | ------------------------- | ----------------------- | ---------- |
| `DATABRICKS_LLM_ENDPOINT`              | `databricks-gpt-oss-120b` | `llm.ts` `chatModel()`  | no         |
| `DATABRICKS_EMBEDDING_ENDPOINT`        | `databricks-gte-large-en` | `llm.ts` `embedModel()` | no         |
| `DATABRICKS_HOST` / `DATABRICKS_TOKEN` | see databricks-token.md   | auth                    | token: yes |

## Code touchpoints

- `src/lib/databricks/llm.ts` — `createOpenAICompatible` against `${DATABRICKS_HOST}/serving-endpoints`
  (the SDK appends `/chat/completions` and `/embeddings`, both of which Databricks accepts), plus a
  `fetch` middleware that normalizes reasoning-model responses. `flattenContent()` is the unit under test.
- `src/lib/resume.ts` — `generateObject` with a zod schema, temperature 0, one retry (F2, spec 10.4).
- Tests: `tests/unit/llm-normalize.test.ts`; live: `tests/integration/llm-live.test.ts` (`RUN_LIVE=1`).

## Reasoning models return content blocks

`databricks-gpt-oss-120b` returns `message.content` as an array of typed blocks rather than a string:

```json
{
  "content": [
    { "type": "reasoning", "summary": [{ "type": "summary_text", "text": "We need to ..." }] },
    { "type": "text", "text": "hello from HokiePath" }
  ]
}
```

This happens for plain answers, JSON-schema output, and streamed deltas (where text deltas are plain
strings but reasoning deltas are arrays). The OpenAI wire format the AI SDK parses expects a string, so
`normalizingFetch` rewrites every response: reasoning blocks are dropped and text blocks concatenated.
Reasoning is a summary of the model's scratchpad, so it must never be shown or stored as an answer.
Llama 4 Maverick needs none of this, and the middleware is a no-op for it.

## Verify

```bash
# tool calling (expect a tool_calls entry naming find_events)
curl -s "$DATABRICKS_HOST/serving-endpoints/$DATABRICKS_LLM_ENDPOINT/invocations" \
  -H "Authorization: Bearer $DATABRICKS_TOKEN" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Find investment banking events in the next 30 days"}],
       "tools":[{"type":"function","function":{"name":"find_events","description":"Find VT events",
       "parameters":{"type":"object","properties":{"target_path":{"type":"string"},
       "days_ahead":{"type":"integer"}},"required":["target_path"]}}}],"max_tokens":200}'

RUN_LIVE=1 pnpm test tests/integration   # text, JSON schema, tool calling, embeddings
```

## Failure modes and fallback

- Empty assistant text with a reasoning model: the normalizing `fetch` was bypassed. Always build
  models through `chatModel()`.
- 429: Free Edition rate limit. Retry once with jitter, then fall back to scripted demo answers (14.4).
- No `tool_calls` in the smoke test: the endpoint does not support tool calling. Switch to
  `databricks-llama-4-maverick`.
- A model may invent a plausible-but-wrong tool argument. gpt-oss guessed
  `target_path: "investment-banking"`, which returns **0** rows, where `"investment banking"` returns 12.
  `resolvePath()` in `src/lib/catalog.ts` maps any model-supplied goal onto a real path before it reaches
  a UC Function; keep every new tool behind it.

## Security notes

`llm.ts` is `server-only`; the token never reaches the browser. Resume text and user messages are
wrapped as data in prompts and explicitly labelled untrusted, so instructions inside a resume are ignored.
