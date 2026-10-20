import { z } from "zod";

const tooLong = (max: number) => `Слишком длинно: не больше ${max} символов`;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, tooLong(max))
    .transform((value) => value || null);

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(200, tooLong(200)),
  about: optionalText(500),
  howWeMet: optionalText(500),
  phone: z
    .string()
    .trim()
    .max(50, tooLong(50))
    .regex(
      /^[\d\s()+\-.]*$/,
      "В телефоне могут быть только цифры, пробелы и знаки + - ( )",
    )
    .transform((value) => value || null),
  email: z
    .string()
    .trim()
    .max(254, tooLong(254))
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Проверьте адрес почты, например: name@mail.ru",
    )
    .transform((value) => value || null),
});

export type ContactField = keyof z.input<typeof contactSchema>;

export const CONTACT_FIELDS = [
  "name",
  "about",
  "howWeMet",
  "phone",
  "email",
] as const satisfies readonly ContactField[];

export type ContactFormValues = Record<ContactField, string>;

export type ContactFormState = {
  values: ContactFormValues;
  errors: Partial<Record<ContactField, string>>;
  message?: string;
  // Grows on every failed save so the form remounts with the submitted values
  version: number;
};

export const emptyContactValues: ContactFormValues = {
  name: "",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
};

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст заметки")
    .max(5000, tooLong(5000)),
});

export type NoteFormState = {
  body: string;
  error?: string;
};

export type DeleteContactState = {
  error?: string;
};
