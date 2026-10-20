"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pluralForm, pluralize } from "@/lib/format";
import type { DeleteContactState } from "@/lib/validation";

type DeleteContactButtonProps = {
  action: (
    state: DeleteContactState,
    formData: FormData,
  ) => Promise<DeleteContactState>;
  name: string;
  notesCount: number;
};

export function DeleteContactButton({
  action,
  name,
  notesCount,
}: DeleteContactButtonProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState(false);

  // "Вместе с ним удалятся 3 заметки"; the verb agrees with the number
  const notesWarning =
    notesCount > 0
      ? `Вместе с ним ${pluralForm(notesCount, ["удалится", "удалятся", "удалятся"])} ${pluralize(notesCount, ["заметка", "заметки", "заметок"])}. `
      : "";

  return (
    <AlertDialog
      open={open}
      // Keep the dialog open while the contact is being deleted
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash2 aria-hidden />
        Удалить контакт
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-section font-medium break-words">
            Удалить контакт «{name}»?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base text-ink-soft">
            {notesWarning}Отменить это нельзя.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {/* Cancel comes first, so it gets the focus when the dialog opens */}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              disabled={pending}
            >
              {pending ? "Удаляю…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
