"use client";

/**
 * A row of large choices (finish, condition), the same control Type a name uses: real radio inputs,
 * so arrow keys and screen readers work, with 44 px targets.
 */
export function Segmented({
  name,
  labelledBy,
  value,
  options,
  onChange,
}: {
  name: string;
  labelledBy: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-1 rounded-lg border border-line bg-background p-1">
      {options.map((o) => (
        <label key={o.value} className="min-w-0 flex-1">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
          <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 text-sm text-muted peer-checked:bg-panel peer-checked:font-semibold peer-checked:text-foreground peer-checked:shadow-sm peer-checked:ring-1 peer-checked:ring-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
