# Speed, and keeping data on the device

Brayden asked (2026-11-16) whether the hosted app could load faster by keeping things on the device and only asking other sites when it needs to, which would also allow deckbuilding offline. Yes: this is done in stages, each one merged on its own.

1. **Make the server answer quickly** (done): fewer database round trips, and no page waits on EDHREC, Commander Spellbook or the exchange rate when it already has an answer.
2. **Keep the app, card images and the pages you've opened on the device** (done): a service worker, so it opens straight away and pages you've seen still open offline.
3. **Keep your collection, decks and card data on the device** (SQLite in the browser, synced with the server), so pages draw from the device and decks can be built offline, with changes sent when you're back online.

## Where the time goes on the hosted app

Every tap goes from Australia to Vercel's Tokyo region (about 120 ms there and back), the page asks the database (Turso, also Tokyo) once per query, and some pages also asked another site before answering. When the app has been idle, Vercel also has to start it (a cold start).

`npm run bench:pages` times every page against a copy of `data/mtg.db` holding a seeded collection (6,000 cards, 8,000 copies) and 8 decks, with 8 ms added to each database round trip to stand in for Turso. Numbers are a laptop's, without the trip to Tokyo or a cold start, so the hosted app is slower in absolute terms; the differences are what matter.

| Page (a tapped link) | Before | After | Round trips before → after | Rows read in full before → after |
|---|---|---|---|---|
| Today | 722 ms | 193 ms | 73 → 22 | 39,018 → 33,006 |
| Decks | 616 ms | 118 ms | 61 → 10 | 9,018 → 3,006 |
| Collection | 427 ms | 187 ms | 10 → 10 | 129,965 → 25,002 |
| Commanders by theme | 258 ms | 160 ms | 4 → 3 | 45,295 → 6,000 |
| Deck overview, first visit after an edit | 812 ms | 94 ms | 11 → 10 | 7,002 → 1,002 |
| Rebuild a deck | 1,996 ms | 1,308 ms | 91 → 15 | 86,594 → 47,299 |

What changed:

- **Decks load together.** Today and Decks loaded each deck on its own, seven queries after another per deck. `deckViews()` in `src/lib/deck/store.ts` now loads any number of decks in two rounds of queries, and `getDeck()` and `listDecks()` both use it, so a deck reads the same alone or in a list.
- **Writes go in one batch.** Rebuilding a deck and placing its copies ran a transaction with one round trip per changed card; they now send one batch (still all or nothing).
- **Outside sites never hold a page when there's an answer to show.** `src/lib/background.ts` runs work after the response has gone out (Next's `after`, which Vercel keeps alive for). A week-old EDHREC page, yesterday's exchange rate, or a deck's last Commander Spellbook answer is shown at once and refreshed for next time. For Spellbook, a deck whose list changed shows its last answer adjusted to the new list (exact for a card added or removed, since every combo one new card completes was in the old "almost included" list); with nothing cached, a page waits at most 5 s.
- **Queries that read whole tables.** Collection's set filter walked all ~110,000 printings on every visit (now `CROSS JOIN`, so it walks your collection); lookups by exact card name use the indexed normalised name; Find a commander reads only the columns it needs, in one query, at the same time as EDHREC.

Turso's free plan bills rows read (500 million a month). "Rows read in full" counts big tables a query scans end to end; aggregates over your whole collection (Today's and Collection's totals) still read every copy, which stage 3 moves to the device.

## Stage 2: the app, images and pages on the device

`public/sw.js` is a service worker (production builds only; registered by `src/components/shell/OfflineSupport.tsx`, which sits in the app shell).

| What | How it's kept |
|---|---|
| The app's code, styles and fonts (`/_next/static`, named by their contents) | From the device once fetched. |
| Card images (`cards.scryfall.io`) | From the device once fetched, up to 2,500 (Scryfall sends them with CORS and a year's cache). |
| Pages, on a full load (opening the app, a reload) | The copy saved on this device is shown at once and the page is fetched behind it. If the new copy differs, the open page refreshes its data (the usual thin bar shows). A reload within 10 s of a saved copy waits for the network instead. |
| Pages, on a tapped link | Straight from the network as before (only the page's data). Offline, Next falls back to a full load, which the saved copy answers. |
| API calls and saves | Always the network. |

Five seconds after a page settles, the worker saves Today, Decks, Collection and every deck's tabs (Overview, Cards, Missing, Upgrades, Playtest) in the background, one at a time, skipping any saved in the last 30 minutes, so they open offline even if you haven't visited them lately. A page is only saved together with the code it runs on, and only in the new look. Signing out on a device deletes its saved pages; a page saved under another theme or look is dropped and redrawn.

When the device is offline, or online but the app doesn't answer (bad signal, the server is down), the page says so above its content, with when the copy was saved, and that changes won't save until it's back. A page that was never saved shows a short note with links to the pages that are.

Checked in Chromium against `next start` (`/tmp`-only Playwright script, not in the repo): Today from its saved copy in about 50 ms; after the warm-up 43 pages saved (8 decks); with the network off, Today, Decks, Collection (48 of 48 images), a deck never opened and its Cards tab all open, and the notice shows; with the server stopped, the same pages open and say the app can't be reached.

To start every cache afresh, bump `VERSION` in `public/sw.js`. `/sw.js` is served with `no-cache` (`next.config.ts`) and without the password (`src/middleware.ts`), so a new worker is picked up on the next visit.

## Running the benchmark

```
npm run build
npm run bench:pages -- --db /tmp/bench.db            # seeds once into /tmp/bench.db, reuses it after
npm run bench:pages -- --db /tmp/bench.db --live     # let pages call EDHREC and Spellbook as on Vercel
npm run bench:pages -- --db /tmp/bench.db --only "Today,Decks" --trace   # each page's queries
```

Options: `--latency 8` (ms per round trip), `--cards 6000`, `--decks 8`, `--runs 2`. It needs `data/mtg.db` with card data (`npm run sync:cards`). Under the hood it starts `next start` with `DB_LATENCY_MS` and `DB_TRACE=1` (see `src/db/client.ts`), which are for local use only.
