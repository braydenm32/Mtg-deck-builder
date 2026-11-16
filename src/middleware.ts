import { NextResponse, type NextRequest } from "next/server";

const PARAMS = { look: ["new", "old"], theme: ["commandery", "kitchen", "auto"] } as const;

/**
 * `?look=new|old` and `?theme=commandery|kitchen|auto` remember the choice on this device (cookies
 * "look" and "theme", read by src/lib/look.ts and src/lib/theme.ts), then drop the parameter.
 */
export function middleware(req: NextRequest) {
  const set = Object.entries(PARAMS).flatMap(([name, allowed]) => {
    const v = req.nextUrl.searchParams.get(name);
    return v && (allowed as readonly string[]).includes(v) ? [[name, v] as const] : [];
  });
  if (!set.length) return NextResponse.next();
  const url = req.nextUrl.clone();
  for (const [name] of set) url.searchParams.delete(name);
  const res = NextResponse.redirect(url);
  for (const [name, v] of set) res.cookies.set(name, v, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
