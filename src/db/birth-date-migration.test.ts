// Scenario: «Первое открытие после выкатки» (birthdays): the deploy runs
// migration 0005 on a database that already has contacts, notes and groups.
// The test makes such a database from the migrations up to 0004, then applies
// the rest, the way src/db/migrate.ts does on the server.
import { rm } from "node:fs/promises";

import postgres from "postgres";
import { expect, test } from "vitest";

import { applyMigrations } from "@/db/apply-migrations";
import { migrationsUpTo, rows } from "../../test/migrations";
import {
  MIGRATION_DATABASE_SUFFIX,
  createTestDatabase,
} from "../../test/test-database";

const BEFORE_BIRTH_DATE = "0004_data_owner";
// The owner is already there, so the migrations need no address
const OWNER_ID = "owner";

test("after the deploy no contact has a birth date, and everything else stays as it was", async () => {
  const folder = await migrationsUpTo(BEFORE_BIRTH_DATE);
  const database = await createTestDatabase(MIGRATION_DATABASE_SUFFIX, {
    migrationsFolder: folder,
  });
  const sql = postgres(database.url, { max: 1, onnotice: () => {} });
  try {
    await sql`
      insert into users (id, name, email, email_verified, created_at, updated_at)
      values (${OWNER_ID}, '', 'owner@mail.ru', true, now(), now())`;
    await sql`
      insert into contacts (user_id, name, about, phone, email, contact_frequency, created_at, updated_at) values
        (${OWNER_ID}, 'Анна Смирнова', 'Коллега', '+7 900 123-45-67', 'anna@mail.ru', 'month',
         '2026-01-10T09:00:00Z', '2026-03-01T18:30:00Z'),
        (${OWNER_ID}, 'Иван Петров', null, null, null, null,
         '2026-02-20T12:00:00Z', '2026-02-20T12:00:00Z')`;
    await sql`
      insert into notes (contact_id, body, created_at) values
        (1, 'Созвонились', '2026-03-01T18:30:00Z'),
        (2, 'Встретились', '2026-06-01T10:00:00Z')`;
    await sql`insert into groups (user_id, name) values (${OWNER_ID}, 'Друзья')`;
    await sql`insert into contact_groups (contact_id, group_id) values (1, 1), (2, 1)`;
    const contactsBefore = await rows(sql`select * from contacts order by id`);
    const notesBefore = await rows(sql`select * from notes order by id`);
    const groupsBefore = await rows(sql`select * from groups order by id`);
    const linksBefore = await rows(
      sql`select * from contact_groups order by contact_id, group_id`,
    );

    // A client of its own, like src/db/migrate.ts: drizzle changes how its
    // client reads dates, and the rows must be read the same way as before
    const migrator = postgres(database.url, { max: 1, onnotice: () => {} });
    try {
      await applyMigrations(migrator, { ownerEmail: undefined });
    } finally {
      await migrator.end();
    }

    // The only change: the new empty birth date
    expect(await rows(sql`select * from contacts order by id`)).toEqual(
      contactsBefore.map((contact) => ({
        ...contact,
        birth_day: null,
        birth_month: null,
        birth_year: null,
      })),
    );
    expect(await rows(sql`select * from notes order by id`)).toEqual(
      notesBefore,
    );
    expect(await rows(sql`select * from groups order by id`)).toEqual(
      groupsBefore,
    );
    expect(
      await rows(
        sql`select * from contact_groups order by contact_id, group_id`,
      ),
    ).toEqual(linksBefore);
  } finally {
    await sql.end();
    await database.drop();
    await rm(folder, { recursive: true, force: true });
  }
});
