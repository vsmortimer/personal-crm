import { describe, expect, test } from "vitest";

import {
  BIRTHDAY_SOON_DAYS,
  birthdayCaption,
  formatBirthDate,
  moscowToday,
  nextBirthday,
  type Birth,
} from "@/lib/birthday";

// A moment at noon by Moscow time (UTC+3), so the day is the same everywhere
function noon(date: string) {
  return new Date(`${date}T12:00:00+03:00`);
}

function daysLeft(birth: Birth, today: string) {
  return nextBirthday(birth, noon(today)).daysLeft;
}

const NOV_21: Birth = { day: 21, month: 11, year: null };
const FEB_29: Birth = { day: 29, month: 2, year: null };

describe("moscowToday", () => {
  // Scenario: «Когда день рождения скоро»: «сегодня» - по московскому времени
  test("00:30 in Moscow is already the next day, though in UTC it is still the day before", () => {
    expect(moscowToday(new Date("2026-11-13T21:30:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 14,
    });
  });

  test("23:30 in Moscow is still the same day, though in UTC it is 20:30", () => {
    expect(moscowToday(new Date("2026-11-14T20:30:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 14,
    });
  });

  test("the last evening of the year by Moscow time", () => {
    expect(moscowToday(new Date("2026-12-31T23:30:00+03:00"))).toEqual({
      year: 2026,
      month: 12,
      day: 31,
    });
  });
});

describe("nextBirthday: how many days are left", () => {
  test("a birthday today is 0 days away", () => {
    expect(daysLeft(NOV_21, "2026-11-21")).toBe(0);
  });

  test("exactly 7 days before, 8 days before, and the day after", () => {
    expect(daysLeft(NOV_21, "2026-11-14")).toBe(7);
    expect(daysLeft(NOV_21, "2026-11-13")).toBe(8);
    expect(daysLeft(NOV_21, "2026-11-22")).toBe(364);
  });

  test("the block shows birthdays 0 to 7 days away, 8 days in all", () => {
    expect(BIRTHDAY_SOON_DAYS).toBe(7);
  });

  test("a birthday that has just passed is almost a year away", () => {
    expect(daysLeft({ day: 13, month: 11, year: null }, "2026-11-14")).toBe(
      364,
    );
  });

  test("a birthday across the end of the year", () => {
    expect(daysLeft({ day: 3, month: 1, year: null }, "2026-12-28")).toBe(6);
    expect(
      nextBirthday({ day: 3, month: 1, year: 1990 }, noon("2026-12-28")).date,
    ).toEqual({ year: 2027, month: 1, day: 3 });
  });

  test("Moscow's day decides: at 00:30 on 14 November, 21 November is 7 days away", () => {
    const night = new Date("2026-11-13T21:30:00Z");
    expect(nextBirthday(NOV_21, night).daysLeft).toBe(7);
  });

  test("at 23:30 on 13 November, 21 November is 8 days away", () => {
    const evening = new Date("2026-11-13T20:30:00Z");
    expect(nextBirthday(NOV_21, evening).daysLeft).toBe(8);
  });
});

describe("nextBirthday: February 29", () => {
  // Scenario: «29 февраля в обычный год»
  test("in a common year the birthday is on February 28", () => {
    expect(nextBirthday(FEB_29, noon("2027-02-21"))).toMatchObject({
      date: { year: 2027, month: 2, day: 28 },
      daysLeft: 7,
    });
    expect(daysLeft(FEB_29, "2027-02-28")).toBe(0);
  });

  test("on March 1 of a common year the next one is the leap year's February 29", () => {
    expect(nextBirthday(FEB_29, noon("2027-03-01"))).toMatchObject({
      date: { year: 2028, month: 2, day: 29 },
      daysLeft: 365,
    });
  });

  test("in a leap year it stays February 29, and February 28 is the day before", () => {
    expect(nextBirthday(FEB_29, noon("2028-02-28"))).toMatchObject({
      date: { year: 2028, month: 2, day: 29 },
      daysLeft: 1,
    });
    expect(daysLeft(FEB_29, "2028-02-29")).toBe(0);
  });

  test("the day before a common year's February 28 is 1 day away", () => {
    expect(daysLeft(FEB_29, "2027-02-27")).toBe(1);
  });
});

describe("nextBirthday: age", () => {
  test("without a birth year the age is not known", () => {
    expect(nextBirthday(NOV_21, noon("2026-11-14")).age).toBeNull();
  });

  test("the age is the year of the birthday minus the birth year", () => {
    const birth = { day: 16, month: 11, year: 1990 };
    expect(nextBirthday(birth, noon("2026-11-14")).age).toBe(36);
    // The birthday of the next year
    expect(nextBirthday(birth, noon("2026-11-17")).age).toBe(37);
  });

  test("across the end of the year the age is of the new year", () => {
    const birth = { day: 3, month: 1, year: 1990 };
    expect(nextBirthday(birth, noon("2026-12-28")).age).toBe(37);
  });
});

describe("birthdayCaption", () => {
  // The number and its word are tied by a non-breaking space, so that a line
  // does not break between them; here it is told from a plain space by nobody
  const caption = (birth: Birth, today: string) =>
    birthdayCaption(nextBirthday(birth, noon(today))).replaceAll("\u00a0", " ");

  // Scenario: «Без года»
  test("without a year: the date and the days left", () => {
    expect(caption(NOV_21, "2026-11-14")).toBe("21 ноября · через 7 дней");
  });

  // Scenario: «С годом»
  test("with a year: the age is added", () => {
    expect(caption({ day: 16, month: 11, year: 1990 }, "2026-11-14")).toBe(
      "16 ноября · через 2 дня · исполнится 36",
    );
  });

  // Scenario: «Сегодня и завтра»
  test("today and tomorrow have their own words", () => {
    expect(caption({ day: 14, month: 11, year: 1990 }, "2026-11-14")).toBe(
      "14 ноября · сегодня · исполняется 36",
    );
    expect(caption({ day: 15, month: 11, year: null }, "2026-11-14")).toBe(
      "15 ноября · завтра",
    );
  });

  test.each([
    [2, "через 2 дня"],
    [3, "через 3 дня"],
    [5, "через 5 дней"],
    [7, "через 7 дней"],
  ])("%i days left: «%s»", (days, text) => {
    const birth = { day: 14 + days, month: 11, year: null };
    expect(caption(birth, "2026-11-14")).toBe(`${14 + days} ноября · ${text}`);
  });

  test("a birthday of February 29 in a common year is shown as February 28", () => {
    expect(caption(FEB_29, "2027-02-27")).toBe("28 февраля · завтра");
  });
});

describe("formatBirthDate", () => {
  // Scenarios: «Дата без года», «Дата с годом»
  test("a date without a year is the day and the month in words", () => {
    expect(formatBirthDate({ day: 21, month: 11, year: null })).toBe(
      "21 ноября",
    );
  });

  test("a date with a year ends with the year", () => {
    expect(formatBirthDate({ day: 5, month: 3, year: 1990 })).toBe(
      "5 марта 1990",
    );
  });

  test("February 29 stays as it is", () => {
    expect(formatBirthDate(FEB_29)).toBe("29 февраля");
  });

  test.each([
    [1, "января"],
    [2, "февраля"],
    [3, "марта"],
    [4, "апреля"],
    [5, "мая"],
    [6, "июня"],
    [7, "июля"],
    [8, "августа"],
    [9, "сентября"],
    [10, "октября"],
    [11, "ноября"],
    [12, "декабря"],
  ])("month %i is «%s»", (month, name) => {
    expect(formatBirthDate({ day: 1, month, year: null })).toBe(`1 ${name}`);
  });
});
