"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addNote,
  createContact,
  updateContact,
  type ContactInput,
} from "@/lib/contacts";
import {
  CONTACT_FIELDS,
  contactSchema,
  noteSchema,
  type ContactField,
  type ContactFormState,
  type ContactFormValues,
  type NoteFormState,
} from "@/lib/validation";

const SAVE_FAILED = "Не удалось сохранить. Попробуйте ещё раз.";
const CONTACT_MISSING = "Контакт не найден: возможно, его уже нет в базе.";

function readContactValues(formData: FormData): ContactFormValues {
  return Object.fromEntries(
    CONTACT_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as ContactFormValues;
}

function firstErrors(error: z.ZodError): ContactFormState["errors"] {
  const { fieldErrors } = z.flattenError(error);
  const errors: ContactFormState["errors"] = {};
  for (const field of CONTACT_FIELDS) {
    const message = (fieldErrors as Partial<Record<ContactField, string[]>>)[field]?.[0];
    if (message) errors[field] = message;
  }
  return errors;
}

function parseContact(
  prevState: ContactFormState,
  formData: FormData,
): { ok: true; data: ContactInput } | { ok: false; state: ContactFormState } {
  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      state: failedState(prevState, formData, { errors: firstErrors(parsed.error) }),
    };
  }
  return { ok: true, data: parsed.data };
}

function failedState(
  prevState: ContactFormState,
  formData: FormData,
  { errors = {}, message }: Pick<Partial<ContactFormState>, "errors" | "message">,
): ContactFormState {
  return {
    values: readContactValues(formData),
    errors,
    message,
    version: prevState.version + 1,
  };
}

export async function createContactAction(
  prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = parseContact(prevState, formData);
  if (!parsed.ok) return parsed.state;

  let id: number;
  try {
    id = await createContact(parsed.data);
  } catch (error) {
    console.error("Failed to create contact", error);
    return failedState(prevState, formData, { message: SAVE_FAILED });
  }

  revalidatePath("/");
  redirect(`/?added=${id}`);
}

export async function updateContactAction(
  contactId: number,
  prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = parseContact(prevState, formData);
  if (!parsed.ok) return parsed.state;

  let updated: boolean;
  try {
    updated = await updateContact(contactId, parsed.data);
  } catch (error) {
    console.error("Failed to update contact", error);
    return failedState(prevState, formData, { message: SAVE_FAILED });
  }
  if (!updated) {
    return failedState(prevState, formData, { message: CONTACT_MISSING });
  }

  revalidatePath("/");
  redirect(`/contacts/${contactId}`);
}

export async function addNoteAction(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const body = String(formData.get("body") ?? "");
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: parsed.error.issues[0]?.message };
  }

  let added: boolean;
  try {
    added = await addNote(contactId, parsed.data.body);
  } catch (error) {
    console.error("Failed to add note", error);
    return { body, error: SAVE_FAILED };
  }
  if (!added) {
    return { body, error: CONTACT_MISSING };
  }

  refresh();
  return { body: "" };
}
