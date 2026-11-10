import "server-only";

import { postgresErrorCode } from "@/db/errors";

type Fields = Record<string, unknown>;

// Only the stack frames (the paths of files): the first lines of a stack
// repeat the message of the error
function frames(error: Error): string[] {
  return (error.stack ?? "")
    .split("\n")
    .filter((line) => line.startsWith("    at "))
    .map((line) => line.trim());
}

// The error of Postgres is somewhere in the causes (Drizzle wraps it)
function postgresError(error: unknown): Fields | undefined {
  for (let cause = error; cause; cause = (cause as Error).cause) {
    if (typeof (cause as { code?: unknown }).code === "string") {
      return cause as Fields;
    }
  }
  return undefined;
}

// Writes a failure to the error log without the data of the people.
//
// The message of a failed query holds the values of its parameters (name,
// phone, email, text of a note), and Postgres puts the values into `detail`
// ("Key (email)=(anna@mail.ru) already exists") and sometimes into its
// message. So for a database error only the places that never hold values are
// logged: the code, the table, the column, the constraint, the query text
// (it has $1, $2 instead of values) and the stack frames.
export function logError(what: string, error: unknown) {
  if (!(error instanceof Error)) {
    console.error(what, { error: `not an Error: ${typeof error}` });
    return;
  }

  const code = postgresErrorCode(error);
  if (code === undefined) {
    console.error(what, {
      error: error.name,
      message: error.message,
      frames: frames(error),
    });
    return;
  }

  const postgres = postgresError(error);
  console.error(what, {
    error: error.name,
    code,
    table: postgres?.table_name,
    column: postgres?.column_name,
    constraint: postgres?.constraint_name,
    query: (error as { query?: unknown }).query,
    frames: frames(error),
  });
}
