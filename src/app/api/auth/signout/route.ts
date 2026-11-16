import { NextResponse } from "next/server";
import { publicUrl, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/auth/signout: lock this device again (Settings › Sign out on this device). */
export async function POST(req: Request) {
  const res = NextResponse.redirect(publicUrl(req, "/unlock"), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
