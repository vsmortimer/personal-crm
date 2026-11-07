// Keep in touch (openspec/specs/keep-in-touch/spec.md), the main paths:
// the frequency in the contact form and on the card, and the «Пора
// связаться» block on the home page. When exactly a period runs out and the
// order of the block are covered by src/lib/keep-in-touch.test.ts.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { OWNER_EMAIL, resetDatabase } from "./database";
import { signIn } from "./sign-in";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY);
}

function frequencyField(page: Page) {
  return page.getByRole("combobox", { name: "Как часто общаться" });
}

function selectedOption(select: Locator) {
  return select.locator("option:checked");
}

// The value next to «Как часто общаться» on the contact's card
function frequencyOnCard(page: Page) {
  return page
    .locator("dt", { hasText: "Как часто общаться" })
    .locator("xpath=following-sibling::dd[1]");
}

function dueBlock(page: Page) {
  return page.getByRole("region", { name: "Пора связаться" });
}

function dueRows(page: Page) {
  return dueBlock(page).getByRole("listitem");
}

// The rows of the contact list under the search, not of the block
function contactRows(page: Page) {
  return page.locator("li[id^='contact-']");
}

function showMoreButton(page: Page) {
  return dueBlock(page).getByRole("button", { name: /^Показать ещё/ });
}

function notes(page: Page) {
  return page.getByRole("region", { name: "Заметки" }).getByRole("listitem");
}

test("the frequency in the form and on the card", async ({ page }) => {
  await resetDatabase({ contacts: [] });
  await signIn(page, OWNER_EMAIL);

  await test.step("a new contact has «Не задано»", async () => {
    await page.goto("/contacts/new");

    await expect(selectedOption(frequencyField(page))).toHaveText("Не задано");
  });

  await test.step("a wrong email keeps the chosen frequency", async () => {
    await page.getByRole("textbox", { name: "Имя" }).fill("Анна Смирнова");
    await frequencyField(page).selectOption({ label: "Раз в неделю" });
    await page.getByRole("textbox", { name: "Почта" }).fill("anna@");
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(
      page.getByRole("textbox", { name: "Почта" }),
    ).toHaveAccessibleDescription(
      "Проверьте адрес почты, например: name@mail.ru",
    );
    await expect(selectedOption(frequencyField(page))).toHaveText(
      "Раз в неделю",
    );
  });

  await test.step("the new contact is saved with its frequency", async () => {
    await page.getByRole("textbox", { name: "Почта" }).fill("anna@mail.ru");
    await frequencyField(page).selectOption({ label: "Раз в месяц" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await page
      .getByRole("status")
      .getByRole("link", { name: "Открыть карточку" })
      .click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Анна Смирнова",
    );
    await expect(frequencyOnCard(page)).toHaveText("Раз в месяц");
  });

  await test.step("another frequency", async () => {
    await page.getByRole("link", { name: "Изменить" }).click();
    await expect(selectedOption(frequencyField(page))).toHaveText(
      "Раз в месяц",
    );

    await frequencyField(page).selectOption({ label: "Раз в квартал" });
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(frequencyOnCard(page)).toHaveText("Раз в квартал");
  });

  await test.step("the frequency removed: «Не указано»", async () => {
    await page.getByRole("link", { name: "Изменить" }).click();
    await frequencyField(page).selectOption({ label: "Не задано" });
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(frequencyOnCard(page)).toHaveText("Не указано");
  });
});

test("a contact who is due leaves the block after a note", async ({ page }) => {
  await resetDatabase({
    contacts: [
      "Анна Смирнова",
      "Вера Иванова",
      // A monthly catch-up, and no notes for 45 days and an hour
      {
        name: "Иван Петров",
        contactFrequency: "month",
        createdAt: new Date(daysAgo(45).getTime() - 60 * 60 * 1000),
      },
    ],
  });
  await signIn(page, OWNER_EMAIL);

  await test.step("the block is above the search with Иван in it", async () => {
    await page.goto("/");

    await expect(dueRows(page)).toHaveText([/^Петров Иван/]);
    await expect(dueRows(page)).toContainText(
      "Раз в месяц · не общались 45 дней",
    );
    await expect(showMoreButton(page)).toHaveCount(0);

    const search = page.getByRole("searchbox", {
      name: "Найти контакт по имени",
    });
    const blockBox = await dueBlock(page).boundingBox();
    const searchBox = await search.boundingBox();
    expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(searchBox!.y);
  });

  await test.step("the search filters the list, not the block", async () => {
    await page
      .getByRole("searchbox", { name: "Найти контакт по имени" })
      .fill("Анна");

    await expect(page.getByText("Найдено: 1 из 3")).toBeVisible();
    await expect(contactRows(page)).toHaveText([/^Смирнова Анна/]);
    await expect(dueRows(page)).toHaveText([/^Петров Иван/]);
  });

  await test.step("a row opens the contact's card", async () => {
    await dueRows(page).getByRole("link").click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Иван Петров",
    );
  });

  await test.step("a note, then back to the home page: the block is gone", async () => {
    await page
      .getByRole("textbox", { name: "Новая заметка" })
      .fill("Созвонились, договорились встретиться в субботу");
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(notes(page)).toHaveCount(1);

    // With the browser's Back button
    await page.goBack();
    await expect(page.getByText("Найдено: 1 из 3")).toBeVisible();
    await expect(dueBlock(page)).toHaveCount(0);

    // With the «Все контакты» link
    await page.goForward();
    await page.getByRole("link", { name: "Все контакты" }).click();
    await expect(page.getByText("Всего 3 контакта")).toBeVisible();
    await expect(dueBlock(page)).toHaveCount(0);
  });
});

