/**
 * check-migrations.ts
 *
 * Warns if any file under lib/db/src/schema/ is newer than the most recent
 * Drizzle migration entry in the journal.
 *
 * Usage: pnpm --filter @workspace/scripts run check-migrations
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../../");
const SCHEMA_DIR = path.join(ROOT, "lib/db/src/schema");
const MIGRATIONS_DIR = path.join(ROOT, "lib/db/migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

function latestMigrationTimestamp(): number | null {
  if (!fs.existsSync(JOURNAL_PATH)) {
    return null;
  }

  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8")) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
  };

  if (!journal.entries || journal.entries.length === 0) {
    return null;
  }

  const latest = journal.entries.reduce((a, b) => (a.idx > b.idx ? a : b));

  const sqlFile = path.join(MIGRATIONS_DIR, `${latest.tag}.sql`);
  if (fs.existsSync(sqlFile)) {
    return fs.statSync(sqlFile).mtimeMs;
  }

  return latest.when;
}

function schemaFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(dir, f));
}

function main() {
  const migrationTs = latestMigrationTimestamp();

  if (migrationTs === null) {
    console.warn(
      "⚠  No migrations found in lib/db/migrations/. Run:\n" +
        "   pnpm --filter @workspace/db run generate"
    );
    process.exit(1);
  }

  const files = schemaFiles(SCHEMA_DIR);
  const stale = files.filter((f) => fs.statSync(f).mtimeMs > migrationTs);

  if (stale.length === 0) {
    console.log("✓ Schema is in sync with the latest migration.");
    process.exit(0);
  }

  const migrationDate = new Date(migrationTs).toISOString();
  console.warn(
    `⚠  The following schema file(s) are newer than the latest migration\n` +
      `   (generated ${migrationDate}):\n`
  );
  for (const f of stale) {
    const rel = path.relative(ROOT, f);
    const mtime = new Date(fs.statSync(f).mtimeMs).toISOString();
    console.warn(`   ${rel}  (modified ${mtime})`);
  }
  console.warn(
    "\n   Run the following to generate a migration, then commit the SQL file:\n" +
      "   pnpm --filter @workspace/db run generate\n"
  );
  process.exit(1);
}

main();
