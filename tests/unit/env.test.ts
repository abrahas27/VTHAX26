import { describe, expect, it } from "vitest";
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
  LAKEBASE_INSTANCE: "hokiepath-db",
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

  it("lists every missing live-service variable when DEMO_MODE is off", () => {
    const { DATABRICKS_TOKEN: _t, LAKEBASE_HOST: _h, ...partial } = live;
    expect(() => parseEnv(partial)).toThrow(/DATABRICKS_TOKEN[\s\S]*LAKEBASE_HOST/);
  });

  it("requires a Lakebase auth method", () => {
    const { LAKEBASE_INSTANCE: _i, ...partial } = live;
    expect(() => parseEnv(partial)).toThrow(/LAKEBASE_INSTANCE/);
    expect(() => parseEnv({ ...partial, LAKEBASE_PASSWORD: "pw" })).not.toThrow();
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
