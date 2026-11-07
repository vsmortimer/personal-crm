// Postgres error code (e.g. "23505", unique violation) of a failed query.
// Drizzle wraps the driver's error, so the code is somewhere in the causes.
export function postgresErrorCode(error: unknown): string | undefined {
  for (let cause = error; cause; cause = (cause as Error).cause) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export const UNIQUE_VIOLATION = "23505";
export const CHECK_VIOLATION = "23514";
