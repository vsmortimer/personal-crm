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

// Sign-in settings of the tests. The emails go to Mailpit and nowhere else:
// a test never sends a real email, whatever the .env says
process.env.SMTP_URL ||= "smtp://127.0.0.1:1025";
if (!/^smtp:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(process.env.SMTP_URL)) {
  throw new Error(
    `Refusing to run: SMTP_URL must point to Mailpit on this computer in tests, got "${process.env.SMTP_URL}"`,
  );
}
process.env.BETTER_AUTH_SECRET ||= "Hs8Lw3Nq7Vb2Tk9Xc4Rj6Mf5Pd1Yg0Ae";
process.env.BETTER_AUTH_URL ||= "http://127.0.0.1:3000";
process.env.MAIL_FROM ||= "Личная CRM <noreply@mail.crm.app.example-crm.site>";

const { db } = await import("@/db");

beforeAll(async () => {
  const [{ name }] = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  assertTestDatabase(name);
});

beforeEach(async () => {
  // Notes and group memberships go with them (cascade), so do sessions and
  // accounts with the users
  await db.execute(
    sql`truncate contacts, groups, users, verifications, login_link_requests restart identity cascade`,
  );
});

afterAll(async () => {
  await db.$client.end();
  // src/db/index.ts keeps the pool on globalThis outside production
  delete (globalThis as { pgClient?: unknown }).pgClient;
});
