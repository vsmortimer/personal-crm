// Fills the database with realistic test contacts, notes and groups, for the
// user with the address OWNER_EMAIL from .env. Does nothing if that user has
// contacts already. Usage: pnpm db:seed
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "./connection-url";
import * as schema from "./schema";
import { seedDemoData } from "./seed-demo";

loadEnvConfig(process.cwd());

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    throw new Error(
      "OWNER_EMAIL is not set: the demo contacts need an owner. Add it to .env",
    );
  }

  const client = postgres(getDatabaseUrl(), { max: 1 });
  try {
    const result = await seedDemoData(drizzle(client, { schema }), ownerEmail);
    if (!result.seeded) {
      console.log(
        `${ownerEmail} already has ${result.existingContacts} contacts, seeding skipped to avoid duplicates.`,
      );
      return;
    }
    console.log(
      `Seeded ${result.contacts} contacts, ${result.notes} notes and ${result.groups} groups with ${result.memberships} memberships for ${ownerEmail}.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
