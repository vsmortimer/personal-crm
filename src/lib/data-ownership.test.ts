// Everyone sees and changes only their own contacts and groups (data-ownership).
// Two people, A (Анна) and B (Борис), work with one database. The lib
// functions are called with the id of the person, the actions as that person.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  addNoteAction,
  createContactAction,
  deleteContactAction,
  deleteGroupAction,
  renameGroupAction,
  updateContactAction,
} from "@/app/actions";
import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import {
  addNote,
  countNotes,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  listDueContacts,
  listNotes,
  updateContact,
  type ContactInput,
} from "@/lib/contacts";
import {
  deleteGroup,
  listContactGroups,
  listGroups,
  renameGroup,
} from "@/lib/groups";
import { emptyContactValues } from "@/lib/validation";
import {
  addToGroup,
  insertContact,
  insertGroup,
  insertNote,
  insertUser,
} from "../../test/helpers";

// The person the actions work for. Vitest has no request with a cookie, so
// this is set here; nothing else is replaced.
const signedIn = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: signedIn.id }),
}));

// Revalidating the pages needs a running Next.js; there is nothing to refresh here
vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: () => {} }));

const CONTACT_MISSING = "Контакт не найден: возможно, его уже нет в базе.";
const GROUP_MISSING = "Группа не найдена: возможно, её уже нет в базе.";

const DAY = 24 * 60 * 60 * 1000;

let anna: string;
let boris: string;
// Анна's data, which Борис must not see or touch
let annasContact: number;
let annasGroup: number;

