import { cookies } from "next/headers";

/**
 * The new look's colour theme, chosen per device in Settings (cookie "theme"; `?theme=` on any page
 * sets it too, see src/middleware.ts).
 * - "commandery": direction C, night violet with the purple-to-pink gradient. The default.
 * - "kitchen": Kitchen Table, direction D from the Phase 2 mockups: rose paper, plum ink, Nunito.
 * - "auto": Kitchen Table when the phone or computer is in light mode, Commandery when it's dark.
 * The palettes are in src/app/globals.css. The old look ignores this.
 */
export const THEME_COOKIE = "theme";
export const THEMES = ["commandery", "kitchen", "auto"] as const;
export type Theme = (typeof THEMES)[number];

export function themeFrom(cookie: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(cookie ?? "") ? (cookie as Theme) : "commandery";
}

export async function currentTheme(): Promise<Theme> {
  const jar = await cookies();
  return themeFrom(jar.get(THEME_COOKIE)?.value);
}

/** The browser bar colour for each palette (the top bar's background). */
export const THEME_COLOR = { commandery: "#0f0c1b", kitchen: "#f8f0ef" } as const;
