"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icons";
import { fmt } from "@/components/decks/bits";
import { resolveTheme, searchThemes, type ThemeEntry } from "@/lib/deck/theme-catalog";
import { joinThemes, themeParts } from "@/lib/deck/themes";

/**
 * The theme search on Find a commander. Type any theme or creature type ("angels", "dragon tribal",
 * "slivers") and pick it from the list, or press Enter to look for what you typed. Choosing one goes
 * straight to its address (/decks/commanders?theme=…), so Back steps through the themes you looked
 * at. Without JavaScript, the form sends the text and the page works out the theme.
 *
 * With themes already chosen (`value`, e.g. "tokens+angels"), it adds the one you pick to them, up
 * to three, for commanders that suit the mix.
 */
export function CommanderThemePicker({ value, label, colors }: { value?: string; label?: string; colors?: string }) {
  const chosen = useMemo(() => themeParts(value), [value]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(label ?? "");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const needle = text.trim();
  const hits = useMemo(() => (open && needle ? searchThemes(needle, 8 + chosen.length).filter((h) => !chosen.includes(h.slug)).slice(0, 8) : []), [needle, open, chosen]);
  // What Enter does with no row picked: the theme the text means (a creature type, a name, or the text itself).
  const typed = needle ? resolveTheme(needle) : undefined;
  const options: (ThemeEntry | { slug: string; label: string; free: true })[] = [...hits];
  if (open && typed && !chosen.includes(typed) && !hits.some((h) => h.slug === typed)) options.push({ slug: typed, label: needle, free: true });

  const go = (slug: string, shown: string) => {
    setOpen(false);
    // Adding to a mix clears the field for the next one; a lone theme stays shown.
    setText(chosen.length ? "" : shown);
    const next = joinThemes([...chosen, slug]) ?? slug;
    if (next === value) return;
    start(() => router.push(`/decks/commanders?theme=${encodeURIComponent(next)}${colors ? `&colors=${encodeURIComponent(colors)}` : ""}`));
  };

  return (
    <form
      action="/decks/commanders"
      role="search"
      aria-busy={pending}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const pick = options[active] ?? options[0];
        if (pick) go(pick.slug, pick.label);
      }}
    >
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-muted">
          <Icon name="search" />
        </span>
        <label htmlFor={`${listId}-q`} className="sr-only">
          Theme or creature type
        </label>
        <input
          id={`${listId}-q`}
          name="theme"
          type="search"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length ? `${listId}-${active}` : undefined}
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={chosen.length ? "Add a theme or creature type, like Vampires" : "Theme or creature type, like Angels"}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && options.length) {
              e.preventDefault();
              setActive((a) => (a + 1) % options.length);
            } else if (e.key === "ArrowUp" && options.length) {
              e.preventDefault();
              setActive((a) => (a - 1 + options.length) % options.length);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          className="h-12 w-full rounded-xl border border-line bg-panel pl-11 pr-3 text-base text-foreground placeholder:text-muted"
        />
      </div>
      {colors && <input type="hidden" name="colors" value={colors} />}
      {value && <input type="hidden" name="with" value={value} />}
      {options.length > 0 && (
        // Taps on the list don't take focus from the field, so the keyboard stays up.
        <ul id={listId} role="listbox" aria-label="Themes" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel" onPointerDown={(e) => e.preventDefault()}>
          {options.map((o, i) => (
            <li
              key={o.slug + ("free" in o ? ":free" : "")}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 text-sm ${i === active ? "bg-background" : ""} hover:bg-background`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(o.slug, o.label)}
            >
              {"free" in o ? (
                <span className="min-w-0 flex-1 truncate">
                  Look for <span className="font-medium">“{o.label}”</span>
                </span>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                  {o.type && <span className="shrink-0 text-xs text-muted">Creature type</span>}
                  {o.decks > 0 && <span className="shrink-0 text-xs text-muted tabular-nums">{fmt(o.decks)} decks</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending && <p className="text-sm text-muted">Looking…</p>}
    </form>
  );
}
