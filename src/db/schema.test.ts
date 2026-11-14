import { eq } from "drizzle-orm";
import { describe, expect, test, beforeEach } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import {
  CHECK_VIOLATION,
  failureCode,
  insertContact,
  insertGroup,
  insertNote,
  insertUser,
  UNIQUE_VIOLATION,
  type Birth,
} from "../../test/helpers";

// The person whose contacts and groups the tests work with
let owner: string;

beforeEach(async () => {
  owner = await insertUser("owner@mail.ru");
});

describe("groups table", () => {
  test("two groups that differ only in letter case are not allowed", async () => {
    await insertGroup(owner, "Теннис");

    expect(await failureCode(insertGroup(owner, "теннис"))).toBe(
      UNIQUE_VIOLATION,
    );
  });

  test("a name longer than 50 characters is not allowed", async () => {
    await insertGroup(owner, "я".repeat(50));

    expect(await failureCode(insertGroup(owner, "я".repeat(51)))).toBe(
      CHECK_VIOLATION,
    );
  });

  test("an empty name is not allowed", async () => {
    expect(await failureCode(insertGroup(owner, ""))).toBe(CHECK_VIOLATION);
  });
});

describe("contacts table: birth date", () => {
  const anna = (birth: Birth) =>
    insertContact(owner, "Анна Смирнова", { birth });

  test.each([
    ["only a month, no day", { birthDay: null, birthMonth: 11 }],
    ["only a day, no month", { birthDay: 21, birthMonth: null }],
    [
      "a year without a day and a month",
      { birthDay: null, birthMonth: null, birthYear: 1990 },
    ],
    ["month 13", { birthDay: 1, birthMonth: 13 }],
    ["month 0", { birthDay: 1, birthMonth: 0 }],
    ["day 32", { birthDay: 32, birthMonth: 1 }],
    ["day 0", { birthDay: 0, birthMonth: 1 }],
    ["April 31", { birthDay: 31, birthMonth: 4 }],
    ["February 30", { birthDay: 30, birthMonth: 2 }],
    ["year 1850", { birthDay: 5, birthMonth: 3, birthYear: 1850 }],
    ["year 2201", { birthDay: 5, birthMonth: 3, birthYear: 2201 }],
  ] satisfies [string, Birth][])("%s is not allowed", async (_name, birth) => {
    expect(await failureCode(anna(birth))).toBe(CHECK_VIOLATION);
  });

  test.each([
    ["no date at all", { birthDay: null, birthMonth: null }],
    ["a day and a month", { birthDay: 21, birthMonth: 11 }],
    ["February 29, the year is not checked", { birthDay: 29, birthMonth: 2 }],
    [
      "a day, a month and a year",
      { birthDay: 5, birthMonth: 3, birthYear: 1990 },
    ],
    ["the first year", { birthDay: 1, birthMonth: 1, birthYear: 1900 }],
  ] satisfies [string, Birth][])("%s is allowed", async (_name, birth) => {
    const id = await anna(birth);

    const [saved] = await db
      .select({
        birthDay: contacts.birthDay,
        birthMonth: contacts.birthMonth,
        birthYear: contacts.birthYear,
      })
      .from(contacts)
      .where(eq(contacts.id, id));
    expect(saved).toEqual({ birthYear: null, ...birth });
  });
});

describe("contact_groups table", () => {
  // Scenario: «Удалил последний контакт группы»
  test("deleting a contact removes its memberships but keeps the group", async () => {
    const anna = await insertContact(owner, "Анна Смирнова");
    const tennis = await insertGroup(owner, "Теннис");
    await db.insert(contactGroups).values({ contactId: anna, groupId: tennis });

    await db.delete(contacts).where(eq(contacts.id, anna));

    expect(await db.select().from(contactGroups)).toEqual([]);
    expect(await db.select({ name: groups.name }).from(groups)).toEqual([
      { name: "Теннис" },
    ]);
  });

  test("deleting a group keeps its contacts, their notes and other memberships", async () => {
    const ivan = await insertContact(owner, "Иван Петров");
    await insertNote(ivan, "Зовёт играть в теннис по субботам");
    const tennis = await insertGroup(owner, "Теннис");
    const friends = await insertGroup(owner, "Друзья");
    await db.insert(contactGroups).values([
      { contactId: ivan, groupId: tennis },
      { contactId: ivan, groupId: friends },
    ]);

    await db.delete(groups).where(eq(groups.id, tennis));

    expect(await db.select({ name: contacts.name }).from(contacts)).toEqual([
      { name: "Иван Петров" },
    ]);
    expect(await db.select({ body: notes.body }).from(notes)).toEqual([
      { body: "Зовёт играть в теннис по субботам" },
    ]);
    expect(
      await db
        .select({
          contactId: contactGroups.contactId,
          groupId: contactGroups.groupId,
        })
        .from(contactGroups),
    ).toEqual([{ contactId: ivan, groupId: friends }]);
  });

  test("a contact is in a group at most once", async () => {
    const anna = await insertContact(owner, "Анна Смирнова");
    const tennis = await insertGroup(owner, "Теннис");
    await db.insert(contactGroups).values({ contactId: anna, groupId: tennis });

    expect(
      await failureCode(
        db.insert(contactGroups).values({ contactId: anna, groupId: tennis }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });
});
