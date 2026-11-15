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

export const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
