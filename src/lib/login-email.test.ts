// Scenario «Что в письме» (user-auth): what the email with the sign-in link says
import { describe, expect, test } from "vitest";

import { loginEmail } from "@/lib/login-email";

const LINK =
  "https://app.example-crm.site/api/auth/magic-link/verify?token=abc&callbackURL=%2F&errorCallbackURL=%2Flogin%2Fexpired";

const IGNORE_LINE =
  "Если вы не запрашивали вход - просто проигнорируйте письмо";

describe("loginEmail", () => {
  test("the subject is «Вход в Личную CRM»", () => {
    expect(loginEmail(LINK).subject).toBe("Вход в Личную CRM");
  });

  test("the page has a «Войти» button with the link", () => {
    const { html } = loginEmail(LINK);

    // In HTML an & in an address is written as &amp;
    const href = LINK.replaceAll("&", "&amp;");
    expect(html).toMatch(
      new RegExp(`<a [^>]*href="${escapeRegExp(href)}"[^>]*>\\s*Войти\\s*</a>`),
    );
  });

  test("the page says the link works for 15 minutes and what to do if it was not asked for", () => {
    const { html } = loginEmail(LINK);

    expect(html).toContain("15 минут");
    expect(html).toContain(IGNORE_LINE);
  });

  test("the text version, for mail programs without HTML, has the same", () => {
    const { text } = loginEmail(LINK);

    expect(text).toContain("Войти");
    expect(text).toContain(LINK);
    expect(text).toContain("15 минут");
    expect(text).toContain(IGNORE_LINE);
  });
});

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
