import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

// Without sign-in every page is the sign-in page. Not the only guard: pages
// and actions check the person again (src/lib/session.ts), because actions
// are not requests for a page and do not pass here.
//
// Also the only place that can extend the sign-in: a page cannot set a cookie,
// and without a fresh cookie the browser forgets the sign-in 30 days after
// it, however often the person visits.
export async function proxy(request: NextRequest) {
  // Pages are read with GET; actions (POST) check the person themselves
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  const { headers: sessionHeaders, response: session } =
    await auth.api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
  const { pathname } = request.nextUrl;
  const onSignInPage = pathname === "/login";
  const onSignInSideGroup = pathname.startsWith("/login/");

  let response: NextResponse;
  if (!session && !onSignInPage && !onSignInSideGroup) {
    response = NextResponse.redirect(new URL("/login", request.url));
  } else if (session && onSignInPage) {
    response = NextResponse.redirect(new URL("/", request.url));
  } else {
    response = NextResponse.next();
  }

  // The new cookie of an extended sign-in goes to the browser
  for (const cookie of sessionHeaders.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export const config = {
  // Not the handler of Better Auth (the link from the email opens there), not
  // the check of the deploy, not the files of Next.js and the icon
  matcher: ["/((?!api/auth/|health$|_next/|favicon\\.ico$).*)"],
};
