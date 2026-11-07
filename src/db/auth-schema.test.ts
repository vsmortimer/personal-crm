// The tables Better Auth keeps people and their sign-ins in, and the table
// that counts the sign-in emails sent to an address
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { UNIQUE_VIOLATION, failureCode } from "../../test/helpers";

async function tableNames() {
  const rows = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public'`,
  );
  return rows.map((row) => row.table_name);
}

function insertUserRow(email: string) {
  return db.execute(sql`
    insert into users (id, name, email, email_verified, created_at, updated_at)
    values (${`id-${email}`}, '', ${email}, true, now(), now())`);
}

describe("sign-in tables", () => {
  test("the database has the tables of Better Auth and of the email limit", async () => {
    expect(await tableNames()).toEqual(
      expect.arrayContaining([
        "users",
        "sessions",
        "accounts",
        "verifications",
        "login_link_requests",
      ]),
    );
  });

  test("two users with the same email are not allowed", async () => {
    await insertUserRow("anna@mail.ru");

    expect(await failureCode(insertUserRow("anna@mail.ru"))).toBe(
      UNIQUE_VIOLATION,
    );
  });

  test("deleting a user ends the sign-ins of that user", async () => {
    await insertUserRow("anna@mail.ru");
    await db.execute(sql`
      insert into sessions (id, expires_at, token, created_at, updated_at, user_id)
      values ('session-1', now() + interval '30 days', 'token-1', now(), now(), 'id-anna@mail.ru')`);

    await db.execute(sql`delete from users`);

    const [{ sessions }] = await db.execute<{ sessions: number }>(
      sql`select count(*)::int as sessions from sessions`,
    );
    expect(sessions).toBe(0);
  });
});
