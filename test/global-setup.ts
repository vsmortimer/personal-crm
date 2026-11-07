// Runs once per `pnpm test`: creates a fresh test database, applies the
// migrations from ./drizzle to it and drops it when the run is over.
// The app's own local database is never touched.
import type { TestProject } from "vitest/node";

import { TEST_DATABASE_SUFFIX, createTestDatabase } from "./test-database";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const database = await createTestDatabase(TEST_DATABASE_SUFFIX);
  project.provide("testDatabaseUrl", database.url);
  return database.drop;
}
