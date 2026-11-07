// Helpers for the tests that run the migrations on a database that already has
// data, the way a deploy does
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const MIGRATIONS_FOLDER = "./drizzle";

type Journal = { entries: { tag: string }[] };

// A copy of ./drizzle that ends at the given migration. The caller removes
// the folder.
export async function migrationsUpTo(tag: string) {
  const folder = await mkdtemp(path.join(tmpdir(), "crm-migrations-"));
  const journal = JSON.parse(
    await readFile(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
  ) as Journal;
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  if (last < 0) throw new Error(`There is no migration ${tag}`);
  const entries = journal.entries.slice(0, last + 1);

  await mkdir(path.join(folder, "meta"));
  await writeFile(
    path.join(folder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    await copyFile(
      `${MIGRATIONS_FOLDER}/${entry.tag}.sql`,
      path.join(folder, `${entry.tag}.sql`),
    );
  }
  return folder;
}

// Plain rows, without the query details postgres adds to its result
export async function rows(query: Promise<Record<string, unknown>[]>) {
  return [...(await query)];
}
