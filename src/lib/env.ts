// src/lib/env.ts : fail fast on missing configuration (spec Section 13).
// Server-only: secrets must never be bundled for the browser.
import "server-only";
import { z } from "zod";

// .env files copied from .env.example contain `KEY=` lines; treat "" the same as unset.
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const str = () => z.preprocess(blank, z.string());
const optStr = () => z.preprocess(blank, z.string().optional());
const csv = () =>
  z.preprocess(
    blank,
    z
      .string()
      .optional()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),
  );

export const envSchema = z
  .object({
    // Auth.js + Google (12.1)
    AUTH_SECRET: str().pipe(z.string().min(16)),
    AUTH_GOOGLE_ID: str(),
    AUTH_GOOGLE_SECRET: str(),
    ALLOWED_EMAIL_DOMAINS: csv(),
    ADMIN_EMAILS: csv(),

    // Databricks (11.1-11.10); required unless DEMO_MODE=true (checked below)
    DATABRICKS_HOST: z.preprocess(
      blank,
      z
        .url()
        .transform((u) => u.replace(/\/+$/, ""))
        .optional(),
    ),
    DATABRICKS_TOKEN: z.preprocess(blank, z.string().min(10).optional()),
    DATABRICKS_WAREHOUSE_ID: optStr(),
    DATABRICKS_CATALOG: z.preprocess(blank, z.string().default("workspace")),
    DATABRICKS_SCHEMA: z.preprocess(blank, z.string().default("hokiepath")),
    DATABRICKS_LLM_ENDPOINT: optStr(),
    DATABRICKS_EMBEDDING_ENDPOINT: optStr(),
    DATABRICKS_VS_EVENTS_INDEX: optStr(),
    DATABRICKS_VS_OPPS_INDEX: optStr(),
    DATABRICKS_GENIE_SPACE_ID: optStr(),

    // Lakebase (11.8)
    LAKEBASE_HOST: optStr(),
    LAKEBASE_DB: optStr(),
    LAKEBASE_USER: optStr(),
    LAKEBASE_ENDPOINT: optStr(),
    LAKEBASE_PASSWORD: optStr(),

    // App
    NEXT_PUBLIC_AIBI_DASHBOARD_URL: z.preprocess(blank, z.url().optional()),
    DEMO_MODE: z.preprocess(blank, z.enum(["true", "false"]).default("false")),
    CRON_SECRET: optStr(),
  })
  .superRefine((e, ctx) => {
    // DEMO_MODE serves fixtures (14.4), so live-service config is only mandatory when it is off.
    // Services that arrive later in the build (Lakebase, model serving, Vector Search, Genie) are
    // checked where they are used instead, so an unfinished phase does not break the whole app.
    if (e.DEMO_MODE === "true") return;
    const required = ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_WAREHOUSE_ID"] as const;
    for (const key of required) {
      if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required` });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new Error(
      `Invalid environment configuration. See .env.example and docs/integrations/.\n${lines.join("\n")}`,
    );
  }
  return result.data;
}

// Parsed on first access rather than at import, so `next build` and tests that never touch
// configuration do not need secrets. Any real use still fails fast with the full list of problems.
let cached: Env | undefined;
export const env = new Proxy({} as Env, {
  get(_target, key) {
    cached ??= parseEnv(process.env);
    return cached[key as keyof Env];
  },
});

export const isDemoMode = () => env.DEMO_MODE === "true";

/**
 * Assert the variables a late-arriving service needs, with a message that names the spec step.
 * Use at the top of a client module's entry point rather than widening the global schema, so a
 * service that is not configured yet only breaks its own routes.
 */
export function requireEnv<K extends keyof Env>(
  keys: readonly K[],
  where: string,
): { [P in K]: NonNullable<Env[P]> } {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `${where} needs ${missing.join(", ")}. See .env.example and docs/integrations/.`,
    );
  }
  return Object.fromEntries(keys.map((k) => [k, env[k]])) as { [P in K]: NonNullable<Env[P]> };
}
