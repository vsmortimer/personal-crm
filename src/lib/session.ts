import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

// Who is signed in, from the cookie of the request; null if nobody.
// cache() makes it one query to the database per page, however many
// components ask.
export const getCurrentUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

// For pages and actions that need a person: without sign-in, the sign-in page
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
