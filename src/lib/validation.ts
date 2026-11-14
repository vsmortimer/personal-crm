import { z } from "zod";

import { moscowToday } from "@/lib/birthday";
import { CONTACT_FREQUENCIES } from "@/lib/contact-frequency";
import { parseGroupId } from "@/lib/format";

const tooLong = (max: number) => `Слишком длинно: не больше ${max} символов`;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, tooLong(max))
    .transform((value) => value || null);

// The birth date comes from the form as three strings, "" means "not set".
// The form offers only real days and months, so a wrong value can come only
// from a forged request. The database checks the same (src/db/schema.ts) but
// knows neither the current year nor which years are leap ones.
const BIRTH_YEAR_FIRST = 1900;
const NEED_DAY_AND_MONTH = "Нужны и день, и месяц";
const NO_SUCH_DATE = "Такой даты нет";
const BAD_YEAR = "Год должен быть от 1900 до нынешнего";

// February has 29 days here: whether the year is a leap one is checked below
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

// Only digits: "1.5", "-3", "1e1" and full-width digits are not numbers here
function wholeNumber(text: string): number | null {
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

type BirthInput = { birthDay: string; birthMonth: string; birthYear: string };

type ParsedBirth =
  | { ok: true; day: number | null; month: number | null; year: number | null }
  | { ok: false; message: string };

function parseBirth(input: BirthInput): ParsedBirth {
  const dayText = input.birthDay.trim();
  const monthText = input.birthMonth.trim();
  const yearText = input.birthYear.trim();
  if (!dayText && !monthText && !yearText) {
    return { ok: true, day: null, month: null, year: null };
  }
  if (!dayText || !monthText) return { ok: false, message: NEED_DAY_AND_MONTH };

  const day = wholeNumber(dayText);
  const month = wholeNumber(monthText);
  if (!day || !month || month > 12 || day > MONTH_DAYS[month - 1]) {
    return { ok: false, message: NO_SUCH_DATE };
  }
  if (!yearText) return { ok: true, day, month, year: null };

  const year = wholeNumber(yearText);
  if (
    year === null ||
    year < BIRTH_YEAR_FIRST ||
    year > moscowToday(new Date()).year
  ) {
    return { ok: false, message: BAD_YEAR };
  }
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return { ok: false, message: NO_SUCH_DATE };
  }
  return { ok: true, day, month, year };
}

const contactFieldsSchema = z.object({
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
  birthDay: z.string(),
  birthMonth: z.string(),
  birthYear: z.string(),
});

// All the date's mistakes go to one place, under the "День" field, and show
// as one line under the whole group of the date's fields. The check is
// separate from the transform so that it runs next to the other fields'
// checks: a wrong email does not hide a wrong date.
export const contactSchema = contactFieldsSchema
  .superRefine((data, ctx) => {
    const birth = parseBirth(data);
    if (!birth.ok) {
      ctx.addIssue({
        code: "custom",
        message: birth.message,
        path: ["birthDay"],
      });
    }
  })
  .transform(({ birthDay, birthMonth, birthYear, ...rest }) => {
    // Cannot fail here: a wrong date has already failed the check above
    const birth = parseBirth({ birthDay, birthMonth, birthYear });
    return {
      ...rest,
      birthDay: birth.ok ? birth.day : null,
      birthMonth: birth.ok ? birth.month : null,
      birthYear: birth.ok ? birth.year : null,
    };
  });

export type ContactField = keyof z.input<typeof contactSchema>;

export const CONTACT_FIELDS = [
  "name",
  "about",
  "howWeMet",
  "phone",
  "email",
  "contactFrequency",
  "birthDay",
  "birthMonth",
  "birthYear",
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
  birthDay: "",
  birthMonth: "",
  birthYear: "",
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
