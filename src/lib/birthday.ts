// Relative: the demo data (src/db/seed-demo.ts) uses this file too
import { pluralize } from "./format";

// A birthday is a calendar date, so "today" needs a time zone. Moscow has no
// daylight saving time. The server lives in UTC, and without this the block
// would show yesterday's date between 00:00 and 03:00 by Moscow time.
export const BIRTHDAY_TIME_ZONE = "Europe/Moscow";

// The block shows today and the next 7 days
export const BIRTHDAY_SOON_DAYS = 7;

// In the genitive case, as after a day: "21 ноября". The month's number is
// the index plus one.
export const MONTH_NAMES = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

const DAY_WORDS = ["день", "дня", "дней"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CalendarDate = { year: number; month: number; day: number };

// A birth date as the database keeps it: no year is an honest "not known"
export type Birth = { day: number; month: number; year: number | null };

export type NextBirthday = {
  // The day it is celebrated, which February 29 moves in a common year
  date: CalendarDate;
  daysLeft: number;
  // How old the person becomes; null when the birth year is not known
  age: number | null;
};

const todayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BIRTHDAY_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

// The date by Moscow time at the moment `now`
export function moscowToday(now: Date): CalendarDate {
  const parts = Object.fromEntries(
    todayFormat.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// The birthday in the given year. February 29 is February 28 in a common year.
function birthdayIn(year: number, birth: Birth): CalendarDate {
  const moved = birth.month === 2 && birth.day === 29 && !isLeapYear(year);
  return { year, month: birth.month, day: moved ? 28 : birth.day };
}

function dayNumber({ year, month, day }: CalendarDate): number {
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

// The nearest birthday: today's one, or the next to come
export function nextBirthday(birth: Birth, now: Date): NextBirthday {
  const today = moscowToday(now);
  let date = birthdayIn(today.year, birth);
  if (dayNumber(date) < dayNumber(today)) {
    date = birthdayIn(today.year + 1, birth);
  }
  return {
    date,
    daysLeft: dayNumber(date) - dayNumber(today),
    age: birth.year === null ? null : date.year - birth.year,
  };
}

// "21 ноября" or, with the year, "5 марта 1990"
export function formatBirthDate({ day, month, year }: Birth): string {
  const dayAndMonth = `${day} ${MONTH_NAMES[month - 1]}`;
  return year === null ? dayAndMonth : `${dayAndMonth} ${year}`;
}

function daysLeftText(daysLeft: number): string {
  if (daysLeft === 0) return "сегодня";
  if (daysLeft === 1) return "завтра";
  return `через ${pluralize(daysLeft, DAY_WORDS)}`;
}

// The line under the name in the block: "16 ноября · через 2 дня · исполнится 36"
export function birthdayCaption({ date, daysLeft, age }: NextBirthday): string {
  const parts = [
    formatBirthDate({ ...date, year: null }),
    daysLeftText(daysLeft),
  ];
  if (age !== null) {
    parts.push(`${daysLeft === 0 ? "исполняется" : "исполнится"} ${age}`);
  }
  return parts.join(" · ");
}
