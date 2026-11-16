# MTG Deck Tutor

A personal web app for building Magic: The Gathering **Commander** decks from the cards you own.

- **Your own collection database.** Cards live in a local SQLite database, matched to Scryfall printings. CSV import from other apps, typed lists, manual adds, and the phone scanner all write to the same store.
- **Deck suggestions** (coming): pick a commander and a theme, get a 99 built from your collection, plus the strong cards you're missing.
- **Card scanner**: scan cards with your phone camera (or from photos) straight into the collection.

See [`docs/research.md`](docs/research.md) for data sources and design decisions.

## Use it on your phone and computer

The easiest way is hosting it on Vercel (free), with a password: see [`docs/hosting.md`](docs/hosting.md). You get an HTTPS address you open anywhere and install to your home screen, the card data downloads itself, and every merge into `main` goes live.

## Getting started (on your own computer)

Requires Node 22+.

```bash
npm install
npm run sync:cards     # download Scryfall card data into data/mtg.db (~30s, ~90 MB)
npm run dev            # http://localhost:3000
```

`sync:cards` skips the download if your data is less than 24 hours old; pass `-- --force` to refresh anyway. You can also skip it: on an empty database, Today downloads the card data itself, and it refreshes itself when it's over a week old.

If you're behind an HTTP proxy, run Node with `NODE_USE_ENV_PROXY=1` so `fetch` uses `HTTPS_PROXY`.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest, uses a small Scryfall fixture, no network) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | New Drizzle migration after changing `src/db/schema.ts` |
| `npm run fixtures` | Refresh the test fixture from Scryfall |
| `npx tsx scripts/bench-import.mts 10000` | Time a 10,000-row import against a copy of your database (about 6 s) |
| `npx tsx scripts/check-names.mts "Mana Vault"` | Show which printing a name-only match picks |

## Using the app

- **Import** (`/import`): choose a CSV export or paste a card list. You see a preview (detected app, sample rows, copies) before anything is written. "Replace my earlier import" swaps out cards from the same app's previous import and keeps scanned and manually added cards. Unmatched rows are listed afterwards with links to add them by hand.
- **Collection** (`/collection`): search by name, type or rules text; filter by colour identity ("fits in these colours" is what a commander can use), type, rarity and set; sort by name, mana value, value, EDHREC popularity, copies or date added. Filters live in the URL.
- **Card page**: every stack you own (printing, finish, condition, language, location), with +/− and remove (undoable).
- **Add cards** (`/collection/add`): name autocomplete, pick the printing, finish, condition, copies and location.
- **Scan** (`/scan`): hold a card inside the frame and it's read automatically. Sure matches are added straight away with an Undo; anything unsure waits for you below the camera with the printing and finish to check. Your foil/condition/location choices stick between scans, and the session list lets you fix or remove anything before you leave. See [Scanning cards](#scanning-cards).

### Decks

