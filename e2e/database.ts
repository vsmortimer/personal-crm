// Direct access to the e2e database, to set up the data a test starts from.
// The app under test reads and writes the same database.
import postgres from "postgres";

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

// Empties the database and adds contacts that have only a name
export async function resetDatabase({ contacts }: { contacts: string[] }) {
  await withDatabase(async (sql) => {
    // Notes and group memberships go with them (cascade)
    await sql`truncate contacts, groups restart identity cascade`;
    if (contacts.length > 0) {
      await sql`insert into contacts ${sql(contacts.map((name) => ({ name })))}`;
    }
  });
}
