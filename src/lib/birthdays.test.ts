// Birthdays: the birth date in the contact form and the «Скоро день рождения»
// block (openspec/changes/birthdays/specs/birthdays/spec.md). "Today" is set
// by `now`, so the tests do not wait for a real calendar. Dates are by Moscow
// time, like in the app.
import { beforeEach, describe, expect, test } from "vitest";

import {
  createContact,
  getContact,
  listBirthdayContacts,
  updateContact,
} from "@/lib/contacts";
import {
  contactInput as contact,
  insertContact,
  insertUser,
} from "../../test/helpers";

// The person whose contacts the tests work with
let owner: string;

beforeEach(async () => {
  owner = await insertUser("owner@mail.ru");
});

const noGroups = { groupIds: [], newGroups: [] };

// The same day in the Moscow noon, whatever the zone of the machine
function noon(date: string) {
  return new Date(`${date}T12:00:00+03:00`);
}

// Contacts of the owner with a birthday on the day and month
function withBirthday(name: string, day: number, month: number, year?: number) {
  return insertContact(owner, name, {
    birth: { birthDay: day, birthMonth: month, birthYear: year ?? null },
  });
}

// Names in the block, in its order
async function soon(today: string) {
  const list = await listBirthdayContacts(owner, noon(today));
  return list.map((entry) => entry.listName);
}

describe("when a birthday is soon", () => {
  // Scenario: «Сегодня»
  test("a birthday today is in the block", async () => {
    await withBirthday("Анна Смирнова", 14, 11);

    expect(await soon("2026-11-14")).toEqual(["Смирнова Анна"]);
  });

  // Scenario: «Ровно через 7 дней»
  test("a birthday in 7 days is in the block", async () => {
    await withBirthday("Анна Смирнова", 21, 11);

    expect(await soon("2026-11-14")).toEqual(["Смирнова Анна"]);
  });

  // Scenario: «Через 8 дней»
  test("a birthday in 8 days is not", async () => {
    await withBirthday("Анна Смирнова", 22, 11);

    expect(await soon("2026-11-14")).toEqual([]);
  });

  // Scenario: «День рождения только что прошёл»
  test("a birthday that was yesterday is not", async () => {
    await withBirthday("Анна Смирнова", 13, 11);

    expect(await soon("2026-11-14")).toEqual([]);
  });

  // Scenario: «Через границу года»
  test("a birthday on 3 January is in the block on 28 December", async () => {
    await withBirthday("Анна Смирнова", 3, 1);

    expect(await soon("2026-12-28")).toEqual(["Смирнова Анна"]);
  });

  // Scenario: «Даты нет»
  test("a contact without a date is never in the block", async () => {
    await insertContact(owner, "Анна Смирнова");

    expect(await soon("2026-11-14")).toEqual([]);
  });

  test("the birth year does not matter", async () => {
    await withBirthday("Анна Смирнова", 21, 11, 1990);
    await withBirthday("Иван Петров", 21, 11);

    expect(await soon("2026-11-14")).toEqual(["Петров Иван", "Смирнова Анна"]);
  });

  // Scenario: «29 февраля в обычный год»
  describe("February 29 in a common year (2027)", () => {
    beforeEach(async () => {
      await withBirthday("Анна Смирнова", 29, 2);
    });

    test("is in the block 7 days before February 28 and on February 28", async () => {
      expect(await soon("2027-02-21")).toEqual(["Смирнова Анна"]);
      expect(await soon("2027-02-28")).toEqual(["Смирнова Анна"]);
    });

    test("is not in the block 8 days before February 28 and on March 1", async () => {
      expect(await soon("2027-02-20")).toEqual([]);
      expect(await soon("2027-03-01")).toEqual([]);
    });
  });

  test("February 29 in a leap year (2028) is in the block on the day", async () => {
    await withBirthday("Анна Смирнова", 29, 2);

    expect(await soon("2028-02-29")).toEqual(["Смирнова Анна"]);
    expect(await soon("2028-03-01")).toEqual([]);
  });

  test("the day is Moscow's: 00:30 on 14 November is already the 14th", async () => {
    await withBirthday("Анна Смирнова", 21, 11);
    await withBirthday("Иван Петров", 22, 11);

    // 21:30 UTC on the 13th
    const night = new Date("2026-11-13T21:30:00Z");
    expect(
      (await listBirthdayContacts(owner, night)).map((entry) => entry.listName),
    ).toEqual(["Смирнова Анна"]);
  });

  test("an entry has what the block shows: the days left and the age", async () => {
    const id = await withBirthday("Иван Петров", 16, 11, 1990);

    expect(await listBirthdayContacts(owner, noon("2026-11-14"))).toEqual([
      {
        id,
        listName: "Петров Иван",
        next: {
          date: { year: 2026, month: 11, day: 16 },
          daysLeft: 2,
          age: 36,
        },
      },
    ]);
  });
});

