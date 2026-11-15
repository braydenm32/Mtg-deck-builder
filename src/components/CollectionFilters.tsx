import Link from "next/link";
import { RARITIES, TYPES, type CollectionFilters as F } from "@/lib/collection/query";

/** Plain GET form: filters live in the URL, so views are linkable and Back works. No JS needed. */
export function CollectionFilters({ f, sets }: { f: F; sets: { code: string; name: string }[] }) {
  const field = "h-11 rounded-md border border-line bg-panel px-2 text-sm text-foreground";
  const active = [f.ci, f.type, f.rarity, f.set, f.commander, f.sort !== "name" ? f.sort : undefined].filter(Boolean).length;
  return (
    <form method="get" className="space-y-2">
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Search</span>
          <input name="q" defaultValue={f.q} placeholder="Search name, type or rules text" className={`${field} w-full`} />
        </label>
        <button className="h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg">Search</button>
      </div>
      <details open={active > 0} className="group rounded-md border border-line bg-panel">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-muted">
          Filters and sort{active > 0 && ` (${active} on)`}
        </summary>
        <div className="grid grid-cols-2 gap-2 p-3 pt-0 sm:grid-cols-3 lg:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Colours
            <input name="ci" defaultValue={f.ci} placeholder="e.g. BG" maxLength={5} className={`${field} uppercase`} title="W U B R G, or C for colourless" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Match
            <select name="ciMode" defaultValue={f.ciMode} className={field}>
              <option value="within">Fits these colours</option>
              <option value="exact">Exactly these</option>
              <option value="includes">Includes these</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Type
            <select name="type" defaultValue={f.type ?? ""} className={field}>
              <option value="">Any</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Rarity
            <select name="rarity" defaultValue={f.rarity ?? ""} className={field}>
              <option value="">Any</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Set ({sets.length})
            <select name="set" defaultValue={f.set ?? ""} className={field}>
              <option value="">Any</option>
              {sets.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sort
            <select name="sort" defaultValue={f.sort} className={field}>
              <option value="name">Name</option>
              <option value="cmc">Mana value</option>
              <option value="price">Value</option>
              <option value="edhrec">EDHREC popularity</option>
              <option value="quantity">Copies</option>
              <option value="added">Recently added</option>
            </select>
          </label>
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm sm:col-span-1">
            <input type="checkbox" name="commander" value="1" defaultChecked={f.commander} className="h-5 w-5" /> Commanders only
          </label>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-2">
            <button className="h-11 flex-1 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg sm:flex-none">Apply</button>
            <Link href="/collection" className="inline-flex h-11 items-center px-3 text-sm text-muted hover:text-foreground">
              Clear all
            </Link>
          </div>
        </div>
      </details>
    </form>
  );
}
