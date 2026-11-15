# MTG Deck Builder

A personal web app for building Magic: The Gathering **Commander** decks from the cards you own.

- **Your own collection database.** Cards live in a local SQLite database, matched to Scryfall printings. CSV import from other apps, typed lists, manual adds, and the phone scanner all write to the same store.
- **Deck suggestions** (coming): pick a commander and a theme, get a 99 built from your collection, plus the strong cards you're missing.
- **Card scanner** (in progress): scan cards with your phone camera straight into the collection.

See [`docs/research.md`](docs/research.md) for data sources and design decisions.

## Getting started

Requires Node 22+.

```bash
npm install
npm run sync:cards     # download Scryfall card data into data/mtg.db (~30s, ~90 MB)
npm run dev            # http://localhost:3000
```

`sync:cards` skips the download if your data is less than 24 hours old; pass `-- --force` to refresh anyway. Re-run it weekly or after a set release.

If you're behind an HTTP proxy, run Node with `NODE_USE_ENV_PROXY=1` so `fetch` uses `HTTPS_PROXY`.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest, uses a small Scryfall fixture, no network) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | New Drizzle migration after changing `src/db/schema.ts` |
| `npm run fixtures` | Refresh the test fixture from Scryfall |

The database defaults to `data/mtg.db`. Set `DATABASE_URL` (and `DATABASE_AUTH_TOKEN`) to use a hosted libSQL database instead.

## Code layout

```
src/db/              schema.ts (Drizzle tables), client.ts (open + migrate)
src/lib/scryfall/    rate-limited API client (headers, 10/s and 2/s lanes, 429 backoff)
src/lib/cards/       bulk sync, lookups, identity normalisation, matching to printings
src/lib/collection/  the collection store: add, update, remove, stats
src/app/             pages and API routes
src/scanner/         phone-camera card recognition (scanner work)
drizzle/             SQL migrations, applied automatically on start
tests/               Vitest tests and fixtures
```

## Data model

- **`cards`**: one row per gameplay card (Scryfall oracle card). Holds colour identity, Commander legality, commander eligibility, EDHREC rank, and oracle text.
- **`printings`**: one row per physical printing (Scryfall ID, set, collector number, language, finishes, prices, images).
- **`collection_items`**: what you own. Each row is a *stack*: a printing in one finish, condition, language and location, plus a quantity. Adding an identical stack bumps the quantity.
- **`import_batches` / `unmatched_rows`**: import history and the rows we couldn't match, kept for review.

## Adding cards to the collection

Everything that adds cards goes through `src/lib/collection/service.ts`:

```ts
import { getDb } from "@/db/client";
import { addPrinting, addCards } from "@/lib/collection/service";

// You know the exact printing (e.g. the scanner, after the user confirms):
await addPrinting(db, { scryfallId, quantity: 1, finish: "foil", lang: "en", condition: "NM" }, { source: "scanner" });

// You have a partial identity and want it matched (name, set + number, TCGplayer ID...):
const { added, unmatched } = await addCards(db, [
  { identity: { name: "Sol Ring", setCode: "c21" }, quantity: 2, finish: "nonfoil" },
], { source: "manual" });
```

Matching order: Scryfall ID → TCGplayer ID → set + collector number (+ language) → name (+ set). Anything not in the local data is looked up on Scryfall's API and stored.

### HTTP API (for the browser and the scanner)

| Route | Body / query | Returns |
|---|---|---|
| `POST /api/collection/items` | `{ source: "scanner", cards: [{ scryfallId, quantity?, finish?, lang?, condition?, location? }, { identity: { name?, setCode?, collectorNumber?, lang?, scryfallId?, tcgplayerId? }, quantity?, finish? }] }` | `201 { added: [{ index, itemId, printingId, quantity }], unmatched: [{ index, reason }] }` |
| `PATCH /api/collection/items/:id` | `{ quantity }` (0 removes the stack) | the updated item |
| `DELETE /api/collection/items/:id` | | `204` |
| `GET /api/cards/lookup` | `?id=<scryfall id>`, `?set=c21&number=263`, or `?name=Sol Ring` | `{ printings: Printing[] }` |
| `GET /api/cards/search` | `?q=atra` | `{ cards: [{ oracleId, name, typeLine, imageSmall }] }` (name autocomplete) |

Server-side lookups for card recognition are in `src/lib/cards/lookup.ts`: `printingById`, `printingsBySetNumber`, `printingsByName`, `searchCardNames`, and `allCardNames` (for building an in-memory fuzzy index).

---

Card data is provided by [Scryfall](https://scryfall.com). This app is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy and is not approved or endorsed by Wizards.
