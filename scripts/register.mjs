// Runtime setup for the standalone scripts in this folder: load .env.local, then install a
// resolver so "@/..." and "server-only" behave the same as they do inside Next.js.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

process.loadEnvFile?.(".env.local");
register("./scripts/loader.mjs", pathToFileURL("./"));
