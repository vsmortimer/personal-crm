// Runs once per `pnpm test`: creates a fresh test database, applies the
// migrations from ./drizzle to it and drops it when the run is over.
// The app's own local database is never touched.
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

import { getDatabaseUrl } from "../src/db/connection-url";
import { TEST_DATABASE_SUFFIX, assertTestDatabase } from "./test-database";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const quietLog = { info() {}, error: console.error };

function connect(url: URL) {
  return postgres(url.href, { max: 1, onnotice: () => {} });
}

async function dropDatabase(admin: postgres.Sql, name: string) {
  assertTestDatabase(name);
  // "with (force)" closes connections a crashed run may have left behind
  await admin`drop database if exists ${admin(name)} with (force)`;
}

export default async function setup(project: TestProject) {
  // The same .env and POSTGRES_* settings the app uses
  loadEnvConfig(process.cwd(), false, quietLog);
  const appUrl = new URL(getDatabaseUrl());
  const testDatabase = `${decodeURIComponent(appUrl.pathname.slice(1))}${TEST_DATABASE_SUFFIX}`;
  const testUrl = new URL(appUrl);
  testUrl.pathname = `/${encodeURIComponent(testDatabase)}`;

  const admin = connect(appUrl);
  try {
    await dropDatabase(admin, testDatabase);
    await admin`create database ${admin(testDatabase)}`;
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

  const client = connect(testUrl);
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }

  project.provide("testDatabaseUrl", testUrl.href);

  return async () => {
    try {
      await dropDatabase(admin, testDatabase);
    } finally {
      await admin.end();
    }
  };
}
