import nodemailer from "nodemailer";
import { beforeEach, describe, expect, test } from "vitest";

import { clearEmails, emailsTo, linkIn } from "./mailpit";

const SMTP_URL = "smtp://127.0.0.1:1025";

async function send(to: string, text: string) {
  const transport = nodemailer.createTransport(SMTP_URL);
  await transport.sendMail({
    from: "Личная CRM <noreply@example.com>",
    to,
    subject: "Тема",
    text,
    html: `<p>${text}</p>`,
  });
}

describe("Mailpit helper", () => {
  beforeEach(async () => {
    await clearEmails();
  });

  test("finds an email by the address of the recipient", async () => {
    await send("anna@mail.ru", "Привет, Анна");
    await send("boris@mail.ru", "Привет, Борис");

    const emails = await emailsTo("anna@mail.ru");

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      subject: "Тема",
      from: { name: "Личная CRM", address: "noreply@example.com" },
      to: ["anna@mail.ru"],
    });
    expect(emails[0].text).toContain("Привет, Анна");
    expect(emails[0].html).toContain("Привет, Анна");
    expect(await emailsTo("nobody@mail.ru")).toEqual([]);
  });

  test("clears all emails", async () => {
    await send("anna@mail.ru", "Привет");
    expect(await emailsTo("anna@mail.ru")).toHaveLength(1);

    await clearEmails();

    expect(await emailsTo("anna@mail.ru")).toEqual([]);
  });

  test("takes the link out of the text of an email", async () => {
    await send("anna@mail.ru", "Войти: http://127.0.0.1:3100/x?token=a&b=c");

    const [email] = await emailsTo("anna@mail.ru");

    expect(linkIn(email)).toBe("http://127.0.0.1:3100/x?token=a&b=c");
  });
});
