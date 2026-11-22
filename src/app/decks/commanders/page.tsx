import Link from "next/link";
import { getDb } from "@/db/client";
import { CommanderColourFilter } from "@/components/CommanderColourFilter";
import { colourName } from "@/lib/cards/colours";
import { CommanderThemePicker } from "@/components/CommanderThemePicker";
import { colorsParam, parseColors } from "@/lib/cards/normalize";
import { ChevronIcon, fmt } from "@/components/decks/bits";
import { CommanderSuggestions } from "@/components/decks/CommanderSuggestions";
import { suggestCommanders } from "@/lib/deck/suggest";
import { MAX_THEMES, THEMES, joinThemes, themeLabel, themeParts } from "@/lib/deck/themes";
import { THEME_CATALOG, catalogTheme, popularThemes, popularTypes, resolveTheme, type ThemeEntry } from "@/lib/deck/theme-catalog";

export const dynamic = "force-dynamic";

/*
 * Find a commander: pick a theme, or mix up to three (?theme=tokens+angels), and see the commanders you own that fit it,
 * then popular ones on EDHREC you'd need to get. Any of EDHREC's themes or any creature type can be
 * typed or picked. Tapping a commander shows its picture and rules text; its arrow starts a new
 * deck with that commander and theme. The suggestions and their reasons come from suggestCommanders().
 */

/** Chips shown before a theme is picked: EDHREC's most played themes and creature types. */
const CHIPS = 18;
const EDHREC_COUNT = THEME_CATALOG.filter((t) => t.decks > 0).length;

/** A slug from a link, or what someone typed without JavaScript ("angel tribal" -> angels). */
const asTheme = (raw: string) => (catalogTheme(raw) || THEMES.some((t) => t.slug === raw) ? raw : resolveTheme(raw));

