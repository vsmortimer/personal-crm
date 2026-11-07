// The main scenario from specs/01-продуктовая-идея.md, end to end:
// open the app and see all contacts → add a contact → find it by name →
// add a note → the note is kept on the contact's card, in another browser too.
import { expect, test, type Page } from "@playwright/test";

import { OWNER_EMAIL, resetDatabase } from "./database";
import { signIn } from "./sign-in";

const EXISTING_CONTACTS = ["Анна Смирнова", "Борис Петров", "Вера Иванова"];
const NEW_CONTACT = "Дмитрий Орлов";
const NOTE =
  "Созвонились после конференции: договорились встретиться в субботу";

// The list shows the surname first and is sorted by it
const ROWS_BEFORE = ["Иванова Вера", "Петров Борис", "Смирнова Анна"];
const ROWS_AFTER = [
  "Иванова Вера",
  "Орлов Дмитрий",
  "Петров Борис",
  "Смирнова Анна",
];

// The contacts have no groups and no contact frequency, so the home page has
// neither the group filter nor «Пора связаться»: every list item is a contact
function contactRows(page: Page) {
  return page.getByRole("listitem");
}

function notes(page: Page) {
  return page.getByRole("region", { name: "Заметки" }).getByRole("listitem");
}

test.beforeEach(async () => {
  await resetDatabase({ contacts: EXISTING_CONTACTS });
});

test("add a contact, find it by name and add a note that is kept", async ({
  page,
  browser,
  baseURL,
}) => {
  await test.step("sign in and open the app: all contacts are listed", async () => {
    await signIn(page, OWNER_EMAIL);

    await expect(page.getByText("Всего 3 контакта")).toBeVisible();
    await expect(contactRows(page)).toHaveText(ROWS_BEFORE);
  });

  await test.step("add a contact: it appears in the list", async () => {
    await page.getByRole("link", { name: "Добавить контакт" }).click();
    await page.getByRole("textbox", { name: "Имя" }).fill(NEW_CONTACT);
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(page.getByRole("status")).toContainText(
      `Контакт «${NEW_CONTACT}» добавлен в список.`,
    );
    await expect(page.getByText("Всего 4 контакта")).toBeVisible();
    await expect(contactRows(page)).toHaveText(ROWS_AFTER);
  });

  await test.step("find the contact by name and open the card", async () => {
    await page
      .getByRole("searchbox", { name: "Найти контакт по имени" })
      .fill("Орлов");

    await expect(page.getByText("Найдено: 1 из 4")).toBeVisible();
    await expect(contactRows(page)).toHaveText(["Орлов Дмитрий"]);

    await contactRows(page).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      NEW_CONTACT,
    );
  });

  await test.step("add a note: it appears on the card", async () => {
    await expect(notes(page)).toHaveCount(0);

    await page.getByRole("textbox", { name: "Новая заметка" }).fill(NOTE);
    await page.getByRole("button", { name: "Добавить заметку" }).click();

    await expect(notes(page)).toHaveCount(1);
    await expect(notes(page)).toContainText(NOTE);
    await expect(page.getByText("1 заметка")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Новая заметка" }),
    ).toHaveValue("");
  });

  await test.step("reload the card: the note is still there", async () => {
    await page.reload();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      NEW_CONTACT,
    );
    await expect(notes(page)).toHaveCount(1);
    await expect(notes(page)).toContainText(NOTE);
  });

  await test.step("another browser: the same contacts and the same note", async () => {
    const cardUrl = page.url();
    // A fresh context shares no cookies, storage or cache with the first one,
    // like another browser: everything it shows comes from the server
    const otherBrowser = await browser.newContext({ baseURL });
    try {
      const other = await otherBrowser.newPage();

      // Signs in as the same person: the data lives on the server
      await signIn(other, OWNER_EMAIL);
      await expect(other.getByText("Всего 4 контакта")).toBeVisible();
      await expect(contactRows(other)).toHaveText(ROWS_AFTER);

      await other.goto(cardUrl);
      await expect(other.getByRole("heading", { level: 1 })).toHaveText(
        NEW_CONTACT,
      );
      await expect(notes(other)).toHaveCount(1);
      await expect(notes(other)).toContainText(NOTE);
    } finally {
      await otherBrowser.close();
    }
  });
});