function input(name: string): ContactInput {
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

function names(list: { contacts: { name: string }[] }) {
  return list.contacts.map((contact) => contact.name);
}

beforeEach(async () => {
  anna = await insertUser("anna@mail.ru");
  boris = await insertUser("boris@mail.ru");
  annasContact = await insertContact(anna, "Анна Смирнова", {
    contactFrequency: "week",
    createdAt: new Date(Date.now() - 30 * DAY),
  });
  // A month without a catch-up, for a weekly contact: Анна is due
  await insertNote(
    annasContact,
    "Созвонились",
    new Date(Date.now() - 20 * DAY),
  );
  annasGroup = await insertGroup(anna, "Теннис");
  await addToGroup(annasContact, annasGroup);
  signedIn.id = boris;
});

describe("what a person sees", () => {
  // Scenario: «Список и поиск»
  test("Борис does not see Анна's contact in the list, in the search or in the total", async () => {
    expect(names(await listContacts(boris, "", null))).toEqual([]);
    expect(await listContacts(boris, "", null)).toMatchObject({ total: 0 });
    expect(names(await listContacts(boris, "Смирнова", null))).toEqual([]);
    expect(await listContacts(boris, "Смирнова", null)).toMatchObject({
      total: 0,
    });
  });

  // Scenario: «Пора связаться»
  test("Борис has no «Пора связаться» when only Анна has an overdue contact", async () => {
    expect(await listDueContacts(boris)).toEqual([]);
    expect(await listDueContacts(anna)).toHaveLength(1);
  });

  // Scenario: «Группы и фильтр»
  test("Борис has none of Анна's groups, and the filter by her group shows nothing", async () => {
    expect(await listGroups(boris)).toEqual([]);
    expect(await listGroups(anna)).toEqual([
      { id: annasGroup, name: "Теннис", contactCount: 1 },
    ]);
    const inHerGroup = await listContacts(boris, "", annasGroup);
    expect(inHerGroup.contacts).toEqual([]);
    expect(inHerGroup.total).toBe(0);
  });

  // Scenario: «Свои данные на месте»
  test("Анна sees all of her own after Борис worked", async () => {
    const borisContact = await createContact(boris, input("Борис Орлов"), {
      groupIds: [],
      newGroups: ["Работа"],
    });
    await addNote(boris, borisContact, "Заметка Бориса");

    const list = await listContacts(anna, "", null);
    expect(names(list)).toEqual(["Анна Смирнова"]);
    expect(list.total).toBe(1);
    expect(await listNotes(anna, annasContact)).toHaveLength(1);
    expect(await listGroups(anna)).toEqual([
      { id: annasGroup, name: "Теннис", contactCount: 1 },
    ]);
  });

  // Scenario: «Карточка по прямой ссылке»
  test("Анна's card is empty for Борис: no contact, no notes, no groups", async () => {
    expect(await getContact(boris, annasContact)).toBeNull();
    expect(await listNotes(boris, annasContact)).toEqual([]);
    expect(await countNotes(boris, annasContact)).toBe(0);
    expect(await listContactGroups(boris, annasContact)).toEqual([]);

    expect(await getContact(anna, annasContact)).toMatchObject({
      name: "Анна Смирнова",
    });
    expect(await countNotes(anna, annasContact)).toBe(1);
    expect(await listContactGroups(anna, annasContact)).toHaveLength(1);
  });

  // Scenario: «Первый вход»
  test("a person who has just signed in has an empty list, no groups and no «Пора связаться»", async () => {
    const newcomer = await insertUser("vera@mail.ru");

    expect(await listContacts(newcomer, "", null)).toEqual({
      contacts: [],
      total: 0,
    });
    expect(await listGroups(newcomer)).toEqual([]);
    expect(await listDueContacts(newcomer)).toEqual([]);
  });

  // Scenario: «Первый контакт»
  test("a contact of Борис is only Борис's", async () => {
    await createContact(boris, input("Борис Орлов"), noGroups);

    expect(names(await listContacts(boris, "", null))).toEqual(["Борис Орлов"]);
    expect(names(await listContacts(anna, "", null))).toEqual([
      "Анна Смирнова",
    ]);
  });
});

describe("what a person cannot change", () => {
  async function annasDataIsUntouched() {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, annasContact));
    expect(contact).toMatchObject({ name: "Анна Смирнова", userId: anna });
    expect(await db.select().from(notes)).toHaveLength(1);
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, annasGroup));
    expect(group).toMatchObject({ name: "Теннис", userId: anna });
    expect(await db.select().from(contactGroups)).toHaveLength(1);
  }

  // Scenario: «Изменить или удалить чужой контакт»
  test("changing Анна's contact is refused as for one that is not there", async () => {
    expect(
      await updateContact(boris, annasContact, input("Взломано"), noGroups),
    ).toBe(false);

    await annasDataIsUntouched();
  });

  test("deleting Анна's contact is refused as for one that is not there", async () => {
    expect(await deleteContact(boris, annasContact)).toBeNull();

    await annasDataIsUntouched();
  });

  test("the actions of Борис answer «Контакт не найден» for Анна's contact", async () => {
    const formData = new FormData();
    formData.set("name", "Взломано");
    const state = await updateContactAction(
      annasContact,
      {
        values: emptyContactValues,
        errors: {},
        groupIds: [],
        newGroups: [],
        version: 0,
      },
      formData,
    );
    expect(state.message).toBe(CONTACT_MISSING);

    expect(await deleteContactAction(annasContact)).toEqual({
      error: CONTACT_MISSING,
    });

    await annasDataIsUntouched();
  });

  // Scenario: «Заметка к чужому контакту»
  test("a note to Анна's contact is refused", async () => {
    expect(await addNote(boris, annasContact, "Подброшенная заметка")).toBe(
      false,
    );
    const noteState = await addNoteAction(
      annasContact,
      { body: "" },
      formWith({ body: "Подброшенная" }),
    );
    expect(noteState.error).toBe(CONTACT_MISSING);

    await annasDataIsUntouched();
  });

  // Scenario: «Чужая группа»
  test("renaming or deleting Анна's group is refused as for one that is not there", async () => {
    expect(await renameGroup(boris, annasGroup, "Взломано")).toEqual({
      status: "missing",
    });
    expect(await deleteGroup(boris, annasGroup)).toBeNull();

    const renamed = await renameGroupAction(
      annasGroup,
      { version: 0 },
      formWith({ name: "Взломано" }),
    );
    expect(renamed.error).toBe(GROUP_MISSING);
    expect(await deleteGroupAction(annasGroup)).toEqual({
      error: GROUP_MISSING,
    });

    await annasDataIsUntouched();
  });

  // Scenario: «Свой контакт в чужую группу»
  test("Борис saves his contact with Анна's group checked: it is saved without the group", async () => {
    const id = await createContact(boris, input("Борис Орлов"), {
      groupIds: [annasGroup],
      newGroups: [],
    });

    expect(await listContactGroups(boris, id)).toEqual([]);
    expect(await listGroups(anna)).toEqual([
      { id: annasGroup, name: "Теннис", contactCount: 1 },
    ]);
  });

  test("the same on changing a contact", async () => {
    const id = await createContact(boris, input("Борис Орлов"), noGroups);

    expect(
      await updateContact(boris, id, input("Борис Орлов"), {
        groupIds: [annasGroup],
        newGroups: [],
      }),
    ).toBe(true);

    expect(await listContactGroups(boris, id)).toEqual([]);
    expect(await listGroups(anna)).toEqual([
      { id: annasGroup, name: "Теннис", contactCount: 1 },
    ]);
  });

  // Scenario: «Первый контакт», through the action
  test("a contact saved by the action belongs to the person who is signed in", async () => {
    const formData = formWith({ name: "Борис Орлов" });

    await expect(
      createContactAction(
        {
          values: emptyContactValues,
          errors: {},
          groupIds: [],
          newGroups: [],
          version: 0,
        },
        formData,
      ),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    const [saved] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.name, "Борис Орлов"));
    expect(saved.userId).toBe(boris);
  });
});

