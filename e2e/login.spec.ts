// Sign-in (openspec/changes/login, specs user-auth and data-ownership), end to
// end: the form, the email in Mailpit, the link, the header, signing out.
// The wording of every answer and the limits to the letter are covered by
// src/lib/login-link.test.ts and src/lib/sign-in.test.ts; here it is what a
// person sees and does.
import { expect, test, type Page } from "@playwright/test";

import {
  HOUR,
  OWNER_EMAIL,
  ageSession,
  expireLoginLinks,
  resetDatabase,
  sessionExpiry,
} from "./database";
import { emailsTo, waitForEmail } from "../test/mailpit";
import { linkFromEmail, requestLink, signIn } from "./sign-in";

const EMAIL_FIELD_NAME = "Почта";

function signInButton(page: Page) {
  return page.getByRole("button", { name: "Получить ссылку" });
}

test.beforeEach(async () => {
  await resetDatabase({ contacts: ["Анна Смирнова"] });
});

test.describe("not signed in", () => {
  // Scenario: «Открыл приложение без входа»
  test("the main page is the sign-in page, with no contacts", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("textbox", { name: EMAIL_FIELD_NAME }),
    ).toBeVisible();
    await expect(signInButton(page)).toBeVisible();
    await expect(page.getByText(/Смирнова/)).toHaveCount(0);
    await expect(page.getByText(/Всего \d+ контакт/)).toHaveCount(0);
  });

  // Scenario: «Открыл карточку без входа»
  test("the card of a contact is the sign-in page, with no card", async ({
    page,
  }) => {
    await page.goto("/contacts/1");

    await expect(page).toHaveURL(/\/login$/);
    await expect(signInButton(page)).toBeVisible();
    await expect(page.getByText(/Смирнова/)).toHaveCount(0);
  });

  // Scenario: «Проверка выкатки»
  test("/health answers without signing in", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  test("there is no sign-out button in the header", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("button", { name: "Выйти" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Личная CRM" })).toBeVisible();
  });
});

test.describe("asking for the link", () => {
  // Scenario: «Ввёл почту»
  test("the page says where the link went, and the email arrives", async ({
    page,
  }) => {
    await requestLink(page, "anna@mail.ru");

    await expect(
      page.getByText("Ссылка для входа отправлена на anna@mail.ru"),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: EMAIL_FIELD_NAME }),
    ).toBeVisible();
    const [email] = await waitForEmail("anna@mail.ru");
    expect(email.subject).toBe("Вход в Личную CRM");
  });

  // Scenario: «Ошибка в адресе»
  test("a wrong address is explained under the field and sends nothing", async ({
    page,
  }) => {
    await requestLink(page, "anna@");

    await expect(page.getByText("Проверь адрес почты")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: EMAIL_FIELD_NAME }),
    ).toHaveValue("anna@");
    await expect(page.getByText(/Ссылка для входа отправлена/)).toHaveCount(0);
    expect(await emailsTo("anna@")).toEqual([]);
  });

  // Scenario: «Четвёртое письмо»
  test("the fourth email in a row is refused", async ({ page }) => {
    for (let time = 0; time < 3; time++) {
      await requestLink(page, "anna@mail.ru");
      await expect(
        page.getByText("Ссылка для входа отправлена на anna@mail.ru"),
      ).toBeVisible();
    }

    await requestLink(page, "anna@mail.ru");

    await expect(
      page.getByText("Слишком часто, попробуй через несколько минут"),
    ).toBeVisible();
    await expect
      .poll(() => emailsTo("anna@mail.ru").then((e) => e.length))
      .toBe(3);
  });
});

