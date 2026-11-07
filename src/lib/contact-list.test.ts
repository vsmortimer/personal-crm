// The home page list with groups: group names in rows, the group filter
// (?group=<id>) and the search inside a group
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { listContacts, listDueContacts } from "@/lib/contacts";
import { listGroups, selectedGroup } from "@/lib/groups";
import { addToGroup, insertContact, insertGroup } from "../../test/helpers";

async function listNames(query: string, groupId: number | null = null) {
  const { contacts } = await listContacts(query, groupId);
  return contacts.map((contact) => contact.listName);
}

describe("groups in the list rows", () => {
  // Scenario: «Контакт в двух группах»
  test("a row has the contact's groups in alphabetical order", async () => {
    const tennis = await insertGroup("Теннис");
    const friends = await insertGroup("Друзья");
    const ivan = await insertContact("Иван Петров");
    await addToGroup(ivan, tennis);
    await addToGroup(ivan, friends);

    const { contacts } = await listContacts("");

    expect(contacts).toEqual([
      expect.objectContaining({ listName: "Петров Иван", groups: ["Друзья", "Теннис"] }),
    ]);
  });

  // Scenario: «Контакт без групп»
  test("a contact without groups has none in its row", async () => {
    await insertGroup("Теннис");
    await insertContact("Анна Смирнова");

    const { contacts } = await listContacts("");

    expect(contacts).toEqual([expect.objectContaining({ groups: [] })]);
  });
});

describe("the group filter", () => {
  // Анна Смирнова and Иван Петров play tennis, Иван is also a friend,
  // Мама is family, Олег Сидоров is in no group
  async function people() {
    const tennis = await insertGroup("Теннис");
    const friends = await insertGroup("Друзья");
    const family = await insertGroup("Семья");
    const anna = await insertContact("Анна Смирнова");
    const ivan = await insertContact("Иван Петров");
    const mom = await insertContact("Мама");
    await insertContact("Олег Сидоров");
    await addToGroup(anna, tennis);
    await addToGroup(ivan, tennis);
    await addToGroup(ivan, friends);
    await addToGroup(mom, family);
    return { tennis, friends, family };
  }

  // Scenario: «Выбрал группу»
  test("a selected group leaves only its contacts, in the usual order", async () => {
    const { tennis } = await people();

    expect(await listNames("", tennis)).toEqual(["Петров Иван", "Смирнова Анна"]);
  });

  // Scenario: «Другая группа»
  test("another group shows its own contacts", async () => {
    const { family } = await people();

    expect(await listNames("", family)).toEqual(["Мама"]);
  });

  // Scenario: «Снова все»
  test("no group shows everyone", async () => {
    await people();

    expect(await listNames("", null)).toEqual([
      "Мама",
      "Петров Иван",
      "Сидоров Олег",
      "Смирнова Анна",
    ]);
  });

  // Scenario: «Контакт в нескольких группах»
  test("a contact in two groups is in both lists", async () => {
    const { tennis, friends } = await people();

    expect(await listNames("", tennis)).toContain("Петров Иван");
    expect(await listNames("", friends)).toEqual(["Петров Иван"]);
  });

  test("the total without a group counts everyone", async () => {
    await people();

    expect((await listContacts("", null)).total).toBe(4);
  });
});

describe("search inside a group", () => {
  // «Теннис» has 5 people, two of them Анна; one more Анна is not in it
  async function tennisClub() {
    const tennis = await insertGroup("Теннис");
    for (const name of [
      "Анна Смирнова",
      "Анна Белова",
      "Иван Петров",
      "Олег Сидоров",
      "Пётр Котов",
    ]) {
      await addToGroup(await insertContact(name), tennis);
    }
    await insertContact("Анна Ким");
    return tennis;
  }

  // Scenarios: «Поиск в группе», «Группа при введённом поиске»
  test("finds only the group's contacts and counts from the group", async () => {
    const tennis = await tennisClub();

    const { contacts, total } = await listContacts("Анна", tennis);

    expect(contacts.map((contact) => contact.listName)).toEqual([
      "Белова Анна",
      "Смирнова Анна",
    ]);
    // «Найдено: 2 из 5»
    expect(total).toBe(5);
  });

  // Scenario: «Никого не нашлось в группе»
  test("nothing found in a group that has people", async () => {
    const tennis = await tennisClub();

    const { contacts, total } = await listContacts("Ким", tennis);

    expect(contacts).toEqual([]);
    expect(total).toBe(5);
  });
});

describe("the selected group above the list", () => {
  // Scenarios: «Группа с людьми», «Пустая группа»
  test("the number of people: 5 in a full group, 0 in an empty one", async () => {
    const tennis = await insertGroup("Теннис");
    const analysts = await insertGroup("Аналитики");
    for (const name of ["Анна Смирнова", "Иван Петров", "Олег Сидоров", "Пётр Котов", "Мама"]) {
      await addToGroup(await insertContact(name), tennis);
    }

    expect(await listGroups()).toEqual([
      { id: analysts, name: "Аналитики", contactCount: 0 },
      { id: tennis, name: "Теннис", contactCount: 5 },
    ]);
    expect(await listContacts("", analysts)).toEqual({ contacts: [], total: 0 });
  });
});

// Scenario: «Фильтр не сбрасывается»: the group lives in the address
describe("selectedGroup", () => {
  const groups = [
    { id: 3, name: "Друзья", contactCount: 1 },
    { id: 7, name: "Теннис", contactCount: 2 },
  ];

  test("?group=<id> selects that group", () => {
    expect(selectedGroup(groups, "7")).toEqual(groups[1]);
  });

  test.each([
    ["no group", undefined],
    ["an unknown group, e.g. deleted in another tab", "999"],
    ["a broken value", "abc"],
    ["an empty value", ""],
    ["a negative number", "-7"],
    ["the parameter twice", ["7", "3"]],
  ])("%s means «Все»", (_, raw) => {
    expect(selectedGroup(groups, raw)).toBeNull();
  });
});

// Scenario: «Выбрал группу при непустом блоке»
test("«Пора связаться» doesn't depend on the selected group", async () => {
  const tennis = await insertGroup("Теннис");
  const friends = await insertGroup("Друзья");
  const anna = await insertContact("Анна Смирнова");
  await addToGroup(anna, tennis);
  // Иван is a friend, due for a weekly catch-up for a month
  const [ivan] = await db
    .insert(contacts)
    .values({
      name: "Иван Петров",
      contactFrequency: "week",
      createdAt: sql`now() - interval '30 days'`,
    })
    .returning({ id: contacts.id });
  await addToGroup(ivan.id, friends);

  // The home page with «Теннис» selected
  expect(selectedGroup(await listGroups(), String(tennis))?.name).toBe("Теннис");
  expect(await listNames("", tennis)).toEqual(["Смирнова Анна"]);

  expect((await listDueContacts()).map((contact) => contact.listName)).toEqual([
    "Петров Иван",
  ]);
});
