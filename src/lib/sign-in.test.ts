// Signing in with the link from the email, and how long it holds: scenarios of
// user-auth («Вход по ссылке», «Ссылка работает один раз и 15 минут»,
// «Сколько держится вход»). The link is opened in the handler of Better Auth,
// the way a browser opens it.
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { db } from "@/db";
import { sessions, users, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { clearEmails } from "../../test/mailpit";
import { openLink, requestLink, signIn, withCookie } from "../../test/sign-in";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

beforeEach(async () => {
  await clearEmails();
});

async function currentUser(cookie: string) {
  const session = await auth.api.getSession({ headers: withCookie(cookie) });
  return session?.user ?? null;
}

// The link has lived this long, 15 minutes being its whole life
async function ageLinks(minutes: number) {
  await db
    .update(verifications)
    .set({ expiresAt: new Date(Date.now() + (15 - minutes) * MINUTE) });
}

describe("opening the link", () => {
  // Scenario: «Первый вход»
  test("a new address signs in: the main page, a session cookie, a user with no name", async () => {
    const opened = await signIn("anna@mail.ru");

    expect(opened.status).toBe(302);
    expect(opened.location.pathname).toBe("/");
    expect(opened.cookie).not.toBeNull();
    const [user] = await db.select().from(users);
    expect(user).toMatchObject({
      email: "anna@mail.ru",
      name: "",
      emailVerified: true,
    });
    expect((await currentUser(opened.cookie!))?.email).toBe("anna@mail.ru");
  });

  // Scenario: «Повторный вход»
  test("an address that signed in before gets the same user, not a second one", async () => {
    const first = await signIn("anna@mail.ru");
    const [user] = await db.select().from(users);

    const second = await signIn("anna@mail.ru");

    expect(second.location.pathname).toBe("/");
    expect(await db.select().from(users)).toHaveLength(1);
    expect((await currentUser(second.cookie!))?.id).toBe(user.id);
    expect((await currentUser(first.cookie!))?.id).toBe(user.id);
  });

  // Scenario: «Пробелы и большие буквы»
  test("«  Anna@Mail.RU  » is the same user as «anna@mail.ru»", async () => {
    const plain = await signIn("anna@mail.ru");
    const messy = await signIn("  Anna@Mail.RU  ");

    expect(await db.select().from(users)).toHaveLength(1);
    expect((await currentUser(messy.cookie!))?.id).toBe(
      (await currentUser(plain.cookie!))?.id,
    );
  });

  // Scenario: «Ссылка в срок»
  test("a link of 14 minutes signs in", async () => {
    const link = await requestLink("anna@mail.ru");
    await ageLinks(14);

    const opened = await openLink(link);

    expect(opened.location.pathname).toBe("/");
    expect(opened.cookie).not.toBeNull();
  });

  // Scenario: «Ссылка после 15 минут»
  test("a link of 16 minutes does not sign in and leads to «Ссылка устарела»", async () => {
    const link = await requestLink("anna@mail.ru");
    await ageLinks(16);

    const opened = await openLink(link);

    expect(opened.location.pathname).toBe("/login/expired");
    expect(opened.location.searchParams.get("error")).not.toBeNull();
    expect(opened.cookie).toBeNull();
    expect(await db.select().from(sessions)).toEqual([]);
    expect(await db.select().from(users)).toEqual([]);
  });

  // Scenario: «Ссылку открыли второй раз»
  test("a link works once", async () => {
    const link = await requestLink("anna@mail.ru");
    expect((await openLink(link)).cookie).not.toBeNull();

    const again = await openLink(link);

    expect(again.location.pathname).toBe("/login/expired");
    expect(again.cookie).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  // Scenario: «Запросил новую ссылку»
  test("a new link cancels the first one, the second one signs in", async () => {
    const first = await requestLink("anna@mail.ru");
    const second = await requestLink("anna@mail.ru");

    const withFirst = await openLink(first);
    expect(withFirst.location.pathname).toBe("/login/expired");
    expect(withFirst.cookie).toBeNull();

    const withSecond = await openLink(second);
    expect(withSecond.location.pathname).toBe("/");
    expect(withSecond.cookie).not.toBeNull();
  });
});

describe("how long the sign-in holds", () => {
  async function signedInSession(email: string) {
    const opened = await signIn(email);
    const [session] = await db
      .select()
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(users.email, email));
    return { cookie: opened.cookie!, sessionId: session.sessions.id };
  }

  async function sessionRow(id: string) {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    return row;
  }

  // The session expires 30 days after it was last extended
  function extendedDaysAgo(days: number) {
    return new Date(Date.now() + (30 - days) * DAY);
  }

  test("the session lasts 30 days", async () => {
    const { sessionId } = await signedInSession("anna@mail.ru");

    const { expiresAt } = await sessionRow(sessionId);

    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(29.9 * DAY);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * DAY);
  });

  // Scenario: «Заходил недавно»
  test("29 days since the last visit: still signed in, and extended 30 days ahead", async () => {
    const { cookie, sessionId } = await signedInSession("anna@mail.ru");
    await db
      .update(sessions)
      .set({ expiresAt: extendedDaysAgo(29) })
      .where(eq(sessions.id, sessionId));

    expect((await currentUser(cookie))?.email).toBe("anna@mail.ru");

    const { expiresAt } = await sessionRow(sessionId);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(29.9 * DAY);
  });

  // Scenario: «Давно не заходил»
  test("31 days since the last visit: not signed in", async () => {
    const { cookie, sessionId } = await signedInSession("anna@mail.ru");
    await db
      .update(sessions)
      .set({ expiresAt: extendedDaysAgo(31) })
      .where(eq(sessions.id, sessionId));

    expect(await currentUser(cookie)).toBeNull();
  });

  // Scenario: «Захожу регулярно»
  test("signed in 40 days ago and visited 20 days ago: still signed in", async () => {
    const { cookie, sessionId } = await signedInSession("anna@mail.ru");
    await db
      .update(sessions)
      .set({
        createdAt: new Date(Date.now() - 40 * DAY),
        updatedAt: new Date(Date.now() - 20 * DAY),
        expiresAt: extendedDaysAgo(20),
      })
      .where(eq(sessions.id, sessionId));

    expect((await currentUser(cookie))?.email).toBe("anna@mail.ru");
  });

  test("a visit within the hour does not write to the database again", async () => {
    const { cookie, sessionId } = await signedInSession("anna@mail.ru");
    const before = await sessionRow(sessionId);

    await currentUser(cookie);

    expect((await sessionRow(sessionId)).expiresAt).toEqual(before.expiresAt);
  });

  // Scenario: «Два устройства»
  test("two devices of one user both stay signed in", async () => {
    const computer = await signIn("anna@mail.ru");
    const phone = await signIn("anna@mail.ru");

    expect(computer.cookie).not.toBe(phone.cookie);
    expect(await db.select().from(sessions)).toHaveLength(2);
    expect((await currentUser(computer.cookie!))?.email).toBe("anna@mail.ru");
    expect((await currentUser(phone.cookie!))?.email).toBe("anna@mail.ru");
  });

  // Scenario: «Выход только на этом устройстве»
  test("signing out on one device keeps the other one signed in", async () => {
    const computer = await signIn("anna@mail.ru");
    const phone = await signIn("anna@mail.ru");

    await auth.api.signOut({ headers: withCookie(computer.cookie!) });

    expect(await currentUser(computer.cookie!)).toBeNull();
    expect((await currentUser(phone.cookie!))?.email).toBe("anna@mail.ru");
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  test("a cookie that was never issued is not a sign-in", async () => {
    await signIn("anna@mail.ru");

    expect(await currentUser("better-auth.session_token=forged.value")).toBe(
      null,
    );
    expect(
      (await db.execute(sql`select count(*)::int as n from sessions`))[0].n,
    ).toBe(1);
  });
});
