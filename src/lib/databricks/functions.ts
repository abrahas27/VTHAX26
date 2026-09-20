// src/lib/databricks/functions.ts : the one place that knows UC Function argument order (spec 11.3).
import "server-only";
import { sql, T, type SqlValue } from "./sql";

/** Positional argument order of each Unity Catalog function created by the seed notebook. */
const FN_ARGS = {
  list_career_paths: [],
  get_skill_gap: ["target_path", "student_skills"],
  build_gap_roadmap: ["target_path", "student_skills", "days_ahead"],
  find_events: ["target_path", "major", "days_ahead"],
  companies_visiting: ["target_path", "days_ahead"],
  find_opportunities: ["target_path", "opp_type"],
} as const satisfies Record<string, readonly string[]>;

export type UcFunction = keyof typeof FN_ARGS;
type ArgName<K extends UcFunction> = (typeof FN_ARGS)[K][number];
export type UcArgs<K extends UcFunction> = Partial<Record<ArgName<K>, SqlValue>>;

/** Empty string means "any" for string filters; days_ahead defaults to 30 (spec 8.2). */
const defaultFor = (name: string): SqlValue => (name === "days_ahead" ? 30 : "");

/**
 * Call a UC Function by name with named parameters, e.g.
 * `SELECT * FROM workspace.hokiepath.find_events(:target_path, :major, :days_ahead)`.
 */
export async function ucFn<T_ = Record<string, unknown>, K extends UcFunction = UcFunction>(
  name: K,
  args: UcArgs<K> = {},
): Promise<T_[]> {
  const names: readonly string[] = FN_ARGS[name];
  const placeholders = names.map((n) => `:${n}`).join(", ");
  const params = Object.fromEntries(
    names.map((n) => [n, (args as Record<string, SqlValue | undefined>)[n] ?? defaultFor(n)]),
  );
  return sql<T_>(`SELECT * FROM ${T(name)}(${placeholders})`, params);
}

export const UC_FUNCTION_NAMES = Object.keys(FN_ARGS) as UcFunction[];