export default async function CommanderFinder({ searchParams }: { searchParams: Promise<{ theme?: string; colors?: string; with?: string }> }) {
  const sp = await searchParams;
  // `with` is the mix the search added to when the form was sent without JavaScript.
  const raws = [...themeParts(sp.with), ...themeParts(sp.theme)];
  const theme = joinThemes(raws.map(asTheme).filter((t): t is string => !!t));
  const chosen = themeParts(theme);
  // Exact colour identity, e.g. ?colors=BR; "C" is colourless.
  const colors = parseColors(sp.colors);
  const cp = colors === undefined ? undefined : colorsParam(colors);
  const result = theme || colors !== undefined ? await suggestCommanders(await getDb(), theme, { colors }) : undefined;
  const label = theme ? themeLabel(theme) : colourName(colors);
  const themeHref = (slug: string | undefined) => (slug ? `/decks/commanders?theme=${encodeURIComponent(slug)}${cp ? `&colors=${cp}` : ""}` : `/decks/commanders${cp ? `?colors=${cp}` : ""}`);
  // Quick picks to mix in once a theme is chosen: the most played themes and creature types not already in.
  const mixIn = chosen.length && chosen.length < MAX_THEMES ? [...popularThemes(8), ...popularTypes(8)].filter((t) => !chosen.includes(t.slug)).slice(0, 8) : [];

  return (
    <div className="space-y-5">
      {/* Once a theme is chosen, the search sits here to switch themes; before that, it leads the theme chips. */}
      <div className="max-w-xl">
        <CommanderColourFilter theme={theme} colors={cp} />
      </div>
      {result && (
        <div className="max-w-xl space-y-3">
          {chosen.length > 0 && (
            <div className="space-y-2" role="group" aria-labelledby="chosen-themes">
              <h2 id="chosen-themes" className="text-sm font-medium text-muted">
                {chosen.length > 1 ? "Commanders for all of these" : "Theme"}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {chosen.map((t) => (
                  <li key={t}>
                    <Link
                      href={themeHref(joinThemes(chosen.filter((x) => x !== t)))}
                      aria-label={`Remove ${themeLabel(t)}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-accent bg-panel px-4 text-sm font-medium"
                    >
                      {themeLabel(t)} <span aria-hidden className="ml-1.5 text-muted">×</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {chosen.length < MAX_THEMES ? (
            <CommanderThemePicker key={theme ?? ""} value={theme} colors={cp} />
          ) : (
            <p className="text-sm text-muted">That&rsquo;s three, the most a mix can have. Remove one to add another.</p>
          )}
          {mixIn.length > 0 && (
            <div className="space-y-2" role="group" aria-labelledby="mix-in">
              <h3 id="mix-in" className="text-sm font-medium text-muted">
                Mix in another
              </h3>
              <ul className="flex flex-wrap gap-2">
                {mixIn.map((t) => (
                  <li key={t.slug}>
                    <Link href={themeHref(joinThemes([...chosen, t.slug]))} className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-4 text-sm hover:border-accent">
                      + {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result ? (
        <section aria-labelledby="themes" className="space-y-4">
          <div className="space-y-3">
            <h2 id="themes" className="text-lg font-semibold">
              Pick a theme
            </h2>
            <p className="text-sm text-muted">
              You’ll see the commanders you own that suit it first, then popular ones on EDHREC. Then mix in up to two more, like Tokens and Angels. Or pick colours above to see commanders in exactly those colours.
            </p>
            <div className="max-w-xl">
              <CommanderThemePicker colors={cp} />
            </div>
          </div>
          <ThemeChips title="Popular themes" id="popular-themes" themes={popularThemes(CHIPS)} href={themeHref} />
          <ThemeChips title="Creature types" id="creature-types" themes={popularTypes(CHIPS)} href={themeHref} />
          <details className="group space-y-3">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm text-muted hover:text-foreground">
              All {fmt(EDHREC_COUNT)} EDHREC themes, A to Z
              <ChevronIcon className="rotate-90 group-open:-rotate-90" />
            </summary>
            <AllThemes href={themeHref} />
          </details>
        </section>
      ) : (
        <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          <section aria-labelledby="owned" className="space-y-3">
            <h2 id="owned" className="flex items-baseline gap-2 text-lg font-semibold">
              You own
              {result.owned.length > 0 && <span className="text-sm font-normal text-muted tabular-nums">{fmt(result.owned.length)}</span>}
            </h2>
            {result.owned.length ? (
              <CommanderSuggestions list={result.owned} theme={theme} />
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
                <p className="text-sm text-muted">
                  You’d need to buy or proxy the commander. Each says how many of your cards would fit{chosen.length > 1 ? ", and ones that suit every theme come first" : ""}.
                </p>
                <CommanderSuggestions list={result.popular} theme={theme} />
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

function ThemeChips({ title, id, themes, href }: { title: string; id: string; themes: ThemeEntry[]; href: (slug: string) => string }) {
  return (
    <div className="space-y-2" role="group" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-medium text-muted">
        {title}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {themes.map((t) => (
          <li key={t.slug}>
            <Link href={href(t.slug)} className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-4 text-sm hover:border-accent">
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** EDHREC's themes (typal ones too), A to Z under each letter: plain links, so it's light on a phone. Rarer creature types are a search away. */
function AllThemes({ href }: { href: (slug: string) => string }) {
  const sorted = THEME_CATALOG.filter((t) => t.decks > 0).sort((a, b) => a.label.localeCompare(b.label));
  const groups = new Map<string, ThemeEntry[]>();
  for (const t of sorted) {
    const letter = /^[a-z]/i.test(t.label) ? t.label[0].toUpperCase() : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), t]);
  }
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      {[...groups].map(([letter, list]) => (
        <div key={letter} className="space-y-1">
          <h3 className="text-xs font-semibold text-muted">{letter}</h3>
          <p className="text-sm leading-8">
            {list.map((t, i) => (
              <span key={t.slug}>
                <Link href={href(t.slug)} className="underline-offset-4 hover:text-accent hover:underline">
                  {t.label}
                </Link>
                {i < list.length - 1 && <span className="text-muted"> · </span>}
              </span>
            ))}
          </p>
        </div>
      ))}
    </div>
  );
}
