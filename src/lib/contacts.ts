import "server-only";

import { count, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";

export type ContactInput = {
  name: string;
  about: string | null;
  howWeMet: string | null;
  phone: string | null;
  email: string | null;
  contactFrequency: ContactFrequency | null;
};

// Case-insensitive and treats "ё" as "е", so "семен" finds "Семён"
function normalizeForSearch(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е");
}

function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// The surname is the last word of the name: "Анна Смирнова" -> "Смирнова";
// a one-word name ("Мама") is its own surname
const surname = sql`regexp_replace(${contacts.name}, '^.*[[:space:]]', '')`;

// The list shows the surname first: "Иван Иванович Петров" -> "Петров Иван Иванович"
const listName = sql<string>`regexp_replace(${contacts.name}, '^(.*[^[:space:]])[[:space:]]+([^[:space:]]+)$', '\\2 \\1')`;

export async function listContacts(query: string) {
  // Contacts must be read fresh on every request, never prerendered
  await connection();

  // Finds "Анна Смирнова" both as written and as shown in the list
  const normalized = normalizeForSearch(query.trim());
  const pattern = `%${escapeLikePattern(normalized)}%`;
  const nameFilter = normalized
    ? or(
        sql`replace(lower(${contacts.name}), 'ё', 'е') like ${pattern}`,
        sql`replace(lower(${listName}), 'ё', 'е') like ${pattern}`,
      )
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        listName: listName.as("list_name"),
        about: contacts.about,
        phone: contacts.phone,
        email: contacts.email,
      })
      .from(contacts)
      .where(nameFilter)
      // By surname, then by the rest of the name within one surname
      .orderBy(
        sql`${surname} collate "ru-x-icu"`,
        sql`${listName} collate "ru-x-icu"`,
        contacts.id,
      ),
    db.select({ total: count() }).from(contacts),
  ]);

  return { contacts: rows, total };
}

export type ContactListItem = Awaited<
  ReturnType<typeof listContacts>
>["contacts"][number];

// Months are calendar ones: Jan 31 + 1 month is the last day of February
const FREQUENCY_INTERVALS: Record<ContactFrequency, string> = {
  week: "7 days",
  month: "1 month",
  quarter: "3 months",
  year: "1 year",
};

const frequencyInterval = sql`case ${contacts.contactFrequency} ${sql.raw(
  Object.entries(FREQUENCY_INTERVALS)
    .map(([frequency, interval]) => `when '${frequency}' then interval '${interval}'`)
    .join(" "),
)} end`;

// The last catch-up is the latest note, or the moment the contact was added
const lastContactAt = sql`coalesce(max(${notes.createdAt}), ${contacts.createdAt})`;

// The moment the contact's period runs out
const dueAt = sql`${lastContactAt} + ${frequencyInterval}`;

// Contacts whose period has run out since the last catch-up
export async function listDueContacts() {
  await connection();

  return db
    .select({
      id: contacts.id,
      listName: listName.as("list_name"),
      contactFrequency: sql<ContactFrequency>`${contacts.contactFrequency}`.as(
        "contact_frequency",
      ),
      // Whole days, against the same now() as the filter below
      daysSinceContact: sql<number>`floor(extract(epoch from now() - ${lastContactAt}) / 86400)::int`.as(
        "days_since_contact",
      ),
    })
    .from(contacts)
    .leftJoin(notes, eq(notes.contactId, contacts.id))
    .where(isNotNull(contacts.contactFrequency))
    .groupBy(contacts.id)
    .having(sql`${dueAt} < now()`)
    // The longest overdue first, then in the same order as the contact list
    .orderBy(
      dueAt,
      sql`${surname} collate "ru-x-icu"`,
      sql`${listName} collate "ru-x-icu"`,
      contacts.id,
    );
}

export type DueContact = Awaited<ReturnType<typeof listDueContacts>>[number];

// cache() dedupes the query between the page and its metadata within one request
export const getContact = cache(async (id: number) => {
  await connection();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  return contact ?? null;
});

export async function listNotes(contactId: number) {
  await connection();

  return db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

export async function countNotes(contactId: number) {
  await connection();

  const [{ total }] = await db
    .select({ total: count() })
    .from(notes)
    .where(eq(notes.contactId, contactId));
  return total;
}

export async function createContact(input: ContactInput) {
  const [created] = await db
    .insert(contacts)
    .values(input)
    .returning({ id: contacts.id });
  return created.id;
}

export async function updateContact(id: number, input: ContactInput) {
  const updated = await db
    .update(contacts)
    .set(input)
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return updated.length > 0;
}

// Returns the deleted contact's name, or null if it was already gone.
// Its notes are removed by the database (on delete cascade).
export async function deleteContact(id: number) {
  const [deleted] = await db
    .delete(contacts)
    .where(eq(contacts.id, id))
    .returning({ name: contacts.name });
  return deleted?.name ?? null;
}

export async function addNote(contactId: number, body: string) {
  return db.transaction(async (tx) => {
    // Adding a note counts as a change to the contact
    const touched = await tx
      .update(contacts)
      .set({ updatedAt: new Date() })
      .where(eq(contacts.id, contactId))
      .returning({ id: contacts.id });
    if (touched.length === 0) {
      return false;
    }

    await tx.insert(notes).values({ contactId, body });
    return true;
  });
}
