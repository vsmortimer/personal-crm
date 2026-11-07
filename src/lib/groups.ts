import "server-only";

import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { UNIQUE_VIOLATION, postgresErrorCode } from "@/db/errors";
import { contactGroups, contacts, groups } from "@/db/schema";
import { parseGroupId } from "@/lib/format";
import { groupNameSchema, type ContactGroupsInput } from "@/lib/validation";

// Alphabetical, the same way the contact list sorts names
const byName = [sql`${groups.name} collate "ru-x-icu"`, groups.id];

// Every function here takes the id of the person first and sees only the
// groups of that person. A group of someone else is as good as not there.

// All groups with how many contacts are in each; empty groups included
export async function listGroups(userId: string) {
  await connection();

  return db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: count(contactGroups.contactId),
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .where(eq(groups.userId, userId))
    .groupBy(groups.id)
    .orderBy(...byName);
}

export type GroupListItem = Awaited<ReturnType<typeof listGroups>>[number];

// The group chosen in the home page filter, from ?group=<id>. A group that
// is gone (e.g. deleted in another tab) or a broken value means «Все».
export function selectedGroup<T extends { id: number }>(
  groups: T[],
  raw: string | string[] | undefined,
): T | null {
  const id = typeof raw === "string" ? parseGroupId(raw) : null;
  return groups.find((group) => group.id === id) ?? null;
}

export async function listContactGroups(userId: string, contactId: number) {
  await connection();

  return db
    .select({ id: groups.id, name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .innerJoin(contacts, eq(contacts.id, contactGroups.contactId))
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        eq(groups.userId, userId),
        eq(contacts.userId, userId),
      ),
    )
    .orderBy(...byName);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Puts the contact into exactly these groups, inside the contact's own save.
// New names become groups of this user; a name that already exists in any
// letter case (e.g. just created in another tab) means that group, not a copy.
export async function setContactGroups(
  tx: Transaction,
  userId: string,
  contactId: number,
  { groupIds, newGroups }: ContactGroupsInput,
) {
  const ids = [...groupIds];
  if (newGroups.length > 0) {
    await tx
      .insert(groups)
      .values(newGroups.map((name) => ({ userId, name })))
      .onConflictDoNothing();
    const named = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(
          eq(groups.userId, userId),
          sql`lower(${groups.name}) in (${sql.join(
            newGroups.map((name) => sql`lower(${name})`),
            sql`, `,
          )})`,
        ),
      );
    ids.push(...named.map((group) => group.id));
  }

  await tx.delete(contactGroups).where(eq(contactGroups.contactId, contactId));
  if (ids.length === 0) return;

  // Selecting from this user's groups skips ids of groups deleted meanwhile
  // and ids of groups of other users, which can only come from a forged request
  await tx.insert(contactGroups).select(
    tx
      .select({
        contactId: sql<number>`cast(${contactId} as integer)`.as("contact_id"),
        groupId: groups.id,
      })
      .from(groups)
      .where(and(inArray(groups.id, ids), eq(groups.userId, userId))),
  );
}

export type RenameGroupResult =
  | { status: "renamed"; name: string }
  // The name breaks the rules or belongs to another group; the text is for the field
  | { status: "invalid"; error: string }
  | { status: "missing" };

// The same name rules as for a new group in the contact form
export async function renameGroup(
  userId: string,
  id: number,
  rawName: string,
): Promise<RenameGroupResult> {
  const parsed = groupNameSchema.safeParse(rawName);
  if (!parsed.success) {
    return { status: "invalid", error: parsed.error.issues[0]?.message ?? "" };
  }
  const name = parsed.data;

  // "теннис" -> "Теннис" of the same group is fine: only other groups count
  const takenBy = async () => {
    const [other] = await db
      .select({ name: groups.name })
      .from(groups)
      .where(
        and(
          eq(groups.userId, userId),
          sql`lower(${groups.name}) = lower(${name})`,
          ne(groups.id, id),
        ),
      )
      .limit(1);
    return other
      ? { status: "invalid" as const, error: `Группа «${other.name}» уже есть` }
      : null;
  };

  const taken = await takenBy();
  if (taken) return taken;

  try {
    const renamed = await db
      .update(groups)
      .set({ name })
      .where(and(eq(groups.id, id), eq(groups.userId, userId)))
      .returning({ id: groups.id });
    return renamed.length > 0
      ? { status: "renamed", name }
      : { status: "missing" };
  } catch (error) {
    // Another tab took the name between the check and the update
    if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
      const takenNow = await takenBy();
      if (takenNow) return takenNow;
    }
    throw error;
  }
}

// Returns the deleted group's name, or null if it was already gone.
// Its contacts stay; the database removes only their links to it.
export async function deleteGroup(userId: string, id: number) {
  const [deleted] = await db
    .delete(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .returning({ name: groups.name });
  return deleted?.name ?? null;
}
