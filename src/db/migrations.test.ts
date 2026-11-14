// Scenario: «Первое открытие после выкатки» (keep-in-touch): the deploy runs
// the new migrations on a database that already has contacts and notes.
// The test makes such a database from the first migration only, then
// applies all of them, the way src/db/migrate.ts does on the server.
import { rm } from "node:fs/promises";

import postgres from "postgres";
import { expect, test } from "vitest";

import { applyMigrations } from "@/db/apply-migrations";
import { migrationsUpTo, rows } from "../../test/migrations";
import {
  MIGRATION_DATABASE_SUFFIX,
  createTestDatabase,
} from "../../test/test-database";

// The last migration before the contact frequency
const BEFORE_FREQUENCY = "0000_init";
// The existing contacts get this owner (migration 0004)
const OWNER_EMAIL = "owner@mail.ru";

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
      await applyMigrations(migrator, { ownerEmail: OWNER_EMAIL });
    } finally {
      await migrator.end();
    }

    // The only changes: the new empty frequency, i.e. «Не задано», the
    // owner that all the existing contacts get and the empty birth date
    // (birthdays: «Первое открытие после выкатки»)
    const [owner] =
      await sql`select id from users where email = ${OWNER_EMAIL}`;
    expect(await rows(sql`select * from contacts order by id`)).toEqual(
      contactsBefore.map((contact) => ({
        ...contact,
        contact_frequency: null,
        user_id: owner.id,
        birth_day: null,
        birth_month: null,
        birth_year: null,
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
