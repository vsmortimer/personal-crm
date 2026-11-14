// Birthdays (openspec/changes/birthdays/specs/birthdays/spec.md), the screens:
// the birth date in the contact form and on the card, and the «Скоро день
// рождения» block on the home page. The dates are counted from today's date by
// Moscow time, so the tests do not depend on the day they run. The rules of the
// count (February 29, the turn of the year, the 8th day) are covered by
// src/lib/birthday.test.ts and src/lib/birthdays.test.ts.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { MONTH_NAMES, moscowToday } from "../src/lib/birthday";
import { OWNER_EMAIL, resetDatabase } from "./database";
import { signIn } from "./sign-in";

const DAY_MS = 24 * 60 * 60 * 1000;

// The day and month that are `days` after today, by Moscow time
function inDays(days: number) {
  const today = moscowToday(new Date());
  const date = new Date(
    Date.UTC(today.year, today.month - 1, today.day) + days * DAY_MS,
  );
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1 };
}

// "21 ноября", as the block and the card write it
function dateText({ day, month }: { day: number; month: number }) {
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

function dateField(page: Page) {
  return page.getByRole("group", { name: "Дата рождения" });
}

function dayField(page: Page) {
  return dateField(page).getByRole("combobox", { name: "День" });
}

function monthField(page: Page) {
  return dateField(page).getByRole("combobox", { name: "Месяц" });
}

function yearField(page: Page) {
  return dateField(page).getByRole("textbox", { name: "Год" });
}

function selectedOption(select: Locator) {
  return select.locator("option:checked");
}

// The value next to «Дата рождения» on the contact's card
function birthDateOnCard(page: Page) {
  return page
    .locator("dt", { hasText: "Дата рождения" })
    .locator("xpath=following-sibling::dd[1]");
}

async function fillDate(
  page: Page,
  { day, month, year = "" }: { day: string; month: string; year?: string },
) {
  await dayField(page).selectOption({ label: day });
  await monthField(page).selectOption({ label: month });
  await yearField(page).fill(year);
}

async function addContact(page: Page, name: string) {
  await page.getByRole("textbox", { name: "Имя" }).fill(name);
}

function birthdayBlock(page: Page) {
  return page.getByRole("region", { name: "Скоро день рождения" });
}

function birthdayRows(page: Page) {
  return birthdayBlock(page).getByRole("listitem");
}

function dueBlock(page: Page) {
  return page.getByRole("region", { name: "Пора связаться" });
}

// The rows of the contact list under the search, not of the blocks
function contactRows(page: Page) {
  return page.locator("li[id^='contact-']");
}

test("the birth date in the form and on the card", async ({ page }) => {
  await resetDatabase({ contacts: [] });
  await signIn(page, OWNER_EMAIL);

  await test.step("a new contact has nothing chosen", async () => {
    await page.goto("/contacts/new");

    await expect(selectedOption(dayField(page))).toHaveText("День");
    await expect(selectedOption(monthField(page))).toHaveText("Месяц");
    await expect(yearField(page)).toHaveValue("");
  });

  await test.step("a date without a year", async () => {
    await addContact(page, "Анна Смирнова");
    await fillDate(page, { day: "21", month: "ноября" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await page
      .getByRole("status")
      .getByRole("link", { name: "Открыть карточку" })
      .click();

    await expect(birthDateOnCard(page)).toHaveText("21 ноября");
  });

  await test.step("the form shows the saved date; another month", async () => {
    await page.getByRole("link", { name: "Изменить" }).click();
    await expect(selectedOption(dayField(page))).toHaveText("21");
    await expect(selectedOption(monthField(page))).toHaveText("ноября");
    await expect(yearField(page)).toHaveValue("");

    await monthField(page).selectOption({ label: "декабря" });
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(birthDateOnCard(page)).toHaveText("21 декабря");
  });

  await test.step("the date removed: «Не указано»", async () => {
    await page.getByRole("link", { name: "Изменить" }).click();
    await dayField(page).selectOption({ label: "День" });
    await monthField(page).selectOption({ label: "Месяц" });
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(birthDateOnCard(page)).toHaveText("Не указано");
  });

  await test.step("a date with a year", async () => {
    await page.goto("/contacts/new");
    await addContact(page, "Иван Петров");
    await fillDate(page, { day: "5", month: "марта", year: "1990" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await page
      .getByRole("status")
      .getByRole("link", { name: "Открыть карточку" })
      .click();

    await expect(birthDateOnCard(page)).toHaveText("5 марта 1990");
  });

  await test.step("a contact saved without touching the date has none", async () => {
    await page.goto("/contacts/new");
    await addContact(page, "Ольга Яковлева");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await page
      .getByRole("status")
      .getByRole("link", { name: "Открыть карточку" })
      .click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ольга Яковлева",
    );
    await expect(birthDateOnCard(page)).toHaveText("Не указано");
  });
});

test("mistakes in the birth date", async ({ page }) => {
  await resetDatabase({ contacts: [] });
  await signIn(page, OWNER_EMAIL);
  await page.goto("/contacts/new");
  await addContact(page, "Анна Смирнова");

  await test.step("a month without a day", async () => {
    await monthField(page).selectOption({ label: "ноября" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(dateField(page)).toHaveAccessibleDescription(
      "Нужны и день, и месяц",
    );
    await expect(dayField(page)).toBeFocused();
    await expect(page).toHaveURL(/\/contacts\/new$/);
  });

  await test.step("a date that does not exist", async () => {
    await fillDate(page, { day: "31", month: "апреля" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(dateField(page)).toHaveAccessibleDescription("Такой даты нет");
    await expect(page).toHaveURL(/\/contacts\/new$/);
  });

  await test.step("a year out of range", async () => {
    await fillDate(page, { day: "5", month: "марта", year: "1850" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(dateField(page)).toHaveAccessibleDescription(
      "Год должен быть от 1900 до нынешнего",
    );
  });

  await test.step("a mistake in another field keeps the date", async () => {
    await fillDate(page, { day: "21", month: "ноября", year: "1990" });
    await page.getByRole("textbox", { name: "Почта" }).fill("anna@");
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(
      page.getByRole("textbox", { name: "Почта" }),
    ).toHaveAccessibleDescription(
      "Проверьте адрес почты, например: name@mail.ru",
    );
    await expect(selectedOption(dayField(page))).toHaveText("21");
    await expect(selectedOption(monthField(page))).toHaveText("ноября");
    await expect(yearField(page)).toHaveValue("1990");
    await expect(dateField(page)).not.toHaveAccessibleDescription(/.+/);
  });

  await test.step("after the fix the contact is saved with the date", async () => {
    await page.getByRole("textbox", { name: "Почта" }).fill("anna@mail.ru");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await page
      .getByRole("status")
      .getByRole("link", { name: "Открыть карточку" })
      .click();

    await expect(birthDateOnCard(page)).toHaveText("21 ноября 1990");
  });
});

test("the «Скоро день рождения» block", async ({ page }) => {
  const tomorrow = inDays(1);
  const inWeek = inDays(7);
  await resetDatabase({
    contacts: [
      { name: "Анна Смирнова", birth: inWeek, groups: ["Теннис"] },
      // The year is known: the age is in the line
      { name: "Иван Петров", birth: { ...inDays(2), year: 1990 } },
      { name: "Ольга Яковлева", birth: inDays(0) },
      { name: "Мария Абрамова", birth: tomorrow },
      // 8 days: not yet in the block; no date at all: never
      { name: "Борис Орлов", birth: inDays(8) },
      "Вера Иванова",
    ],
  });
  await signIn(page, OWNER_EMAIL);

  await test.step("the block is above the search, the nearest are first", async () => {
    await expect(birthdayBlock(page)).toBeVisible();
    await expect(birthdayRows(page)).toHaveCount(4);
    await expect(birthdayRows(page).nth(0)).toContainText("Яковлева Ольга");
    await expect(birthdayRows(page).nth(1)).toContainText("Абрамова Мария");
    await expect(birthdayRows(page).nth(2)).toContainText("Петров Иван");
    await expect(birthdayRows(page).nth(3)).toContainText("Смирнова Анна");
    // Above the search field
    const blockBottom = (await birthdayBlock(page).boundingBox())!;
    const search = (await page
      .getByRole("searchbox", { name: "Найти контакт по имени" })
      .boundingBox())!;
    expect(blockBottom.y + blockBottom.height).toBeLessThan(search.y);
  });

  await test.step("a caption without a year, with a year, today and tomorrow", async () => {
    await expect(birthdayRows(page).nth(0)).toContainText(
      `${dateText(inDays(0))} · сегодня`,
    );
    await expect(birthdayRows(page).nth(1)).toContainText(
      `${dateText(tomorrow)} · завтра`,
    );
    await expect(birthdayRows(page).nth(2)).toContainText(
      `${dateText(inDays(2))} · через 2 дня · исполнится`,
    );
    await expect(birthdayRows(page).nth(3)).toContainText(
      `${dateText(inWeek)} · через 7 дней`,
    );
    // Today with a known year would say «исполняется»; here it is unknown
    await expect(birthdayRows(page).nth(0)).not.toContainText("исполн");
  });

  await test.step("search and group do not change the block", async () => {
    await page.goto("/?q=Вера");

    await expect(contactRows(page)).toHaveCount(1);
    await expect(birthdayRows(page)).toHaveCount(4);

    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Группы" })
      .getByRole("link", { name: /Теннис/ })
      .click();

    await expect(contactRows(page)).toHaveCount(1);
    await expect(birthdayRows(page)).toHaveCount(4);
  });

  await test.step("a row opens the card", async () => {
    await page.goto("/");
    await birthdayRows(page)
      .getByRole("link", { name: /Смирнова Анна/ })
      .click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Анна Смирнова",
    );
    await expect(birthDateOnCard(page)).toHaveText(dateText(inWeek));
  });
});

test("the block is above «Пора связаться»", async ({ page }) => {
  const DAY = 24 * 60 * 60 * 1000;
  await resetDatabase({
    contacts: [
      { name: "Анна Смирнова", birth: inDays(3) },
      {
        name: "Иван Петров",
        contactFrequency: "week",
        createdAt: new Date(Date.now() - 30 * DAY),
      },
    ],
  });
  await signIn(page, OWNER_EMAIL);

  await expect(birthdayBlock(page)).toBeVisible();
  await expect(dueBlock(page)).toBeVisible();
  const birthday = (await birthdayBlock(page).boundingBox())!;
  const due = (await dueBlock(page).boundingBox())!;
  expect(birthday.y + birthday.height).toBeLessThan(due.y);
});

test("many birthdays: all rows at once, no «Показать ещё»", async ({
  page,
}) => {
  await resetDatabase({
    contacts: Array.from({ length: 8 }, (_, index) => ({
      name: `Контакт Номер${index + 1}`,
      birth: inDays(index),
    })),
  });
  await signIn(page, OWNER_EMAIL);

  await expect(birthdayRows(page)).toHaveCount(8);
  await expect(
    birthdayBlock(page).getByRole("button", { name: /Показать ещё/ }),
  ).toHaveCount(0);
});

test("nobody has a birthday soon: no block, as before", async ({ page }) => {
  await resetDatabase({
    contacts: [
      // The birthday was yesterday, and the one after is 8 days away
      { name: "Анна Смирнова", birth: inDays(-1) },
      { name: "Иван Петров", birth: inDays(8) },
      "Вера Иванова",
    ],
  });
  await signIn(page, OWNER_EMAIL);

  await expect(contactRows(page)).toHaveCount(3);
  await expect(birthdayBlock(page)).toHaveCount(0);
});

// Scenario: «Первое открытие после выкатки»: contacts that were there before
// have no date
test("contacts without a date: no block, «Не указано» on every card", async ({
  page,
}) => {
  await resetDatabase({ contacts: ["Анна Смирнова", "Иван Петров"] });
  await signIn(page, OWNER_EMAIL);

  await expect(contactRows(page)).toHaveCount(2);
  await expect(birthdayBlock(page)).toHaveCount(0);

  await contactRows(page).first().getByRole("link").click();
  await expect(birthDateOnCard(page)).toHaveText("Не указано");
});
