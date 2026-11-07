// Keep in touch: the contact frequency and the «Пора связаться» block
// (openspec/specs/keep-in-touch/spec.md). Dates are in UTC, like the
// database the tests run against.
import { eq } from "drizzle-orm";
import { describe, expect, test, beforeEach } from "vitest";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";
import {
  addNote,
  createContact,
  listDueContacts,
  updateContact,
  type ContactInput,
} from "@/lib/contacts";
import { insertContact, insertNote, insertUser } from "../../test/helpers";

// The person whose contacts and groups the tests work with
let owner: string;

beforeEach(async () => {
  owner = await insertUser("owner@mail.ru");
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const noGroups = { groupIds: [], newGroups: [] };

function contact(name: string, fields: Partial<ContactInput> = {}) {
  return {
    name,
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    contactFrequency: null,
    ...fields,
  } satisfies ContactInput;
}

function daysBefore(moment: Date, days: number) {
  return new Date(moment.getTime() - days * DAY);
}

function daysAgo(days: number) {
  return daysBefore(new Date(), days);
}

// Names in the block, in its order; `now` sets the clock
async function dueNames(now?: Date) {
  return (await listDueContacts(owner, now)).map((due) => due.listName);
}

async function frequencyOf(contactId: number) {
  const [row] = await db
    .select({ contactFrequency: contacts.contactFrequency })
    .from(contacts)
    .where(eq(contacts.id, contactId));
  return row.contactFrequency;
}

describe("the frequency is saved with the contact", () => {
  // Scenario: «Новый контакт с частотой»
  test("a new contact keeps the chosen frequency", async () => {
    const anna = await createContact(
      owner,
      contact("Анна Смирнова", { contactFrequency: "month" }),
      noGroups,
    );

    expect(await frequencyOf(anna)).toBe("month");
  });

  // Scenario: «Новый контакт без частоты»
  test("a new contact without a frequency is saved", async () => {
    const anna = await createContact(owner, contact("Анна Смирнова"), noGroups);

    expect(await frequencyOf(anna)).toBeNull();
  });

  // Scenario: «Смена частоты»
  test("another frequency replaces the old one", async () => {
    const anna = await insertContact(owner, "Анна Смирнова", {
      contactFrequency: "month",
    });

    await updateContact(
      owner,
      anna,
      contact("Анна Смирнова", { contactFrequency: "quarter" }),
      noGroups,
    );

    expect(await frequencyOf(anna)).toBe("quarter");
  });

  // Scenario: «Частоту убрали»
  test("a removed frequency leaves the contact out of the block", async () => {
    const ivan = await insertContact(owner, "Иван Петров", {
      contactFrequency: "week",
      createdAt: daysAgo(30),
    });
    expect(await dueNames()).toEqual(["Петров Иван"]);

    await updateContact(owner, ivan, contact("Иван Петров"), noGroups);

    expect(await frequencyOf(ivan)).toBeNull();
    expect(await dueNames()).toEqual([]);
  });
});

describe("the period runs from the last catch-up", () => {
  // Scenario: «У контакта есть заметки»
  test("from the latest note", async () => {
    const anna = await insertContact(owner, "Анна Смирнова", {
      contactFrequency: "month",
      createdAt: new Date("2026-07-01T12:00:00Z"),
    });
    // Written out of order: the latest by date counts, not the last written
    await insertNote(anna, "Встретились", new Date("2026-09-01T12:00:00Z"));
    await insertNote(anna, "Созвонились", new Date("2026-08-01T12:00:00Z"));

    // A month from August 1 has run out, from September 1 it has not
    expect(await dueNames(new Date("2026-09-30T12:00:00Z"))).toEqual([]);
    expect(
      await listDueContacts(owner, new Date("2026-10-02T12:00:00Z")),
    ).toEqual([
      expect.objectContaining({
        listName: "Смирнова Анна",
        daysSinceContact: 31,
      }),
    ]);
  });

  // Scenario: «Заметок нет»
  test("from the moment the contact was added when there are no notes", async () => {
    await insertContact(owner, "Анна Смирнова", {
      contactFrequency: "month",
      createdAt: new Date("2026-09-01T12:00:00Z"),
    });

    expect(await dueNames(new Date("2026-09-30T12:00:00Z"))).toEqual([]);
    expect(
      await listDueContacts(owner, new Date("2026-10-02T12:00:00Z")),
    ).toEqual([
      expect.objectContaining({
        listName: "Смирнова Анна",
        daysSinceContact: 31,
      }),
    ]);
  });

  // Scenario: «Написал заметку»
  test("a new note starts the period again", async () => {
    const ivan = await insertContact(owner, "Иван Петров", {
      contactFrequency: "week",
      createdAt: daysAgo(30),
    });
    expect(await dueNames()).toEqual(["Петров Иван"]);

    await addNote(owner, ivan, "Созвонились, договорились о встрече");

    expect(await dueNames()).toEqual([]);
  });

  // Scenario: «Изменил контакт без заметки»
  test("other changes to the contact do not start it again", async () => {
    const ivan = await insertContact(owner, "Иван Петров", {
      contactFrequency: "week",
      createdAt: daysAgo(30),
    });
    expect(await dueNames()).toEqual(["Петров Иван"]);

    await updateContact(
      owner,
      ivan,
      contact("Иван Петров", {
        contactFrequency: "week",
        phone: "+7 900 123-45-67",
      }),
      noGroups,
    );

    expect(await dueNames()).toEqual(["Петров Иван"]);
  });

  // Scenario: «Сменил частоту»
  test("a new frequency is counted from the same last note", async () => {
    const ivan = await insertContact(owner, "Иван Петров", {
      contactFrequency: "week",
      createdAt: daysAgo(60),
    });
    await insertNote(ivan, "Созвонились", daysAgo(10));
    expect(await dueNames()).toEqual(["Петров Иван"]);

    await updateContact(
      owner,
      ivan,
      contact("Иван Петров", { contactFrequency: "month" }),
      noGroups,
    );

    // Less than a month since the last note
    expect(await dueNames()).toEqual([]);
  });
});

describe("when it is time to get in touch", () => {
  async function annaWithNoteOnSeptember20() {
    const anna = await insertContact(owner, "Анна Смирнова", {
      contactFrequency: "month",
      createdAt: new Date("2026-09-01T12:00:00Z"),
    });
    await insertNote(anna, "Созвонились", new Date("2026-09-20T12:00:00Z"));
  }

  // Scenario: «Срок ещё не прошёл»
  test("not yet an hour before the month runs out", async () => {
    await annaWithNoteOnSeptember20();

    expect(await dueNames(new Date("2026-10-20T11:00:00Z"))).toEqual([]);
  });

  // Scenario: «Срок прошёл»
  test("due an hour after the month runs out", async () => {
    await annaWithNoteOnSeptember20();

    expect(await dueNames(new Date("2026-10-20T13:00:00Z"))).toEqual([
      "Смирнова Анна",
    ]);
  });

  // A week is 7 days; a month, a quarter and a year are calendar ones:
  // the period runs out on the same day and hour. The dates make a wrong
  // 30, 90 or 365 days show: 31, 92 and 366 days pass
  test.each<[ContactFrequency, string, string]>([
    ["week", "2026-12-13T12:00:00Z", "2026-12-20T12:00:00Z"],
    ["month", "2026-12-20T12:00:00Z", "2027-01-20T12:00:00Z"],
    ["quarter", "2026-11-20T12:00:00Z", "2027-02-20T12:00:00Z"],
    ["year", "2023-03-01T12:00:00Z", "2024-03-01T12:00:00Z"],
  ])("%s: a note on %s runs out on %s", async (frequency, noteAt, dueAt) => {
    const anna = await insertContact(owner, "Анна Смирнова", {
      contactFrequency: frequency,
      createdAt: new Date("2023-01-01T12:00:00Z"),
    });
    await insertNote(anna, "Созвонились", new Date(noteAt));
    const due = new Date(dueAt).getTime();

    expect(await dueNames(new Date(due - HOUR))).toEqual([]);
    expect(await dueNames(new Date(due + HOUR))).toEqual(["Смирнова Анна"]);
  });

  // Scenario: «Частота не задана»
  test("never without a frequency", async () => {
    const anna = await insertContact(owner, "Анна Смирнова", {
      createdAt: new Date("2024-01-01T12:00:00Z"),
    });
    await insertNote(anna, "Созвонились", new Date("2024-10-20T12:00:00Z"));

    expect(await dueNames(new Date("2026-10-20T12:00:00Z"))).toEqual([]);
  });
});

describe("a row of the block", () => {
  // Scenario: «Есть кому пора»: «Петров Иван», «Раз в месяц · не общались 45 дней»
  test("has the list name, the frequency and the whole days without contact", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const ivan = await insertContact(owner, "Иван Петров", {
      contactFrequency: "month",
      createdAt: new Date("2026-08-01T12:00:00Z"),
    });
    // 45 days and 20 hours ago: 45 whole days, not rounded up to 46
    await insertNote(
      ivan,
      "Созвонились",
      new Date(daysBefore(now, 45).getTime() - 20 * HOUR),
    );

    expect(await listDueContacts(owner, now)).toEqual([
      {
        id: ivan,
        listName: "Петров Иван",
        contactFrequency: "month",
        daysSinceContact: 45,
      },
    ]);
  });
});

describe("the order in the block", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  // Scenario: «Просрочка, а не дни без общения». Анна's surname comes first
  // in the alphabet and she has gone longer without contact, so only the
  // time overdue puts Иван above her
  test("the longest overdue first, not the longest without contact", async () => {
    const anna = await insertContact(owner, "Анна Белова", {
      contactFrequency: "year",
      createdAt: daysBefore(now, 400),
    });
    await insertNote(anna, "Созвонились", daysBefore(now, 370));
    const ivan = await insertContact(owner, "Иван Петров", {
      contactFrequency: "week",
      createdAt: daysBefore(now, 60),
    });
    await insertNote(ivan, "Созвонились", daysBefore(now, 30));

    // Overdue: Иван 23 days, Анна 5 days
    expect(await dueNames(now)).toEqual(["Петров Иван", "Белова Анна"]);
  });

  test("equally overdue contacts go by surname, as in the contact list", async () => {
    for (const name of ["Олег Сидоров", "Пётр Котов"]) {
      const id = await insertContact(owner, name, {
        contactFrequency: "week",
        createdAt: daysBefore(now, 60),
      });
      await insertNote(id, "Созвонились", daysBefore(now, 10));
    }

    expect(await dueNames(now)).toEqual(["Котов Пётр", "Сидоров Олег"]);
  });
});