describe("groups of every person are their own", () => {
  // Scenario: «Своя группа у каждого»
  test("Борис creates «Друзья» in the contact form: his own group, Анна's one is not touched", async () => {
    const annasFriends = await insertGroup(anna, "Друзья");
    await addToGroup(annasContact, annasFriends);

    const id = await createContact(boris, input("Борис Орлов"), {
      groupIds: [],
      newGroups: ["Друзья"],
    });

    const borisGroups = await listGroups(boris);
    expect(borisGroups).toHaveLength(1);
    expect(borisGroups[0]).toMatchObject({ name: "Друзья", contactCount: 1 });
    expect(borisGroups[0].id).not.toBe(annasFriends);
    expect(await listContactGroups(boris, id)).toEqual([
      { id: borisGroups[0].id, name: "Друзья" },
    ]);
    // Анна's «Друзья» has the same people as before
    expect(await listGroups(anna)).toEqual([
      { id: annasFriends, name: "Друзья", contactCount: 1 },
      { id: annasGroup, name: "Теннис", contactCount: 1 },
    ]);
  });

  // Scenario: «Переименовал в название чужой группы»
  test("Борис renames his group to the name of Анна's: it is allowed", async () => {
    await insertGroup(anna, "Друзья");
    const borisTennis = await insertGroup(boris, "Теннис");

    expect(await renameGroup(boris, borisTennis, "Друзья")).toEqual({
      status: "renamed",
      name: "Друзья",
    });

    expect((await listGroups(boris)).map((group) => group.name)).toEqual([
      "Друзья",
    ]);
  });

  test("a name taken by Борис's own group is still refused to him", async () => {
    await insertGroup(boris, "Друзья");
    const borisTennis = await insertGroup(boris, "Теннис");

    expect(await renameGroup(boris, borisTennis, "друзья")).toEqual({
      status: "invalid",
      error: "Группа «Друзья» уже есть",
    });
  });
});

function formWith(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}
