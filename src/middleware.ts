import { NextResponse, type NextRequest } from "next/server";

/** `?look=new` / `?look=old` remembers the choice on this device (cookie "look", read by src/lib/look.ts), then drops the parameter. */
export function middleware(req: NextRequest) {
  const look = req.nextUrl.searchParams.get("look");
  if (look !== "new" && look !== "old") return NextResponse.next();
  const url = req.nextUrl.clone();
  url.searchParams.delete("look");
  const res = NextResponse.redirect(url);
  res.cookies.set("look", look, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
