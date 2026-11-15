# Feature backlog: what Commander players expect that our plan lacks

Researched 2026-11-15. I compared the approved plan (import, collection with locations, scanner, commander + theme suggestions, multi-deck allocation, optional prices, buy or proxy only for missing cards) against what the main deck builders offer today: Moxfield, Archidekt, ManaBox, MythicHub, SpellRack, Spellweave, Deckstats, TappedOut and EDHREC. I also checked the current Commander Brackets rules from Wizards of the Coast.

**Priority key.** **P0**: a deck builder feels broken without it, and it's pure logic we can build and test now. **P1**: high value, needs the deck model or UI. **P2**: nice to have. **P3**: later or only if asked.

**Owner key.** *This thread* builds pure logic in `src/lib/deck/`. *Core* is the deck-builder thread (schema, persistence, routes, suggestions, EDHREC). *Design* is the design thread (screens and UI).

## P0: build now

| # | Feature | Why it matters | Who has it | Owner | Status |
|---|---|---|---|---|---|
| 1 | **Card roles** (ramp, draw, removal, wipes, tutors, counters, protection, recursion) | The "do I have enough ramp and removal?" checklist is the first thing players look at. Suggestions need it to fill a role template. | Moxfield and Archidekt (manual tags), EDHREC (categories), Scryfall Tagger | This thread | Done, PR #5 |
| 2 | **Deck legality check**: 100 cards, singleton, colour identity, banned list, commander eligibility, two-commander pairings (Partner, Partner with, Friends forever, Choose a Background, Doctor's companion), "a deck can have any number of" cards, companion | Every builder flags illegal decks. Our suggestions also need to prove they're legal. | Moxfield (lists exactly what failed), Archidekt, all others | This thread | Done, PR #6 |
| 3 | **Deck stats**: mana curve, average mana value (with and without lands), card types, colour pips vs. colour sources, land count advice, MDFCs counted separately, role checklist against a template, deck price (when prices are on) | Players use these to tune. Pip-vs-source and land advice are SpellRack's selling point. | Moxfield, Deckstats, SpellRack, Archidekt | This thread | Done, PR #6 |
| 4 | **Bracket estimate (1 to 5)** with reasons: Game Changers count (0, 0, up to 3, any, any), mass land denial, extra-turn cards and chains, two-card infinite combos, and the expected game length for each bracket | Brackets are how pods agree on power level now (official since Feb 2025, revised Oct 2025 and Feb 2026). Shows the bracket on every deck. | SpellRack, Spellweave, Draftsim calculator | This thread | Done, PR #6 |
| 5 | **Opening hand and goldfish**: seeded sample hands, Commander's free first mulligan (CR 103.5c) with the London mulligan, chance of 2 to 4 lands in the opening 7, chance to have a card by turn N, average turn you hit 4 lands | Moxfield's sample hand is one of its most used tools. A probability readout is a calm, phone-friendly substitute for a full playtester. | Moxfield, Archidekt, SpellRack (mulligan trainer), Deckstats (probabilities) | This thread | Done, PR #7 |
| 6 | **Decklist import and export**: paste a list from Moxfield, Archidekt, MTGO, Arena or plain text (with set, number, foil and section headers); export the same formats | Brayden will want to bring in decks he already built and share lists. Approved step 4 includes export. | Every builder | This thread (parsing), Core (routes and screens) | Done, PR #7 |

## P1: next, needs the deck model or UI

| # | Feature | Why | Owner |
|---|---|---|---|
| 7 | **Pull list by location**: for a deck, list each owned card with the box or binder it's in, sorted so you walk each box once | Brayden keeps cards in boxes and binders. MythicHub's binder links are its standout feature. | Core |
| 8 | **Owned / missing marking in the deck view**, with "own another printing" and "in another deck" states | Builds from owned cards first. | Core, Design |
| 9 | **Buy or proxy list for missing required cards**, with total price, cheapest printing and a budget cap | Already planned. Add a budget cap and a "cheapest printing" option (MythicHub). | Core |
| 10 | **Combo detection via Commander Spellbook**: combos in the deck, combos one card away using the collection, and bracket input | SpellRack and Spellweave do this. "One card away from a combo you didn't know you had" is a strong collection-aware feature. Need to confirm Spellbook's terms first (the backend is reachable from here). | This thread (pure matching), Core (fetch and cache) |
| 11 | **Maybeboard / considering list and per-card tags** | Every serious builder has it. Players park cuts and candidates there. | Core, Design |
| 12 | **Deck change history**: what was added or cut, and when | Moxfield's History page. Cheap to add once deck_cards exists. | Core |
| 13 | **Token and emblem list** for a deck, from Scryfall's `all_parts` | Players sleeve tokens before game night. | This thread (pure), Core (data) |
| 14 | **Deck notes / primer** (Markdown) | Moxfield primers. Also where Rule 0 notes live. | Core, Design |

## P2: nice to have

| # | Feature | Notes |
|---|---|---|
| 15 | **Import a precon you own** from Scryfall/MTGJSON deck lists | Many players own precons and upgrade them. MTGJSON is MIT-licensed. |
| 16 | **Proxy sheet printing** (PDF, 3×3 at card size) for cards marked "proxy" | Fits the existing buy-or-proxy decision. |
| 17 | **Deck comparison**: two of your decks, or a deck vs. EDHREC's average for that commander | Good for seeing what a suggestion changed. |
| 18 | **Card rulings** on the card page (Scryfall `/cards/:id/rulings`) | Moxfield and ManaBox show them. |
| 19 | **Scryfall-style search** over the collection (`t:creature c:bg mv<=3 otag:ramp`) | Moxfield supports full Scryfall syntax. |
| 20 | **Shareable deck summary** for Rule 0: bracket, Game Changers, combos, commander image | SpellRack's scorecard. Keep it private by default. |
| 21 | **Salt score** from EDHREC | Some pods care. Comes free with the EDHREC adapter. |
| 22 | **Upgrade suggestions within a budget**: the top N missing cards per $X | Natural extension of the buy list. |

## P3: later or only if asked

- Full playtest sandbox with a battlefield, tokens and counters (Moxfield, Archidekt). A big build, and the goldfish stats in P0 cover most of the value.
- Price history and price alerts.
- Wishlist and trade list.
- Local store stock lookup (SpellRack).
- Public sharing, likes and comments. This is a personal, single-user app.
- Other formats (Brawl, Oathbreaker, Duel Commander). Commander only for now.

## Already planned (no new work)

- Multi-deck card allocation (research.md, "sharing cards between decks").
- Banned list and Game Changers stay current through the weekly Scryfall sync. Scryfall sets `legalities.commander` and `game_changer`, so nothing is hard-coded.

## Notes for implementers

- **Brackets (rules as of the Feb 9, 2026 update).** Game Changers allowed: 0 (B1), 0 (B2), up to 3 (B3), any (B4, B5). Mass land denial only in B4 and B5. Extra turns: none in B1, "low quantities, never chained" in B2 and B3, any in B4 and B5. Two-card infinite combos: none in B1 and B2, only late-game ones (about turn 6 or later) in B3, any in B4 and B5. Tutors are not restricted since Oct 21, 2025. Expected game length: 9+ turns (B1), 8+ (B2), 6+ (B3), 4+ (B4), any (B5). Card rules can't tell B4 from B5 (intent does), and Wizards says intent matters most, so the estimator gives a floor with reasons, not a verdict. Sources: [WotC, Feb 9 2026](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026), [commanderbrackets.com changelog](https://commanderbrackets.com/changelog).
- **Land count.** The commonly cited Karsten-style formula for 99-card decks is about 31.4 + 3.1 × (average mana value of nonland cards) − 0.28 × (cheap ramp and draw, mana value 2 or less). I couldn't read Karsten's original article from here, so the stats module labels this as a guideline and clamps it to 31–42.
- **Mulligans.** Comprehensive Rules 103.5c: in multiplayer games, the first mulligan is free (you draw 7 and bottom 0). After that, the London mulligan applies.

## Questions for Brayden

1. Which bracket do your playgroups usually play? I'll default new decks to Bracket 3 ("Upgraded") as the target and warn when a deck goes above it.
2. Do you play proxies in casual games? If yes, the proxy sheet (P2 #16) moves up.
3. For prices, is TCGplayer USD right, or would you prefer Cardmarket EUR?

## Sources

- [Draftsim: best MTG deck builders](https://draftsim.com/best-mtg-deck-builder/) and [best Commander deck builders](https://draftsim.com/mtg-edh-deck-builder/)
- [Moxfield feature list](https://github.com/moxfield/moxfield-public/wiki/Features)
- [SpellRack: why SpellRack](https://spellrack.com/why-spellrack) (self-described, includes its own comparison)
- [MythicHub: deckbuilder evolved](https://mythichub.com/blog/deckbuilder-evolved)
- [Commander Brackets beta update, Feb 9 2026](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026)
- [Commander Brackets changelog and Game Changers list](https://commanderbrackets.com/changelog) (unofficial summary of WotC announcements)

## Where the built pieces live

All pure functions in `src/lib/deck/`, taking `DeckEntry[]` (see `types.ts`). None touch the database.

| Module | Main export | What it gives the deck page |
|---|---|---|
| `roles.ts` | `cardRoles`, `roleCounts`, `ROLE_TARGETS` | Ramp/draw/removal/... tags and counts |
| `validate.ts` | `validateDeck` | `legal`, a list of issues with the cards involved |
| `stats.ts` | `deckStats` | Curve, types, pips vs sources, land advice, checklist, price |
| `bracket.ts` | `estimateBracket` | Bracket floor, name, reasons, summary sentence |
| `combos.ts` | `findCombos`, `nearCombos` | Two-card combos in the deck, and ones a card away |
| `probability.ts` | `chanceByTurn`, `openingHandLands` | Exact draw odds |
| `goldfish.ts` | `shuffledLibrary`, `openingHand`, `goldfish` | Sample hands, mulligans, simulated first turns |
| `decklist.ts` | `parseDecklist`, `exportDecklist` | Paste-in and export (text, Moxfield, Archidekt, Arena, MTGO) |
