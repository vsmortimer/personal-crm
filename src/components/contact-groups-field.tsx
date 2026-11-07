"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  addGroup,
  initialGroupChoice,
  submittedNewGroups,
  toggleGroup,
  toggleNewGroup,
  type FormGroup,
} from "@/lib/group-form";

type ContactGroupsFieldProps = {
  // All groups, in alphabetical order
  groups: FormGroup[];
  initialGroupIds: number[];
  initialNewGroups: string[];
};

// The «Группы» section of the contact form. Existing groups are sent as
// "groupIds" checkboxes, checked new groups as hidden "newGroups" fields.
export function ContactGroupsField({
  groups,
  initialGroupIds,
  initialNewGroups,
}: ContactGroupsFieldProps) {
  const initial = () => initialGroupChoice(groups, initialGroupIds, initialNewGroups);
  const [choice, setChoice] = useState(initial);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string>();

  // Next.js keeps a page's state while you are away from it; start over when
  // the page is left, so a group typed in and abandoned doesn't come back
  useEffect(
    () => () => {
      setChoice(initial);
      setNewName("");
      setError(undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on leaving the page
    [],
  );

  function add() {
    const result = addGroup(groups, choice, newName);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChoice(result.choice);
    setNewName("");
    setError(undefined);
  }

  const hasGroups = groups.length > 0 || choice.newGroups.length > 0;

  return (
    <FieldSet className="gap-3">
      <legend className="mb-1 text-xs leading-none font-medium tracking-widest text-muted-foreground uppercase">
        Группы
      </legend>

      {hasGroups && (
        <ul className="flex flex-wrap gap-x-6">
          {groups.map((group) => (
            <li key={group.id} className="min-w-0">
              <GroupCheckbox
                label={group.name}
                name="groupIds"
                value={String(group.id)}
                checked={choice.checkedIds.includes(group.id)}
                onCheckedChange={(checked) =>
                  setChoice((current) => toggleGroup(current, group.id, checked))
                }
              />
            </li>
          ))}
          {choice.newGroups.map((group) => (
            <li key={group.name} className="min-w-0">
              <GroupCheckbox
                label={group.name}
                checked={group.checked}
                onCheckedChange={(checked) =>
                  setChoice((current) => toggleNewGroup(current, group.name, checked))
                }
              />
            </li>
          ))}
        </ul>
      )}
      {submittedNewGroups(choice).map((name) => (
        <input key={name} type="hidden" name="newGroups" value={name} />
      ))}

      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="newGroup">Новая группа</FieldLabel>
        <div className="flex gap-2">
          {/* No name: the typed text itself is not sent, only added groups are */}
          <Input
            id="newGroup"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds the group instead of submitting the whole form
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                add();
              }
            }}
            autoComplete="off"
            placeholder="Например: Теннис"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "newGroup-error" : undefined}
          />
          <Button type="button" variant="outline" className="h-11" onClick={add}>
            Добавить
          </Button>
        </div>
        {error && <FieldError id="newGroup-error">{error}</FieldError>}
      </Field>
    </FieldSet>
  );
}

function GroupCheckbox({
  label,
  checked,
  onCheckedChange,
  name,
  value,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name?: string;
  value?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 break-words">
      <Checkbox
        name={name}
        value={value}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}
