// Runs once per `pnpm test:e2e`, after the app has started: creates a fresh
// e2e database that the app is already pointed at (see playwright.config.ts)
// and drops it when the run is over. The app's own database is never touched.
import { E2E_DATABASE_SUFFIX, createTestDatabase } from "../test/test-database";

export default async function globalSetup() {
  const database = await createTestDatabase(E2E_DATABASE_SUFFIX);
  return database.drop;
}
