// Applies pending migrations from ./drizzle and lists what is applied.
// Usage: pnpm db:migrate. The deploy script runs the same code on the server.
import { readFileSync } from "node:fs";

import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getDatabaseUrl } from "./connection-url";

loadEnvConfig(process.cwd());

const MIGRATIONS_FOLDER = "./drizzle";

type JournalEntry = { tag: string; when: number };

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(
    readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
  ) as { entries: JournalEntry[] };
  return journal.entries;
}

// Drizzle records each applied migration with its journal timestamp
async function appliedTimestamps(db: PostgresJsDatabase) {
  const [{ exists }] = await db.execute<{ exists: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (!exists) return new Set<number>();

  const rows = await db.execute<{ created_at: string }>(
    sql`select created_at from drizzle.__drizzle_migrations`,
  );
  return new Set(rows.map((row) => Number(row.created_at)));
}

async function main() {
  const client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    const journal = readJournal();
    const before = await appliedTimestamps(db);

    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const after = await appliedTimestamps(db);
    const tags = (filter: (entry: JournalEntry) => boolean) =>
      journal.filter(filter).map((entry) => entry.tag).join(", ") || "none";

    console.log(`Applied before: ${tags((entry) => before.has(entry.when))}`);
    console.log(
      `Applied now: ${tags((entry) => after.has(entry.when) && !before.has(entry.when))}`,
    );

    const missing = journal.filter((entry) => !after.has(entry.when));
    if (missing.length > 0) {
      throw new Error(
        `Migrations not applied: ${missing.map((entry) => entry.tag).join(", ")}`,
      );
    }
    console.log(`Database schema is up to date: ${journal.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
