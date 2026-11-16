"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; help: string; swatch: [string, string, string] }[] = [
  { value: "commandery", label: "Commandery", help: "Night violet with the purple-to-pink gradient.", swatch: ["#0f0c1b", "#7c3aed", "#db2777"] },
  { value: "kitchen", label: "Kitchen Table", help: "Rose paper and plum ink, like cards on the table.", swatch: ["#f8f0ef", "#9b3a74", "#b84874"] },
  { value: "auto", label: "Match my phone", help: "Kitchen Table in light mode, Commandery in dark mode.", swatch: ["#f8f0ef", "#0f0c1b", "#9b3a74"] },
];

/**
 * The colour theme for this device (src/lib/theme.ts). It's a cookie rather than a saved setting,
 * so a phone in light mode and a laptop in dark mode can differ. The change shows straight away.
 */
export function ThemeChoice({ initial }: { initial: Theme }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initial);
  const [status, setStatus] = useState<string>();

  function choose(t: Theme) {
    setTheme(t);
    document.cookie = `theme=${t}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.dataset.theme = t;
    setStatus(`Saved. ${OPTIONS.find((o) => o.value === t)!.label} on this device.`);
    // Re-render the layout so the browser bar colour follows.
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <fieldset className="overflow-hidden rounded-2xl border border-line bg-panel">
        <legend className="sr-only">Theme</legend>
        <p className="px-4 pt-4 text-[13px] font-medium text-muted" aria-hidden>
          Theme
        </p>
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
            <input type="radio" name="theme" className="h-5 w-5 shrink-0 accent-(--accent)" checked={theme === o.value} onChange={() => choose(o.value)} />
            <span aria-hidden className="flex h-8 w-12 shrink-0 overflow-hidden rounded-lg border border-line">
              <span className="w-1/2" style={{ background: o.swatch[0] }} />
              <span className="w-1/2" style={{ background: `linear-gradient(135deg, ${o.swatch[1]}, ${o.swatch[2]})` }} />
            </span>
            <span className="min-w-0">
              <span className="block">{o.label}</span>
              <span className="block text-[13px] text-muted">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="min-h-5 px-1 text-[13px] text-muted" role="status">
        {status ?? "Only this device changes."}
      </p>
    </div>
  );
}
