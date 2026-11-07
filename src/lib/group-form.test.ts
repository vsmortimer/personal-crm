import { describe, expect, test } from "vitest";

import {
  addGroup,
  initialGroupChoice,
  submittedNewGroups,
  toggleGroup,
  toggleNewGroup,
  type GroupChoice,
} from "@/lib/group-form";

const TENNIS = { id: 1, name: "Теннис" };
const FAMILY = { id: 2, name: "Семья" };
const GROUPS = [FAMILY, TENNIS];

const nothingChecked: GroupChoice = { checkedIds: [], newGroups: [] };

function added(choice: GroupChoice, input: string, groups = GROUPS) {
  const result = addGroup(groups, choice, input);
  if (!result.ok)
    throw new Error(`Expected "${input}" to be added: ${result.error}`);
  return result.choice;
}

describe("addGroup", () => {
  // Scenario: «Новая группа»
  test("a new name is added to the form already checked", () => {
    expect(added(nothingChecked, "Аналитики")).toEqual({
      checkedIds: [],
      newGroups: [{ name: "Аналитики", checked: true }],
    });
  });

  test("new groups are kept in the order they were added", () => {
    const choice = added(added(nothingChecked, "Аналитики"), "Друзья");

    expect(choice.newGroups.map((group) => group.name)).toEqual([
      "Аналитики",
      "Друзья",
    ]);
  });

  // Scenario: «Групп ещё нет»: the field works without any groups
  test("a name can be added when there are no groups yet", () => {
    expect(added(nothingChecked, "Аналитики", [])).toEqual({
      checkedIds: [],
      newGroups: [{ name: "Аналитики", checked: true }],
    });
  });

  // Scenario: «Пробелы по краям»
  test("spaces around the name are removed", () => {
    expect(added(nothingChecked, "  Аналитики  ").newGroups).toEqual([
      { name: "Аналитики", checked: true },
    ]);
  });

  // Scenario: «Такая группа уже есть»
  test("the name of an existing group in another case checks that group", () => {
    expect(added(nothingChecked, "теннис")).toEqual({
      checkedIds: [TENNIS.id],
      newGroups: [],
    });
  });

  test("an existing group that is already checked stays checked once", () => {
    const choice = { checkedIds: [TENNIS.id], newGroups: [] };

    expect(added(choice, "ТЕННИС")).toEqual(choice);
  });

  test("a name already added in this form checks it again instead of a copy", () => {
    const unchecked = toggleNewGroup(
      added(nothingChecked, "Аналитики"),
      "Аналитики",
      false,
    );

    expect(added(unchecked, "аналитики")).toEqual({
      checkedIds: [],
      newGroups: [{ name: "Аналитики", checked: true }],
    });
  });

  // Scenario: «Пустое название»
  test.each(["", "   "])("an empty name (%j) is not added", (input) => {
    expect(addGroup(GROUPS, nothingChecked, input)).toEqual({
      ok: false,
      error: "Укажите название группы",
    });
  });

  // Scenario: «Слишком длинное название»
  test("a name of 51 characters is not added", () => {
    expect(addGroup(GROUPS, nothingChecked, "я".repeat(51))).toEqual({
      ok: false,
      error: "Слишком длинно: не больше 50 символов",
    });
  });
});

describe("checkboxes", () => {
  test("checking and unchecking an existing group", () => {
    const checked = toggleGroup(nothingChecked, TENNIS.id, true);
    expect(checked.checkedIds).toEqual([TENNIS.id]);

    expect(toggleGroup(checked, TENNIS.id, false).checkedIds).toEqual([]);
  });

  // Scenario: «Снял галочку с новой группы»
  test("an unchecked new group stays in the form but is not sent", () => {
    const choice = toggleNewGroup(
      added(added(nothingChecked, "Аналитики"), "Друзья"),
      "Аналитики",
      false,
    );

    expect(choice.newGroups).toEqual([
      { name: "Аналитики", checked: false },
      { name: "Друзья", checked: true },
    ]);
    expect(submittedNewGroups(choice)).toEqual(["Друзья"]);
  });
});

// Scenario: «Ошибка в другом поле»: the form comes back with what was sent
describe("initialGroupChoice", () => {
  test("restores the checked groups and the new groups as checked", () => {
    expect(initialGroupChoice(GROUPS, [TENNIS.id], ["Аналитики"])).toEqual({
      checkedIds: [TENNIS.id],
      newGroups: [{ name: "Аналитики", checked: true }],
    });
  });

  test("a new name that has become an existing group checks that group", () => {
    expect(initialGroupChoice(GROUPS, [], ["семья"])).toEqual({
      checkedIds: [FAMILY.id],
      newGroups: [],
    });
  });
});
