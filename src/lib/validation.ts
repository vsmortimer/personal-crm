import { z } from "zod";

import { CONTACT_FREQUENCIES } from "@/lib/contact-frequency";
import { parseGroupId } from "@/lib/format";

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
  // "" means "not set"; a value off the list can only come from a forged request
  contactFrequency: z
    .enum(["", ...CONTACT_FREQUENCIES] as const, {
      error: "Выберите вариант из списка",
    })
    .transform((value) => value || null),
});

export type ContactField = keyof z.input<typeof contactSchema>;

export const CONTACT_FIELDS = [
  "name",
  "about",
  "howWeMet",
  "phone",
  "email",
  "contactFrequency",
] as const satisfies readonly ContactField[];

export type ContactFormValues = Record<ContactField, string>;

// Groups checked in the contact form: existing ones by id, new ones by name
export type ContactGroupsInput = {
  groupIds: number[];
  newGroups: string[];
};

export type ContactFormState = ContactGroupsInput & {
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
  contactFrequency: "",
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

// The rename field above the list. `version` grows with every answer from
// the server; `value` is the typed name to show again after an error.
export type RenameGroupState = {
  version: number;
  renamed?: boolean;
  error?: string;
  value?: string;
};

export type DeleteGroupState = {
  error?: string;
};

// One rule for a new group in the contact form and for renaming a group;
// the database checks the same limit (src/db/schema.ts)
export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Укажите название группы")
  .max(50, tooLong(50));

// The form sends a "groupIds" field per checked group and a "newGroups"
// field per checked new group. Anything else can only come from a forged
// request and is dropped; a new name repeated in another case counts once.
export function parseContactGroups(formData: FormData): ContactGroupsInput {
  const groupIds = new Set<number>();
  for (const raw of formData.getAll("groupIds")) {
    const id = typeof raw === "string" ? parseGroupId(raw) : null;
    if (id) groupIds.add(id);
  }

  const newGroups = new Map<string, string>();
  for (const raw of formData.getAll("newGroups")) {
    const parsed = groupNameSchema.safeParse(raw);
    const key = parsed.data?.toLowerCase();
    if (parsed.success && key && !newGroups.has(key)) {
      newGroups.set(key, parsed.data);
    }
  }

  return { groupIds: [...groupIds], newGroups: [...newGroups.values()] };
}