- **New deck** (`/decks/new`): pick a commander (the ones you own are listed first) and a theme. Themes come from EDHREC for that commander (with deck counts) plus built-in themes that work from rules text alone. The builder fills the 99 from your collection first: role targets (36 lands, 10 ramp, 10 draw, 8 removal, 3 wipes), then your best-scoring cards, then lands and basics split by colour. It only suggests buying or proxying a card when your collection can't fill a slot (you can switch that off or cap the price). Each deck has a target bracket (Bracket 3 by default): the builder keeps to its Game Changer limit, leaves out mass land denial at Bracket 3 or lower, and plays at most two extra-turn cards, and the deck page warns when the deck goes over. New decks start as ideas.
- **Import a decklist** (`/decks/import`): paste a list from Moxfield, Archidekt, MTGO, Arena or plain text. Cards are locked (basics excepted, so a rebuild can re-split them), your copies are placed, and unknown names are listed. If the list doesn't mark a commander you pick one of its legendary cards.
- **Find a commander** (`/decks/commanders`): pick a theme; commanders you own are ranked by how well they and your cards fit it, then popular EDHREC commanders you don't own.
- **Deck page** (`/decks/:id`): Overview (a prioritised to-do list, bracket estimate with reasons, legality, role checklist, land advice, mana curve, colour sources, combos and near-combos, pull list by box or binder, exports, rebuild, status), Cards (by role, type or location; lock, maybeboard, buy/proxy, remove with undo, add by search), Missing (every open slot with one reason: free copy, shared, in another deck, not owned) Upgrades (strong cards you don't own, and what they'd replace) and Playtest (sample opening hands with Commander mulligans, and a 1,000-game goldfish summary).
- **Deck status**: *Idea* (the default for new decks) holds none of your copies. *Building* and *Built* hold the copies placed in them, so one physical copy is never in two decks. Proxies in your collection count as owned; a real copy is used first when you have both. *Retired* keeps the list and releases the copies.
- **Settings** (`/settings`): hide prices everywhere, or show them in Australian dollars (converted from Scryfall's US dollar prices).
- **Shared cards** (`/decks/shared`): cards more active decks want than you own copies of. The recommended deck is the one where EDHREC says the card has the most synergy with the commander. Under $2 it suggests getting another copy. "Give to" locks the card into that deck and rebuilds decks that are still being built.
- **Exports**: `/api/decks/:id/export?format=text|moxfield|archidekt|arena|mtgo|missing|pull` (decklists for other apps, with the printing you own where we know it; the cards you still need; a pull list by location).
- The land count follows the curve the builder picked (Frank Karsten's formula, 33 to 40) unless you set one.

EDHREC data is fetched only when you build or open a deck, cached for 7 days, at most one request per second. Set `EDHREC_ENABLED=false` to turn it off; the builder then ranks by theme fit and Scryfall's EDHREC rank.

Supported imports: Mythic Tools, ManaBox, Moxfield, Archidekt, Deckbox, TCGplayer (app and seller inventory), Delver Lens, Dragon Shield, any CSV with recognisable column names, and plain lists like `4 Sol Ring (C21) 263 *F*`.

### Printing confidence

When a source names the exact printing (Scryfall ID, TCGplayer ID, or set + collector number) the stack is **exact**. When only a name is known we pick the most regular printing (no Secret Lair, promos, showcase or serialized versions), and the stack is marked **printing guessed**. Its value then uses the card's cheapest printing. We never change the finish a source gives; if the printing isn't made in that finish, the stack is flagged as guessed instead.

The database defaults to `data/mtg.db`. Set `DATABASE_URL` (and `DATABASE_AUTH_TOKEN`), or `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, to use a hosted libSQL database instead. Set `APP_PASSWORD` to lock the app behind a password (always on when hosted on Vercel). `npx tsx scripts/bench-remote.mts` shows round trips and full-table reads per flow, as a hosted database would see them.

## Scanning cards

The phone's camera only works on a secure page, so on your phone open the app over HTTPS:

```bash
npm run dev:https      # https://<your computer's LAN IP>:3000, self-signed certificate
```

Your phone will warn about the certificate the first time; accept it for this address. On the computer itself, plain `http://localhost:3000/scan` works. Without HTTPS, **Scan from photos** still works: take pictures with the phone's camera app (one card each, anywhere in the frame) and pick them all at once.

Tips: a plain table that contrasts with the card's border helps it find the edges; even light without glare helps it read the name; sleeves are fine if they don't reflect.

How it works (details in [`docs/scanner.md`](docs/scanner.md)): the page finds the card's edges in the live video and, once it's steady, sends a flattened picture of it to `POST /api/scan`. The server reads the title bar and the collector line (set code and number, bottom left on cards since 2015) with Tesseract OCR, fuzzy-matches the name against every card in your database, then picks the printing by the collector line and by comparing the photo with Scryfall's image of each printing. A scan takes about 0.7 s on a laptop.

Accuracy on 20 real phone photos (foils, Japanese and Chinese cards, Unlimited to 2025 frames; `scripts/scanner/real-eval.mts`): exact printing 19 of 20, 14 added without asking and none of those wrong. On 120 simulated photos (`npm run scan:eval`): right card 96.7%, exact printing 95%, 90% added without asking. Older cards without a set code are found by the "78/143" number and year on their copyright line. Japanese and Chinese cards are saved in their language; when the scanner can't tell which, it asks. Foil isn't detected from the photo: use the Foil toggle.

| Route | Body | Returns |
|---|---|---|
| `POST /api/scan` | JPEG/PNG of the flattened card; `?kind=photo` for any photo with one card in it | `{ status: "matched" \| "uncertain" \| "not-found", best, candidates, name, lang, read }` |
| `POST /api/scan/undo` | `{ itemId, quantity? }` | lowers that stack by 1 (removes it at 0) |

## Code layout

```
src/db/              schema.ts (Drizzle tables), client.ts (open + migrate)
src/lib/scryfall/    rate-limited API client (headers, 10/s and 2/s lanes, 429 backoff)
src/lib/cards/       bulk sync, lookups, identity normalisation, matching to printings
src/lib/collection/  the collection store: add, update, remove, stats
src/lib/edhrec/      cached, rate-limited EDHREC JSON client and parsers
src/lib/deck/        build.ts (pure builder), store.ts (decks in the DB, copy placement), allocate.ts (shared cards),
                     suggest.ts (commanders for a theme), themes.ts, plus roles/stats/validation/bracket modules
src/app/             pages and API routes
src/scanner/         card recognition: find the card, OCR name + collector line, fuzzy match, pick the printing
src/components/scanner/  the /scan page (camera, review sheet, session tray)
scripts/scanner/     scan-eval: accuracy check on simulated phone photos
drizzle/             SQL migrations, applied automatically on start
tests/               Vitest tests and fixtures
```

## Data model

- **`cards`**: one row per gameplay card (Scryfall oracle card). Holds colour identity, Commander legality, commander eligibility, EDHREC rank, and oracle text.
- **`printings`**: one row per physical printing (Scryfall ID, set, collector number, language, finishes, prices, images).
- **`collection_items`**: what you own. Each row is a *stack*: a printing in one finish, condition, language and location, plus a quantity. Adding an identical stack bumps the quantity.
- **`decks` / `deck_cards`**: a deck's commander(s), theme, status and build settings; its cards on the main, maybe, wanted (every copy is in another deck) and upgrade boards. An owned card points at the collection stack it's taken from (`collection_item_id`).
- **`edhrec_cache`**: EDHREC pages, cached for 7 days.
- **`meta`**: bookkeeping such as sync times, and the app settings (`settings`, JSON).
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
