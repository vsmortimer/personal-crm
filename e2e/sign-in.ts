// Signs in the way a person does: the form, the email in Mailpit, the link.
// Nothing here knows how the app works inside; any address will do, the emails
// never leave Mailpit.
import { expect, type Page } from "@playwright/test";

import { emailsTo, linkIn, waitForEmail } from "../test/mailpit";

// Types the address into the form on the sign-in page and presses the button
export async function requestLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Почта" }).fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
}

// The link from the newest email to the address. `emailsBefore`: how many
// emails to it there were before the request, so that an old one is not taken
export async function linkFromEmail(email: string, emailsBefore = 0) {
  const emails = await waitForEmail(email, { count: emailsBefore + 1 });
  return linkIn(emails[0]);
}

export async function signIn(page: Page, email: string) {
  const emailsBefore = (await emailsTo(email)).length;
  await requestLink(page, email);
  await expect(
    page.getByText(`Ссылка для входа отправлена на ${email}`),
  ).toBeVisible();

  await page.goto(await linkFromEmail(email, emailsBefore));

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}
