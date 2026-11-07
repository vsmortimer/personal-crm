import { db } from "@/db";
import { postgresErrorCode } from "@/db/errors";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";

export { CHECK_VIOLATION, UNIQUE_VIOLATION } from "@/db/errors";

// Postgres error code of a query that must fail
export async function failureCode(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code) return code;
    throw error;
  }
  throw new Error("Expected the query to fail, but it succeeded");
}

// Without the options: no contact frequency, added just now
export async function insertContact(
  name: string,
  {
    contactFrequency = null,
    createdAt,
  }: { contactFrequency?: ContactFrequency | null; createdAt?: Date } = {},
) {
  const [contact] = await db
    .insert(contacts)
    .values({ name, contactFrequency, createdAt })
    .returning({ id: contacts.id });
  return contact.id;
}

// Without createdAt the note is written just now
export async function insertNote(
  contactId: number,
  body: string,
  createdAt?: Date,
) {
  await db.insert(notes).values({ contactId, body, createdAt });
}

export async function insertGroup(name: string) {
  const [group] = await db
    .insert(groups)
    .values({ name })
    .returning({ id: groups.id });
  return group.id;
}

export async function addToGroup(contactId: number, groupId: number) {
  await db.insert(contactGroups).values({ contactId, groupId });
}
