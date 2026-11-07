// The contact form's server action, on a save that fails the checks
import { expect, test } from "vitest";

import { createContactAction } from "@/app/actions";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { emptyContactValues, type ContactFormState } from "@/lib/validation";

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
