// Scenario «Заполнил пустую базу демо-данными» (data-ownership): the demo
// data goes to the user with the address of OWNER_EMAIL and to nobody else
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";
import { seedDemoData } from "@/db/seed-demo";
import { listBirthdayContacts } from "@/lib/contacts";
import { insertContact, insertUser } from "../../test/helpers";

async function countsOf(userId: string) {
  const ownContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.userId, userId));
  const ownGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.userId, userId));
  return { contacts: ownContacts.length, groups: ownGroups.length };
}

async function totals() {
  return {
    contacts: (await db.select().from(contacts)).length,
    notes: (await db.select().from(notes)).length,
    groups: (await db.select().from(groups)).length,
    memberships: (await db.select().from(contactGroups)).length,
  };
}

describe("seedDemoData", () => {
  test("creates contacts, notes and groups for the owner and for nobody else", async () => {
    const friend = await insertUser("friend@mail.ru");

    const result = await seedDemoData(db, "owner@mail.ru");

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.email, "owner@mail.ru"));
    expect(owner).toBeDefined();
    expect(result.seeded).toBe(true);
    const own = await countsOf(owner.id);
    expect(own.contacts).toBeGreaterThan(100);
    expect(own.groups).toBeGreaterThan(0);
    const all = await totals();
    expect(all.contacts).toBe(own.contacts);
    expect(all.groups).toBe(own.groups);
    expect(all.notes).toBeGreaterThan(0);
    expect(all.memberships).toBeGreaterThan(0);
    expect(await countsOf(friend)).toEqual({ contacts: 0, groups: 0 });
  });

  test("some contacts have a birthday soon, so the home page block has people", async () => {
    await seedDemoData(db, "owner@mail.ru");
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "owner@mail.ru"));

    const soon = await listBirthdayContacts(owner.id);

    expect(soon.length).toBeGreaterThanOrEqual(5);
  });

  test("a second run adds nothing", async () => {
    await seedDemoData(db, "owner@mail.ru");
    const before = await totals();

    const result = await seedDemoData(db, "owner@mail.ru");

    expect(result.seeded).toBe(false);
    expect(await totals()).toEqual(before);
  });

  test("gives the same data every run", async () => {
    await seedDemoData(db, "owner@mail.ru");
    const first = (await db.select({ name: contacts.name }).from(contacts))
      .map((contact) => contact.name)
      .sort();
    await db.delete(contacts);
    await db.delete(groups);

    await seedDemoData(db, "owner@mail.ru");

    const second = (await db.select({ name: contacts.name }).from(contacts))
      .map((contact) => contact.name)
      .sort();
    expect(second).toEqual(first);
  });

  test("contacts of other users do not get in the way", async () => {
    const friend = await insertUser("friend@mail.ru");
    await insertContact(friend, "Анна Смирнова");

    const result = await seedDemoData(db, "owner@mail.ru");

    expect(result.seeded).toBe(true);
    expect(await countsOf(friend)).toEqual({ contacts: 1, groups: 0 });
  });

  test("a user who signed in before is the owner, not a second one", async () => {
    const earlier = await insertUser("owner@mail.ru");

    await seedDemoData(db, "  Owner@Mail.RU ");

    expect(await db.select().from(users)).toHaveLength(1);
    expect((await countsOf(earlier)).contacts).toBeGreaterThan(100);
  });

  test("an address that is not an address is refused", async () => {
    await expect(seedDemoData(db, "owner@")).rejects.toThrow(/OWNER_EMAIL/);

    expect(await totals()).toEqual({
      contacts: 0,
      notes: 0,
      groups: 0,
      memberships: 0,
    });
  });
});
