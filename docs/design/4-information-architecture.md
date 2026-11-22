# 4 · Information architecture

Phase 3 of the redesign. Brayden chose direction **C, "Bold product"** (dark violet, a purple-to-pink gradient, Sora numbers). The menu below is the same in every direction. It's the one from the Phase 2 mockups, adjusted to the brief's rules.

Everything here comes from `1-usage-audit.md` §4 ("What the data decides"). Where this plan differs from it, the reason is given.

## 1. Four areas, in the order you move through them

The brief's flow is **scan or import → plan → build**. The areas follow that flow, plus a home that tells you what needs doing.

| Area | What it's for | Landing page | Phone | Laptop |
|---|---|---|---|---|
| **Today** | "What needs me?" Cards waiting for a home, cards two decks want, decks one step from done. Most visits, least time. | `/` | Bottom bar | Sidebar |
| **Add cards** | Every way cards come in: scan, type a name, import a file. | `/scan` on a phone, `/collection/add` on a laptop | The raised button in the middle of the bottom bar | The gradient button at the bottom of the sidebar |
| **Collection** | "Do I own it, where is it, is a copy free?" The most-used working screen. | `/collection` | Bottom bar | Sidebar |
| **Decks** | Plan and build: your decks, the cards they share, finding a commander. | `/decks` | Bottom bar | Sidebar |

**Settings** (`/settings`, prices on or off and US$ or A$) has no area of its own. It's used about four times a month, mostly for scan defaults that belong on the Scan screen anyway. It lives under Collection's **More** tab, it's on the settings button in Today's top bar, and ⌘K finds it.

**Why "Add cards" is an area and not just a button.** The audit said Scan shouldn't be a tab. It still needs a place in the menu, because Type a name and Import a file need a home too. As an area, its button keeps the thumb-reach spot from the mockups, and its three pages get one row of tabs.

## 2. The top bar becomes the area's tabs

Clicking an area puts that area's tabs in the top bar. The page's own header moves into the top bar too, so there's no second title on the page.

| Area | Tabs | More (themed sheet) |
|---|---|---|
| Today | (none) | |
| Add cards | **Scan** · **Type a name** · **Import a file** | |
| Collection | **Cards** | **More**: Settings |
| Decks | **My decks** · **Shared cards** · **Find a commander** | **More**: Import a decklist |
| Inside a deck | **Overview** · **Cards** · **Missing** · **Upgrades** | **More**: Playtest |

- **Inside a deck** the top bar switches to that deck's tabs, with "← Decks" to go back. Only Overview carries the deck's summary strip (commander, progress, status, next step). The other tabs open straight on their own content (CALM 6).
- **New deck** is the main button on My decks and on Today. It isn't also a tab, so there's never a duplicate control.
- **More** opens a small sheet titled after its area ("More in Decks"). Nothing under More disappears: it's in the route map, and ⌘K finds it.
- Counts on tabs (Missing 24, Upgrades 9) stay, because they tell you there's something to do. There's no other count on the tab bar.

## 3. Phone and laptop

| | Phone (under 900 px) | Laptop (900 px and up) |
|---|---|---|
| Areas | Bottom bar: Today · Collection · **Add** (raised, gradient) · Decks | Sidebar: logo, search, the four areas, then **Add cards** at the bottom |
| Tabs | Top bar, under the title, scrolls sideways if needed | Top bar, beside the title |
| Search | Magnifier in the top bar opens ⌘K full-screen | Search box in the sidebar, or ⌘K / Ctrl+K anywhere |
| Back | "← Decks" in the top bar on child pages, plus the phone's own Back | Same |

The bottom bar respects the phone's safe areas, so nothing sits under the home indicator. Tap targets are 44 px or more.

## 4. One config file drives the menu

`src/lib/nav.ts` is the only place the menu is defined. The sidebar, the bottom bar, the top-bar tabs, the More sheets and the ⌘K page list all read from it. The old `NAV` list is kept, built from the same config, so nothing that imports it breaks.

Each entry has a label, a route, an area, and either a tab, a place under More, or a parent page. Search keywords are optional ("csv" finds Import a file).

## 5. Route map

Every page has exactly one home. A test (`tests/nav.test.ts`) fails if:

1. a `page.tsx` under `src/app` has no entry here (an orphaned route),
2. an entry points at a page that doesn't exist (a dead link),
3. a tab or More item sits in an area that doesn't exist, or a parent page isn't in the map,
4. ⌘K can't find a page that isn't a child page.

