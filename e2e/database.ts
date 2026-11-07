// Direct access to the e2e database, to set up the data a test starts from.
// The app under test reads and writes the same database.
import postgres from "postgres";

import type { ContactFrequency } from "../src/lib/contact-frequency";
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

// A contact to start from: a name alone means no frequency, added just now
export type SeedContact =
  | string
  | {
      name: string;
      contactFrequency?: ContactFrequency;
      createdAt?: Date;
    };

// Empties the database and adds the contacts, in this order
export async function resetDatabase({ contacts }: { contacts: SeedContact[] }) {
  await withDatabase(async (sql) => {
    // Notes and group memberships go with them (cascade)
    await sql`truncate contacts, groups restart identity cascade`;
    for (const contact of contacts) {
      const {
        name,
        contactFrequency = null,
        createdAt,
      } = typeof contact === "string" ? { name: contact } : contact;
      await sql`
        insert into contacts (name, contact_frequency, created_at, updated_at)
        values (${name}, ${contactFrequency}, ${createdAt ?? sql`now()`}, ${createdAt ?? sql`now()`})`;
    }
  });
}
