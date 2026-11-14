import { describe, expect, test } from "vitest";

import { moscowToday } from "@/lib/birthday";
import { CONTACT_FREQUENCIES } from "@/lib/contact-frequency";
import {
  contactSchema,
  emptyContactValues,
  groupNameSchema,
  parseContactGroups,
} from "@/lib/validation";

function errorOf(input: string) {
  const parsed = groupNameSchema.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("groupNameSchema", () => {
  // Scenario: «Пустое название»
  test.each(["", "   "])("an empty name (%j) asks for a name", (input) => {
    expect(errorOf(input)).toBe("Укажите название группы");
  });

  // Scenario: «Слишком длинное название»
  test("a name of 51 characters is too long", () => {
    expect(errorOf("я".repeat(51))).toBe(
      "Слишком длинно: не больше 50 символов",
    );
  });

  test("a name of 50 characters is fine", () => {
    expect(groupNameSchema.parse("я".repeat(50))).toBe("я".repeat(50));
  });

  // Scenario: «Пробелы по краям»
  test("spaces around the name are removed", () => {
    expect(groupNameSchema.parse("  Теннис  ")).toBe("Теннис");
  });

  test("the length limit counts the name without the spaces around it", () => {
    expect(groupNameSchema.parse(` ${"я".repeat(50)} `)).toBe("я".repeat(50));
  });
});

function formData(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("parseContactGroups", () => {
  // Scenario: «Ошибка в другом поле»: what was checked goes back into the form
  test("reads the checked groups and the new groups from the sent form", () => {
    const sent = formData([
      ["name", "Анна Смирнова"],
      ["email", "не почта"],
      ["groupIds", "3"],
      ["groupIds", "7"],
      ["newGroups", "Аналитики"],
    ]);

    expect(parseContactGroups(sent)).toEqual({
      groupIds: [3, 7],
      newGroups: ["Аналитики"],
    });
  });

  // Scenario: «Без групп»
  test("a form without groups gives no groups", () => {
    expect(parseContactGroups(formData([["name", "Анна Смирнова"]]))).toEqual({
      groupIds: [],
      newGroups: [],
    });
  });

  test("ids that are not positive whole numbers are dropped", () => {
    const sent = formData([
      ["groupIds", "0"],
      ["groupIds", "-1"],
      ["groupIds", "1.5"],
      ["groupIds", "abc"],
      ["groupIds", "99999999999"],
      ["groupIds", "2"],
      ["groupIds", "2"],
    ]);

    expect(parseContactGroups(sent).groupIds).toEqual([2]);
  });

  test("new names are trimmed, and repeats in another case count once", () => {
    const sent = formData([
      ["newGroups", "  Аналитики "],
      ["newGroups", "аналитики"],
      ["newGroups", "Теннис"],
    ]);

    expect(parseContactGroups(sent).newGroups).toEqual(["Аналитики", "Теннис"]);
  });

  // Only a forged request can send them: the form checks names before adding
  test("new names that break the name rules are dropped", () => {
    const sent = formData([
      ["newGroups", "   "],
      ["newGroups", "я".repeat(51)],
      ["newGroups", "Теннис"],
    ]);

    expect(parseContactGroups(sent).newGroups).toEqual(["Теннис"]);
  });
});

describe("contactSchema: «Как часто общаться»", () => {
  const anna = { ...emptyContactValues, name: "Анна Смирнова" };

  // Scenario: «Новый контакт без частоты»: the untouched field sends ""
  test("an untouched field means no frequency", () => {
    expect(contactSchema.parse(anna).contactFrequency).toBeNull();
  });

  test.each(CONTACT_FREQUENCIES)("%s is kept", (frequency) => {
    expect(
      contactSchema.parse({ ...anna, contactFrequency: frequency })
        .contactFrequency,
    ).toBe(frequency);
  });

  // Only a forged request can send a value that is not in the list
  test("a value off the list asks to choose from the list", () => {
    const parsed = contactSchema.safeParse({
      ...anna,
      contactFrequency: "daily",
    });

    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({
        path: ["contactFrequency"],
        message: "Выберите вариант из списка",
      }),
    ]);
  });
});

