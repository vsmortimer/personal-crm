"use client";

import { useActionState } from "react";

import { requestLoginLinkAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emptyLoginForm } from "@/lib/login-form";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    requestLoginLinkAction,
    emptyLoginForm,
  );

  return (
    // A new key after each answer remounts the field with the address in it
    <form
      key={state.version}
      action={formAction}
      noValidate
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <Field data-invalid={!!state.emailError}>
          <FieldLabel htmlFor="email">Почта</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            defaultValue={state.email}
            aria-invalid={state.emailError ? true : undefined}
            aria-describedby={state.emailError ? "email-error" : undefined}
          />
          {state.emailError && (
            <FieldError id="email-error">{state.emailError}</FieldError>
          )}
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        Получить ссылку
      </Button>

      {state.sentTo && (
        <p
          role="status"
          className="rounded-lg border border-success-line bg-success px-4 py-3 text-sm break-words text-success-ink"
        >
          Ссылка для входа отправлена на {state.sentTo}
        </p>
      )}
      {state.message && (
        <p role="alert" className="text-sm break-words text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
