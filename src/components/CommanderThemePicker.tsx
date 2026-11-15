"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * The theme menu on Find a commander. Choosing a theme goes straight to its address
 * (/decks/commanders?theme=…), so Back steps through the themes you looked at. Without
 * JavaScript, the Show button submits the same address.
 */
export function CommanderThemePicker({ themes, value }: { themes: { slug: string; label: string }[]; value?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form action="/decks/commanders" className="flex items-center gap-2" aria-busy={pending}>
      <label className="sr-only" htmlFor="theme-picker">
        Theme
      </label>
      <select
        id="theme-picker"
        name="theme"
        defaultValue={value ?? ""}
        key={value ?? ""}
        onChange={(e) => e.target.value && start(() => router.push(`/decks/commanders?theme=${encodeURIComponent(e.target.value)}`))}
        className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 text-base"
      >
        <option value="" disabled>
          Pick a theme…
        </option>
        {themes.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.label}
          </option>
        ))}
      </select>
      <noscript>
        <button className="inline-flex min-h-12 items-center rounded-xl border border-line px-4 text-sm">Show</button>
      </noscript>
      {pending && <span className="text-sm text-muted">Looking…</span>}
    </form>
  );
}
