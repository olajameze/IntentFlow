import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Defense-in-depth: never run auth refresh on Next assets (avoids 500 on chunks/CSS if matcher mis-fires)
  if (request.nextUrl.pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  try {
    return await updateSession(request);
  } catch (e) {
    console.error("[middleware]", e);
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|.*\\.(?:svg|ico|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
