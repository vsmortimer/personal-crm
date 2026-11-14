import "server-only";

import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import { BIRTHDAY_SOON_DAYS, nextBirthday } from "@/lib/birthday";
import type { ContactFrequency } from "@/lib/contact-frequency";
import { setContactGroups } from "@/lib/groups";
import type { ContactGroupsInput } from "@/lib/validation";

export type ContactInput = {
  name: string;
  about: string | null;
  howWeMet: string | null;
  phone: string | null;
  email: string | null;
  contactFrequency: ContactFrequency | null;
  // Day and month go together; the year is optional
  birthDay: number | null;
  birthMonth: number | null;
  birthYear: number | null;
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

// Written with explicit table names: drizzle leaves columns unqualified in a
// single-table query, and inside these subqueries "id" would mean groups.id

// Names of the contact's groups, alphabetical
const contactGroupNames = sql<string[]>`array(
  select g.name from contact_groups cg
  join groups g on g.id = cg.group_id
  where cg.contact_id = contacts.id
  order by g.name collate "ru-x-icu", g.id
)`;

function inGroup(groupId: number) {
  return sql`exists (
    select 1 from contact_groups cg
    where cg.contact_id = contacts.id and cg.group_id = ${groupId}
  )`;
}

// Every function below takes the id of the person first and sees only the
// contacts of that person. A contact of someone else is as good as not there.

// With a group, both the list and the total are within that group:
// "Найдено: 2 из 5" where 5 is how many people are in the group
export async function listContacts(
  userId: string,
  query: string,
  groupId: number | null = null,
) {
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

  const groupFilter = groupId ? inGroup(groupId) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        listName: listName.as("list_name"),
        about: contacts.about,
        phone: contacts.phone,
        email: contacts.email,
        groups: contactGroupNames.as("groups"),
      })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), nameFilter, groupFilter))
      // By surname, then by the rest of the name within one surname
      .orderBy(
        sql`${surname} collate "ru-x-icu"`,
        sql`${listName} collate "ru-x-icu"`,
        contacts.id,
      ),
    db
      .select({ total: count() })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), groupFilter)),
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
    .map(
      ([frequency, interval]) =>
        `when '${frequency}' then interval '${interval}'`,
    )
    .join(" "),
)} end`;

// The last catch-up is the latest note, or the moment the contact was added
const lastContactAt = sql`coalesce(max(${notes.createdAt}), ${contacts.createdAt})`;

// The moment the contact's period runs out
const dueAt = sql`${lastContactAt} + ${frequencyInterval}`;

// Contacts whose period has run out since the last catch-up.
// `now` lets tests set the clock; the app leaves it out and gets the
// database's own time
export async function listDueContacts(userId: string, now?: Date) {
  await connection();

  const currentTime = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;

  return (
    db
      .select({
        id: contacts.id,
        listName: listName.as("list_name"),
        contactFrequency:
          sql<ContactFrequency>`${contacts.contactFrequency}`.as(
            "contact_frequency",
          ),
        // Whole days, against the same time as the filter below
        daysSinceContact:
          sql<number>`floor(extract(epoch from ${currentTime} - ${lastContactAt}) / 86400)::int`.as(
            "days_since_contact",
          ),
      })
      .from(contacts)
      .leftJoin(notes, eq(notes.contactId, contacts.id))
      .where(
        and(eq(contacts.userId, userId), isNotNull(contacts.contactFrequency)),
      )
      .groupBy(contacts.id)
      .having(sql`${dueAt} < ${currentTime}`)
      // The longest overdue first, then in the same order as the contact list
      .orderBy(
        dueAt,
        sql`${surname} collate "ru-x-icu"`,
        sql`${listName} collate "ru-x-icu"`,
        contacts.id,
      )
  );
}

export type DueContact = Awaited<ReturnType<typeof listDueContacts>>[number];

// Contacts whose birthday is today or in the next BIRTHDAY_SOON_DAYS days,
// the nearest first. The dates are counted in code, not in SQL: February 29
// and the turn of the year are easier to get right and to test there, and one
// person has hundreds of contacts, not millions. `now` lets tests set the
// clock.
export async function listBirthdayContacts(userId: string, now = new Date()) {
  await connection();

  const withBirthday = await db
    .select({
      id: contacts.id,
      listName: listName.as("list_name"),
      birthDay: contacts.birthDay,
      birthMonth: contacts.birthMonth,
      birthYear: contacts.birthYear,
    })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), isNotNull(contacts.birthDay)))
    // The same order as the contact list; a birthday on the same day keeps it
    .orderBy(
      sql`${surname} collate "ru-x-icu"`,
      sql`${listName} collate "ru-x-icu"`,
      contacts.id,
    );

  return (
    withBirthday
      .map(({ id, listName, birthDay, birthMonth, birthYear }) => ({
        id,
        listName,
        // The day and the month go together (a check in the database)
        next: nextBirthday(
          { day: birthDay!, month: birthMonth!, year: birthYear },
          now,
        ),
      }))
      .filter(({ next }) => next.daysLeft <= BIRTHDAY_SOON_DAYS)
      // The sort is stable: the order by surname stays within one day
      .sort((a, b) => a.next.daysLeft - b.next.daysLeft)
  );
}

export type BirthdayContact = Awaited<
  ReturnType<typeof listBirthdayContacts>
>[number];

// cache() dedupes the query between the page and its metadata within one request
export const getContact = cache(async (userId: string, id: number) => {
  await connection();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .limit(1);
  return contact ?? null;
});

// A note belongs to the owner of its contact, so the notes are read through it
function notesOfContact(userId: string, contactId: number) {
  return and(eq(notes.contactId, contactId), eq(contacts.userId, userId));
}

export async function listNotes(userId: string, contactId: number) {
  await connection();

  return db
    .select(getTableColumns(notes))
    .from(notes)
    .innerJoin(contacts, eq(contacts.id, notes.contactId))
    .where(notesOfContact(userId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

export async function countNotes(userId: string, contactId: number) {
  await connection();

  const [{ total }] = await db
    .select({ total: count() })
    .from(notes)
    .innerJoin(contacts, eq(contacts.id, notes.contactId))
    .where(notesOfContact(userId, contactId));
  return total;
}

// The contact and its groups are saved together or not at all
export async function createContact(
  userId: string,
  input: ContactInput,
  groupsInput: ContactGroupsInput,
) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contacts)
      .values({ ...input, userId })
      .returning({ id: contacts.id });
    await setContactGroups(tx, userId, created.id, groupsInput);
    return created.id;
  });
}

export async function updateContact(
  userId: string,
  id: number,
  input: ContactInput,
  groupsInput: ContactGroupsInput,
) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(contacts)
      .set(input)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning({ id: contacts.id });
    if (updated.length === 0) return false;

    await setContactGroups(tx, userId, id, groupsInput);
    return true;
  });
}

// Returns the deleted contact's name, or null if it was already gone.
// Its notes are removed by the database (on delete cascade).
export async function deleteContact(userId: string, id: number) {
  const [deleted] = await db
    .delete(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .returning({ name: contacts.name });
  return deleted?.name ?? null;
}

export async function addNote(userId: string, contactId: number, body: string) {
  return db.transaction(async (tx) => {
    // Adding a note counts as a change to the contact
    const touched = await tx
      .update(contacts)
      .set({ updatedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
      .returning({ id: contacts.id });
    if (touched.length === 0) {
      return false;
    }

    await tx.insert(notes).values({ contactId, body });
    return true;
  });
}
