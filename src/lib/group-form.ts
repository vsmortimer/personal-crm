// The «Группы» section of the contact form, without the screen: which
// groups are checked and which new ones were typed in. Runs in the browser.
import { groupNameSchema } from "@/lib/validation";

export type FormGroup = { id: number; name: string };

// A group typed into the form; it is created only when the contact is saved
export type NewGroup = { name: string; checked: boolean };

export type GroupChoice = {
  checkedIds: number[];
  // In the order they were added, after the existing groups
  newGroups: NewGroup[];
};

export type AddGroupResult =
  { ok: true; choice: GroupChoice } | { ok: false; error: string };

// Letter case doesn't matter, as in the database's unique index on lower(name)
function sameName(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export function toggleGroup(
  choice: GroupChoice,
  id: number,
  checked: boolean,
): GroupChoice {
  if (choice.checkedIds.includes(id) === checked) return choice;
  return {
    ...choice,
    checkedIds: checked
      ? [...choice.checkedIds, id]
      : choice.checkedIds.filter((checkedId) => checkedId !== id),
  };
}

export function toggleNewGroup(
  choice: GroupChoice,
  name: string,
  checked: boolean,
): GroupChoice {
  return {
    ...choice,
    newGroups: choice.newGroups.map((group) =>
      sameName(group.name, name) ? { ...group, checked } : group,
    ),
  };
}

// A name that is already in the form checks that group instead of adding a copy
function withGroup(
  groups: FormGroup[],
  choice: GroupChoice,
  name: string,
): GroupChoice {
  const existing = groups.find((group) => sameName(group.name, name));
  if (existing) return toggleGroup(choice, existing.id, true);

  if (choice.newGroups.some((group) => sameName(group.name, name))) {
    return toggleNewGroup(choice, name, true);
  }
  return {
    ...choice,
    newGroups: [...choice.newGroups, { name, checked: true }],
  };
}

// «Добавить» or Enter in the «Новая группа» field
export function addGroup(
  groups: FormGroup[],
  choice: GroupChoice,
  input: string,
): AddGroupResult {
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "" };
  }
  return { ok: true, choice: withGroup(groups, choice, parsed.data) };
}

// Unchecked new groups stay in the form but are not sent, so not created
export function submittedNewGroups(choice: GroupChoice): string[] {
  return choice.newGroups
    .filter((group) => group.checked)
    .map((group) => group.name);
}

// The form's starting point, also after a failed save with the sent values
export function initialGroupChoice(
  groups: FormGroup[],
  groupIds: number[],
  newGroups: string[],
): GroupChoice {
  return newGroups.reduce((choice, name) => withGroup(groups, choice, name), {
    checkedIds: groupIds,
    newGroups: [],
  } as GroupChoice);
}
