import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!req.auth?.user;
  const isPublicPath = PUBLIC_PATHS.some((path) => nextUrl.pathname.startsWith(path));

  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Deliberately NOT redirecting an already-authenticated visitor away
  // from /login here: `req.auth` only reflects the JWT's signature and
  // claims, not whether the account is still active or has since been
  // deactivated — Prisma isn't available in this Edge middleware to check
  // live. The /login page itself performs that live check (via
  // getCurrentUser, which re-validates against the database) and redirects
  // when appropriate. Doing it here too, from stale data, risks a redirect
  // loop for a deactivated user: middleware bounces them from /login to
  // /dashboard on stale "authenticated" data, the live check in
  // (app)/layout.tsx then bounces them back to /login, forever.

  return NextResponse.next();
});

export const config = {
  // Run on everything except static assets, images, and API auth routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|manifest.webmanifest).*)"],
};
