// Renaming and deleting a group (the buttons above the list)
import { describe, expect, test } from "vitest";

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
} from "../../test/helpers";

async function groupNames() {
  return (await listGroups()).map((group) => group.name);
}

describe("renameGroup", () => {
  // Scenario: «Исправил опечатку»
  test("the group gets the new name and keeps its people", async () => {
    const tennis = await insertGroup("Тенис");
    const anna = await insertContact("Анна Смирнова");
    const ivan = await insertContact("Иван Петров");
    await addToGroup(anna, tennis);
    await addToGroup(ivan, tennis);

    expect(await renameGroup(tennis, "Теннис")).toEqual({
      status: "renamed",
      name: "Теннис",
    });

    expect(await listGroups()).toEqual([
      { id: tennis, name: "Теннис", contactCount: 2 },
    ]);
    expect(await listContactGroups(ivan)).toEqual([
      { id: tennis, name: "Теннис" },
    ]);
  });

  // Scenario: «Название уже занято»
  test("the name of another group in any letter case is refused", async () => {
    await insertGroup("Друзья");
    const tennis = await insertGroup("Теннис");

    expect(await renameGroup(tennis, "друзья")).toEqual({
      status: "invalid",
      error: "Группа «Друзья» уже есть",
    });
    expect(await groupNames()).toEqual(["Друзья", "Теннис"]);
  });

  // Scenario: «Пустое название»
  test.each(["", "   "])("an empty name (%j) is refused", async (name) => {
    const tennis = await insertGroup("Теннис");

    expect(await renameGroup(tennis, name)).toEqual({
      status: "invalid",
      error: "Укажите название группы",
    });
    expect(await groupNames()).toEqual(["Теннис"]);
  });

  test("a name of 51 characters is refused, as in the contact form", async () => {
    const tennis = await insertGroup("Теннис");

    expect(await renameGroup(tennis, "я".repeat(51))).toEqual({
      status: "invalid",
      error: "Слишком длинно: не больше 50 символов",
    });
  });

  // Scenario: «Сменил только регистр»
  test("changing only the letter case is allowed", async () => {
    const tennis = await insertGroup("теннис");

    expect(await renameGroup(tennis, "Теннис")).toEqual({
      status: "renamed",
      name: "Теннис",
    });
    expect(await groupNames()).toEqual(["Теннис"]);
  });

  test("spaces around the new name are removed", async () => {
    const tennis = await insertGroup("Тенис");

    await renameGroup(tennis, "  Теннис  ");

    expect(await groupNames()).toEqual(["Теннис"]);
  });

  test("a group deleted meanwhile is reported as missing", async () => {
    expect(await renameGroup(999, "Теннис")).toEqual({ status: "missing" });
  });
});

describe("deleteGroup", () => {
  // Scenario: «Удалил группу»
  test("removes the group but keeps its contacts, their notes and other groups", async () => {
    const tennis = await insertGroup("Теннис");
    const friends = await insertGroup("Друзья");
    const ivan = await insertContact("Иван Петров");
    await insertNote(ivan, "Зовёт играть в теннис по субботам");
    await addToGroup(ivan, tennis);
    await addToGroup(ivan, friends);

    // The name comes back for «Группа «Теннис» удалена.»
    expect(await deleteGroup(tennis)).toBe("Теннис");

    expect(await groupNames()).toEqual(["Друзья"]);
    expect(await db.select({ name: contacts.name }).from(contacts)).toEqual([
      { name: "Иван Петров" },
    ]);
    expect(await db.select({ body: notes.body }).from(notes)).toEqual([
      { body: "Зовёт играть в теннис по субботам" },
    ]);
    expect(await listContactGroups(ivan)).toEqual([
      { id: friends, name: "Друзья" },
    ]);
  });

  // Scenario: «Удалил последнюю группу»: no groups means no filter
  test("deleting the only group leaves no groups", async () => {
    const tennis = await insertGroup("Теннис");

    await deleteGroup(tennis);

    expect(await listGroups()).toEqual([]);
  });

  test("a group that is already gone gives null", async () => {
    const tennis = await insertGroup("Теннис");
    await deleteGroup(tennis);

    expect(await deleteGroup(tennis)).toBeNull();
  });
});
