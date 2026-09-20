// Minimal module resolver for `node --experimental-strip-types` runs of our TypeScript scripts.
// Handles the two things Next.js does for us: the "@/" path alias and extensionless TS imports.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function resolveFile(absPath) {
  if (existsSync(absPath) && path.extname(absPath)) return absPath;
  for (const ext of EXTENSIONS) {
    if (existsSync(absPath + ext)) return absPath + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexFile = path.join(absPath, `index${ext}`);
    if (existsSync(indexFile)) return indexFile;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // `server-only` throws outside the react-server condition; scripts are server-side by definition.
  if (specifier === "server-only") {
    return { shortCircuit: true, url: pathToFileURL(path.resolve("scripts/empty.mjs")).href };
  }

  if (specifier.startsWith("@/")) {
    const file = resolveFile(path.resolve("src", specifier.slice(2)));
    if (file) return { shortCircuit: true, url: pathToFileURL(file).href };
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL ? path.dirname(new URL(context.parentURL).pathname) : ".";
    const file = resolveFile(path.resolve(parent, specifier));
    if (file) return { shortCircuit: true, url: pathToFileURL(file).href };
  }

  return nextResolve(specifier, context);
}
