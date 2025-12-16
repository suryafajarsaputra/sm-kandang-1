import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // baca cookie auth_token dari request
  const token = request.cookies.get("auth_token")?.value;

  const pathname = request.nextUrl.pathname;

  // jika mengakses /dashboard dan tidak punya token -> redirect ke /login
  if (pathname.startsWith("/dashboard") && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // jika mengakses /login tapi sudah login -> redirect ke dashboard
  if (pathname === "/login" && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
