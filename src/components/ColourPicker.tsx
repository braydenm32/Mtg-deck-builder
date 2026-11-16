"use client";

import { colourName } from "@/lib/cards/colours";

/**
 * Pick a deck's colours: five mana colours plus colourless, as toggle chips. The value is a WUBRG
 * identity ("BR"), "" for colourless, or undefined for any colours. Colourless can't be combined
 * with a colour, so choosing one clears the other.
 */
const COLOURS = [
  { c: "W", name: "White", dot: "#f8f6d8" },
  { c: "U", name: "Blue", dot: "#c1d7e9" },
  { c: "B", name: "Black", dot: "#bab1ab" },
  { c: "R", name: "Red", dot: "#e49977" },
  { c: "G", name: "Green", dot: "#a3c095" },
] as const;

export function ColourPicker({ value, onChange, label = "Colours" }: { value: string | undefined; onChange: (v: string | undefined) => void; label?: string }) {
  const toggle = (c: string) => {
    const set = new Set(value ?? "");
    if (set.has(c)) set.delete(c);
    else set.add(c);
    const next = COLOURS.map((x) => x.c).filter((x) => set.has(x)).join("");
    onChange(next ? next : undefined);
  };
  const chip = (on: boolean) =>
    `inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-accent bg-panel font-medium" : "border-line"}`;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {label} <span className="font-normal text-muted">· {colourName(value)}</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {COLOURS.map((x) => {
          const on = !!value && value.includes(x.c);
          return (
            <button key={x.c} type="button" aria-pressed={on} className={chip(on)} onClick={() => toggle(x.c)} title={x.name}>
              <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: x.dot }} aria-hidden />
              <span>{x.c}</span>
              <span className="sr-only">{x.name}</span>
            </button>
          );
        })}
        <button type="button" aria-pressed={value === ""} className={chip(value === "")} onClick={() => onChange(value === "" ? undefined : "")} title="Colourless">
          C<span className="sr-only">olourless</span>
        </button>
        {value !== undefined && (
          <button type="button" className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline-offset-2 hover:underline" onClick={() => onChange(undefined)}>
            Any
          </button>
        )}
      </div>
    </fieldset>
  );
}
