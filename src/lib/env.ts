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
    LAKEBASE_INSTANCE: optStr(),
    LAKEBASE_PASSWORD: optStr(),

    // App
    NEXT_PUBLIC_AIBI_DASHBOARD_URL: z.preprocess(blank, z.url().optional()),
    DEMO_MODE: z.preprocess(blank, z.enum(["true", "false"]).default("false")),
    CRON_SECRET: optStr(),
  })
  .superRefine((e, ctx) => {
    // DEMO_MODE serves fixtures (14.4), so live-service config is only mandatory when it is off.
    if (e.DEMO_MODE === "true") return;
    const required = [
      "DATABRICKS_HOST",
      "DATABRICKS_TOKEN",
      "DATABRICKS_WAREHOUSE_ID",
      "DATABRICKS_LLM_ENDPOINT",
      "LAKEBASE_HOST",
      "LAKEBASE_DB",
      "LAKEBASE_USER",
    ] as const;
    for (const key of required) {
      if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required` });
    }
    if (!e.LAKEBASE_PASSWORD && !e.LAKEBASE_INSTANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["LAKEBASE_INSTANCE"],
        message: "Set LAKEBASE_INSTANCE (OAuth credentials) or LAKEBASE_PASSWORD (native role)",
      });
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
