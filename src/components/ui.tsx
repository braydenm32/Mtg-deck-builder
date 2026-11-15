import type { ComponentProps } from "react";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    secondary: "border border-line bg-panel hover:bg-background",
    danger: "bg-danger text-accent-fg hover:opacity-90",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-lg border border-line bg-panel p-4 ${className}`} {...props} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-skeleton ${className}`} />;
}

const PIP: Record<string, string> = { W: "#f8f6d8", U: "#c1d7e9", B: "#bab1ab", R: "#e49977", G: "#a3c095" };

/** Colour identity as small mana-coloured dots. Colours are the five mana colours, not theme tokens. */
export function ColorPips({ identity }: { identity: string }) {
  if (!identity) return <span className="text-xs text-muted">Colourless</span>;
  return (
    <span className="inline-flex gap-0.5" aria-label={`Colour identity ${identity}`}>
      {identity.split("").map((c) => (
        <span key={c} className="h-3 w-3 rounded-full border border-black/20" style={{ background: PIP[c] }} title={c} />
      ))}
    </span>
  );
}

/** Every price goes through this; see lib/money.ts. Returns null when prices are hidden. */
export { formatMoney as money } from "@/lib/money";

const TONES = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  accent: "border border-accent text-accent",
  muted: "border border-line text-muted",
};

export function Badge({ tone = "muted", className = "", ...props }: ComponentProps<"span"> & { tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`} {...props} />;
}

/** A thin progress bar, e.g. cards placed out of 100. */
export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-skeleton">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Mana cost like "{2}{B}{R}" as compact text, e.g. "2BR". */
export function ManaCost({ cost }: { cost: string | null | undefined }) {
  if (!cost) return null;
  const text = cost.replace(/\{([^}]+)\}/g, (_, s: string) => s.replace("/", "")).replace(/ \/\/ /g, " / ");
  return <span className="font-mono text-xs text-muted" aria-label={`Mana cost ${cost}`}>{text}</span>;
}
