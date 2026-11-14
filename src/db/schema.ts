import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { CONTACT_FREQUENCIES } from "../lib/contact-frequency";

// The tables users, sessions, accounts and verifications are Better Auth's
// (https://better-auth.com/docs/concepts/database), named in the plural like
// the rest. Its code creates the rows and sets the ids, which are text.
// "user" is a reserved word in Postgres, hence "users".

// A person who signed in. The owner of contacts and groups
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Empty: we do not ask for a name, the person is known by the email
  name: text("name").notNull(),
  // Always in lower case, Better Auth makes it so
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const contactFrequency = pgEnum(
  "contact_frequency",
  CONTACT_FREQUENCIES,
);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Whose contact it is. Deleting a user who has contacts is not allowed by
    // the database: contacts must not vanish with an account by accident
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    // Who this person is: role, occupation, relation
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // Empty means "not set": such a contact is never due for a catch-up
    contactFrequency: contactFrequency("contact_frequency"),
    // The birth date is three numbers, so that "no year" is an honest empty
    // value and not an invented year. Day and month go together; the year
    // only with them
    birthDay: smallint("birth_day"),
    birthMonth: smallint("birth_month"),
    birthYear: smallint("birth_year"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("contacts_user_id_idx").on(table.userId),
    // A second line of defence behind contactSchema in src/lib/validation.ts.
    // The year is not compared with today and February 29 is not tied to a
    // leap year: the database must not depend on the current or on a given
    // year, the server checks that
    check(
      "contacts_birth_day_month_check",
      sql`(${table.birthDay} is null) = (${table.birthMonth} is null)`,
    ),
    check(
      "contacts_birth_year_check",
      sql`${table.birthYear} is null or (${table.birthDay} is not null and ${table.birthYear} between 1900 and 2200)`,
    ),
    check(
      "contacts_birth_date_check",
      sql`${table.birthDay} is null or (${table.birthMonth} between 1 and 12 and ${table.birthDay} between 1 and (case when ${table.birthMonth} = 2 then 29 when ${table.birthMonth} in (4, 6, 9, 11) then 30 else 31 end))`,
    ),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_contact_id_created_at_idx").on(
      table.contactId,
      table.createdAt,
    ),
  ],
);

// Groups a user makes up, e.g. "Семья" or "Теннис".
// A group stays when its last contact leaves it, until it is deleted.
export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // "Теннис" and "теннис" are the same group, but only for one user:
    // everyone has groups of their own
    uniqueIndex("groups_user_id_name_lower_idx").on(
      table.userId,
      sql`lower(${table.name})`,
    ),
    // A second line of defence behind groupNameSchema in src/lib/validation.ts
    check(
      "groups_name_length_check",
      sql`char_length(${table.name}) between 1 and 50`,
    ),
  ],
);

// Which contacts are in which groups; deleting either side removes the link
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    // For the group filter on the home page
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

// One row per device that is signed in
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// Not used by the magic link, but Better Auth's code expects the table
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// The sign-in links that can still be used: a link is deleted when it is used
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// One row per sign-in email sent: the limit of 3 emails to an address in
// 10 minutes counts them. The address is in lower case.
export const loginLinkRequests = pgTable(
  "login_link_requests",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("login_link_requests_email_created_at_idx").on(
      table.email,
      table.createdAt,
    ),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Group = typeof groups.$inferSelect;