describe("contactSchema: «Дата рождения»", () => {
  const anna = { ...emptyContactValues, name: "Анна Смирнова" };
  const birth = (day: string, month: string, year = "") => ({
    ...anna,
    birthDay: day,
    birthMonth: month,
    birthYear: year,
  });
  const currentYear = moscowToday(new Date()).year;
  const NEED_BOTH = "Нужны и день, и месяц";
  const NO_SUCH_DATE = "Такой даты нет";
  const BAD_YEAR = "Год должен быть от 1900 до нынешнего";

  // The date errors come as one error under the first part of the field
  function dateError(input: ReturnType<typeof birth>) {
    const parsed = contactSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    const issues = parsed.error?.issues ?? [];
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(["birthDay"]);
    return issues[0].message;
  }

  // Scenario: «Дата без года»
  test("a day and a month without a year are kept, the year stays empty", () => {
    expect(contactSchema.parse(birth("21", "11"))).toMatchObject({
      birthDay: 21,
      birthMonth: 11,
      birthYear: null,
    });
  });

  // Scenario: «Дата с годом»
  test("a day, a month and a year are kept", () => {
    expect(contactSchema.parse(birth("5", "3", "1990"))).toMatchObject({
      birthDay: 5,
      birthMonth: 3,
      birthYear: 1990,
    });
  });

  // Scenario: «Новый контакт без даты»: the untouched fields send ""
  test("untouched fields mean no date", () => {
    expect(contactSchema.parse(anna)).toMatchObject({
      birthDay: null,
      birthMonth: null,
      birthYear: null,
    });
  });

  test("spaces around the numbers do not matter, spaces alone mean no date", () => {
    expect(contactSchema.parse(birth(" 21 ", "11", " 1990 "))).toMatchObject({
      birthDay: 21,
      birthMonth: 11,
      birthYear: 1990,
    });
    expect(contactSchema.parse(birth(" ", " ", " "))).toMatchObject({
      birthDay: null,
      birthMonth: null,
      birthYear: null,
    });
  });

  // Scenario: «Указан только месяц»
  test("a month without a day asks for both", () => {
    expect(dateError(birth("", "11"))).toBe(NEED_BOTH);
  });

  test("a day without a month asks for both", () => {
    expect(dateError(birth("21", ""))).toBe(NEED_BOTH);
  });

  // Scenario: «Год без дня и месяца»
  test("a year alone asks for a day and a month", () => {
    expect(dateError(birth("", "", "1990"))).toBe(NEED_BOTH);
  });

  // Scenario: «Несуществующая дата»
  test.each([
    ["31", "4"],
    ["30", "2"],
    ["31", "6"],
    ["0", "5"],
    ["32", "1"],
    ["1", "13"],
    ["1", "0"],
  ])("day %s of month %s does not exist", (day, month) => {
    expect(dateError(birth(day, month))).toBe(NO_SUCH_DATE);
  });

  // Only a forged request can send what is not a whole number
  test.each(["abc", "1.5", "-3", "1e1", "２１"])(
    "%j in the day is not a date",
    (day) => {
      expect(dateError(birth(day, "11"))).toBe(NO_SUCH_DATE);
    },
  );

  test("a month that is not a number is not a date", () => {
    expect(dateError(birth("21", "ноября"))).toBe(NO_SUCH_DATE);
  });

  // Scenario: «29 февраля»
  test("February 29 without a year is kept", () => {
    expect(contactSchema.parse(birth("29", "2"))).toMatchObject({
      birthDay: 29,
      birthMonth: 2,
      birthYear: null,
    });
  });

  test("February 29 with a leap year is kept", () => {
    expect(contactSchema.parse(birth("29", "2", "2000"))).toMatchObject({
      birthYear: 2000,
    });
  });

  test.each(["2001", "1900"])(
    "February 29 of the year %s, which is not a leap year, does not exist",
    (year) => {
      expect(dateError(birth("29", "2", year))).toBe(NO_SUCH_DATE);
    },
  );

  // Scenario: «Год в будущем или слишком давний»
  test.each([String(currentYear + 1), "1899", "1850", "0", "abc", "19.90"])(
    "the year %s is out of range",
    (year) => {
      expect(dateError(birth("5", "3", year))).toBe(BAD_YEAR);
    },
  );

  test("the first year and the current year are allowed", () => {
    expect(contactSchema.parse(birth("1", "1", "1900")).birthYear).toBe(1900);
    expect(
      contactSchema.parse(birth("1", "1", String(currentYear))).birthYear,
    ).toBe(currentYear);
  });

  test("a mistake in the date does not hide a mistake in another field", () => {
    const parsed = contactSchema.safeParse({
      ...birth("31", "4"),
      email: "anna@",
    });

    expect(parsed.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      "birthDay",
      "email",
    ]);
  });
});
