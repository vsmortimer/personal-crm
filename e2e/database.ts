// Direct access to the e2e database, to set up the data a test starts from.
// The app under test reads and writes the same database.
import postgres from "postgres";

import type { ContactFrequency } from "../src/lib/contact-frequency";
import { clearEmails } from "../test/mailpit";
import {
  E2E_DATABASE_SUFFIX,
  assertTestDatabase,
  testDatabaseUrl,
} from "../test/test-database";

async function withDatabase(run: (sql: postgres.Sql) => Promise<void>) {
  const sql = postgres(testDatabaseUrl(E2E_DATABASE_SUFFIX), {
    max: 1,
    onnotice: () => {},
  });
  try {
    const [{ name }] = await sql<
      { name: string }[]
    >`select current_database() as name`;
    assertTestDatabase(name);
    await run(sql);
  } finally {
    await sql.end();
  }
}

// The person whose contacts the tests start from; the tests sign in as them
export const OWNER_EMAIL = "owner@example.com";

// A contact to start from: a name alone means no frequency, added just now
export type SeedContact =
  | string
  | {
      name: string;
      contactFrequency?: ContactFrequency;
      createdAt?: Date;
    };

// Empties the database and the mailbox of Mailpit, and adds the owner
// (OWNER_EMAIL) with the contacts, in this order
export async function resetDatabase({ contacts }: { contacts: SeedContact[] }) {
  await clearEmails();
  await withDatabase(async (sql) => {
    // Notes and group memberships go with them (cascade), so do sessions and
    // accounts with the users
    await sql`truncate contacts, groups, users, verifications, login_link_requests restart identity cascade`;
    const [owner] = await sql<{ id: string }[]>`
      insert into users (id, name, email, email_verified)
      values (${`user-${OWNER_EMAIL}`}, '', ${OWNER_EMAIL}, true)
      returning id`;
    for (const contact of contacts) {
      const {
        name,
        contactFrequency = null,
        createdAt,
      } = typeof contact === "string" ? { name: contact } : contact;
      await sql`
        insert into contacts (user_id, name, contact_frequency, created_at, updated_at)
        values (${owner.id}, ${name}, ${contactFrequency}, ${createdAt ?? sql`now()`}, ${createdAt ?? sql`now()`})`;
    }
  });
}

// Makes the links that were asked for older than 15 minutes, so they no longer work
export async function expireLoginLinks() {
  await withDatabase(async (sql) => {
    await sql`update verifications set expires_at = now() - interval '1 minute'`;
  });
}

const HOUR = 60 * 60 * 1000;

// Makes the sign-in look as if it was last extended this many hours ago: a
// session lasts 30 days from the last extension
export async function ageSession(hours: number) {
  await withDatabase(async (sql) => {
    await sql`update sessions set expires_at = now() + interval '30 days' - ${`${hours} hours`}::interval`;
  });
}

// When the (only) session ends
export async function sessionExpiry(): Promise<Date> {
  let expiry: Date | undefined;
  await withDatabase(async (sql) => {
    const [row] = await sql<
      { expires_at: Date }[]
    >`select expires_at from sessions`;
    expiry = new Date(row.expires_at);
  });
  if (!expiry) throw new Error("There is no session");
  return expiry;
}

export { HOUR };
