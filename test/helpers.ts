import { db } from "@/db";
import { postgresErrorCode } from "@/db/errors";
import { contactGroups, contacts, groups, notes } from "@/db/schema";

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

export async function insertContact(name: string) {
  const [contact] = await db
    .insert(contacts)
    .values({ name })
    .returning({ id: contacts.id });
  return contact.id;
}

export async function insertNote(contactId: number, body: string) {
  await db.insert(notes).values({ contactId, body });
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
