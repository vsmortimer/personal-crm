// Tests run against their own databases next to the app's one: the same
// local Postgres, the app database name plus a suffix that ends in "_test".
// Vitest and the e2e tests each have their own, so they never share data.
// A run creates its database from scratch and drops it when it is over;
// the app's own database is never touched.
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getDatabaseUrl } from "../src/db/connection-url";

// Vitest (pnpm test)
export const TEST_DATABASE_SUFFIX = "_test";
// Playwright (pnpm test:e2e)
export const E2E_DATABASE_SUFFIX = "_e2e_test";
// The migration test in Vitest: a database of its own, made from older
// migrations, next to the Vitest one
export const MIGRATION_DATABASE_SUFFIX = "_migration_test";

// The last line of defence before anything is dropped or truncated
export function assertTestDatabase(name: string) {
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to touch database "${name}": the test database name must end with "${TEST_DATABASE_SUFFIX}"`,
    );
  }
}

const quietLog = { info() {}, error: console.error };

// The app's database: the same .env and POSTGRES_* settings the app uses
function appDatabaseUrl(): URL {
  loadEnvConfig(process.cwd(), false, quietLog);
  return new URL(getDatabaseUrl());
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

// The test database on the same server, with the same user and password
export function testDatabaseUrl(suffix: string): string {
  const url = appDatabaseUrl();
  const name = `${databaseName(url)}${suffix}`;
  assertTestDatabase(name);
  url.pathname = `/${encodeURIComponent(name)}`;
  return url.href;
}

function connect(url: string) {
  return postgres(url, { max: 1, onnotice: () => {} });
}

async function dropDatabase(admin: postgres.Sql, name: string) {
  assertTestDatabase(name);
  // "with (force)" closes connections a crashed run may have left behind
  await admin`drop database if exists ${admin(name)} with (force)`;
}

// Creates the test database from scratch and applies the migrations from
// ./drizzle to it, or from another folder, e.g. one with only the first
// migrations. `drop` removes it when the run is over.
export async function createTestDatabase(
  suffix: string,
  { migrationsFolder = "./drizzle" }: { migrationsFolder?: string } = {},
) {
  const appUrl = appDatabaseUrl();
  const url = testDatabaseUrl(suffix);
  const name = databaseName(new URL(url));

  const admin = connect(appUrl.href);
  try {
    await dropDatabase(admin, name);
    await admin`create database ${admin(name)}`;

    const client = connect(url);
    try {
      await migrate(drizzle(client), { migrationsFolder });
    } finally {
      await client.end();
    }
  } catch (error) {
    await admin.end();
    if ((error as { code?: string }).code === "ECONNREFUSED") {
      throw new Error(
        `Postgres is not reachable at ${appUrl.host}. Start it with: docker compose up -d db`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    url,
    drop: async () => {
      try {
        await dropDatabase(admin, name);
      } finally {
        await admin.end();
      }
    },
  };
}
