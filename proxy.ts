import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

export async function proxy(request: NextRequest) {
  const authResponse =
    await auth0.middleware(request);

  if (
    request.nextUrl.pathname.startsWith("/auth")
  ) {
    return authResponse;
  }

  const session =
    await auth0.getSession(request);

  if (!session) {
    const loginUrl =
      new URL("/auth/login", request.url);

    const returnTo =
      request.nextUrl.pathname +
      request.nextUrl.search;

    loginUrl.searchParams.set(
      "returnTo",
      returnTo
    );

    return NextResponse.redirect(
      loginUrl
    );
  }

  return authResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};