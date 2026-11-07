"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { DeleteGroupButton } from "@/components/delete-group-button";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DeleteGroupState, RenameGroupState } from "@/lib/validation";

type GroupHeaderProps = {
  name: string;
  // E.g. «5 контактов»
  sizeLabel: string;
  renameAction: (
    state: RenameGroupState,
    formData: FormData,
  ) => Promise<RenameGroupState>;
  deleteAction: (
    state: DeleteGroupState,
    formData: FormData,
  ) => Promise<DeleteGroupState>;
};

// The selected group above the list: its name, size, «Переименовать» and «Удалить»
export function GroupHeader({
  name,
  sizeLabel,
  renameAction,
  deleteAction,
}: GroupHeaderProps) {
  const [state, formAction, pending] = useActionState(renameAction, {
    version: 0,
  });
  // The answer version when the field was opened; null while it is closed.
  // Only answers newer than that belong to this opening of the field.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const answer = openedAt !== null && state.version > openedAt ? state : null;

  // Saved: close the field; the page already shows the new name
  if (answer?.renamed) setOpenedAt(null);

  // Next.js keeps a page's state while you are away from it; close the field
  // when the page is left, so coming back shows the group as usual
  useEffect(() => () => setOpenedAt(null), []);

  if (openedAt !== null && !answer?.renamed) {
    return (
      <div className="flex flex-col gap-2">
        <form
          // Remounts the field with the typed name after each answer
          key={state.version}
          action={formAction}
          noValidate
          className="flex flex-wrap gap-2"
        >
          <Input
            name="name"
            defaultValue={answer?.value ?? name}
            autoFocus
            autoComplete="off"
            aria-label="Название группы"
            aria-invalid={answer?.error ? true : undefined}
            aria-describedby={answer?.error ? "group-name-error" : undefined}
            className="min-w-0 flex-1 basis-60"
          />
          <div className="flex gap-2">
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "Сохраняю…" : "Сохранить"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={pending}
              onClick={() => setOpenedAt(null)}
            >
              Отмена
            </Button>
          </div>
        </form>
        {answer?.error && (
          <FieldError id="group-name-error">{answer.error}</FieldError>
        )}
        <p className="eyebrow">{sizeLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="font-display text-section font-medium break-words sm:text-section-lg">
          {name}
        </h2>
        <p className="mt-2 eyebrow">{sizeLabel}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-11 sm:h-10"
          onClick={() => setOpenedAt(state.version)}
        >
          <Pencil aria-hidden />
          Переименовать
        </Button>
        <DeleteGroupButton action={deleteAction} name={name} />
      </div>
    </div>
  );
}