test.describe("opening the link", () => {
  // Scenarios: «Первый вход», «Шапка», «В автотестах»
  test("a new address signs in: the main page, the address in the header", async ({
    page,
  }) => {
    await signIn(page, "anna@mail.ru");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("anna@mail.ru", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
  });

  // Scenario: «Ссылка после 15 минут»
  test("a link older than 15 minutes shows «Ссылка устарела» and leads back to the form", async ({
    page,
  }) => {
    await requestLink(page, "anna@mail.ru");
    const link = await linkFromEmail("anna@mail.ru");
    await expireLoginLinks();

    await page.goto(link);

    await expect(
      page.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Выйти" })).toHaveCount(0);
    await page.getByRole("link", { name: "На страницу входа" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(signInButton(page)).toBeVisible();
  });

  test("a link opened for the second time shows «Ссылка устарела»", async ({
    page,
  }) => {
    await requestLink(page, "anna@mail.ru");
    const link = await linkFromEmail("anna@mail.ru");
    await page.goto(link);
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto(link);

    await expect(
      page.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
  });

  // Scenario: «Уже вошёл»
  test("a signed-in person who opens the sign-in page is taken to the main page", async ({
    page,
  }) => {
    await signIn(page, "anna@mail.ru");

    await page.goto("/login");

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("the header and signing out", () => {
  // Scenario: «Шапка»
  test("the address and «Выйти» are in the header on every page", async ({
    page,
  }) => {
    await signIn(page, OWNER_EMAIL);

    for (const path of ["/", "/contacts/new", "/contacts/1"]) {
      await page.goto(path);
      await expect(page.getByText(OWNER_EMAIL, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
    }
  });

  // Scenario: «Вышел»
  test("«Выйти» leads to the sign-in page, also after «Назад»", async ({
    page,
  }) => {
    await signIn(page, OWNER_EMAIL);
    await expect(page.getByText(/Смирнова/)).toBeVisible();

    await page.getByRole("button", { name: "Выйти" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(signInButton(page)).toBeVisible();

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await page.goBack();
    await expect(signInButton(page)).toBeVisible();
    await expect(page.getByText(/Смирнова/)).toHaveCount(0);
  });
});

test.describe("where the emails go", () => {
  // Scenarios: «На моём компьютере» and «В автотестах»
  test("any address signs in through Mailpit, and the email is not delivered anywhere else", async ({
    page,
  }) => {
    await requestLink(page, "friend@example.com");
    await expect(
      page.getByText("Ссылка для входа отправлена на friend@example.com"),
    ).toBeVisible();
    const [email] = await waitForEmail("friend@example.com");
    expect(email.to).toEqual(["friend@example.com"]);

    await page.goto(await linkFromEmail("friend@example.com"));

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByText("friend@example.com", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("a visit extends the sign-in", () => {
  // The session lasts 30 days from the last extension, and a visit extends
  // it once an hour at most: after 2 hours it is time. The proxy does it,
  // because a page cannot set a cookie.
  async function expectExtended(page: Page, step: () => Promise<void>) {
    await signIn(page, "anna@mail.ru");
    await ageSession(2);
    const expiryBefore = await sessionExpiry();

    await step();

    await expect
      .poll(
        async () => (await sessionExpiry()).getTime() - expiryBefore.getTime(),
      )
      .toBeGreaterThan(HOUR);
    // The cookie in the browser is extended too, not only the database
    const [cookie] = (await page.context().cookies()).filter((cookie) =>
      cookie.name.endsWith("session_token"),
    );
    expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(
      29.9 * 24 * HOUR,
    );
  }

  test("opening a page extends it", async ({ page }) => {
    await expectExtended(page, async () => {
      await page.reload();
    });
  });

  test("a link inside the app extends it", async ({ page }) => {
    await expectExtended(page, async () => {
      await page.getByRole("link", { name: "Добавить контакт" }).click();
      await expect(page).toHaveURL(/\/contacts\/new$/);
    });
  });
});

// Two people in two browsers: nothing a person adds can be seen or opened by
// the other (data-ownership). The success criterion of the whole feature.
test.describe("every person has their own contacts", () => {
  const CONTACT_A = "Дмитрий Орлов";
  const CONTACT_B = "Елена Фролова";
  // The list shows the surname first
  const ROW_A = "Орлов Дмитрий";
  const ROW_B = "Фролова Елена";

  function notFoundHeading(page: Page) {
    return page.getByRole("heading", { level: 1, name: "Контакт не найден" });
  }

  function search(page: Page) {
    return page.getByRole("searchbox", { name: "Найти контакт по имени" });
  }

  // Adds a contact the way a person does and returns the address of its card
  async function addContact(page: Page, name: string) {
    await page.getByRole("link", { name: "Добавить контакт" }).click();
    await page.getByRole("textbox", { name: "Имя" }).fill(name);
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await page.getByRole("link", { name: "Открыть карточку" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    return page.url();
  }

  // Scenario: «Двое не видят данные друг друга» is the whole test; the steps
  // are the scenarios «Список и поиск», «Карточка по прямой ссылке»,
  // «Форма «Изменить» по прямой ссылке», «Первый контакт», «Свои данные на месте»
  test("two people in two browsers do not see each other's data", async ({
    browser,
    baseURL,
  }) => {
    await resetDatabase({ contacts: [] });
    const browserA = await browser.newContext({ baseURL });
    const browserB = await browser.newContext({ baseURL });
    try {
      const a = await browserA.newPage();
      const b = await browserB.newPage();

      await signIn(a, "anna@mail.ru");
      const cardA = await addContact(a, CONTACT_A);

      await signIn(b, "boris@mail.ru");
      // B sees nothing of A: not in the list, not in the search...
      await expect(b.getByText(ROW_A)).toHaveCount(0);
      await search(b).fill("Орлов");
      await expect(b.getByText(ROW_A)).toHaveCount(0);
      await expect(b.getByText("Найдено: 0 из 0")).toBeVisible();
      // ...and not by the direct address of the card and of the form «Изменить»
      await b.goto(cardA);
      await expect(notFoundHeading(b)).toBeVisible();
      await expect(b.getByText(CONTACT_A)).toHaveCount(0);
      await b.goto(`${cardA}/edit`);
      await expect(notFoundHeading(b)).toBeVisible();
      await expect(b.getByText(CONTACT_A)).toHaveCount(0);

      await b.goto("/");
      const cardB = await addContact(b, CONTACT_B);

      // A reloads: their own contact is in place, B's is not there at all
      await a.goto("/");
      await expect(a.getByText(ROW_A)).toBeVisible();
      await expect(a.getByText(ROW_B)).toHaveCount(0);
      await search(a).fill("Фролова");
      await expect(a.getByText(ROW_B)).toHaveCount(0);
      await a.goto(cardB);
      await expect(notFoundHeading(a)).toBeVisible();
      await a.goto(cardA);
      await expect(a.getByRole("heading", { level: 1 })).toHaveText(CONTACT_A);
    } finally {
      await browserA.close();
      await browserB.close();
    }
  });

  // Scenario: «Несуществующий контакт»
  test("a contact that does not exist is the same page as someone else's", async ({
    page,
  }) => {
    await resetDatabase({ contacts: [] });
    await signIn(page, "anna@mail.ru");

    for (const path of ["/contacts/99999", "/contacts/99999/edit"]) {
      await page.goto(path);
      await expect(notFoundHeading(page)).toBeVisible();
      // The header is the same on this page too
      await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
    }
    await expect(
      page.getByText("Возможно, его удалили или ссылка набрана с ошибкой."),
    ).toBeVisible();
    await page.getByRole("link", { name: "К списку контактов" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  // Scenario: «Первый вход» (data-ownership)
  test("a new person has an empty list with a hint, no filter and no «Пора связаться»", async ({
    page,
  }) => {
    await resetDatabase({ contacts: ["Анна Смирнова"] });

    await signIn(page, "friend@mail.ru");

    await expect(page.getByText("Контактов пока нет")).toBeVisible();
    await expect(page.getByText("Добавь первый контакт")).toBeVisible();
    await expect(page.getByText(/Смирнова/)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Пора связаться" }),
    ).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Группы" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Всего 0 контактов")).toBeVisible();
  });
});
