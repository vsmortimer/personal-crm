import { sql } from "drizzle-orm";
import { expect, test } from "vitest";

import { db } from "@/db";

test("the test database has an empty contacts table", async () => {
  const [row] = await db.execute<{ database: string; contacts: number }>(
    sql`select current_database() as database, (select count(*) from contacts)::int as contacts`,
  );

  expect(row.database).toMatch(/_test$/);
  expect(row.contacts).toBe(0);
});
