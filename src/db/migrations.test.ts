// Scenario: «Первое открытие после выкатки» (keep-in-touch): the deploy runs
// the new migrations on a database that already has contacts and notes.
// The test makes such a database from the first migration only, then
// applies all of them, the way src/db/migrate.ts does on the server.
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { expect, test } from "vitest";

import {
  MIGRATION_DATABASE_SUFFIX,
  createTestDatabase,
} from "../../test/test-database";

const MIGRATIONS_FOLDER = "./drizzle";
// The last migration before the contact frequency
const BEFORE_FREQUENCY = "0000_init";

type Journal = { entries: { tag: string }[] };

// A copy of ./drizzle that ends at the given migration
async function migrationsUpTo(tag: string) {
  const folder = await mkdtemp(path.join(tmpdir(), "crm-migrations-"));
  const journal = JSON.parse(
    await readFile(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
  ) as Journal;
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  expect(last).toBeGreaterThanOrEqual(0);
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
async function rows(query: Promise<Record<string, unknown>[]>) {
  return [...(await query)];
}

test("after the deploy every existing contact has no frequency, and contacts and notes stay as they were", async () => {
  const folder = await migrationsUpTo(BEFORE_FREQUENCY);
  const database = await createTestDatabase(MIGRATION_DATABASE_SUFFIX, {
    migrationsFolder: folder,
  });
  const sql = postgres(database.url, { max: 1, onnotice: () => {} });
  try {
    await sql`
      insert into contacts (name, about, phone, email, created_at, updated_at) values
        ('Анна Смирнова', 'Коллега по прошлой работе', '+7 900 123-45-67', 'anna@mail.ru',
         '2026-01-10T09:00:00Z', '2026-03-01T18:30:00Z'),
        ('Иван Петров', null, null, null,
         '2026-02-20T12:00:00Z', '2026-02-20T12:00:00Z')`;
    await sql`
      insert into notes (contact_id, body, created_at) values
        (1, 'Созвонились после конференции', '2026-03-01T18:30:00Z'),
        (1, 'Поздравил с днём рождения', '2026-05-12T10:00:00Z')`;
    const contactsBefore = await rows(sql`select * from contacts order by id`);
    const notesBefore = await rows(sql`select * from notes order by id`);

    // A client of its own, like src/db/migrate.ts: drizzle changes how its
    // client reads dates, and the rows must be read the same way as before
    const migrator = postgres(database.url, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(migrator), { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await migrator.end();
    }

    // The only change: the new empty column, i.e. «Не задано»
    expect(await rows(sql`select * from contacts order by id`)).toEqual(
      contactsBefore.map((contact) => ({
        ...contact,
        contact_frequency: null,
      })),
    );
    expect(await rows(sql`select * from notes order by id`)).toEqual(
      notesBefore,
    );
  } finally {
    await sql.end();
    await database.drop();
    await rm(folder, { recursive: true, force: true });
  }
});
