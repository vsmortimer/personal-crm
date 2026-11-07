"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { LoginFormState } from "@/lib/login-form";
import { requestLoginLink } from "@/lib/login-link";

export async function requestLoginLinkAction(
  prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const raw = String(formData.get("email") ?? "");
  const result = await requestLoginLink(raw, await headers());
  const version = prevState.version + 1;

  if ("sentTo" in result) {
    return { email: result.sentTo, sentTo: result.sentTo, version };
  }
  if (result.field === "email") {
    return { email: raw, emailError: result.error, version };
  }
  return { email: raw.trim(), message: result.error, version };
}

// Signs out on this device only: other devices have sessions of their own
export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
