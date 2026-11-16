"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { colorsParam } from "@/lib/cards/normalize";
import { ColourPicker } from "./ColourPicker";

/** The colour chips on Find a commander. Each change goes to its address, so Back steps through them. */
export function CommanderColourFilter({ theme, colors }: { theme?: string; colors?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Shown straight away, so quick taps build on each other before the page catches up.
  const [value, setValue] = useState(colors === "C" ? "" : colors);
  useEffect(() => setValue(colors === "C" ? "" : colors), [colors]);
  return (
    <div aria-busy={pending} className="space-y-1">
      <ColourPicker
        label="Deck colours"
        value={value}
        onChange={(v) => {
          setValue(v);
          const q = new URLSearchParams();
          if (theme) q.set("theme", theme);
          if (v !== undefined) q.set("colors", colorsParam(v));
          const s = q.toString();
          start(() => router.push(s ? `/decks/commanders?${s}` : "/decks/commanders"));
        }}
      />
      {pending && <p className="text-sm text-muted">Looking…</p>}
    </div>
  );
}
