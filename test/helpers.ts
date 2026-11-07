import { db } from "@/db";
import { postgresErrorCode } from "@/db/errors";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";

export {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  NOT_NULL_VIOLATION,
  UNIQUE_VIOLATION,
} from "@/db/errors";

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

// A person who signed in, the owner of contacts and groups. Returns the id.
// The id is made from the address, so it is easy to tell who is who in a failure
export async function insertUser(email: string) {
  const [user] = await db
    .insert(users)
    .values({ id: `user-${email}`, name: "", email, emailVerified: true })
    .returning({ id: users.id });
  return user.id;
}

// Without the options: no contact frequency, added just now
export async function insertContact(
  userId: string,
  name: string,
  {
    contactFrequency = null,
    createdAt,
  }: { contactFrequency?: ContactFrequency | null; createdAt?: Date } = {},
) {
  const [contact] = await db
    .insert(contacts)
    .values({ userId, name, contactFrequency, createdAt })
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

export async function insertGroup(userId: string, name: string) {
  const [group] = await db
    .insert(groups)
    .values({ userId, name })
    .returning({ id: groups.id });
  return group.id;
}

export async function addToGroup(contactId: number, groupId: number) {
  await db.insert(contactGroups).values({ contactId, groupId });
}
