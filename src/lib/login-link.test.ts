// Asking for a sign-in link: scenarios of user-auth («Запрос ссылки для входа»,
// «Неверная почта», «Письмо со ссылкой», «Ссылка работает один раз и 15 минут»,
// «Не больше 3 писем за 10 минут»). The emails really go to Mailpit.
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { POST } from "@/app/api/auth/[...all]/route";
import { requestLoginLinkAction } from "@/app/login/actions";
import { db } from "@/db";
import { loginLinkRequests, users, verifications } from "@/db/schema";
import { requestLoginLink } from "@/lib/login-link";
import type { LoginFormState } from "@/lib/login-form";
import { clearEmails, emailsTo } from "../../test/mailpit";

// A server action reads the headers of the request; there is none in Vitest
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const SENT_TOO_OFTEN = "Слишком часто, попробуй через несколько минут";
const NOT_SENT = "Не удалось отправить письмо, попробуй ещё раз";
const BAD_EMAIL = "Проверь адрес почты";

const MINUTE = 60 * 1000;

function request(email: string) {
  return requestLoginLink(email, new Headers());
}

function limitRows() {
  return db.select().from(loginLinkRequests);
}

function activeLinks() {
  return db.select().from(verifications);
}

// A port where nobody listens: the email cannot be sent
function breakMailServer() {
  vi.stubEnv("SMTP_URL", "smtp://127.0.0.1:1");
}

beforeEach(async () => {
  await clearEmails();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestLoginLink: the email goes out", () => {
  // Scenario: «Ввёл почту»
  test("answers with the address and sends one email from «Личная CRM» to it", async () => {
    expect(await request("anna@mail.ru")).toEqual({ sentTo: "anna@mail.ru" });

    const emails = await emailsTo("anna@mail.ru");
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe("Вход в Личную CRM");
    expect(emails[0].from.name).toBe("Личная CRM");
    // MAIL_FROM is «Личная CRM <noreply@...>»
    expect(`<${emails[0].from.address}>`).toBe(
      /<[^>]+>/.exec(process.env.MAIL_FROM ?? "")?.[0],
    );
    expect(emails[0].text).toMatch(/\/api\/auth\/magic-link\/verify\?token=/);
  });

  // Scenario: «Пробелы и большие буквы»
  test("takes spaces off and ignores letter case", async () => {
    expect(await request("  Anna@Mail.RU  ")).toEqual({
      sentTo: "anna@mail.ru",
    });

    expect(await emailsTo("anna@mail.ru")).toHaveLength(1);
    expect((await limitRows()).map((row) => row.email)).toEqual([
      "anna@mail.ru",
    ]);
  });

  // Scenario: «Новый и знакомый адрес»
  test("answers the same for an address that signed in before and for a new one", async () => {
    await db.insert(users).values({
      id: "user-anna",
      name: "",
      email: "anna@mail.ru",
      emailVerified: true,
    });

    const known = await request("anna@mail.ru");
    const unknown = await request("boris@mail.ru");

    expect(known).toEqual({ sentTo: "anna@mail.ru" });
    expect(unknown).toEqual({ sentTo: "boris@mail.ru" });
    // Asking for a link makes nobody a user: that happens when the link is opened
    expect(await db.select().from(users)).toHaveLength(1);
  });

  // Scenario: «Ссылка работает один раз и 15 минут»
  test("the link in the database lives 15 minutes", async () => {
    await request("anna@mail.ru");

    const [link] = await activeLinks();
    const lifetime = link.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(14 * MINUTE);
    expect(lifetime).toBeLessThanOrEqual(15 * MINUTE);
  });

  // Scenario: «Запросил новую ссылку»
  test("a new link cancels the old ones of the address, and only of it", async () => {
    await request("anna@mail.ru");
    await request("boris@mail.ru");
    const before = await activeLinks();

    await request("anna@mail.ru");

    const after = await activeLinks();
    expect(after).toHaveLength(2);
    // Anna's first link is gone; Boris's stays
    const annasFirst = before.find((link) =>
      link.value.includes("anna@mail.ru"),
    );
    const boriss = before.find((link) => link.value.includes("boris@mail.ru"));
    expect(after.map((link) => link.id)).not.toContain(annasFirst?.id);
    expect(after.map((link) => link.id)).toContain(boriss?.id);
  });
});

describe("requestLoginLink: a wrong address", () => {
  // Scenarios: «Ошибка в адресе» and «Пустое поле»
  test.each([
    ["anna@", "a typo"],
    ["", "an empty field"],
    ["   ", "only spaces"],
    ["anna mail.ru", "no @"],
    [`${"a".repeat(250)}@mail.ru`, "longer than 254 characters"],
  ])(
    "«%s» (%s): asks to check the address and sends nothing",
    async (email) => {
      expect(await request(email)).toEqual({
        error: BAD_EMAIL,
        field: "email",
      });

      expect(await emailsTo(email.trim().toLowerCase())).toEqual([]);
      expect(await limitRows()).toEqual([]);
      expect(await activeLinks()).toEqual([]);
    },
  );

  // Scenario: «Запрос не из формы»
  test("a plain HTTP request for a link is refused and sends nothing", async () => {
    const response = await POST(
      new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "anna@mail.ru" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await emailsTo("anna@mail.ru")).toEqual([]);
    expect(await activeLinks()).toEqual([]);
  });

  test("the form action checks the address on the server too", async () => {
    const formData = new FormData();
    formData.set("email", "anna@");

    const state = await requestLoginLinkAction(FRESH_FORM, formData);

    expect(state).toMatchObject({ email: "anna@", emailError: BAD_EMAIL });
    expect(await limitRows()).toEqual([]);
  });
});

