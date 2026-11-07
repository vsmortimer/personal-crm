import { z } from "zod";

// An email address as the app keeps it: no spaces around, lower case. null if
// it is not an address. The same rules for the sign-in form and for the
// owner's address in the settings (src/db/apply-migrations.ts); the email of
// a contact follows them too (src/lib/validation.ts).
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !z.email().safeParse(email).success) return null;
  return email;
}
