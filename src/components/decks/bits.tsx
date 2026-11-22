/*
 * Small pieces the Decks pages share (My decks, New deck, Shared cards, Find a commander, Import a
 * decklist). They match Today's chips, rows and secondary buttons, so the areas read as one app.
 */

export type ChipTone = "warn" | "accent" | "ok" | "plain";

const CHIP_TONES: Record<ChipTone, string> = {
  warn: "bg-warn-bg text-warn",
  accent: "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-accent",
  ok: "bg-ok-bg text-ok",
  plain: "border border-line text-foreground",
};

/** A status chip: the count (or a mark) that says at a glance what kind of thing needs you. */
export function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex h-8 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular-nums ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Every button that isn't the screen's one main (gradient) button. */
export const SECONDARY =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50";

/** The screen's one main button. Inside the shell, `bg-accent` becomes the gradient. */
export const PRIMARY =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const fmt = (n: number) => n.toLocaleString("en-AU");

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "A, B and C". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "A, B and 4 more", naming the first two of `total`. */
export function someNames(names: string[], total: number): string {
  const shown = names.slice(0, 2);
  const more = total - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : joinAnd(shown);
}

/** EDHREC synergy in percentage points, as R15 shows it: "+44", "−6". Null when EDHREC has no data. */
export function synergyPoints(n: number | null): string | null {
  if (n === null) return null;
  const v = Math.round(n * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
}

export function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-muted ${className}`}
    >
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </svg>
  );
}

/** A check mark. Pass a label when it stands alone; leave it out when text beside it says the same. */
export function CheckIcon({ label }: { label?: string }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" {...a11y}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
