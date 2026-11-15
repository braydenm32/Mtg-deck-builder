# Step 1: data sources, CSV formats and stack

_Researched 2026-11-15. Scope: Commander only, single user, personal and non-commercial._

## TL;DR

- **Scryfall** is the card database. It's free for fan apps, has daily bulk files, and also carries an **EDHREC popularity rank** and **functional "oracle tags"** (e.g. `otag:sacrifice-outlet`) for every card. That alone gets us a solid recommender.
- **EDHREC's terms forbid automated requests**, including its unofficial `json.edhrec.com` endpoints. **Archidekt's terms say the same.** Moxfield has no public API. **Decision:** we'll use EDHREC's JSON with caching and a kill switch while Brayden asks EDHREC for permission (see [Decision](#decision-use-edhrec-alongside-scryfall)). We won't use Archidekt or Moxfield.
- **Multiple decks:** when two decks want the same owned card, the app recommends which deck it should go in (see [Sharing cards between decks](#feature-sharing-cards-between-decks)).
- **CSV import** works by sniffing headers and mapping them to one internal shape. Mythic Tools exports a `Scryfall ID` column, so matching is exact.
- **Stack:** TypeScript, Next.js, SQLite through Drizzle, installable as a PWA. A PWA can use the phone camera, so it's ready for a card scanner later.

## 1. Scryfall (card data)

| What | Detail |
|---|---|
| Rate limits | 10 req/s on most endpoints. `/cards/search`, `/cards/named`, `/cards/random` and `/cards/collection` are limited to **2 req/s**. A 429 locks you out for 30 s, and repeat offenders get banned. Files on `*.scryfall.io` have no limit. |
| Headers | Send a descriptive `User-Agent` and `Accept: application/json` on every call. Scryfall's blog says both are required. |
| Caching | Cache responses for at least 24 h. Use the bulk files for bulk lookups, not one call per card. |
| Bulk files | `GET https://api.scryfall.com/bulk-data` lists the current download URLs, which change daily. **Oracle Cards** (~150 MB, one row per card) feeds deckbuilding. **Default Cards** (~460 MB, every printing) feeds collection matching by set, number and language. **Rulings** is ~22 MB. Sizes are as listed on Scryfall's docs page. |
| Freshness | Gameplay data only needs a weekly refresh, or one after each set release. Prices go stale after 24 h. |
| Useful fields | `color_identity`, `legalities.commander`, `edhrec_rank`, `game_changer`, `keywords`, `type_line`, `oracle_text`, `prices`, `image_uris`, `card_faces`. |
| Useful search | `otag:` / `function:` for card roles (ramp, removal, sac outlet…), `id<=` for colour identity, `f:commander`, and `order=edhrec`. |
| Terms | Free for Magic software. Don't paywall the data, don't just re-host it, and don't use Scryfall's logo or imply they endorse us. Images can't be cropped over the artist/copyright line, watermarked, or distorted. Credit Scryfall and the WotC Fan Content Policy. |

**Plan:** a server job downloads Oracle + Default Cards weekly into SQLite, keeping only the columns we use. The live API is only for one-off lookups and tag searches, behind a 2 req/s queue with a cache.

## 2. Recommendation data

| Source | Access | Verdict |
|---|---|---|
| **EDHREC** | No official API. Unofficial JSON lives at `json.edhrec.com/pages/commanders/<slug>.json` and `/pages/cards/<slug>.json`, plus theme pages. Its [terms](https://edhrec.com/terms) (Aug 2024) forbid using "software or automated agents or scripts … to generate automated searches, requests, or queries to the Site", and forbid copying or republishing any part of the site. | ⚠️ Used, with caching and a kill switch. Permission is being sought (see Decision below). `edhrec_rank` also arrives through Scryfall. |
| **Archidekt** | Unofficial deck API (`archidekt.com/api/decks/…`). Its [terms](https://archidekt.com/terms) contain the same "no automated queries" clause and add "no harvesting". | ❌ Same as EDHREC. |
| **Moxfield** | No public API. `api2.moxfield.com` is internal and protected by Cloudflare. I couldn't load its terms page from here. | ❌ Don't scrape it. Its *export formats* are fine to support. |
| **Scryfall tags + rank** | Covered above. | ✅ Primary source |
| **Commander Spellbook** | Open combo database with a public backend API. It's the community standard for "does this deck have a combo". I couldn't read its terms from here, so I'll confirm them before using it. | ✅ Likely (combos) |
| **MTGJSON** | MIT-licensed card data. A backup if Scryfall is ever unavailable. | ✅ Fallback |

### How suggestions would work on open data

1. **Legal pool:** owned cards with colour identity ⊆ the commander's identity, `legal` in Commander, one copy each (basic lands excepted).
2. **Theme:** a theme maps to Scryfall tag and keyword queries. For example, "aristocrats" is `otag:sacrifice-outlet OR otag:death-trigger…`, and "+1/+1 counters" is `otag:counters-matter…`. Commander synergy comes from parsing the commander's own oracle text and tags into the same vocabulary.
3. **Score** = theme match + role need + popularity (`edhrec_rank`) + combo bonus (Spellbook).
4. **Template:** fill a role template (~36 lands, ~10 ramp, ~10 draw, ~8 removal, ~3 wipes, the rest theme) and show the gaps.
5. **Missing cards:** run the same query against *all* cards, not just owned ones, to list the best upgrades with prices.

This is less tailored than EDHREC's per-commander "high synergy" lists, but it's legal, works offline once the bulk data is in, and is all ours to tune.

## Decision: use EDHREC alongside Scryfall

Brayden decided on 2026-11-15 to **build with both Scryfall and EDHREC**, and is asking EDHREC for permission in the meantime. We'll keep the EDHREC adapter polite and easy to switch off:

- **Low volume:** only fetch when you open a commander or theme. Never crawl.
- **Cache hard:** keep each commander or theme page in SQLite for 7 days, and send a descriptive `User-Agent`.
- **Rate limit:** at most 1 request per second, with backoff on errors.
- **Kill switch:** `EDHREC_ENABLED` in config. If it's off, or EDHREC is down or changes its format, suggestions fall back to the open-data scoring above.
- **Personal use only:** nothing from EDHREC is republished or shown publicly.

EDHREC gives each commander and theme page a list of cards with **synergy**, **inclusion %** and the **number of decks** that use it. That's the core signal. Scryfall tags, rank and Commander Spellbook combos fill the gaps for cards EDHREC doesn't list.

## Feature: sharing cards between decks

If you're building more than one deck and own fewer copies of a card than the decks want, the app suggests which deck gets it.

- **Per-deck value** of card *c* in deck *d*: EDHREC synergy and inclusion % for *d*'s commander and theme, plus role need (does *d* still lack ramp or removal?), plus a combo bonus, minus the strength of *d*'s next-best owned replacement. A card that's easy to replace in one deck should go to the deck where it's irreplaceable.
- **Allocation:** each owned copy is assigned across all decks to maximise total value. A greedy pass covers the common case, and an assignment solver (Hungarian) handles conflicts. Basic lands are never contested.
- **UI:** a "Contested cards" panel per card, e.g. *"Sol Ring: Atraxa +0.42 vs Korvold +0.18 → Atraxa"*. It shows the reason, lets you override it, and lists the replacement each losing deck gets. It also shows which upgrades would remove the conflict.
- **Data model:** a deck's cards point at specific owned copies (`collection_item_id`), so the app always knows what's spoken for.

This lives in `recommend/allocate.ts` and uses the same scoring as single-deck suggestions.

## 3. CSV formats

The importer reads the header row, works out which app made the file, and maps the columns to one shape:
`{ scryfallId?, name, setCode?, collectorNumber?, lang, finish (nonfoil|foil|etched), quantity, condition?, location?, flags }`.

Matching order: **Scryfall ID → set + collector number (+ lang) → exact name → fuzzy name**, with a "couldn't match" review screen at the end.

| Source | Key columns (header names) | Notes |
|---|---|---|
| **Mythic Tools** ✅ verified | `Card Name, Set Code, Set Name, Collector Number, Rarity, Language, Quantity, Condition, Finish, Altered, Signed, Misprint, Price (USD), Price (EUR), Price (USD Foil), Price (EUR Foil), Price (USD Etched), Price (EUR Etched), Scryfall ID, Container Type, Container Name` | Exact matches through `Scryfall ID`. Some exports use `English Name` instead of `Card Name`. Non-English names can be printed-language or English, so we match by set, number and language rather than name. `Container Type/Name` (box or binder) becomes a location. Decks are exported separately from the collection. |
| **ManaBox** | `Name, Set code, Set name, Collector number, Foil, Rarity, Quantity, ManaBox ID, Scryfall ID, Purchase price, Misprint, Altered, Condition, Language, Purchase price currency` | Has a Scryfall ID. |
| **Moxfield** | `Count, Tradelist Count, Name, Edition, Condition, Language, Foil, Tags, Last Modified, Collector Number, Alter, Proxy, Purchase Price` | No Scryfall ID. `Edition` is the set code. `Foil` = `foil` / `etched` / blank. |
| **Archidekt** | User-chosen columns, e.g. `Quantity, Name, Finish, Condition, Language, Edition Name, Edition Code, Collector Number, Scryfall ID, Tags, Purchase Price` | Tell users to tick `Scryfall ID` when exporting. |
| **Deckbox** | `Count, Tradelist Count, Name, Edition, Edition Code, Card Number, Condition, Language, Foil, Signed, Artist Proof, Altered Art, Misprint, Promo, Textless, My Price` | `Edition` is the full set name, and some names don't match Scryfall's, so prefer `Edition Code`. |
| **TCGplayer app** | `Quantity, Name, Simple Name, Set, Card Number, Set Code, Printing, Condition, Language, Rarity, Product ID, SKU` | The seller inventory export is a different file (`TCGplayer Id, Product Name, Set Name, Number, Condition, Total Quantity…`). Scryfall has `tcgplayer_id`, so we can match on that. |
| **Delver Lens** | Columns are configurable. MythicHub's guide expects `Name, Edition code, Collector's number, Foil, Quantity, Scryfall ID`. | Tell users to include `Scryfall ID`. |
| **Plain text** | `1 Sol Ring (C21) 263` style lines | Same format as Moxfield/Arena deck lists. Useful for quick pastes. |

Only the Mythic Tools headers were confirmed from a real export, in a [Moxfield feedback post](https://moxfield.nolt.io/2592). The others come from converter docs and known exports. Each one gets a test fixture from a real export before we call it supported. Brayden, if you can drop a real export from any of these, that settles it.

## 4. Stack

| Layer | Pick | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language across the UI, the server and the importers. |
| App | **Next.js** (App Router), deployable as a **PWA** | Server routes handle the bulk-data job, and the same app installs on a phone. |
| DB | **SQLite + Drizzle ORM** (libSQL driver) | Zero setup and a single file. It moves to hosted libSQL (Turso) or Postgres later without a rewrite. We're not using the connected Supabase, which belongs to another project. |
| UI | Tailwind + shadcn/ui | Fast to build, and easy to restyle. |
| Tests | Vitest (importers, deck rules, scoring), Playwright (smoke tests) | Importers and deck rules are where bugs would hide. |
| Hosting | Local `npm run dev` first. Then a small always-on host with a disk, such as Fly.io or Railway. | The phone camera needs HTTPS, so the scanner step needs a deploy, or Tailscale for home use. |

### Code layout (room to grow)

```
src/
  domain/        card, collection, deck types; Commander rules (pure, tested)
  ingest/        importers: csv/<source>.ts, text.ts, later scanner.ts -> CardIdentity[]
  cards/         Scryfall bulk sync, matcher (CardIdentity -> printing)
  recommend/     RecommendationSource interface: edhrec, scryfall-tags, spellbook; allocate.ts
  formats/       commander.ts now; brawl/oathbreaker later, same interface
  export/        Moxfield / Arena / plain text
  app/           Next.js pages and routes
```

### Card scanner later

The camera is just another importer. It produces the same `CardIdentity` the CSV importers do, so matching, the collection and decks don't change.

- In the browser, `getUserMedia` grabs a frame and we crop the card.
- We OCR the **bottom-left collector line** (set code, collector number, language), which gives an exact printing on cards from 2023 onward. We fall back to OCR on the name, and then to image-hash matching against Scryfall art for older cards.
- We can start with Tesseract.js in the browser, and move to an on-device model or a server OCR if accuracy needs it.

## Next (step 2, after approval)

Scaffold the app, run the Scryfall bulk sync, build the Mythic Tools importer plus header sniffing for the others, and add a collection browser with search and filters. I'll need `api.scryfall.com` and `data.scryfall.io` allowed in the cloud environment's network settings, because they're blocked from this session today.
