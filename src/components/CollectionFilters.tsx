import Link from "next/link";
import { RARITIES, TYPES, type CollectionFilters as F } from "@/lib/collection/query";

/** Plain GET form: filters live in the URL, so views are linkable and Back works. No JS needed. */
export function CollectionFilters({ f, sets }: { f: F; sets: { code: string; name: string }[] }) {
  const select = "rounded-md border border-line bg-panel px-2 py-1.5 text-sm";
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-48 flex-1 flex-col text-xs text-muted">
        Search
        <input name="q" defaultValue={f.q} placeholder="Name, type or rules text" className={`${select} text-foreground`} />
      </label>
      <label className="flex flex-col text-xs text-muted">
        Colours
        <input
          name="ci"
          defaultValue={f.ci}
          placeholder="e.g. BG"
          maxLength={5}
          className={`${select} w-20 uppercase text-foreground`}
          title="Colour identity letters: W U B R G (C for colourless)"
        />
      </label>
      <label className="flex flex-col text-xs text-muted">
        Match
        <select name="ciMode" defaultValue={f.ciMode} className={select}>
          <option value="within">Fits in these colours</option>
          <option value="exact">Exactly these</option>
          <option value="includes">Includes these</option>
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted">
        Type
        <select name="type" defaultValue={f.type ?? ""} className={select}>
          <option value="">Any</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted">
        Rarity
        <select name="rarity" defaultValue={f.rarity ?? ""} className={select}>
          <option value="">Any</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted">
        Set
        <select name="set" defaultValue={f.set ?? ""} className={`${select} max-w-48`}>
          <option value="">Any</option>
          {sets.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted">
        Sort
        <select name="sort" defaultValue={f.sort} className={select}>
          <option value="name">Name</option>
          <option value="cmc">Mana value</option>
          <option value="price">Value</option>
          <option value="edhrec">EDHREC popularity</option>
          <option value="quantity">Copies</option>
          <option value="added">Recently added</option>
        </select>
      </label>
      <label className="flex items-center gap-1 pb-2 text-sm">
        <input type="checkbox" name="commander" value="1" defaultChecked={f.commander} /> Commanders only
      </label>
      <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">Apply</button>
      <Link href="/collection" className="pb-1.5 text-sm text-muted hover:text-foreground">
        Clear
      </Link>
    </form>
  );
}
