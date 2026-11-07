// Signs in the way a browser does: asks for a link, takes it from the email in
// Mailpit and opens it in the handler of Better Auth. For Vitest.
import { GET } from "@/app/api/auth/[...all]/route";
import { requestLoginLink } from "@/lib/login-link";
import { emailsTo, linkIn } from "./mailpit";

// What the browser gets back from opening a link
export type Opened = {
  status: number;
  // Where the browser is sent next
  location: URL;
  // The cookie header the browser would send from now on; null: no session
  cookie: string | null;
};

const SESSION_COOKIE = "better-auth.session_token";

// Asks for a link for the address and returns the newest one in Mailpit
export async function requestLink(email: string): Promise<string> {
  const result = await requestLoginLink(email, new Headers());
  if (!("sentTo" in result)) {
    throw new Error(`The link was not sent: ${result.error}`);
  }
  const [newest] = await emailsTo(result.sentTo);
  return linkIn(newest);
}

export async function openLink(link: string): Promise<Opened> {
  const response = await GET(new Request(link));
  const sessionCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  return {
    status: response.status,
    location: new URL(response.headers.get("location") ?? "/", link),
    cookie: sessionCookie ? sessionCookie.split(";")[0] : null,
  };
}

export async function signIn(email: string): Promise<Opened> {
  return openLink(await requestLink(email));
}

// For the tests of the session: the headers of a request with the cookie
export function withCookie(cookie: string): Headers {
  return new Headers({ cookie });
}
