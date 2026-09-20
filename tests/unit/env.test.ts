import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/lib/env";

const live = {
  AUTH_SECRET: "a-very-long-test-secret-value",
  AUTH_GOOGLE_ID: "id.apps.googleusercontent.com",
  AUTH_GOOGLE_SECRET: "secret",
  DATABRICKS_HOST: "https://dbc-test.cloud.databricks.com/",
  DATABRICKS_TOKEN: "dapi-test-token-123",
  DATABRICKS_WAREHOUSE_ID: "abc123",
  DATABRICKS_LLM_ENDPOINT: "databricks-test-llm",
  LAKEBASE_HOST: "instance.database.cloud.databricks.com",
  LAKEBASE_DB: "databricks_postgres",
  LAKEBASE_USER: "me@example.com",
  LAKEBASE_ENDPOINT: "projects/hokiepath-db/branches/production/endpoints/primary",
};

describe("parseEnv", () => {
  it("accepts a complete live configuration and applies defaults", () => {
    const env = parseEnv(live);
    expect(env.DATABRICKS_HOST).toBe("https://dbc-test.cloud.databricks.com");
    expect(env.DATABRICKS_CATALOG).toBe("workspace");
    expect(env.DATABRICKS_SCHEMA).toBe("hokiepath");
    expect(env.DEMO_MODE).toBe("false");
    expect(env.ALLOWED_EMAIL_DOMAINS).toEqual([]);
  });

  it("treats blank values copied from .env.example as unset", () => {
    const env = parseEnv({ ...live, DATABRICKS_EMBEDDING_ENDPOINT: "", DATABRICKS_CATALOG: " " });
    expect(env.DATABRICKS_EMBEDDING_ENDPOINT).toBeUndefined();
    expect(env.DATABRICKS_CATALOG).toBe("workspace");
  });

  it("splits comma-separated lists and lowercases them", () => {
    const env = parseEnv({
      ...live,
      ALLOWED_EMAIL_DOMAINS: "vt.edu, VT.EDU ,",
      ADMIN_EMAILS: "A@vt.edu",
    });
    expect(env.ALLOWED_EMAIL_DOMAINS).toEqual(["vt.edu", "vt.edu"]);
    expect(env.ADMIN_EMAILS).toEqual(["a@vt.edu"]);
  });

  it("lists every missing Databricks core variable when DEMO_MODE is off", () => {
    const { DATABRICKS_TOKEN: _t, DATABRICKS_WAREHOUSE_ID: _w, ...partial } = live;
    expect(() => parseEnv(partial)).toThrow(/DATABRICKS_TOKEN[\s\S]*DATABRICKS_WAREHOUSE_ID/);
  });

  it("does not require services that arrive in later phases", () => {
    // Lakebase (11.8) and model serving (11.5) are checked where they are used, so that an
    // unfinished phase cannot break routes that do not touch them.
    const {
      LAKEBASE_HOST: _h,
      LAKEBASE_DB: _d,
      LAKEBASE_USER: _u,
      LAKEBASE_ENDPOINT: _e,
      ...partial
    } = live;
    expect(() => parseEnv({ ...partial, DATABRICKS_LLM_ENDPOINT: "" })).not.toThrow();
  });

  it("only needs auth settings in DEMO_MODE", () => {
    const env = parseEnv({
      AUTH_SECRET: live.AUTH_SECRET,
      AUTH_GOOGLE_ID: live.AUTH_GOOGLE_ID,
      AUTH_GOOGLE_SECRET: live.AUTH_GOOGLE_SECRET,
      DEMO_MODE: "true",
    });
    expect(env.DEMO_MODE).toBe("true");
  });

  it("rejects a malformed Databricks host", () => {
    expect(() => parseEnv({ ...live, DATABRICKS_HOST: "not a url" })).toThrow(/DATABRICKS_HOST/);
  });
});

describe("requireEnv", () => {
  const withEnv = async (vars: Record<string, string>, run: () => void) => {
    const saved = { ...process.env };
    Object.assign(process.env, vars);
    try {
      run();
    } finally {
      process.env = saved;
    }
  };

  it("returns the requested values when they are set", async () => {
    vi.resetModules();
    const { requireEnv } = await import("@/lib/env");
    await withEnv({ ...live, LAKEBASE_HOST: "db.example.com" }, () => {
      expect(requireEnv(["LAKEBASE_HOST"], "Lakebase")).toEqual({
        LAKEBASE_HOST: "db.example.com",
      });
    });
  });

  it("names the missing variables and where they are needed", async () => {
    vi.resetModules();
    const { requireEnv } = await import("@/lib/env");
    await withEnv({ ...live, LAKEBASE_HOST: "", LAKEBASE_USER: "" }, () => {
      expect(() => requireEnv(["LAKEBASE_HOST", "LAKEBASE_USER"], "Lakebase")).toThrow(
        /Lakebase needs LAKEBASE_HOST, LAKEBASE_USER/,
      );
    });
  });
});
