// Runs before every test file: points the app's database module at the
// test database and empties the tables before each test.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, inject, vi } from "vitest";

import { assertTestDatabase } from "./test-database";

// connection() only tells Next.js not to prerender and throws outside a
// request; the queries themselves still go to the real test database
vi.mock("next/server", () => ({ connection: async () => {} }));

// Read by src/db/connection-url.ts, so it must be set before @/db loads
process.env.DATABASE_URL = inject("testDatabaseUrl");

const { db } = await import("@/db");

beforeAll(async () => {
  const [{ name }] = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  assertTestDatabase(name);
});

beforeEach(async () => {
  // Notes and group memberships go with them (cascade)
  await db.execute(sql`truncate contacts, groups restart identity cascade`);
});

afterAll(async () => {
  await db.$client.end();
  // src/db/index.ts keeps the pool on globalThis outside production
  delete (globalThis as { pgClient?: unknown }).pgClient;
});
