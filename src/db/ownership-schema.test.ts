// Whose contacts and groups they are: the database itself does not allow a
// contact or a group without an owner (data-ownership)
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { contacts, groups } from "@/db/schema";
import {
  FOREIGN_KEY_VIOLATION,
  NOT_NULL_VIOLATION,
  UNIQUE_VIOLATION,
  failureCode,
} from "../../test/helpers";

async function insertUserRow(email: string) {
  const id = `id-${email}`;
  await db.execute(sql`
    insert into users (id, name, email, email_verified, created_at, updated_at)
    values (${id}, '', ${email}, true, now(), now())`);
  return id;
}

describe("the owner of a contact", () => {
  test("a contact without an owner is not allowed", async () => {
    expect(
      await failureCode(
        db.execute(sql`insert into contacts (name) values ('Анна Смирнова')`),
      ),
    ).toBe(NOT_NULL_VIOLATION);
  });

  test("a contact of a user who does not exist is not allowed", async () => {
    expect(
      await failureCode(
        db.insert(contacts).values({ name: "Анна Смирнова", userId: "nobody" }),
      ),
    ).toBe(FOREIGN_KEY_VIOLATION);
  });

  test("a user who has contacts cannot be deleted", async () => {
    const anna = await insertUserRow("anna@mail.ru");
    await db.insert(contacts).values({ name: "Иван Петров", userId: anna });

    expect(
      await failureCode(db.execute(sql`delete from users where id = ${anna}`)),
    ).toBe(FOREIGN_KEY_VIOLATION);
    expect(await db.select().from(contacts)).toHaveLength(1);
  });
});

describe("the owner of a group", () => {
  test("a group without an owner is not allowed", async () => {
    expect(
      await failureCode(
        db.execute(sql`insert into groups (name) values ('Друзья')`),
      ),
    ).toBe(NOT_NULL_VIOLATION);
  });

  test("a user who has groups cannot be deleted", async () => {
    const anna = await insertUserRow("anna@mail.ru");
    await db.insert(groups).values({ name: "Друзья", userId: anna });

    expect(
      await failureCode(db.execute(sql`delete from users where id = ${anna}`)),
    ).toBe(FOREIGN_KEY_VIOLATION);
  });

  // Scenario: «Своя группа у каждого»
  test("two users can both have a group «Друзья»", async () => {
    const anna = await insertUserRow("anna@mail.ru");
    const boris = await insertUserRow("boris@mail.ru");

    await db.insert(groups).values({ name: "Друзья", userId: anna });
    await db.insert(groups).values({ name: "Друзья", userId: boris });

    expect(await db.select().from(groups)).toHaveLength(2);
  });

  test("one user cannot have «Друзья» and «друзья»", async () => {
    const anna = await insertUserRow("anna@mail.ru");
    await db.insert(groups).values({ name: "Друзья", userId: anna });

    expect(
      await failureCode(
        db.insert(groups).values({ name: "друзья", userId: anna }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });
});