test("eight who are due: «Показать ещё 3» and «Свернуть»", async ({ page }) => {
  // Weekly catch-ups, the longest overdue first: from 8 days overdue down to 1
  const names = [
    "Олег Сидоров",
    "Анна Смирнова",
    "Вера Иванова",
    "Борис Петров",
    "Пётр Котов",
    "Мария Белова",
    "Иван Петров",
    "Дарья Орлова",
  ];
  await resetDatabase({
    contacts: names.map((name, index) => ({
      name,
      contactFrequency: "week" as const,
      createdAt: daysAgo(15 - index),
    })),
  });
  await signIn(page, OWNER_EMAIL);
  const firstFive = [
    /^Сидоров Олег/,
    /^Смирнова Анна/,
    /^Иванова Вера/,
    /^Петров Борис/,
    /^Котов Пётр/,
  ];
  const all = [...firstFive, /^Белова Мария/, /^Петров Иван/, /^Орлова Дарья/];

  await test.step("the 5 longest overdue and «Показать ещё 3»", async () => {
    await page.goto("/");

    await expect(dueRows(page)).toHaveText(firstFive);
    await expect(showMoreButton(page)).toHaveText("Показать ещё 3");
  });

  await test.step("«Показать ещё 3» shows all 8 and «Свернуть»", async () => {
    await showMoreButton(page).click();

    await expect(dueRows(page)).toHaveText(all);
    await expect(
      dueBlock(page).getByRole("button", { name: "Свернуть" }),
    ).toBeVisible();
  });

  await test.step("«Свернуть» leaves 5 again", async () => {
    await dueBlock(page).getByRole("button", { name: "Свернуть" }).click();

    await expect(dueRows(page)).toHaveText(firstFive);
    await expect(showMoreButton(page)).toHaveText("Показать ещё 3");
  });

  await test.step("the home page opened again shows the block collapsed", async () => {
    // Back with the browser's Back button
    await showMoreButton(page).click();
    await dueRows(page).last().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Дарья Орлова",
    );
    await page.goBack();
    await expect(dueRows(page)).toHaveText(firstFive);
    await expect(showMoreButton(page)).toHaveText("Показать ещё 3");

    // Back with the «Все контакты» link
    await showMoreButton(page).click();
    await dueRows(page).last().getByRole("link").click();
    await page.getByRole("link", { name: "Все контакты" }).click();
    await expect(dueRows(page)).toHaveText(firstFive);
    await expect(showMoreButton(page)).toHaveText("Показать ещё 3");
  });
});

test("three who are due: all of them and no «Показать ещё»", async ({
  page,
}) => {
  // Weekly catch-ups, the longest overdue first
  await resetDatabase({
    contacts: ["Олег Сидоров", "Анна Смирнова", "Вера Иванова"].map(
      (name, index) => ({
        name,
        contactFrequency: "week" as const,
        createdAt: daysAgo(12 - index),
      }),
    ),
  });
  await signIn(page, OWNER_EMAIL);

  await page.goto("/");

  await expect(dueRows(page)).toHaveText([
    /^Сидоров Олег/,
    /^Смирнова Анна/,
    /^Иванова Вера/,
  ]);
  await expect(showMoreButton(page)).toHaveCount(0);
});
