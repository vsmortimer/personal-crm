// How often the owner wants to be in touch with a contact.
// Shared by the form, the contact page and the home page;
// the database enum in src/db/schema.ts is built from this list.
export const CONTACT_FREQUENCIES = ["week", "month", "quarter", "year"] as const;

export type ContactFrequency = (typeof CONTACT_FREQUENCIES)[number];

export const CONTACT_FREQUENCY_LABELS: Record<ContactFrequency, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};
