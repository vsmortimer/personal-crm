// Realistic demo contacts, notes and groups for one user, to try the app on.
// The command is src/db/seed.ts (pnpm db:seed); the function is here so the
// tests can call it too.
import { count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { moscowToday } from "../lib/birthday";
import { CONTACT_FREQUENCIES } from "../lib/contact-frequency";
import { normalizeEmail } from "../lib/email";
import * as schema from "./schema";
import { contactGroups, contacts, groups, notes, users } from "./schema";

const CONTACT_COUNT = 1000;
const BATCH_SIZE = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

// Deterministic PRNG (mulberry32) so every run produces the same data set
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Set again before every run (resetRandom), so every run gives the same data
let random = createRandom(20261010);
const randomInt = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T =>
  items[randomInt(0, items.length - 1)];
const chance = (probability: number) => random() < probability;

// A separate generator, so the contact frequencies leave the rest
// of the data set exactly as it was before they were added
let frequencyRandom = createRandom(20261020);
function pickFrequency() {
  if (frequencyRandom() >= 1 / 3) return null;
  return CONTACT_FREQUENCIES[
    Math.floor(frequencyRandom() * CONTACT_FREQUENCIES.length)
  ];
}

// A separate generator as well: about 60% of the contacts have a birth date,
// and 70% of those a year
let birthRandom = createRandom(20261114);
type Birth = Pick<NewContact, "birthDay" | "birthMonth" | "birthYear">;
// Days in the months of a leap year, so that February 29 may come up too
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function pickBirth(): Birth {
  const hasDate = birthRandom() < 0.6;
  const month = 1 + Math.floor(birthRandom() * 12);
  const day = 1 + Math.floor(birthRandom() * MONTH_DAYS[month - 1]);
  const year = 1950 + Math.floor(birthRandom() * 56);
  const hasYear = birthRandom() < 0.7;
  if (!hasDate) return { birthDay: null, birthMonth: null, birthYear: null };
  // February 29 only in a leap year, or the database's check would not hold
  const valid = !(month === 2 && day === 29) || isLeapYear(year);
  return {
    birthDay: valid ? day : 28,
    birthMonth: month,
    birthYear: hasYear ? year : null,
  };
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// The first contacts have a birthday today, tomorrow and so on, so that the
// «Скоро день рождения» block has people in it whenever the data is made
const SOON_BIRTHDAY_DAYS = [0, 1, 2, 4, 7] as const;
function soonBirth(now: number, daysAhead: number): Birth {
  const today = moscowToday(new Date(now));
  const date = new Date(
    Date.UTC(today.year, today.month - 1, today.day + daysAhead),
  );
  return {
    birthDay: date.getUTCDate(),
    birthMonth: date.getUTCMonth() + 1,
    birthYear: 1970 + Math.floor(birthRandom() * 30),
  };
}

const GROUP_NAMES = [
  "Семья",
  "Друзья",
  "Знакомые",
  "Теннис",
  "Аналитики",
] as const;

// A separate generator as well: about half of the contacts get one or two groups
let groupRandom = createRandom(20261031);
function pickGroups(): string[] {
  if (groupRandom() >= 0.5) return [];
  const pool: string[] = [...GROUP_NAMES];
  const amount = groupRandom() < 0.7 ? 1 : 2;
  return Array.from(
    { length: amount },
    () => pool.splice(Math.floor(groupRandom() * pool.length), 1)[0],
  );
}

const MALE_FIRST_NAMES = [
  "Александр",
  "Алексей",
  "Андрей",
  "Антон",
  "Артём",
  "Борис",
  "Вадим",
  "Валентин",
  "Василий",
  "Виктор",
  "Виталий",
  "Владимир",
  "Владислав",
  "Вячеслав",
  "Геннадий",
  "Георгий",
  "Глеб",
  "Григорий",
  "Даниил",
  "Денис",
  "Дмитрий",
  "Евгений",
  "Егор",
  "Иван",
  "Игорь",
  "Илья",
  "Кирилл",
  "Константин",
  "Лев",
  "Леонид",
  "Максим",
  "Марк",
  "Матвей",
  "Михаил",
  "Никита",
  "Николай",
  "Олег",
  "Павел",
  "Пётр",
  "Роман",
  "Руслан",
  "Семён",
  "Сергей",
  "Станислав",
  "Степан",
  "Тимофей",
  "Тимур",
  "Фёдор",
  "Юрий",
  "Ярослав",
] as const;

const FEMALE_FIRST_NAMES = [
  "Агата",
  "Алёна",
  "Алина",
  "Алиса",
  "Анастасия",
  "Анна",
  "Арина",
  "Валентина",
  "Валерия",
  "Вера",
  "Вероника",
  "Виктория",
  "Галина",
  "Дарья",
  "Диана",
  "Ева",
  "Евгения",
  "Екатерина",
  "Елена",
  "Елизавета",
  "Жанна",
  "Зоя",
  "Ирина",
  "Карина",
  "Кира",
  "Ксения",
  "Лариса",
  "Лидия",
  "Любовь",
  "Людмила",
  "Маргарита",
  "Марина",
  "Мария",
  "Милана",
  "Надежда",
  "Наталья",
  "Нина",
  "Оксана",
  "Ольга",
  "Полина",
  "Светлана",
  "София",
  "Таисия",
  "Тамара",
  "Татьяна",
  "Ульяна",
  "Юлия",
  "Яна",
] as const;

// Male surname forms; female forms are derived in feminineSurname()
const SURNAMES = [
  "Иванов",
  "Смирнов",
  "Кузнецов",
  "Попов",
  "Васильев",
  "Петров",
  "Соколов",
  "Михайлов",
  "Новиков",
  "Фёдоров",
  "Морозов",
  "Волков",
  "Алексеев",
  "Лебедев",
  "Семёнов",
  "Егоров",
  "Павлов",
  "Козлов",
  "Степанов",
  "Николаев",
  "Орлов",
  "Андреев",
  "Макаров",
  "Никитин",
  "Захаров",
  "Зайцев",
  "Соловьёв",
  "Борисов",
  "Яковлев",
  "Григорьев",
  "Романов",
  "Воробьёв",
  "Сергеев",
  "Кузьмин",
  "Фролов",
  "Александров",
  "Дмитриев",
  "Королёв",
  "Гусев",
  "Киселёв",
  "Ильин",
  "Максимов",
  "Поляков",
  "Сорокин",
  "Виноградов",
  "Ковалёв",
  "Белов",
  "Медведев",
  "Антонов",
  "Тарасов",
  "Жуков",
  "Баранов",
  "Филиппов",
  "Комаров",
  "Давыдов",
  "Беляев",
  "Герасимов",
  "Богданов",
  "Осипов",
  "Сидоров",
  "Матвеев",
  "Титов",
  "Марков",
  "Миронов",
  "Крылов",
  "Куликов",
  "Карпов",
  "Власов",
  "Мельников",
  "Денисов",
  "Гаврилов",
  "Тихонов",
  "Казаков",
  "Афанасьев",
  "Данилов",
  "Савельев",
  "Тимофеев",
  "Фомин",
  "Чернов",
  "Абрамов",
  "Мартынов",
  "Ефимов",
  "Федотов",
  "Щербаков",
  "Назаров",
  "Калинин",
  "Исаев",
  "Чернышёв",
  "Быков",
  "Маслов",
  "Родионов",
  "Коновалов",
  "Лазарев",
  "Воронин",
  "Климов",
  "Филатов",
  "Пономарёв",
  "Голубев",
  "Кудрявцев",
  "Прохоров",
  "Наумов",
  "Потапов",
  "Журавлёв",
  "Овчинников",
  "Трофимов",
  "Леонов",
  "Соболев",
  "Ермаков",
  "Колесников",
  "Гончаров",
  "Емельянов",
  "Никифоров",
  "Грачёв",
  "Котов",
  "Гришин",
  "Ефремов",
  "Архипов",
  "Громов",
  "Кириллов",
  "Малышев",
  "Панов",
  "Моисеев",
  "Румянцев",
  "Акимов",
  "Кондратьев",
  "Бирюков",
  "Горбунов",
  "Анисимов",
  "Ерёмин",
  "Тихомиров",
  "Галкин",
  "Лукьянов",
  "Михеев",
  "Скворцов",
  "Юдин",
  "Белоусов",
  "Нестеров",
  "Симонов",
  "Прокофьев",
  "Харитонов",
  "Князев",
  "Цветков",
  "Левин",
  "Митрофанов",
  "Воронцов",
  "Аксёнов",
  "Софронов",
  "Мальцев",
  "Логинов",
  "Горшков",
  "Савин",
  "Краснов",
  "Майоров",
  "Демидов",
  "Елисеев",
  "Рыбаков",
  "Сафонов",
  "Плотников",
  "Дёмин",
  "Хохлов",
  "Жданов",
  "Руденко",
  "Шевчук",
  "Бондаренко",
  "Ткаченко",
  "Кравченко",
  "Литвиненко",
  "Островский",
  "Вишневский",
  "Покровский",
  "Заболоцкий",
  "Добровольский",
  "Черных",
  "Седых",
  "Белых",
  "Ким",
  "Цой",
  "Гарипов",
  "Сафин",
  "Хабибуллин",
  "Алиев",
  "Мамедов",
  "Арутюнян",
  "Саркисян",
  "Гагуа",
] as const;

const DOMAINS = [
  "gmail.com",
  "gmail.com",
  "gmail.com",
  "yandex.ru",
  "yandex.ru",
  "mail.ru",
  "icloud.com",
  "outlook.com",
  "proton.me",
  "bk.ru",
] as const;

// Texts use {male|female} placeholders, resolved by the contact's gender
const ABOUT = [
  "Продакт-менеджер в финтехе",
  "Фронтенд-разработчик",
  "Бэкенд-разработчик, пишет на Go",
  "Дизайнер интерфейсов",
  "Арт-директор в рекламном агентстве",
  "Руководитель отдела продаж",
  "Маркетолог, ведёт свой телеграм-канал",
  "HR в IT-компании",
  "Рекрутер, помогает с наймом",
  "Бухгалтер, ведёт ИП",
  "Юрист по корпоративному праву",
  "Нотариус",
  "Стоматолог",
  "Терапевт в частной клинике",
  "Психолог",
  "Ветеринар",
  "Тренер по теннису",
  "Фитнес-тренер",
  "Инструктор по горным лыжам",
  "Преподаватель английского",
  "Учитель математики",
  "Доцент в университете",
  "Аспирант{|ка}, занимается машинным обучением",
  "Фотограф, снимает свадьбы",
  "Видеограф",
  "Музыкант, играет на саксофоне",
  "Шеф-повар",
  "Владел{ец|ица} кофейни",
  "Предприниматель, своё производство мебели",
  "Риелтор",
  "Архитектор",
  "Прораб, делал{|а} ремонт в квартире",
  "Автомеханик",
  "Финансовый консультант",
  "Инвестор, вкладывается в стартапы",
  "Журналист",
  "Редактор в издательстве",
  "Переводчи{к|ца} с немецкого",
  "Врач-кардиолог",
  "Аналитик данных",
  "Тимлид",
  "Технический директор стартапа",
  "Пилот гражданской авиации",
  "Сосед{|ка} по даче",
  "Сосед{|ка} по подъезду",
  "Одноклассни{к|ца}",
  "Однокурсни{к|ца}",
  "Бывш{ий|ая} коллега",
  "{Друг|Подруга} детства",
  "Родственни{к|ца} со стороны жены",
  "{Двоюродный брат|Двоюродная сестра} друга",
  "{Папа|Мама} одноклассника сына",
  "Организатор митапов",
  "Волонтёр в приюте для собак",
  "Садовни{к|ца}, ухаживает за участком",
] as const;

const HOW_WE_MET = [
  "Учились вместе в университете",
  "Учились в одной школе",
  "Работали вместе в прошлой компании",
  "Работали в одной команде пару лет",
  "Познакомились на конференции",
  "Познакомились на митапе по продуктовой разработке",
  "Через общих друзей",
  "Познакомил коллега",
  "На свадьбе у друзей",
  "На дне рождения у общего друга",
  "В походе по Алтаю",
  "В отпуске в Грузии",
  "На курсах английского",
  "В спортзале",
  "На теннисном корте",
  "В беговом клубе",
  "Соседи по дому",
  "Соседи по даче",
  "Родители одноклассников детей",
  "По рекомендации знакомых",
  "{Был клиентом|Была клиенткой}",
  "Был{|а} нашим подрядчиком",
  "Собеседовали {его|её} на работу",
  "В поезде Москва — Петербург",
  "В летнем лагере в детстве",
  "На воркшопе по фотографии",
  "Играем вместе в настолки",
  "В очереди на визу",
  "Вместе волонтёрили",
  "Через чат жильцов дома",
] as const;

const NOTES = [
  "Созвонились, обсудили {его|её} новую работу. Договорились встретиться в следующем месяце.",
  "Обещал{|а} прислать контакт хорошего стоматолога.",
  "Поздравили с днём рождения.",
  "Пили кофе. Думает о переезде в Казань — спросить через пару месяцев, что решил{|а}.",
  "Просил{|а} совета по ремонту — скинули контакт нашего прораба.",
  "Договорились вместе сходить на концерт в декабре.",
  "Рассказал{|а} про свой стартап, ищет сооснователя с техническим бэкграундом.",
  "Ищет дизайнера на проект. Порекомендовали Аню.",
  "Виделись на дне рождения у общих друзей. Сын пошёл в первый класс.",
  "Должны {ему|ей} 3000 ₽ за билеты — вернуть до конца месяца.",
  "Договорились: помогаем {ему|ей} с резюме, {он|она} знакомит с рекрутером.",
  "Переехал{|а} в новую квартиру, зовёт на новоселье.",
  "Обсудили отпуск. Советует Калининград в сентябре.",
  "Взяли у {него|неё} книгу «Думай медленно… решай быстро». Вернуть.",
  "Прислал{|а} фотографии с похода, очень круто получилось.",
  "{Ушёл|Ушла} из компании, сейчас на фрилансе. Интересно, если будут заказы на брендинг.",
  "Созвонились по работе, обещал{|а} посмотреть наш договор до пятницы.",
  "Поздравили с рождением дочки.",
  "Сходили на {его|её} выступление на конференции — интересный доклад про найм.",
  "Договорились созвониться после праздников.",
  "Помог{|ла} с переездом — позвать на ужин в благодарность.",
  "Посоветовали {ему|ей} курс по аналитике, говорит, понравился.",
  "Случайно встретились в аэропорту, летел{|а} в Новосибирск.",
  "Ищет квартиру в нашем районе — скинуть объявления.",
  "Отправили {ему|ей} подборку статей про инвестиции, как обещали.",
  "Обсудили совместный проект. Ждёт от нас оценку по срокам.",
  "Подарил{|а} рассаду помидоров. Осенью угостить урожаем.",
  "Зовёт играть в теннис по субботам в 10:00.",
  "Порекомендовал{|а} своего юриста — очень помог с договором аренды.",
  "Давно не общались. Списались, договорились встретиться на неделе.",
] as const;

function inflect(template: string, isFemale: boolean): string {
  return template.replace(
    /\{([^|{}]*)\|([^|{}]*)\}/g,
    (_, male: string, female: string) => (isFemale ? female : male),
  );
}

function pickDistinct<T>(items: readonly T[], amount: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < amount && pool.length > 0) {
    picked.push(pool.splice(randomInt(0, pool.length - 1), 1)[0]);
  }
  return picked;
}

const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(text: string): string {
  return [...text.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join("");
}

function feminineSurname(surname: string): string {
  if (/(ов|ев|ёв|ин|ын)$/.test(surname)) return `${surname}а`;
  if (/(ский|цкий)$/.test(surname)) return surname.replace(/ий$/, "ая");
  // Surnames like Шевчук, Черных, Ким don't change
  return surname;
}

function makePhone(usedPhones: Set<string>): string {
  for (;;) {
    const digits = Array.from({ length: 9 }, () => randomInt(0, 9)).join("");
    const phone = `+7 9${digits.slice(0, 2)} ${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7, 9)}`;
    if (!usedPhones.has(phone)) {
      usedPhones.add(phone);
      return phone;
    }
  }
}

function makeEmail(
  firstName: string,
  surname: string,
  usedEmails: Set<string>,
): string {
  const first = transliterate(firstName);
  const last = transliterate(surname);
  const variants = [
    `${first}.${last}`,
    `${first[0]}.${last}`,
    `${last}.${first}`,
    `${first}${last}${randomInt(70, 99)}`,
    `${first}_${last}`,
  ];
  const localPart = pick(variants);
  for (let suffix = 0; ; suffix++) {
    const email = `${localPart}${suffix ? suffix : ""}@${pick(DOMAINS)}`;
    if (!usedEmails.has(email)) {
      usedEmails.add(email);
      return email;
    }
  }
}

type NewContact = Omit<typeof contacts.$inferInsert, "userId">;
type NewNote = Omit<typeof notes.$inferInsert, "contactId">;

function generateContacts(now: number) {
  const usedNames = new Set<string>();
  const usedPhones = new Set<string>();
  const usedEmails = new Set<string>();
  const result: { contact: NewContact; notes: NewNote[]; groups: string[] }[] =
    [];

  while (result.length < CONTACT_COUNT) {
    const isFemale = chance(0.5);
    const firstName = pick(isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);
    const maleSurname = pick(SURNAMES);
    const surname = isFemale ? feminineSurname(maleSurname) : maleSurname;
    const name = `${firstName} ${surname}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    // Contacts were added over the last three years
    const createdAt = new Date(
      now - randomInt(1, 3 * 365) * DAY_MS - randomInt(0, DAY_MS),
    );
    const noteCount = pick([0, 0, 1, 1, 1, 2, 2, 3, 4]);
    const contactNotes: NewNote[] = pickDistinct(NOTES, noteCount).map(
      (body) => ({
        body: inflect(body, isFemale),
        createdAt: new Date(
          createdAt.getTime() + random() * (now - createdAt.getTime()),
        ),
      }),
    );

    const updatedAt = contactNotes.reduce(
      (latest, note) => (note.createdAt! > latest ? note.createdAt! : latest),
      createdAt,
    );

    result.push({
      contact: {
        name,
        about: chance(0.9) ? inflect(pick(ABOUT), isFemale) : null,
        howWeMet: chance(0.85) ? inflect(pick(HOW_WE_MET), isFemale) : null,
        phone: chance(0.9) ? makePhone(usedPhones) : null,
        email: chance(0.75) ? makeEmail(firstName, surname, usedEmails) : null,
        // About a third of the contacts, so the home page has people to catch up with
        contactFrequency: pickFrequency(),
        ...(result.length < SOON_BIRTHDAY_DAYS.length
          ? soonBirth(now, SOON_BIRTHDAY_DAYS[result.length])
          : pickBirth()),
        createdAt,
        updatedAt,
      },
      notes: contactNotes,
      groups: pickGroups(),
    });
  }

  // Insert in the order the contacts were "added"
  return result.sort(
    (a, b) => a.contact.createdAt!.getTime() - b.contact.createdAt!.getTime(),
  );
}

function resetRandom() {
  random = createRandom(20261010);
  frequencyRandom = createRandom(20261020);
  groupRandom = createRandom(20261031);
  birthRandom = createRandom(20261114);
}

export type SeedResult =
  | { seeded: false; existingContacts: number }
  | {
      seeded: true;
      contacts: number;
      notes: number;
      groups: number;
      memberships: number;
    };

// Puts the demo data to the user with this address (made if there is none).
// Skips if the user has contacts already; the data of other users does not matter.
export async function seedDemoData(
  db: PostgresJsDatabase<typeof schema>,
  ownerEmail: string,
): Promise<SeedResult> {
  const email = normalizeEmail(ownerEmail);
  if (!email) {
    throw new Error(
      `OWNER_EMAIL is not an email address: "${ownerEmail}". Set it in .env`,
    );
  }

  return db.transaction(async (tx) => {
    let [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    owner ??= (
      await tx
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          name: "",
          email,
          emailVerified: true,
        })
        .returning({ id: users.id })
    )[0];

    const [{ value: existing }] = await tx
      .select({ value: count() })
      .from(contacts)
      .where(eq(contacts.userId, owner.id));
    if (existing > 0) return { seeded: false, existingContacts: existing };

    resetRandom();
    const generated = generateContacts(Date.now());
    let noteTotal = 0;
    let membershipTotal = 0;

    const insertedGroups = await tx
      .insert(groups)
      .values(GROUP_NAMES.map((name) => ({ userId: owner.id, name })))
      .returning({ id: groups.id, name: groups.name });
    const groupIds = new Map(
      insertedGroups.map((group) => [group.name, group.id]),
    );

    for (let start = 0; start < generated.length; start += BATCH_SIZE) {
      const batch = generated.slice(start, start + BATCH_SIZE);
      const inserted = await tx
        .insert(contacts)
        .values(batch.map((item) => ({ ...item.contact, userId: owner.id })))
        .returning({ id: contacts.id });

      const batchNotes = batch.flatMap((item, index) =>
        item.notes.map((note) => ({
          ...note,
          contactId: inserted[index].id,
        })),
      );
      if (batchNotes.length > 0) {
        await tx.insert(notes).values(batchNotes);
        noteTotal += batchNotes.length;
      }

      const batchMemberships = batch.flatMap((item, index) =>
        item.groups.map((name) => ({
          contactId: inserted[index].id,
          groupId: groupIds.get(name)!,
        })),
      );
      if (batchMemberships.length > 0) {
        await tx.insert(contactGroups).values(batchMemberships);
        membershipTotal += batchMemberships.length;
      }
    }

    return {
      seeded: true,
      contacts: generated.length,
      notes: noteTotal,
      groups: GROUP_NAMES.length,
      memberships: membershipTotal,
    };
  });
}
