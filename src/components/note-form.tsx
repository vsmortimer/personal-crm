"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { NoteFormState } from "@/lib/validation";

export function NoteForm({
  action,
}: {
  action: (state: NoteFormState, formData: FormData) => Promise<NoteFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { body: "" });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <Field data-invalid={!!state.error}>
        <FieldLabel htmlFor="note-body" className="sr-only">
          Новая заметка
        </FieldLabel>
        <Textarea
          id="note-body"
          name="body"
          rows={3}
          defaultValue={state.body}
          placeholder="Что обсудили, о чём договорились…"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "note-body-error" : undefined}
          onKeyDown={(event) => {
            // Cmd/Ctrl + Enter saves the note
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {state.error && (
          <FieldError id="note-body-error">{state.error}</FieldError>
        )}
      </Field>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          или ⌘/Ctrl + Enter
        </span>
      </div>
    </form>
  );
}
