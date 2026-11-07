// Renaming and deleting a group (the buttons above the list)
import { describe, expect, test, beforeEach } from "vitest";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  deleteGroup,
  listContactGroups,
  listGroups,
  renameGroup,
} from "@/lib/groups";
import {
  addToGroup,
  insertContact,
  insertGroup,
  insertNote,
  insertUser,
} from "../../test/helpers";

// The person whose contacts and groups the tests work with
let owner: string;

beforeEach(async () => {
  owner = await insertUser("owner@mail.ru");
});

async function groupNames() {
  return (await listGroups(owner)).map((group) => group.name);
}

describe("renameGroup", () => {
  // Scenario: «Исправил опечатку»
  test("the group gets the new name and keeps its people", async () => {
    const tennis = await insertGroup(owner, "Тенис");
    const anna = await insertContact(owner, "Анна Смирнова");
    const ivan = await insertContact(owner, "Иван Петров");
    await addToGroup(anna, tennis);
    await addToGroup(ivan, tennis);

    expect(await renameGroup(owner, tennis, "Теннис")).toEqual({
      status: "renamed",
      name: "Теннис",
    });

    expect(await listGroups(owner)).toEqual([
      { id: tennis, name: "Теннис", contactCount: 2 },
    ]);
    expect(await listContactGroups(owner, ivan)).toEqual([
      { id: tennis, name: "Теннис" },
    ]);
  });

  // Scenario: «Название уже занято»
  test("the name of another group in any letter case is refused", async () => {
    await insertGroup(owner, "Друзья");
    const tennis = await insertGroup(owner, "Теннис");

    expect(await renameGroup(owner, tennis, "друзья")).toEqual({
      status: "invalid",
      error: "Группа «Друзья» уже есть",
    });
    expect(await groupNames()).toEqual(["Друзья", "Теннис"]);
  });

  // Scenario: «Пустое название»
  test.each(["", "   "])("an empty name (%j) is refused", async (name) => {
    const tennis = await insertGroup(owner, "Теннис");

    expect(await renameGroup(owner, tennis, name)).toEqual({
      status: "invalid",
      error: "Укажите название группы",
    });
    expect(await groupNames()).toEqual(["Теннис"]);
  });

  test("a name of 51 characters is refused, as in the contact form", async () => {
    const tennis = await insertGroup(owner, "Теннис");

    expect(await renameGroup(owner, tennis, "я".repeat(51))).toEqual({
      status: "invalid",
      error: "Слишком длинно: не больше 50 символов",
    });
  });

  // Scenario: «Сменил только регистр»
  test("changing only the letter case is allowed", async () => {
    const tennis = await insertGroup(owner, "теннис");

    expect(await renameGroup(owner, tennis, "Теннис")).toEqual({
      status: "renamed",
      name: "Теннис",
    });
    expect(await groupNames()).toEqual(["Теннис"]);
  });

  test("spaces around the new name are removed", async () => {
    const tennis = await insertGroup(owner, "Тенис");

    await renameGroup(owner, tennis, "  Теннис  ");

    expect(await groupNames()).toEqual(["Теннис"]);
  });

  test("a group deleted meanwhile is reported as missing", async () => {
    expect(await renameGroup(owner, 999, "Теннис")).toEqual({
      status: "missing",
    });
  });
});

describe("deleteGroup", () => {
  // Scenario: «Удалил группу»
  test("removes the group but keeps its contacts, their notes and other groups", async () => {
    const tennis = await insertGroup(owner, "Теннис");
    const friends = await insertGroup(owner, "Друзья");
    const ivan = await insertContact(owner, "Иван Петров");
    await insertNote(ivan, "Зовёт играть в теннис по субботам");
    await addToGroup(ivan, tennis);
    await addToGroup(ivan, friends);

    // The name comes back for «Группа «Теннис» удалена.»
    expect(await deleteGroup(owner, tennis)).toBe("Теннис");

    expect(await groupNames()).toEqual(["Друзья"]);
    expect(await db.select({ name: contacts.name }).from(contacts)).toEqual([
      { name: "Иван Петров" },
    ]);
    expect(await db.select({ body: notes.body }).from(notes)).toEqual([
      { body: "Зовёт играть в теннис по субботам" },
    ]);
    expect(await listContactGroups(owner, ivan)).toEqual([
      { id: friends, name: "Друзья" },
    ]);
  });

  // Scenario: «Удалил последнюю группу»: no groups means no filter
  test("deleting the only group leaves no groups", async () => {
    const tennis = await insertGroup(owner, "Теннис");

    await deleteGroup(owner, tennis);

    expect(await listGroups(owner)).toEqual([]);
  });

  test("a group that is already gone gives null", async () => {
    const tennis = await insertGroup(owner, "Теннис");
    await deleteGroup(owner, tennis);

    expect(await deleteGroup(owner, tennis)).toBeNull();
  });
});