describe("the order in the block", () => {
  // Scenario: «Ближайшие сверху»
  test("the nearest come first, not the ones by surname", async () => {
    await withBirthday("Анна Смирнова", 20, 11);
    await withBirthday("Иван Петров", 15, 11);
    await withBirthday("Ольга Яковлева", 14, 11);

    expect(await soon("2026-11-14")).toEqual([
      "Яковлева Ольга",
      "Петров Иван",
      "Смирнова Анна",
    ]);
  });

  // Scenario: «Через границу года»
  test("31 December is above 2 January on 29 December", async () => {
    await withBirthday("Анна Смирнова", 2, 1);
    await withBirthday("Иван Петров", 31, 12);

    expect(await soon("2026-12-29")).toEqual(["Петров Иван", "Смирнова Анна"]);
  });

  // Scenario: «Один день»
  test("on one day the order is by surname, as in the list", async () => {
    await withBirthday("Анна Смирнова", 18, 11);
    await withBirthday("Иван Петров", 18, 11);
    await withBirthday("Мария Абрамова", 18, 11);

    expect(await soon("2026-11-14")).toEqual([
      "Абрамова Мария",
      "Петров Иван",
      "Смирнова Анна",
    ]);
  });
});

describe("the birth date in the contact form", () => {
  async function birthOf(id: number) {
    const saved = await getContact(owner, id);
    return {
      birthDay: saved?.birthDay,
      birthMonth: saved?.birthMonth,
      birthYear: saved?.birthYear,
    };
  }

  // Scenarios: «Дата без года», «Дата с годом»
  test("a new contact is saved with its date, with or without a year", async () => {
    const anna = await createContact(
      owner,
      contact("Анна Смирнова", { birthDay: 21, birthMonth: 11 }),
      noGroups,
    );
    const ivan = await createContact(
      owner,
      contact("Иван Петров", { birthDay: 5, birthMonth: 3, birthYear: 1990 }),
      noGroups,
    );

    expect(await birthOf(anna)).toEqual({
      birthDay: 21,
      birthMonth: 11,
      birthYear: null,
    });
    expect(await birthOf(ivan)).toEqual({
      birthDay: 5,
      birthMonth: 3,
      birthYear: 1990,
    });
  });

  // Scenario: «Новый контакт без даты»
  test("a new contact without a date has none", async () => {
    const anna = await createContact(owner, contact("Анна Смирнова"), noGroups);

    expect(await birthOf(anna)).toEqual({
      birthDay: null,
      birthMonth: null,
      birthYear: null,
    });
  });

  // Scenario: «Смена и удаление даты»
  test("the date can be changed", async () => {
    const anna = await withBirthday("Анна Смирнова", 21, 11);

    await updateContact(
      owner,
      anna,
      contact("Анна Смирнова", { birthDay: 21, birthMonth: 12 }),
      noGroups,
    );

    expect(await birthOf(anna)).toEqual({
      birthDay: 21,
      birthMonth: 12,
      birthYear: null,
    });
  });

  test("the date can be removed, with the year too", async () => {
    const anna = await withBirthday("Анна Смирнова", 21, 11, 1990);

    await updateContact(owner, anna, contact("Анна Смирнова"), noGroups);

    expect(await birthOf(anna)).toEqual({
      birthDay: null,
      birthMonth: null,
      birthYear: null,
    });
    expect(await soon("2026-11-14")).toEqual([]);
  });
});
