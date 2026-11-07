import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { loginEmail } from "@/lib/login-email";
import { sendEmail } from "@/lib/mailer";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Sign-in with a link from an email, no passwords. The settings:
// openspec/changes/login/design.md, decision 1
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // users, sessions, accounts, verifications
    usePlural: true,
    schema,
  }),
  // Read when the app runs, not when it is built: one image for every machine
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    magicLink({
      // A link works for 15 minutes; the database keeps only its hash
      expiresIn: 15 * MINUTE,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({ to: email, ...loginEmail(url) });
      },
    }),
    // Lets server actions set and remove the cookie of the session
    nextCookies(),
  ],
  session: {
    // A session lasts 30 days from the last visit on this device...
    expiresIn: 30 * DAY,
    // ...and is extended by a visit once an hour at most, so most visits
    // write nothing to the database
    updateAge: HOUR,
  },
  // Its own limit counts by IP address, and behind nginx everyone has the same
  // one. The limit by email is ours: src/lib/login-link.ts
  rateLimit: { enabled: false },
  // A link is requested only through requestLoginLink, never by a plain request
  disabledPaths: ["/sign-in/magic-link"],
});
