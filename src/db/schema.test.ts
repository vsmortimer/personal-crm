import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import {
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
  failureCode,
  insertContact,
  insertGroup,
  insertNote,
} from "../../test/helpers";

describe("groups table", () => {
  test("two groups that differ only in letter case are not allowed", async () => {
    await insertGroup("Теннис");

    expect(await failureCode(insertGroup("теннис"))).toBe(UNIQUE_VIOLATION);
  });

  test("a name longer than 50 characters is not allowed", async () => {
    await insertGroup("я".repeat(50));

    expect(await failureCode(insertGroup("я".repeat(51)))).toBe(CHECK_VIOLATION);
  });

  test("an empty name is not allowed", async () => {
    expect(await failureCode(insertGroup(""))).toBe(CHECK_VIOLATION);
  });
});

describe("contact_groups table", () => {
  // Scenario: «Удалил последний контакт группы»
  test("deleting a contact removes its memberships but keeps the group", async () => {
    const anna = await insertContact("Анна Смирнова");
    const tennis = await insertGroup("Теннис");
    await db.insert(contactGroups).values({ contactId: anna, groupId: tennis });

    await db.delete(contacts).where(eq(contacts.id, anna));

    expect(await db.select().from(contactGroups)).toEqual([]);
    expect(await db.select({ name: groups.name }).from(groups)).toEqual([
      { name: "Теннис" },
    ]);
  });

  test("deleting a group keeps its contacts, their notes and other memberships", async () => {
    const ivan = await insertContact("Иван Петров");
    await insertNote(ivan, "Зовёт играть в теннис по субботам");
    const tennis = await insertGroup("Теннис");
    const friends = await insertGroup("Друзья");
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
        .select({ contactId: contactGroups.contactId, groupId: contactGroups.groupId })
        .from(contactGroups),
    ).toEqual([{ contactId: ivan, groupId: friends }]);
  });

  test("a contact is in a group at most once", async () => {
    const anna = await insertContact("Анна Смирнова");
    const tennis = await insertGroup("Теннис");
    await db.insert(contactGroups).values({ contactId: anna, groupId: tennis });

    expect(
      await failureCode(
        db.insert(contactGroups).values({ contactId: anna, groupId: tennis }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });
});
