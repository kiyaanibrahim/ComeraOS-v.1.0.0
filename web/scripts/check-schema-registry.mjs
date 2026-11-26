import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const pagesRoot = path.join(webRoot, "src", "app", "(os)", "app");
const registryPath = path.join(repoRoot, "supabase", "schema-registry.json");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name === "page.tsx") found.push(full);
  }
  return found;
}

function routeFor(file) {
  const relative = path.relative(pagesRoot, path.dirname(file));
  if (relative === "") return "/app";
  return `/app/${relative.split(path.sep).join("/")}`;
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const routes = registry.routes ?? {};
const sql = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => fs.readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

const pageRoutes = new Set(walk(pagesRoot).map(routeFor));
const errors = [];

for (const route of pageRoutes) {
  const entry = routes[route];
  if (!entry) {
    errors.push(`Missing registry entry for ${route}`);
    continue;
  }
  const tables = entry.tables ?? [];
  if (!Array.isArray(tables) || tables.length === 0) {
    errors.push(`${route} must list the tables it reads or writes`);
    continue;
  }
  for (const table of tables) {
    const created = new RegExp(`create table(?:\\s+if\\s+not\\s+exists)? public\\.${table}\\b`, "i");
    const renamed = new RegExp(`rename to ${table}\\b`, "i");
    if (!created.test(sql) && !renamed.test(sql)) {
      errors.push(`${route} lists ${table}, but no migration creates public.${table}`);
    }
  }
}

for (const route of Object.keys(routes)) {
  if (!pageRoutes.has(route)) {
    errors.push(`Registry route ${route} has no page`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Schema registry matches ${pageRoutes.size} pages.`);
