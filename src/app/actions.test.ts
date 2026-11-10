// The contact form's server action, on a save that fails the checks
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createContactAction } from "@/app/actions";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { emptyContactValues, type ContactFormState } from "@/lib/validation";
import { captureErrorLog } from "../../test/captured-log";
import { insertUser } from "../../test/helpers";

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
