// Builds the Postgres connection string from environment variables.
// DATABASE_URL wins if set; otherwise the same POSTGRES_* variables
// that compose.yaml uses to start the database container.
export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    throw new Error(
      "Database settings are missing: set DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB in .env",
    );
  }

  // compose.yaml publishes the port on 127.0.0.1 only
  const port = process.env.POSTGRES_PORT || "5432";
  const user = encodeURIComponent(POSTGRES_USER);
  const password = encodeURIComponent(POSTGRES_PASSWORD);
  const database = encodeURIComponent(POSTGRES_DB);

  return `postgres://${user}:${password}@127.0.0.1:${port}/${database}`;
}