const FRESH_FORM: LoginFormState = { email: "", version: 0 };

describe("requestLoginLink: the email cannot be sent", () => {
  // Scenario: «Письмо не ушло»
  test("says so, does not count it in the limit and keeps the old link", async () => {
    await request("anna@mail.ru");
    const [oldLink] = await activeLinks();
    const rowsBefore = await limitRows();
    breakMailServer();

    expect(await request("anna@mail.ru")).toEqual({ error: NOT_SENT });

    expect(await limitRows()).toEqual(rowsBefore);
    expect((await activeLinks()).map((link) => link.id)).toContain(oldLink.id);
  });

  test("the form action shows it under the button, not under the field", async () => {
    breakMailServer();
    const formData = new FormData();
    formData.set("email", "anna@mail.ru");

    const state = await requestLoginLinkAction(FRESH_FORM, formData);

    expect(state).toMatchObject({ email: "anna@mail.ru", message: NOT_SENT });
    expect(state.emailError).toBeUndefined();
    expect(state.sentTo).toBeUndefined();
  });
});

describe("requestLoginLink: no more than 3 emails in 10 minutes", () => {
  // Scenario: «Три письма»
  test("sends three emails in a row", async () => {
    for (let time = 0; time < 3; time++) {
      expect(await request("anna@mail.ru")).toEqual({
        sentTo: "anna@mail.ru",
      });
    }

    expect(await emailsTo("anna@mail.ru")).toHaveLength(3);
  });

  // Scenario: «Четвёртое письмо»
  test("does not send the fourth", async () => {
    for (let time = 0; time < 3; time++) await request("anna@mail.ru");

    expect(await request("anna@mail.ru")).toEqual({ error: SENT_TOO_OFTEN });

    expect(await emailsTo("anna@mail.ru")).toHaveLength(3);
  });

  // Scenario: «Через 10 минут»
  test("sends again when the first of the three is older than 10 minutes", async () => {
    for (let time = 0; time < 3; time++) await request("anna@mail.ru");
    const [oldest] = await db
      .select()
      .from(loginLinkRequests)
      .orderBy(loginLinkRequests.id)
      .limit(1);
    await db
      .update(loginLinkRequests)
      .set({ createdAt: new Date(Date.now() - 11 * MINUTE) })
      .where(eq(loginLinkRequests.id, oldest.id));

    expect(await request("anna@mail.ru")).toEqual({ sentTo: "anna@mail.ru" });

    expect(await emailsTo("anna@mail.ru")).toHaveLength(4);
  });

  test("forgets the rows older than 10 minutes", async () => {
    await request("anna@mail.ru");
    await db
      .update(loginLinkRequests)
      .set({ createdAt: sql`now() - interval '11 minutes'` });

    await request("anna@mail.ru");

    expect(await limitRows()).toHaveLength(1);
  });

  // Scenario: «Другая почта»
  test("counts every address on its own", async () => {
    for (let time = 0; time < 3; time++) await request("anna@mail.ru");

    expect(await request("boris@mail.ru")).toEqual({ sentTo: "boris@mail.ru" });

    expect(await emailsTo("boris@mail.ru")).toHaveLength(1);
  });

  // Scenario: «Тот же адрес другими буквами»
  test("counts the same address in other letters as one", async () => {
    for (let time = 0; time < 3; time++) await request("anna@mail.ru");

    expect(await request("ANNA@mail.ru")).toEqual({ error: SENT_TOO_OFTEN });
  });

  test("the limit holds when requests come at the same time", async () => {
    const answers = await Promise.all(
      Array.from({ length: 6 }, () => request("anna@mail.ru")),
    );

    expect(answers.filter((answer) => "sentTo" in answer)).toHaveLength(3);
    expect(answers.filter((answer) => "error" in answer)).toEqual(
      Array(3).fill({ error: SENT_TOO_OFTEN }),
    );
    expect(await emailsTo("anna@mail.ru")).toHaveLength(3);
    // Of the links only the last one works
    expect(await activeLinks()).toHaveLength(1);
  });

  // Each request holds a connection of its own and takes one more for the
  // link: without a cap on parallel requests the pool runs dry and all hang
  test("many requests at the same time all get an answer", async () => {
    const addresses = Array.from(
      { length: 20 },
      (_, index) => `user${index}@mail.ru`,
    );

    const answers = await Promise.all(addresses.map(request));

    expect(answers).toEqual(addresses.map((email) => ({ sentTo: email })));
    for (const email of addresses) {
      expect(await emailsTo(email)).toHaveLength(1);
    }
  });

  test("the form action shows «Слишком часто» under the button", async () => {
    for (let time = 0; time < 3; time++) await request("anna@mail.ru");
    const formData = new FormData();
    formData.set("email", "anna@mail.ru");

    const state = await requestLoginLinkAction(FRESH_FORM, formData);

    expect(state).toMatchObject({
      email: "anna@mail.ru",
      message: SENT_TOO_OFTEN,
    });
    expect(state.emailError).toBeUndefined();
  });

  test("the form action says where the link went, and keeps the form where it is", async () => {
    const formData = new FormData();
    formData.set("email", "  Anna@Mail.RU ");

    const state = await requestLoginLinkAction(FRESH_FORM, formData);

    expect(state).toMatchObject({
      email: "anna@mail.ru",
      sentTo: "anna@mail.ru",
    });
    expect(state.emailError).toBeUndefined();
    expect(state.message).toBeUndefined();
  });
});
