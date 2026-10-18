import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";

// Used by the deploy script and the deploy workflow: 200 when the app is up
// and reaches the database. `commit` tells which version is running.
export async function GET() {
  await connection();

  const commit = process.env.APP_COMMIT ?? "dev";
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    console.error("Health check failed: database is unreachable", error);
    return Response.json({ status: "error", commit }, { status: 503 });
  }
  return Response.json({ status: "ok", commit });
}
