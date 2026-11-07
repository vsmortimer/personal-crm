// Saving a contact together with its groups (createContact / updateContact)
// and reading the groups back (listGroups / listContactGroups)
import { describe, expect, test } from "vitest";

import { createContact, updateContact, type ContactInput } from "@/lib/contacts";
import { addGroup } from "@/lib/group-form";
import { listContactGroups, listGroups } from "@/lib/groups";
import { addToGroup, insertContact, insertGroup } from "../../test/helpers";

function contact(name: string): ContactInput {
  return {
    name,
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    contactFrequency: null,
  };
}

const noGroups = { groupIds: [], newGroups: [] };

async function groupNames(contactId: number) {
  return (await listContactGroups(contactId)).map((group) => group.name);
}

describe("listGroups", () => {
  // Scenario: «Групп ещё нет»
  test("is empty when there are no groups yet", async () => {
    expect(await listGroups()).toEqual([]);
  });

  test("lists the groups in alphabetical order with how many people are in each", async () => {
    const tennis = await insertGroup("Теннис");
    const friends = await insertGroup("друзья");
    const analysts = await insertGroup("Аналитики");
    const anna = await insertContact("Анна Смирнова");
    const ivan = await insertContact("Иван Петров");
    await addToGroup(anna, tennis);
    await addToGroup(ivan, tennis);
    await addToGroup(ivan, friends);

    expect(await listGroups()).toEqual([
      { id: analysts, name: "Аналитики", contactCount: 0 },
      { id: friends, name: "друзья", contactCount: 1 },
      { id: tennis, name: "Теннис", contactCount: 2 },
    ]);
  });
});

describe("createContact with groups", () => {
  // Scenario: «Новый контакт в группе»
  test("puts the new contact into the checked group", async () => {
    await insertGroup("Семья");
    const tennis = await insertGroup("Теннис");

    const anna = await createContact(contact("Анна Смирнова"), {
      groupIds: [tennis],
      newGroups: [],
    });

    expect(await groupNames(anna)).toEqual(["Теннис"]);
  });

  // Scenario: «Несколько групп»
  test("puts the new contact into every checked group", async () => {
    const tennis = await insertGroup("Теннис");
    const friends = await insertGroup("Друзья");

    const anna = await createContact(contact("Анна Смирнова"), {
      groupIds: [tennis, friends],
      newGroups: [],
    });

    expect(await groupNames(anna)).toEqual(["Друзья", "Теннис"]);
  });

  // Scenario: «Без групп»
  test("saves a contact without groups", async () => {
    await insertGroup("Теннис");

    const anna = await createContact(contact("Анна Смирнова"), noGroups);

    expect(await listContactGroups(anna)).toEqual([]);
  });

  // Scenario: «Новая группа»
  test("creates a checked new group when the contact is saved", async () => {
    const anna = await createContact(contact("Анна Смирнова"), {
      groupIds: [],
      newGroups: ["Аналитики"],
    });

    expect(await groupNames(anna)).toEqual(["Аналитики"]);
    expect(await listGroups()).toEqual([
      { id: expect.any(Number), name: "Аналитики", contactCount: 1 },
    ]);
  });

  test("an existing group and a new one together", async () => {
    const tennis = await insertGroup("Теннис");

    const anna = await createContact(contact("Анна Смирнова"), {
      groupIds: [tennis],
      newGroups: ["Аналитики"],
    });

    expect(await groupNames(anna)).toEqual(["Аналитики", "Теннис"]);
  });

  // Scenario: «Такая группа уже есть»: e.g. created in another tab meanwhile
  test("a new name that matches an existing group in another case uses that group", async () => {
    const tennis = await insertGroup("Теннис");

    const anna = await createContact(contact("Анна Смирнова"), {
      groupIds: [],
      newGroups: ["теннис"],
    });

    expect(await listContactGroups(anna)).toEqual([{ id: tennis, name: "Теннис" }]);
    expect(await listGroups()).toEqual([
      { id: tennis, name: "Теннис", contactCount: 1 },
    ]);
  });

  test("a group checked in the form but deleted meanwhile is skipped", async () => {
    const tennis = await insertGroup("Теннис");

    const anna = await createContact(contact("Анна Смирнова"), {
      groupIds: [tennis, 999],
      newGroups: [],
    });

    expect(await groupNames(anna)).toEqual(["Теннис"]);
  });

  // Scenario: «Передумал сохранять»
  test("a new group typed into the form is not created until the contact is saved", async () => {
    const result = addGroup([], { checkedIds: [], newGroups: [] }, "Аналитики");
    expect(result.ok).toBe(true);

    expect(await listGroups()).toEqual([]);
  });
});

describe("updateContact with groups", () => {
  // Scenario: «Смена групп»
  test("the contact ends up in exactly the checked groups", async () => {
    const tennis = await insertGroup("Теннис");
    const family = await insertGroup("Семья");
    const anna = await insertContact("Анна Смирнова");
    await addToGroup(anna, tennis);

    // The edit form shows «Теннис» checked
    expect(await groupNames(anna)).toEqual(["Теннис"]);

    expect(
      await updateContact(anna, contact("Анна Смирнова"), {
        groupIds: [family],
        newGroups: [],
      }),
    ).toBe(true);

    expect(await groupNames(anna)).toEqual(["Семья"]);
  });

  // Scenario: «Убрал последнего человека из группы»
  test("the group stays, empty, when its last person is taken out", async () => {
    const tennis = await insertGroup("Теннис");
    const anna = await insertContact("Анна Смирнова");
    await addToGroup(anna, tennis);

    await updateContact(anna, contact("Анна Смирнова"), noGroups);

    expect(await listContactGroups(anna)).toEqual([]);
    expect(await listGroups()).toEqual([
      { id: tennis, name: "Теннис", contactCount: 0 },
    ]);
  });

  test("other contacts keep their groups", async () => {
    const tennis = await insertGroup("Теннис");
    const anna = await insertContact("Анна Смирнова");
    const ivan = await insertContact("Иван Петров");
    await addToGroup(anna, tennis);
    await addToGroup(ivan, tennis);

    await updateContact(anna, contact("Анна Смирнова"), noGroups);

    expect(await groupNames(ivan)).toEqual(["Теннис"]);
  });

  test("a missing contact changes nothing, not even new groups", async () => {
    expect(
      await updateContact(999, contact("Анна Смирнова"), {
        groupIds: [],
        newGroups: ["Аналитики"],
      }),
    ).toBe(false);

    expect(await listGroups()).toEqual([]);
  });
});

describe("listContactGroups (the contact card)", () => {
  // Scenario: «Контакт в группах»
  test("gives the contact's groups in alphabetical order", async () => {
    const tennis = await insertGroup("Теннис");
    const friends = await insertGroup("Друзья");
    await insertGroup("Семья");
    const ivan = await insertContact("Иван Петров");
    await addToGroup(ivan, tennis);
    await addToGroup(ivan, friends);

    expect(await listContactGroups(ivan)).toEqual([
      { id: friends, name: "Друзья" },
      { id: tennis, name: "Теннис" },
    ]);
  });

  // Scenario: «Контакт без групп»
  test("is empty for a contact without groups", async () => {
    const tennis = await insertGroup("Теннис");
    const anna = await insertContact("Анна Смирнова");
    const ivan = await insertContact("Иван Петров");
    await addToGroup(anna, tennis);

    expect(await listContactGroups(ivan)).toEqual([]);
  });
});
