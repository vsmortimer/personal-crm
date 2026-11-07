import { describe, expect, test } from "vitest";

import { groupNamesLine, homeHref } from "@/lib/format";

describe("groupNamesLine", () => {
  // Scenarios: «Контакт в группах», «Контакт в двух группах»
  test("joins the group names with a middle dot", () => {
    expect(groupNamesLine(["Друзья", "Теннис"])).toBe("Друзья · Теннис");
  });

  test("a single group is just its name", () => {
    expect(groupNamesLine(["Теннис"])).toBe("Теннис");
  });

  // Scenario: «Контакт без групп»: the card then says «Не указано»
  test("no groups give an empty line", () => {
    expect(groupNamesLine([])).toBe("");
  });
});

// The home page address keeps both the search and the selected group
describe("homeHref", () => {
  test("no search and no group is the plain home page", () => {
    expect(homeHref("", null)).toBe("/");
  });

  // Scenario: «Выбрал группу»
  test("a group alone", () => {
    expect(homeHref("", 7)).toBe("/?group=7");
  });

  // Scenarios: «Поиск в группе», «Группа при введённом поиске»
  test("a search inside a group keeps both", () => {
    expect(homeHref("Анна", 7)).toBe("/?group=7&q=%D0%90%D0%BD%D0%BD%D0%B0");
  });

  // Scenario: «Снова все»: the search stays
  test("a search without a group", () => {
    expect(homeHref("a&b", null)).toBe("/?q=a%26b");
  });
});
