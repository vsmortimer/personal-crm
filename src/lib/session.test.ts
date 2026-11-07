// Who is signed in, read from the cookie of the request
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getCurrentUser, requireUser } from "@/lib/session";
import { clearEmails } from "../../test/mailpit";
import { signIn, withCookie } from "../../test/sign-in";

// The headers of the request the code runs in; there is none in Vitest
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

beforeEach(async () => {
  requestHeaders = new Headers();
  await clearEmails();
});

describe("getCurrentUser", () => {
  test("is the person of the cookie", async () => {
    const { cookie } = await signIn("anna@mail.ru");
    requestHeaders = withCookie(cookie!);

    expect(await getCurrentUser()).toMatchObject({ email: "anna@mail.ru" });
  });

  test("is nobody without a cookie", async () => {
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser", () => {
  test("is the person of the cookie", async () => {
    const { cookie } = await signIn("anna@mail.ru");
    requestHeaders = withCookie(cookie!);

    expect(await requireUser()).toMatchObject({ email: "anna@mail.ru" });
  });

  test("sends a person who is not signed in to the sign-in page", async () => {
    await expect(requireUser()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/login;/),
    });
  });
});
