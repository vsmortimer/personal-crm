// Applies the migrations from ./drizzle. Used by src/db/migrate.ts, which the
// deploy runs on the server, and by the tests of the migrations.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";

import { normalizeEmail } from "../lib/email";

export const MIGRATIONS_FOLDER = "./drizzle";

type Options = {
  // The address of the person who owns the contacts and groups that were in
  // the database before the sign-in (migration 0004). Not needed for an empty
  // database
  ownerEmail?: string;
  migrationsFolder?: string;
};

// `client` must be a connection of its own, with a single connection in the
// pool: the owner's address is passed to the migrations as a setting of the
// connection, and all the migrations run in one transaction. If a migration
// fails, none of the new ones is kept.
export async function applyMigrations(
  client: postgres.Sql,
  { ownerEmail, migrationsFolder = MIGRATIONS_FOLDER }: Options = {},
) {
  // A wrong address is caught before anything changes in the database. An
  // address that is not set at all is caught by migration 0004, and only if
  // there is data to give an owner to.
  if (ownerEmail?.trim()) {
    const owner = normalizeEmail(ownerEmail);
    if (!owner) {
      throw new Error(
        `OWNER_EMAIL is not an email address: "${ownerEmail}". Fix it in the settings`,
      );
    }
    await client`select set_config('crm.owner_email', ${owner}, false)`;
  }

  await migrate(drizzle(client), { migrationsFolder });
}
