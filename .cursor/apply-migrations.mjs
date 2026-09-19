// Apply the ordered SQL migrations in db/migrations to the libSQL database
// referenced by TURSO_DATABASE_URL. Intended for local file-based development
// databases only; run once against a fresh database.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const migrationsDir = join(repoRoot, "db", "migrations");

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is required to apply migrations.");
  process.exit(1);
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN ?? "local-dev-placeholder",
});

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  process.stdout.write(`Applying ${file}... `);
  await client.executeMultiple(sql);
  console.log("done");
}

client.close();
console.log(`Applied ${files.length} migration(s).`);
