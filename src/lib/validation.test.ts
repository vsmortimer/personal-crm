import { describe, expect, test } from "vitest";

import { groupNameSchema, parseContactGroups } from "@/lib/validation";

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
