# 3 · Numbers audit

> **Evidence label: REAL.** Every value in this file came from running a query or the app's own code against a database. Three databases were used, and each value says which one:
> - **[real]**: the app on `main` at `0a4db95` (PRs #2–#5), after importing Brayden's real Mythic Tools export (115 rows).
> - **[example]**: the same app after importing a 1,283-row example Mythic Tools file, which has 7 deliberately broken rows.
> - **[mock]**: the real 115 cards, plus example boxes and three example decks (Toph, Omnath, Mondrak). Decks weren't on `main` when this audit ran, so every deck number comes from this database. It's the data behind the Phase 2 mockups. The deck code that landed later (PRs #6–#11) was then checked against these definitions; see Part B, "Checked against the deck code".

_Written 2026-11-15. Queries: `evidence/numbers.sql` (N1–N15). App functions called directly: `dashboardStats`, `queryCollection`, `ownedCard`, `previewImport`, `importCollection`, `undoImport`, `roleCounts`._

**The rule for the redesign:** every number on a screen comes from one named function in `src/lib/`, which is also the function the tests pin. A screen never does its own arithmetic. Where this file gives SQL, the SQL is the check, and the TypeScript function is the source.

---

## Part A · Every number the current build shows

Verdicts: ✅ correct and clear · ⚠️ correct by its own rule, but the label or scope can mislead · ❌ wrong.

### Home (`/`)

| Shown | What the code counts | Check | Verdict |
|---|---|---|---|
| **Copies owned** 115 [real] · 2,235 [example] | `SUM(quantity)` over every stack, **proxies included** | N1 + N2 = 115 + 0 [real] | ⚠️ Right today because there are no proxies. Once Brayden marks proxies, this tile will count them while the collection value leaves them out. See **D1**. |
| **Unique cards** 115 [real] · 1,179 [example] | `COUNT(DISTINCT oracle_id)`, with **basic lands and proxies included** | 1,174 without basics [example] | ⚠️ The five basic land types count as five "unique cards" here. See **D2**. |
| **Commander cards known** 32,642 | Cards that are Commander-legal and exist in paper | Same count by query, out of 39,295 card rows | ✅ Fixed in PR #3 (it was 37,348 with tokens and art cards). It's a fact about the app's card data rather than Brayden's collection, so it moves to **More → Data**. |
| **Card data from** 15 Nov 2026 | Date of Scryfall's bulk file at the last sync | `meta` key `bulk:default_cards:updated_at` | ✅ Also moves to More → Data. Proposal: Today shows it only as a warning, when the data is more than 14 days old. |

### Collection (`/collection`)

| Shown | What the code counts | Check | Verdict |
|---|---|---|---|
| "**115 cards** · 115 copies · $1,011.45" [real] | Unique cards (with basics) · copies (with proxies) · value (without proxies) | N3, N1, N4 | ⚠️ "Cards" means unique cards. Copies and value use different scopes for proxies. The fix is in Part B, §1. |
| **$1,011.45** [real] | `STACK_PRICE`: each stack at its own printing and finish. A guessed printing uses the card's cheapest price, so a guess can't inflate the value. A foil with no foil price falls back to the non-foil price. | N4 = **$1,011.45** ✅ | ⚠️ Two copies have no price for their finish and were priced from the non-foil price, and the page doesn't say so. Pricing strictly by finish gives $1,010.37 with 2 copies unpriced. Mythic Tools' own price columns add up to $1,015.71: a different price snapshot, 0.4 % apart, which is expected. |
| "$" | Formatted with `en-US` USD | — | ⚠️ Brayden is in Sydney (the app pins `Australia/Sydney`). To an Australian reader, "$" means AUD. See **D3**. |
| Row value | Sum of that card's stacks by the same rule | Same query, grouped by card | ✅ |

### Card page (`/collection/[oracleId]`)

| Shown | What the code counts | Check | Verdict |
|---|---|---|---|
| "**You own** 1" (Doubling Season) [real] | `SUM(quantity)` of that card's stacks, proxies included | FDN #216, 1 copy, list "bulk" ✅ | ⚠️ Doesn't say how many copies are in decks or free. That's friction pattern #1 in `1-usage-audit.md` §5. |
| "$33.41 each" | That stack's printing and finish | ✅ | ✅ |
| "EDHREC rank #186" | Scryfall's `edhrec_rank` | ✅ | ⚠️ It's a popularity rank across all of Commander, not a fit score for any deck. The label reads like a quality score. Keep it on the card page and call it "Popularity #186 on EDHREC". |

### Import (`/import`, `/import/[id]`)

| Shown | Check | Verdict |
|---|---|---|
| Rows 115 · Matched 115 · Need review 0 [real] | N7: 115 / 115 / 0, all matched exactly by Scryfall ID | ✅ |
| Rows 1,283 · Matched 1,281 · Need review 2 [example] | The 2 sent to review are correct: "Treasure, TNCC #17" (that number is the Devil token, so name and number disagree) and "Arcane Signett" (typo) | ✅ for those two. ⚠️ "Matched 1,281" includes **4 best guesses** (for example "Kenrith, PELD #303s" became MUL #4, and "Brazen Borrower ELD #39p" became #39). Each guess has a note on the card, but the result page counts them as plain matches. Show "1,277 exact · 4 best guesses to check · 2 need you". |
| Re-import of the same file [real] | Preview suggests **Update**, with a diff of +0 / −0 / changed 0. After import: 115 → **115** ✅ | ✅ The doubling bug from PR #3 is fixed. |
| Re-import with "Add" chosen on purpose [real] | 115 → 230, then **Undo** → 115 ✅ | ✅ The add is allowed, and Undo fully restores. |
| "This file is your list 'bulk' (115 copies)" [real] | Preview reports the container type and name ✅ | ✅ |
| Mythic Tools **Deck** containers [example] | The rows tagged "Deck, Korvold" were imported as a *location* named "Korvold", 96 copies | ⚠️ They're really decks. Until decks exist, "in decks" and "free" can't be computed from an import. The import preview should offer "Korvold looks like a deck. Import it as a deck?" (Phase 4, with the deck model). |

### Dates and locale
`src/lib/format.ts` pins `en-AU` and `Australia/Sydney`, so server-rendered dates are stable. ✅ The forensics item about hard-coded locale is now a decision about currency only (**D3**).

**Part A summary:** no number is wrong. Seven are ⚠️ because a label hides its scope ("cards", "$", "Matched", "EDHREC rank"), or because one line mixes scopes (copies count proxies, while value leaves them out). The redesign fixes these in the definitions below.

---

## Part B · The numbers each screen shows

Every row gives the label as it will appear, the definition, the function that's the source, the query that checks it, an example value, and its edge cases. Example values are **[mock]** unless marked otherwise.

### Shared definitions

| # | Number | Definition | Source → check |
|---|---|---|---|
| **R1** | **Copies** | Every owned copy, proxies included (**D1**, answered). When there are proxies, the count says how many ("367 cards · 3 proxies"), and each proxy row carries a proxy chip. | `collectionTotals()` → N1 + N2 |
| **R2** | **Unique** | Distinct Oracle cards, without basic lands (**D2**). Printings of the same card, and a proxy of a card you also own for real, count once. | `collectionTotals()` → N3 |
| **R3** | **Value** | The app's `STACK_PRICE` rule, unchanged. If any copies were priced by a fallback or a guess, the value gets "≈" and a tap shows "2 copies priced from a similar printing". Unpriced copies are listed, never counted as $0 without saying so. Proxies are never valued. Shown in US$ or A$ (**D3**), and **only when prices are on** (Brayden's answer 5). | `STACK_PRICE` in `query.ts` → N4 |
| **R4** | **Owned · In decks · Free** | Owned = R1 for this card. In decks = copies **claimed** by decks that are *built* or *building* (**D4**). Free = owned − in decks, never below 0. | `cardAvailability()` → N8 |
| **R5** | **Wanted by** | Active decks with an open slot for this card. | `cardAvailability()` → N8 `decks_waiting` |
| **R6** | **Shared** | Owned > 0, and owned is fewer than the active decks that want it. Basic lands are never "shared", because Brayden keeps a box of them. | `sharedCards()` → N11 |
| **R7** | **Deck progress** | Placed ÷ (commander + 99). A placed slot points at a real collection copy. A partner pair counts as 2 of the 100. The maybeboard is never counted. | `deckProgress()` → N9 |
| **R8** | **Open-slot reason** | Each empty slot has exactly one reason, checked in this order: no card data · not owned · free copy (can be placed now) · in another deck. | `openSlots()` → N10 |
| **R9** | **Lands** | The front face is a land (`isLand` in `src/lib/deck/text.ts`). A modal double-faced spell with a land back is counted separately ("36 lands + 2 MDFC") and as half a land in land advice. | `deckStats()` in `src/lib/deck/stats.ts` → N12 |
| **R10** | **Average mana value** | Non-land cards of the 99. The commander isn't included. | `deckStats()` → N12 |
| **R11** | **Roles** | `roleCounts()` from `src/lib/deck/roles.ts`, each compared with `ROLE_TARGETS` (ramp 10, draw 10, removal 8, wipes 3). Brayden can tap a card to correct its role. | `roleCounts()` |
| **R12** | **Bracket** | An *estimate*, shown as a floor with its reasons ("Bracket 3 or higher: 1 Game Changer (Crop Rotation)"). Never shown as a bare number. | `src/lib/deck/bracket.ts` → N13 |
| **R13** | **Cost to finish** | Only slots where **no** copy is owned, at each card's cheapest printing (`cards.price_usd`, the minimum across printings). Cards owned but used in another deck are listed separately as "get another copy", never inside this total. Only shown when prices are on. | `costToFinish()` → N14 |
| **R14** | **Curve** | Non-land cards of the 99 by the R9 rule, mana value 0 to 6, with 7 and up in one bucket. The commander isn't in the curve. | `deckStats()` → N15 |
| **R15** | **EDHREC synergy and inclusion** | Shown exactly as EDHREC gives them for that commander: synergy in percentage points ("+44"), inclusion as "51 % of 35,475 decks". The number of decks always goes with the percentage, so a small sample is visible. | EDHREC adapter (cached) |

### 1. Today

| Shown | Definition | Example | Edge cases |
|---|---|---|---|
| "**6 cards need a home**" | Stacks with no location (`location = ''`), counted in copies | 6 [mock: the 6 most recent scans] | 0 means the row is hidden. Doesn't count proxies. |
| "**7 cards two decks want**" | R6 count | 7 (Arcane Signet, Cinder Glade, Command Tower, Rootbound Crag, Sol Ring, Swiftfoot Boots, Zuran Orb) | Hidden when fewer than two decks are active. |
| "**Toph · 70 / 100 · 6 can be placed now**" | R7, plus R8 = free copy | 70 / 100, with 6 free copies (all 6 are shared cards, so the action is "Decide", not "Place") | When a deck's free-copy slots are all shared, the next step is "Decide". |
| "**Last import: 115 matched**" [real] | N7 | 115 rows · 115 matched · 0 need you | Shown for 7 days after an import, or while anything needs review. |
| Collection line: "**367 cards · 195 unique · ≈ US$1,164**" | R1 · R2 · R3 | 367 · 195 · ≈ US$1,164.06, with 2 copies estimated | The value appears only when prices are on. |

**Not on Today:** cards known, the card-data date, totals by colour or rarity. Each of these lives in More → Data or in Collection filters.

### 2. Collection

| Shown | Definition | Example |
|---|---|---|
| Header line | R1 · R2 · R3, for whatever the current filter matches | "367 cards · 195 unique · ≈ US$1,164" |
| Row: "**1 · 1 free · Bulk list**" | R4, plus the location (or "2 places" when the copies are in more than one) | Sol Ring: "1 · 1 free · wanted by 2 decks · Bulk list" |
| Row price | The stack's value by R3, shown only when prices are on | Tataru Taru (foil) US$156.60 [real] |
| Location chip counts | Copies per location | Box: Lands 160 · Bulk list 109 · Binder: Naya staples 52 · Box: Red-Green 40 · Needs a home 6 [the real 115 are in Bulk list and Needs a home; the other boxes are example data] |

### 3. Card detail (Swiftfoot Boots)

| Shown | Definition | Example |
|---|---|---|
| **Owned · In decks · Free · Where** | R4, plus each stack's location | 1 · 0 · 1 · Bulk list |
| **Wanted by** | R5, with each deck's synergy for this card (R15) | Toph (+11 synergy, in 38 % of decks) · Omnath (−6, 26 %) |
| **Printings you own** | Per stack: set, number, finish, condition, price | [real] |
| **Get another copy** | Cheapest printing, shown only when the card is shared and prices are on | US$1.30 |

### 4. Deck: Overview (Toph)

| Shown | Definition | Example |
|---|---|---|
| Progress | R7 | 70 / 100 placed |
| Open slots by reason | R8 | 24 not owned · 6 free copies, all shared · 0 in another deck |
| Health line | R9 · R10 · R11 | "36 lands · avg MV 2.90 · Ramp 18 · Draw 9 · Removal 6 · Wipes 1" |
| Bracket | R12 | "Bracket 3 or higher: 1 Game Changer (Crop Rotation)" |
| Curve | R14 | 0: 2 · 1: 11 · 2: 13 · 3: 18 · 4: 10 · 5: 4 · 6: 4 · 7+: 1 |
| Cost to finish | R13, only when prices are on | US$482.89 for 24 cards |
| EDHREC sample | R15 | Toph: 35,475 decks on EDHREC |

Omnath, for comparison: 76 / 100 · 17 not owned · 7 shared · 38 lands · avg MV 3.43 · Ramp 28 · Draw 7 · Removal 6 · Wipes 1 · US$211.95.

### 5. Deck: Cards (the editor)

| Shown | Definition |
|---|---|
| Group counts ("Creatures 24") | Cards in that type group, from the front face. |
| Slot state chip | R8 as a word: **Placed** (with its location), **Can place** (free copy), **Shared** (R6), **In Omnath**, **Not owned**. |
| Swap: "**3 free copies that fit**" | Owned cards with Free > 0 that match the commander's colour identity and aren't in the deck, ordered by synergy (R15). |

### 6. Deck: Suggestions (the builder)

| Shown | Definition | Example |
|---|---|---|
| "**From your cards**" | Owned cards with Free > 0 in the commander's colours and on the commander's EDHREC page, ordered by synergy | 35 of Brayden's real cards fit Toph. Top: Earth Kingdom General +26, Omnath, Locus of Rage +20, Rustvale Bridge +15, Strionic Resonator +14 |
| "**You'd need to get**" | Not owned, ordered by synergy, each with its cheapest price when prices are on. Shown under the owned list, never above it (answer 6). | Brightglass Gearhulk +26 (US$4.11), Solid Ground +23, Darksteel Citadel +23 |
| Inclusion | R15 | "Urza's Saga: in 21 % of decks · +21 synergy" |

### 7. Shared cards

| Shown | Definition | Example |
|---|---|---|
| The list | R6 | 7 cards |
| Per deck | R15 synergy and inclusion for each deck that wants it | Zuran Orb: Toph +44 (51 %) · Omnath +12 (15 %). Suggest: Toph. |
| "**Get another copy**" | Cheapest printing. Shown first when it's under US$2, which is cheaper than the time spent deciding. | Command Tower US$0.23 · Arcane Signet US$0.30 · Sol Ring US$0.95 |

### 8. Scan review

| Shown | Definition |
|---|---|
| "**6 scanned · N to check**" | Scans in this session, split by `printing_confidence` (exact vs. guessed printing). |
| Per card | Name, set and number, finish, and price when prices are on. A tap opens the other printings. |
| Session value | Sum of the session's copies by R3, when prices are on. Example: US$195.80 for the 6 scans [mock, real cards] |

### 9. Import review

| Shown | Definition |
|---|---|
| "**115 rows · 115 matched exactly · nothing needs you**" | N7, with matched split into exact and best guess. |
| Update diff | +new · −gone · changed (quantity or finish), from `previewImport().diff`. |
| Container question | "This file is your list 'bulk'. Do you own these cards?" when the container type is `list`. |

### Checked against the deck code

The app thread added decks to `main` while this audit was being written (PRs #6–#11). Their rules were read against the definitions above:

| Definition | In the app's code | Match |
|---|---|---|
| R4, D4: built and building decks claim copies | `CLAIMING = ["building", "built"]` in `src/lib/deck/store.ts` | ✅ |
| R6: shared cards, and "get another copy" under US$2 | `sharedCards()` and `CHEAP_COPY_USD = 2` in `src/lib/deck/allocate.ts` | ✅ |
| R9: lands by front face, MDFCs separate | `stats.ts`: MDFCs are spells in the curve and half a land in land advice | ✅ |
| R10: average mana value | `stats.ts` uses the 99's nonland cards, without the commander | ✅ after R10 was changed to match. The example values above were recomputed (Toph 2.90, not 2.92). |
| R12: bracket as a floor with reasons | `bracket.ts` | ✅ by design. The wording on screen is checked in Phase 4. |

The screens built in Phase 4 call these functions. They don't re-derive the numbers.

---

## Part C · How competitors define the same numbers [sim]

These come from the persona logs in `evidence/`. They show why the definitions above are written out in full:

| Number | How competitors define it | What we do |
|---|---|---|
| Owned | Moxfield, Archidekt and Deckbox count every copy, including copies built into decks (B1, C1). | R4: owned, in decks and free are always shown together. |
| Collection value | ManaBox and Moxfield price at the chosen printing. Archidekt can use the cheapest printing. Totals at the same moment differ by 5–20 % (A4). | R3: each stack at its own printing and finish, and estimates marked "≈". |
| Deck price | Moxfield's total is for the whole deck, including cards you own (B2). | R13: only the cards you'd actually have to get. |
| Lands | Some apps count MDFCs as lands, and some don't (B3). | R9: front face only, with MDFCs shown separately. |
| Bracket | Apps show a number with no reasons (B3). | R12: a floor, plus its reasons. |
| Synergy | EDHREC shows synergy without the sample size (B1). | R15: the number of decks always goes with it. |

---

## Decisions for Brayden

| # | Question | Proposal | Why |
|---|---|---|---|
| **D1** | Do proxies count as copies you own? | **Answered: yes.** Proxies count as owned copies and can fill deck slots, but every count and row marks them ("367 cards · 3 proxies"). Value still leaves them out. | Brayden, 2026-11-15, in the deck-builder thread. |
| **D2** | Should basic lands count as "unique cards"? | **No.** They still count as copies, and the Lands box still shows 160. | Five basics would otherwise read as five unique cards. |
| **D3** | Which currency? Scryfall gives USD and EUR only. | **Answered: US$ or A$.** A setting on `/settings` picks one. US$ is the default; A$ is converted at a shown rate and date and marked "≈". Every price goes through `money()`. | Brayden, 2026-11-15, in the project chat. |
| **D4** | Which decks claim copies? | **Built** and **building** decks claim copies. **Idea** decks only "want" cards (they appear in "Wanted by", never in "In decks"). **Retired** decks give their copies back. | An idea shouldn't lock cards away from a deck he's actually building. |
| **D5** | Do MDFC spell-lands count as lands? | Already decided in the app's code: **no**, they're shown separately. Nothing to answer unless he disagrees. | Matches `isMdfcLand`. |
