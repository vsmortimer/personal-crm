"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addNote,
  createContact,
  deleteContact,
  updateContact,
  type ContactInput,
} from "@/lib/contacts";
import { deleteGroup, renameGroup } from "@/lib/groups";
import {
  CONTACT_FIELDS,
  contactSchema,
  noteSchema,
  parseContactGroups,
  type ContactField,
  type ContactGroupsInput,
  type ContactFormState,
  type ContactFormValues,
  type DeleteContactState,
  type DeleteGroupState,
  type NoteFormState,
  type RenameGroupState,
} from "@/lib/validation";

const SAVE_FAILED = "Не удалось сохранить. Попробуйте ещё раз.";
const DELETE_FAILED = "Не удалось удалить. Попробуйте ещё раз.";
const CONTACT_MISSING = "Контакт не найден: возможно, его уже нет в базе.";
const GROUP_MISSING = "Группа не найдена: возможно, её уже нет в базе.";

function readContactValues(formData: FormData): ContactFormValues {
  return Object.fromEntries(
    CONTACT_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as ContactFormValues;
}

function firstErrors(error: z.ZodError): ContactFormState["errors"] {
  const { fieldErrors } = z.flattenError(error);
  const errors: ContactFormState["errors"] = {};
  for (const field of CONTACT_FIELDS) {
    const message = (fieldErrors as Partial<Record<ContactField, string[]>>)[
      field
    ]?.[0];
    if (message) errors[field] = message;
  }
  return errors;
}

function parseContact(
  prevState: ContactFormState,
  formData: FormData,
):
  | { ok: true; data: ContactInput; groups: ContactGroupsInput }
  | { ok: false; state: ContactFormState } {
  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      state: failedState(prevState, formData, {
        errors: firstErrors(parsed.error),
      }),
    };
  }
  return { ok: true, data: parsed.data, groups: parseContactGroups(formData) };
}

function failedState(
  prevState: ContactFormState,
  formData: FormData,
  {
    errors = {},
    message,
  }: Pick<Partial<ContactFormState>, "errors" | "message">,
): ContactFormState {
  return {
    values: readContactValues(formData),
    // The checked groups and the typed new ones go back into the form too
    ...parseContactGroups(formData),
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
    id = await createContact(parsed.data, parsed.groups);
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
    updated = await updateContact(contactId, parsed.data, parsed.groups);
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

// Used as a form action through useActionState; needs nothing from the form
export async function deleteContactAction(
  contactId: number,
): Promise<DeleteContactState> {
  let name: string | null;
  try {
    name = await deleteContact(contactId);
  } catch (error) {
    console.error("Failed to delete contact", error);
    return { error: DELETE_FAILED };
  }
  if (name === null) {
    return { error: CONTACT_MISSING };
  }

  revalidatePath("/");
  redirect(`/?deleted=${encodeURIComponent(name)}`);
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

export async function renameGroupAction(
  groupId: number,
  prevState: RenameGroupState,
  formData: FormData,
): Promise<RenameGroupState> {
  const value = String(formData.get("name") ?? "");
  const version = prevState.version + 1;

  let result: Awaited<ReturnType<typeof renameGroup>>;
  try {
    result = await renameGroup(groupId, value);
  } catch (error) {
    console.error("Failed to rename group", error);
    return { version, value, error: SAVE_FAILED };
  }
  if (result.status === "invalid") {
    return { version, value, error: result.error };
  }
  if (result.status === "missing") {
    return { version, value, error: GROUP_MISSING };
  }

  // The new name shows up in the filter, the header and the list rows;
  // the address stays, so the group stays selected
  revalidatePath("/");
  refresh();
  return { version, renamed: true };
}

// Used as a form action through useActionState; needs nothing from the form
export async function deleteGroupAction(
  groupId: number,
): Promise<DeleteGroupState> {
  let name: string | null;
  try {
    name = await deleteGroup(groupId);
  } catch (error) {
    console.error("Failed to delete group", error);
    return { error: DELETE_FAILED };
  }
  if (name === null) {
    return { error: GROUP_MISSING };
  }

  revalidatePath("/");
  redirect(`/?deletedGroup=${encodeURIComponent(name)}`);
}
