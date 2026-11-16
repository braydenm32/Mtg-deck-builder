import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { Badge, ColorPips } from "@/components/ui";
import { CommanderColourFilter } from "@/components/CommanderColourFilter";
import { colourName } from "@/lib/cards/colours";
import { CommanderThemePicker } from "@/components/CommanderThemePicker";
import { colorsParam, parseColors } from "@/lib/cards/normalize";
import { ChevronIcon, fmt } from "@/components/decks/bits";
import { suggestCommanders, type CommanderSuggestion } from "@/lib/deck/suggest";
import { THEMES, themeLabel } from "@/lib/deck/themes";

export const dynamic = "force-dynamic";

/*
 * Find a commander: pick a theme (kept in the address), and see the commanders you own that fit it,
 * then popular ones on EDHREC you'd need to get. Each row starts a new deck with that commander
 * and theme. The suggestions and their reasons come from suggestCommanders().
 */

export default async function CommanderFinder({ searchParams }: { searchParams: Promise<{ theme?: string; colors?: string }> }) {
  const sp = await searchParams;
  const theme = sp.theme || undefined;
  // Exact colour identity, e.g. ?colors=BR; "C" is colourless.
  const colors = parseColors(sp.colors);
  const cp = colors === undefined ? undefined : colorsParam(colors);
  const result = theme || colors !== undefined ? await suggestCommanders(await getDb(), theme, { colors }) : undefined;
  const label = theme ? themeLabel(theme) : colourName(colors);
  const themes = THEMES.map((t) => ({ slug: t.slug, label: t.label }));
  // A theme from elsewhere (an EDHREC theme slug) still shows as chosen.
  if (theme && !themes.some((t) => t.slug === theme)) themes.unshift({ slug: theme, label });

  return (
    <div className="space-y-5">
      <div className="old-look-only space-y-4">
        <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
          ← Decks
        </Link>
        <h1 className="text-2xl font-semibold">Find a commander</h1>
      </div>

      {/* Once a theme is chosen, a menu switches between themes; before that, the theme chips do. */}
      <div className="max-w-xl">
        <CommanderColourFilter theme={theme} colors={cp} />
      </div>
      {result && (
        <div className="max-w-xl">
          <CommanderThemePicker themes={themes} value={theme} colors={cp} />
        </div>
      )}

      {!result ? (
        <section aria-labelledby="themes" className="space-y-3">
          <h2 id="themes" className="text-lg font-semibold">
            Pick a theme
          </h2>
          <p className="text-sm text-muted">You’ll see the commanders you own that suit it first, then popular ones on EDHREC. Or pick colours above to see commanders in exactly those colours.</p>
          <ul className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/decks/commanders?theme=${encodeURIComponent(t.slug)}${cp ? `&colors=${cp}` : ""}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-4 text-sm hover:border-accent"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          <section aria-labelledby="owned" className="space-y-3">
            <h2 id="owned" className="flex items-baseline gap-2 text-lg font-semibold">
              You own
              {result.owned.length > 0 && <span className="text-sm font-normal text-muted tabular-nums">{fmt(result.owned.length)}</span>}
            </h2>
            {result.owned.length ? (
              <SuggestionList list={result.owned} theme={theme} />
            ) : (
              <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">
                {theme ? `None of your commanders${colors !== undefined ? ` in ${colourName(colors)}` : ""} stand out for ${label} yet.` : `You don’t own a commander in ${label}.`} The popular ones are a place to start.
              </p>
            )}
          </section>

          <section aria-labelledby="popular" className="space-y-3">
            <h2 id="popular" className="flex items-baseline gap-2 text-lg font-semibold">
              Popular on EDHREC
              {result.popular.length > 0 && <span className="text-sm font-normal text-muted tabular-nums">{fmt(result.popular.length)}</span>}
            </h2>
            {result.popular.length ? (
              <>
                <p className="text-sm text-muted">You’d need to buy or proxy the commander. Each says how many of your cards would fit.</p>
                <SuggestionList list={result.popular} theme={theme} />
              </>
            ) : (
              <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">
                No EDHREC suggestions for {label} right now: EDHREC may be out of reach, or has none for this theme. Your own commanders are ranked by how many of
                your cards fit.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Calm rows: the commander, whether you own it, why it fits, and one tap to start the deck. */
function SuggestionList({ list, theme }: { list: CommanderSuggestion[]; theme?: string }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {list.map((s) => (
        <li key={s.oracleId}>
          <Link
            href={`/decks/new?commander=${encodeURIComponent(s.oracleId)}${theme ? `&theme=${encodeURIComponent(theme)}` : ""}`}
            className="flex min-h-[68px] items-center gap-3 px-3 py-2 hover:bg-background"
          >
            <span className="sr-only">Start a deck with </span>
            <span className="relative aspect-[488/680] w-10 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton">
              {s.imageSmall && <Image src={s.imageSmall} alt="" fill sizes="40px" className="object-cover" />}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 font-medium leading-snug">{s.name}</span>
                <ColorPips identity={s.colorIdentity} />
              </span>
              <span className="block text-[13px] leading-snug text-muted">
                <Badge tone={s.owned ? "ok" : "muted"} className="mr-1.5">
                  {s.owned ? "Owned" : "Not owned"}
                </Badge>
                {s.reason}
              </span>
            </span>
            <ChevronIcon />
          </Link>
        </li>
      ))}
    </ul>
  );
}
