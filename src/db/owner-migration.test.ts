// Migration 0004 gives the contacts and groups that were in the database
// before the sign-in an owner: the person whose address OWNER_EMAIL holds
// (data-ownership: «Существующие данные становятся моими»). The test makes a
// database the way it is before the deploy, from the migrations up to 0003,
// then applies all of them, the way src/db/migrate.ts does on the server.
import { rm } from "node:fs/promises";

import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { applyMigrations } from "@/db/apply-migrations";
import { migrationsUpTo, rows } from "../../test/migrations";
import {
  MIGRATION_DATABASE_SUFFIX,
  createTestDatabase,
} from "../../test/test-database";

const BEFORE_OWNER = "0003_login_tables";
const OWNER_EMAIL = "owner@mail.ru";

let folder: string;
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let sql: postgres.Sql;

beforeEach(async () => {
  folder = await migrationsUpTo(BEFORE_OWNER);
  database = await createTestDatabase(MIGRATION_DATABASE_SUFFIX, {
    migrationsFolder: folder,
  });
  sql = postgres(database.url, { max: 1, onnotice: () => {} });
});

afterEach(async () => {
  await sql.end();
  await database.drop();
  await rm(folder, { recursive: true, force: true });
});

// What the deploy does: a client of its own, one connection
async function migrateAll(ownerEmail: string | undefined) {
  const migrator = postgres(database.url, { max: 1, onnotice: () => {} });
  try {
    await applyMigrations(migrator, { ownerEmail });
  } finally {
    await migrator.end();
  }
}

async function addExistingData() {
  await sql`
    insert into contacts (name, about, created_at, updated_at) values
      ('Анна Смирнова', 'Коллега', '2026-01-10T09:00:00Z', '2026-03-01T18:30:00Z'),
      ('Иван Петров', null, '2026-02-20T12:00:00Z', '2026-02-20T12:00:00Z')`;
  await sql`
    insert into notes (contact_id, body, created_at) values
      (1, 'Созвонились', '2026-03-01T18:30:00Z'),
      (1, 'Поздравил', '2026-05-12T10:00:00Z'),
      (2, 'Встретились', '2026-06-01T10:00:00Z')`;
  await sql`insert into groups (name) values ('Друзья'), ('Теннис')`;
  await sql`insert into contact_groups (contact_id, group_id) values (1, 1), (1, 2), (2, 1)`;
}

async function counts() {
  const [row] = await sql<
    { contacts: number; notes: number; groups: number; links: number }[]
  >`select
      (select count(*) from contacts)::int as contacts,
      (select count(*) from notes)::int as notes,
      (select count(*) from groups)::int as groups,
      (select count(*) from contact_groups)::int as links`;
  return row;
}

async function appliedMigrations() {
  const [row] = await sql<
    { applied: number }[]
  >`select count(*)::int as applied from drizzle.__drizzle_migrations`;
  return row.applied;
}

describe("existing data gets an owner", () => {
  // Scenario: «Первый вход после выкатки»
  test("all of it belongs to the user with the address of OWNER_EMAIL, and nothing is lost", async () => {
    await addExistingData();
    const before = await counts();
    const contactsBefore = await rows(
      sql`select name, about from contacts order by id`,
    );

    await migrateAll(OWNER_EMAIL);

    const [owner] = await sql`select id, name, email_verified from users`;
    expect(owner).toMatchObject({ name: "", email_verified: true });
    expect(await counts()).toEqual(before);
    expect(
      await rows(sql`select name, about from contacts order by id`),
    ).toEqual(contactsBefore);
    expect(await sql`select distinct user_id from contacts`).toEqual([
      { user_id: owner.id },
    ]);
    expect(await sql`select distinct user_id from groups`).toEqual([
      { user_id: owner.id },
    ]);
    const [user] = await sql`select email from users where id = ${owner.id}`;
    expect(user.email).toBe(OWNER_EMAIL);
  });

  test("the address is taken the way a person enters it: spaces off, lower case", async () => {
    await addExistingData();

    await migrateAll("  Owner@Mail.RU ");

    expect(await sql`select email from users`).toEqual([
      { email: OWNER_EMAIL },
    ]);
  });

  test("a user with that address who signed in before is the owner, not a second one", async () => {
    await addExistingData();
    await sql`
      insert into users (id, name, email, email_verified, created_at, updated_at)
      values ('earlier', '', ${OWNER_EMAIL}, true, now(), now())`;

    await migrateAll(OWNER_EMAIL);

    expect(await sql`select id from users`).toEqual([{ id: "earlier" }]);
    expect(await sql`select distinct user_id from contacts`).toEqual([
      { user_id: "earlier" },
    ]);
  });

  // Scenario: «Друг после выкатки»
  test("another user who signs in afterwards has nothing", async () => {
    await addExistingData();
    await migrateAll(OWNER_EMAIL);

    await sql`
      insert into users (id, name, email, email_verified, created_at, updated_at)
      values ('friend', '', 'friend@mail.ru', true, now(), now())`;

    expect(await sql`select id from contacts where user_id = 'friend'`).toEqual(
      [],
    );
    expect(await sql`select id from groups where user_id = 'friend'`).toEqual(
      [],
    );
  });
});

describe("the owner is missing", () => {
  // Scenario: «Почта не задана»
  test("with data in the database the migration fails, and the database stays as it was", async () => {
    await addExistingData();
    const before = await counts();
    const appliedBefore = await appliedMigrations();

    await expect(migrateAll(undefined)).rejects.toThrow(
      /OWNER_EMAIL is not set/,
    );

    expect(await counts()).toEqual(before);
    expect(await appliedMigrations()).toBe(appliedBefore);
    const columns = await sql`
      select column_name from information_schema.columns
      where table_name = 'contacts' and column_name = 'user_id'`;
    expect(columns).toEqual([]);
    expect(await sql`select id from users`).toEqual([]);
  });

  test("an empty setting counts as missing", async () => {
    await addExistingData();

    await expect(migrateAll("   ")).rejects.toThrow(/OWNER_EMAIL is not set/);
  });

  test("groups alone are data too", async () => {
    await sql`insert into groups (name) values ('Друзья')`;

    await expect(migrateAll(undefined)).rejects.toThrow(
      /OWNER_EMAIL is not set/,
    );
  });

  test("an address that is not an address stops everything before the migrations", async () => {
    await addExistingData();
    const appliedBefore = await appliedMigrations();

    await expect(migrateAll("owner@")).rejects.toThrow(/OWNER_EMAIL/);

    expect(await appliedMigrations()).toBe(appliedBefore);
  });

  test("an empty database migrates without it", async () => {
    await migrateAll(undefined);

    expect(await counts()).toEqual({
      contacts: 0,
      notes: 0,
      groups: 0,
      links: 0,
    });
    expect(await sql`select id from users`).toEqual([]);
    const columns = await sql`
      select column_name from information_schema.columns
      where table_name = 'contacts' and column_name = 'user_id'`;
    expect(columns).toHaveLength(1);
  });
});
