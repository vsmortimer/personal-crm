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
import type { DeleteGroupState } from "@/lib/validation";

type DeleteGroupButtonProps = {
  action: (
    state: DeleteGroupState,
    formData: FormData,
  ) => Promise<DeleteGroupState>;
  name: string;
};

// Works like DeleteContactButton
export function DeleteGroupButton({ action, name }: DeleteGroupButtonProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog
      open={open}
      // Keep the dialog open while the group is being deleted
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="destructive" className="h-11 sm:h-10" />}
      >
        <Trash2 aria-hidden />
        Удалить
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-section font-medium break-words">
            Удалить группу «{name}»?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base text-ink-soft">
            Сами контакты не удалятся: они только перестанут быть в этой группе.
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
