"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_FIELDS,
  type ContactField,
  type ContactFormState,
  type ContactFormValues,
} from "@/lib/validation";

type ContactFormProps = {
  action: (
    state: ContactFormState,
    formData: FormData,
  ) => Promise<ContactFormState>;
  initialValues: ContactFormValues;
  submitLabel: string;
  cancelHref: string;
};

export function ContactForm({
  action,
  initialValues,
  submitLabel,
  cancelHref,
}: ContactFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
    errors: {},
    version: 0,
  });
  const firstInvalid =
    CONTACT_FIELDS.find((field) => state.errors[field]) ?? "name";

  // Props shared by every field: restores typed values after a failed save,
  // focuses the first invalid field and links its error for screen readers.
  const fieldProps = (field: ContactField) => ({
    id: field,
    name: field,
    defaultValue: state.values[field],
    autoFocus: field === firstInvalid,
    "aria-invalid": state.errors[field] ? true : undefined,
    "aria-describedby": state.errors[field] ? `${field}-error` : undefined,
  });

  const error = (field: ContactField) =>
    state.errors[field] && (
      <FieldError id={`${field}-error`}>{state.errors[field]}</FieldError>
    );

  return (
    // A new key after each failed save remounts the fields with the submitted values
    <form
      key={state.version}
      action={formAction}
      noValidate
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <Field data-invalid={!!state.errors.name}>
          <FieldLabel htmlFor="name">
            Имя <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            {...fieldProps("name")}
            autoComplete="off"
            required
            placeholder="Например: Анна Смирнова"
          />
          {error("name")}
        </Field>

        <Field data-invalid={!!state.errors.about}>
          <FieldLabel htmlFor="about">Кто это</FieldLabel>
          <Input
            {...fieldProps("about")}
            autoComplete="off"
            placeholder="Например: дизайнер, сосед по даче"
          />
          {error("about")}
        </Field>

        <Field data-invalid={!!state.errors.howWeMet}>
          <FieldLabel htmlFor="howWeMet">Откуда знакомы</FieldLabel>
          <Textarea
            {...fieldProps("howWeMet")}
            rows={2}
            placeholder="Например: учились вместе в университете"
          />
          {error("howWeMet")}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!state.errors.phone}>
            <FieldLabel htmlFor="phone">Телефон</FieldLabel>
            <Input
              {...fieldProps("phone")}
              type="tel"
              autoComplete="off"
              placeholder="+7 900 000-00-00"
            />
            {error("phone")}
          </Field>

          <Field data-invalid={!!state.errors.email}>
            <FieldLabel htmlFor="email">Почта</FieldLabel>
            <Input
              {...fieldProps("email")}
              type="email"
              autoComplete="off"
              placeholder="name@mail.ru"
            />
            {error("email")}
          </Field>
        </div>
        <FieldDescription>
          Обязательно только имя, остальное можно дописать потом.
        </FieldDescription>
      </FieldGroup>

      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Сохраняю…" : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
