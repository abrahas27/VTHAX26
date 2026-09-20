/**
 * pnpm demo:record — capture live dashboard payloads into fixtures/demo/*.json (spec 14.4).
 * Run with real credentials while Databricks is healthy; the fixtures are what DEMO_MODE serves.
 *
 *   pnpm demo:record            # CS-to-IB demo student: for-you + CP04
 *   pnpm demo:record CP01 CP02  # extra goal tabs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDashboard } from "@/lib/dashboard";
import type { Preferences, SkillProfile } from "@/lib/types";

// "Pivoting Priya" from spec 3.3: a CS sophomore with no finance skills, which is what makes the
// investment banking gap dramatic in the demo.
const DEMO_PROFILE: SkillProfile = {
  userId: "00000000-0000-0000-0000-000000000000",
  displayName: "Priya",
  majorCode: "CS",
  classYear: "Sophomore",
  skills: [
    { name: "Python", level: 3, source: "resume", canonical: true },
    { name: "Java", level: 3, source: "resume", canonical: true },
    { name: "Data Structures & Algorithms", level: 3, source: "resume", canonical: true },
    { name: "Git", level: 3, source: "resume", canonical: true },
    { name: "SQL", level: 2, source: "resume", canonical: true },
    { name: "Teamwork", level: 3, source: "resume", canonical: true },
  ],
  preferences: {
    seeking: ["internship"],
    interestedPaths: ["CP01", "CP04"],
    energizers: ["Analyzing data", "Solving puzzles"],
    industries: ["Tech", "Finance"],
    locations: ["NoVA/DC", "NYC"],
    hoursPerWeek: "3-5",
    flags: {},
  } satisfies Preferences,
  fitScores: {},
  primaryGoal: "CP01",
};

async function main() {
  const extraTabs = process.argv.slice(2);
  const tabs = ["for-you", "CP04", ...extraTabs];
  const dir = path.join(process.cwd(), "fixtures", "demo");
  await mkdir(dir, { recursive: true });

  for (const tab of tabs) {
    process.stdout.write(`recording ${tab} ... `);
    const payload = await buildDashboard({ profile: DEMO_PROFILE, tab, days: 45 });
    await writeFile(path.join(dir, `dashboard-${tab}.json`), JSON.stringify(payload, null, 2));
    const counts = `${payload.events.length} events, ${payload.visits.length} visits, ${payload.clubs.length} clubs, ${payload.opportunities.length} opportunities`;
    console.log(
      payload.errors?.length ? `partial (${payload.errors.join(", ")}): ${counts}` : counts,
    );
  }

  await writeFile(path.join(dir, "profile.json"), JSON.stringify(DEMO_PROFILE, null, 2));
  console.log(`\nWrote fixtures to ${dir}. Set DEMO_MODE=true to serve them.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