| Route | Area | Where it sits | Was reached from |
|---|---|---|---|
| `/` | Today | Landing | Logo |
| `/collection/add` | Add cards | Tab: Type a name | Header "Add cards" |
| `/import` | Add cards | Tab: Import a file | Header "Import" |
| `/import/[id]` | Add cards | Child of Import a file | After an import |
| `/collection` | Collection | Tab: Cards | Header "Collection" |
| `/collection/[oracleId]` | Collection | Child of Cards | A card row |
| `/decks` | Decks | Tab: My decks | Header "Decks" |
| `/decks/new` | Decks | Child of My decks (its main button) | "Build a deck" |
| `/decks/shared` | Decks | Tab: Shared cards | Home, decks list |
| `/decks/commanders` | Decks | Tab: Find a commander | New deck |
| `/decks/import` | Decks | More: Import a decklist | Decks list |
| `/decks/[id]` | Decks | Deck tab: Overview | A deck tile |
| `/decks/[id]/cards` | Decks | Deck tab: Cards | Deck tabs |
| `/decks/[id]/missing` | Decks | Deck tab: Missing | Deck tabs |
| `/decks/[id]/suggestions` | Decks | Deck tab: Upgrades | Deck tabs |
| `/decks/[id]/playtest` | Decks | Deck More: Playtest | Deck tabs |
| `/settings` | Collection | More: Settings, and the settings button on Today | Header "Settings" |
| `/scan` | Add cards | Tab: Scan, and the phone's Add button | Header "Scan" |

No URL changes. Every old link still works, and other threads can keep linking to the same paths.

## 6. Search (⌘K)

Before this, search could find seven pages from the header, and owned cards by name, rules text or type on the Collection page. ⌘K finds all of that and more:

- **Pages**: every entry in the config that isn't a child page, by label or keyword.
- **Actions**: New deck, Scan cards, and exporting or backing up your collection.
- **Your decks**: by deck name or commander.
- **Your cards**: owned cards by name, straight to the card page. The answer the audit asked for (owned · in decks · free) is on the card page one tap later.
- **Search the collection for …**: the last result runs the Collection page's own search, so names, rules text and types all still work.

It opens with ⌘K or Ctrl+K, with the search box in the sidebar, or with the magnifier on the phone. Esc closes it, and arrow keys and Enter pick a result.

## 7. State lives in the URL

Tabs are routes, so Back works. Filters, search and sort on Collection, Cards and Find a commander stay in the query string, as they do today. The ⌘K query isn't saved, because it's a one-off.

## 8. How the new look shipped

- **Behind a flag (15 Nov 2026).** The new shell and the C theme first showed only with `?look=new`, which the app remembered on that device. The theme is scoped with `body:has(.app-shell)`.
- **The default (16 Nov 2026).** Brayden checked the new look on his phone and made it the default, with `?look=old` kept for a week as a fallback.
- **The old look removed (23 Nov 2026).** Nothing came up in that week, so the old look is gone: the `?look` switch and its cookie, `COMMANDERY_LOOK`, the old header, and every page's old layout. Every page now has one layout, inside the shell. A shared deck (`/s/…`) is the one page without the shell, so it keeps the plain palette at the top of `globals.css`.
- **Two themes (16 Nov 2026).** Settings › Theme picks, per device: **Commandery** (direction C, the default), **Kitchen Table** (direction D from the Phase 2 mockups: rose paper, plum ink, Nunito) or **Match my phone** (Kitchen Table in light mode, Commandery in dark mode). It's a `theme` cookie, and `?theme=kitchen|commandery|auto` sets it too. Both palettes are tokens in `src/app/globals.css`, so pages never name a colour.
- **Name (16 Nov 2026).** Brayden renamed the app **MTG Deck Tutor** (it was Commandery). The home-screen label is "Deck Tutor", because longer names get cut off under the icon. The mark stays: three cards, with the one you went looking for raised in the middle. The dark theme keeps the name Commandery.

## 9. Phase 4 page checklist

Phase 4 rebuilds each page to the CALM and IN-APP checklists. Builders work one area each, at most three at a time.

| Area | Pages |
|---|---|
| Shell (this PR) | App shell, theme, ⌘K, route map |
| Today | `/` |
| Add cards | `/scan`, `/collection/add`, `/import`, `/import/[id]` |
| Collection | `/collection`, `/collection/[oracleId]`, `/settings` |
| Decks | `/decks`, `/decks/new`, `/decks/shared`, `/decks/commanders`, `/decks/import` |
| Inside a deck | `/decks/[id]`, `/cards`, `/missing`, `/suggestions`, `/playtest` |

**18 of 18 pages done:** Today (`/`, PR #21); Collection, the card page and Settings (PR #22); the five deck tabs (PR #24); Type a name, Import a file and Import review (PR #25); My decks, New deck, Shared cards, Find a commander and Import a decklist (PR #26); and Scan (PR #27). Next: Brayden checks the new look on his phone, then the default flips to new. A page counts as done when it passes both checklists at 390 px and 1280 px, with the new look on.
