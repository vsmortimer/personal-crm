// The contact form's server action, on a save that fails the checks
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { eq } from "drizzle-orm";

import { createContactAction, updateContactAction } from "@/app/actions";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { emptyContactValues, type ContactFormState } from "@/lib/validation";
import { captureErrorLog } from "../../test/captured-log";
import { insertContact, insertUser } from "../../test/helpers";

// Vitest has no request with a cookie, so the signed-in person is set here.
// Nothing else is replaced: the actions work with the real database.
const signedIn = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: signedIn.id }),
}));

beforeEach(async () => {
  signedIn.id = await insertUser("owner@mail.ru");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const initialState: ContactFormState = {
  values: emptyContactValues,
  errors: {},
  groupIds: [],
  newGroups: [],
  version: 0,
};

// Scenario: «Ошибка в другом поле»
test("a wrong email keeps the chosen frequency in the form", async () => {
  const sent = new FormData();
  sent.set("name", "Анна Смирнова");
  sent.set("email", "anna@");
  sent.set("contactFrequency", "week");

  const state = await createContactAction(initialState, sent);

  expect(state.errors).toEqual({
    email: "Проверьте адрес почты, например: name@mail.ru",
  });
  expect(state.values).toMatchObject({
    name: "Анна Смирнова",
    email: "anna@",
    contactFrequency: "week",
  });
  // The form remounts with these values
  expect(state.version).toBe(1);
  expect(await db.select().from(contacts)).toEqual([]);
});

// Scenario: «Ошибка в другом поле» (birthdays)
test("a wrong email keeps the chosen birth date in the form", async () => {
  const sent = new FormData();
  sent.set("name", "Анна Смирнова");
  sent.set("email", "anna@");
  sent.set("birthDay", "21");
  sent.set("birthMonth", "11");
  sent.set("birthYear", "1990");

  const state = await createContactAction(initialState, sent);

  expect(state.errors).toEqual({
    email: "Проверьте адрес почты, например: name@mail.ru",
  });
  expect(state.values).toMatchObject({
    birthDay: "21",
    birthMonth: "11",
    birthYear: "1990",
  });
  expect(await db.select().from(contacts)).toEqual([]);
});

// Scenario: «Подделанный запрос»: the form lets none of these through, so
// they can only come from a forged request
describe("a forged request with a wrong birth date", () => {
  const forged = [
    ["month 13", { birthDay: "1", birthMonth: "13" }],
    ["a day without a month", { birthDay: "21", birthMonth: "" }],
    ["April 31", { birthDay: "31", birthMonth: "4" }],
  ] as const;

  function sentWith(birth: Record<string, string>) {
    const sent = new FormData();
    sent.set("name", "Анна Смирнова");
    for (const [field, value] of Object.entries(birth)) {
      sent.set(field, value);
    }
    return sent;
  }

  test.each(forged)("%s: a new contact is not saved", async (_name, birth) => {
    const state = await createContactAction(initialState, sentWith(birth));

    expect(state.errors.birthDay).toBeTruthy();
    expect(await db.select().from(contacts)).toEqual([]);
  });

  test.each(forged)(
    "%s: the date of an existing contact stays as it was",
    async (_name, birth) => {
      const id = await insertContact(signedIn.id, "Анна Смирнова", {
        birth: { birthDay: 21, birthMonth: 11, birthYear: 1990 },
      });

      const state = await updateContactAction(
        id,
        initialState,
        sentWith(birth),
      );

      expect(state.errors.birthDay).toBeTruthy();
      const [saved] = await db
        .select({
          birthDay: contacts.birthDay,
          birthMonth: contacts.birthMonth,
          birthYear: contacts.birthYear,
        })
        .from(contacts)
        .where(eq(contacts.id, id));
      expect(saved).toEqual({ birthDay: 21, birthMonth: 11, birthYear: 1990 });
    },
  );
});

// The save fails in the database (the person does not exist): the form says
// so, and the error log has no name, phone or email of the contact
test("a failed save does not put the contact's data in the error log", async () => {
  signedIn.id = "nobody";
  const sent = new FormData();
  sent.set("name", "Анна Смирнова");
  sent.set("phone", "+7 916 555-12-34");
  sent.set("email", "anna.smirnova@mail.ru");
  const log = captureErrorLog();

  const state = await createContactAction(initialState, sent);

  expect(state.message).toBe("Не удалось сохранить. Попробуйте ещё раз.");
  const text = log.text();
  expect(text).toContain("Failed to create contact");
  for (const secret of [
    "Анна Смирнова",
    "+7 916 555-12-34",
    "anna.smirnova@mail.ru",
  ]) {
    expect(text).not.toContain(secret);
  }
});
