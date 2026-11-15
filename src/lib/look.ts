import { cookies } from "next/headers";

/**
 * The new look (direction C and the new menu) ships behind a flag until Brayden has checked it on
 * his phone. `?look=new` or `?look=old` on any page sets it for that device (see src/middleware.ts);
 * COMMANDERY_LOOK=new turns it on by default.
 */
export const LOOK_COOKIE = "look";

export function lookFrom(cookie: string | undefined, env: string | undefined = process.env.COMMANDERY_LOOK): "new" | "old" {
  if (cookie === "new" || cookie === "old") return cookie;
  return env === "new" ? "new" : "old";
}

export async function currentLook(): Promise<"new" | "old"> {
  const jar = await cookies();
  return lookFrom(jar.get(LOOK_COOKIE)?.value);
}
