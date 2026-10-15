const pluralRules = new Intl.PluralRules("ru-RU");

// pluralize(5, ["контакт", "контакта", "контактов"]) -> "5 контактов"
export function pluralize(
  amount: number,
  [one, few, many]: readonly [string, string, string],
): string {
  const rule = pluralRules.select(amount);
  const word = rule === "one" ? one : rule === "few" ? few : many;
  return `${amount.toLocaleString("ru-RU")} ${word}`;
}

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

// initials("Андрей Ковалёв") -> "АК"; a single word gives one letter
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    // Array.from keeps an emoji or other two-unit character whole
    .map((word) => (Array.from(word)[0] ?? "").toLocaleUpperCase("ru-RU"))
    .join("");
}

// Contact ids in URLs are positive 32-bit integers
export function parseContactId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id <= 2_147_483_647 ? id : null;
}
