import "server-only";

import { and, count, eq, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { loginLinkRequests, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { logError } from "@/lib/log-error";

// At most 3 emails to one address in 10 minutes
const MAX_EMAILS = 3;
const WINDOW = sql`interval '10 minutes'`;

// A request holds one database connection for its transaction and takes one
// more for the link (Better Auth does not know about our transaction). The
// pool has 10 (src/db/index.ts): with 10 requests at once every connection is
// held and every request waits for one more, so the whole app hangs. With 4 at
// most 8 are taken, the rest wait here without a connection.
const MAX_PARALLEL_REQUESTS = 4;

let running = 0;
const waiting: Array<() => void> = [];

async function inTurn<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL_REQUESTS) {
    // The place is handed over by the one who leaves, `running` stays as is
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running++;
  }
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

export const BAD_EMAIL = "Проверь адрес почты";
export const SENT_TOO_OFTEN = "Слишком часто, попробуй через несколько минут";
export const NOT_SENT = "Не удалось отправить письмо, попробуй ещё раз";

export type RequestLoginLinkResult =
  | { sentTo: string }
  // `field`: the error belongs under that field of the form
  | { error: string; field?: "email" };

// The only way to get a sign-in link: the form action calls this. The plain
// HTTP path of Better Auth is closed (src/lib/auth.ts), so nobody can skip the
// address check, the limit or the cancelling of the old links.
export async function requestLoginLink(
  rawEmail: string,
  headers: Headers,
): Promise<RequestLoginLinkResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { error: BAD_EMAIL, field: "email" };

  try {
    return await inTurn(() =>
      db.transaction(async (tx) => {
        // Requests for one address go one after another; the lock is released
        // when the transaction ends
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

        await tx
          .delete(loginLinkRequests)
          .where(
            and(
              eq(loginLinkRequests.email, email),
              lt(loginLinkRequests.createdAt, sql`now() - ${WINDOW}`),
            ),
          );
        const [{ total }] = await tx
          .select({ total: count() })
          .from(loginLinkRequests)
          .where(eq(loginLinkRequests.email, email));
        if (total >= MAX_EMAILS) return { error: SENT_TOO_OFTEN };

        // The new link cancels the old ones. `case` reads the address only from
        // the rows of links, whatever else the table may hold
        await tx.delete(verifications).where(
          sql`case when ${verifications.identifier} like 'magic-link:%'
          then ${verifications.value}::jsonb ->> 'email' end = ${email}`,
        );
        await tx.insert(loginLinkRequests).values({ email });

        // Makes the link and sends the email. If the email does not go, the
        // error undoes all of the above: the request is not counted and the old
        // links work again. (The new link stays in the table, but nobody has it.)
        await auth.api.signInMagicLink({
          body: {
            email,
            callbackURL: "/",
            errorCallbackURL: "/login/expired",
          },
          headers,
        });
        return { sentTo: email };
      }),
    );
  } catch (error) {
    logError("Failed to send a sign-in link", error);
    return { error: NOT_SENT };
  }
}
