import { cookies } from "next/headers";

/**
 * The new look (direction C and the new menu) is the default since Brayden checked it on his phone
 * (2026-11-16). `?look=old` or `?look=new` on any page sets it for that device (see src/middleware.ts);
 * COMMANDERY_LOOK=old makes the old look the default again.
 */
export const LOOK_COOKIE = "look";

export function lookFrom(cookie: string | undefined, env: string | undefined = process.env.COMMANDERY_LOOK): "new" | "old" {
  if (cookie === "new" || cookie === "old") return cookie;
  return env === "old" ? "old" : "new";
}

export async function currentLook(): Promise<"new" | "old"> {
  const jar = await cookies();
  return lookFrom(jar.get(LOOK_COOKIE)?.value);
}
