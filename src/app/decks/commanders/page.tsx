import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { Badge, ColorPips, Panel } from "@/components/ui";
import { suggestCommanders, type CommanderSuggestion } from "@/lib/deck/suggest";
import { THEMES, themeLabel } from "@/lib/deck/themes";

export const dynamic = "force-dynamic";

export default async function CommanderFinder({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  const result = theme ? await suggestCommanders(await getDb(), theme) : undefined;
  return (
    <div className="space-y-5">
      <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
        ← Decks
      </Link>
      <h1 className="text-2xl font-semibold">Find a commander</h1>
      <form className="flex gap-2" action="/decks/commanders">
        <select name="theme" defaultValue={theme ?? ""} className="h-11 min-w-0 flex-1 rounded-md border border-line bg-panel px-3" aria-label="Theme">
          <option value="" disabled>
            Pick a theme…
          </option>
          {THEMES.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg">Show</button>
      </form>
      {result && (
        <>
          <section className="space-y-2">
            <h2 className="font-semibold">Commanders you own for {themeLabel(theme)}</h2>
            {result.owned.length ? (
              <SuggestionList list={result.owned} theme={theme!} />
            ) : (
              <Panel className="text-sm text-muted">None of your commanders stand out for this theme yet.</Panel>
            )}
          </section>
          {result.popular.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">Popular on EDHREC (you don’t own)</h2>
              <p className="text-sm text-muted">You’d need to buy or proxy the commander. The count shows how many of your cards would fit.</p>
              <SuggestionList list={result.popular} theme={theme!} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SuggestionList({ list, theme }: { list: CommanderSuggestion[]; theme: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {list.map((s) => (
        <li key={s.oracleId} className="flex min-w-0 gap-3 rounded-lg border border-line bg-panel p-3">
          <div className="relative aspect-[488/680] w-16 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton">
            {s.imageSmall && <Image src={s.imageSmall} alt="" fill sizes="64px" className="object-cover" />}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="min-w-0">{s.name}</span>
              <ColorPips identity={s.colorIdentity} />
              {!s.owned && <Badge tone="danger">Not owned</Badge>}
            </p>
            <p className="text-xs text-muted">{s.reason}</p>
            <Link
              href={`/decks/new?commander=${s.oracleId}&theme=${encodeURIComponent(theme)}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
            >
              Build this →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
