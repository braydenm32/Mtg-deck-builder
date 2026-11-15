# 2 · Page forensics

_Why people struggle on each heavily used page, and what we'll fix, as a numbered list per page. Pages are in usage-audit order (`1-usage-audit.md` §3)._

Two kinds of evidence:
- **Ours [real]**: what the current build does, driven with Playwright at 390 × 844 (phone) and 1280 × 800 (laptop). PR #2 (`main` at `31936a5`) and PR #3 (`feat/csv-import-browser` at `0f3785b`) were imported first with a 1,283-row Mythic Tools CSV and then with Brayden's real 115-card export.
- **Competitors [sim]**: failure modes from the 63 simulated sessions (`evidence/persona-*.md`), with session IDs like A4 or C2.

Each fix is tagged with the problem type the brief named: **Back** (state lost on Back), **Danger** (dangerous button), **Hidden** (hidden data), **Dup** (duplicated controls), **Fake** (looks clickable but isn't), plus **Trap** (dead end or empty-state trap), **Loss** (silent data loss), **Thumb** (phone ergonomics) and **Trust** (numbers you can't trust).

Status: ✅ fixed and re-checked on `main` at `0a4db95` · ⏳ open, belongs to the redesign.

---

## 0. The current build, page by page [real]

### Home (`/`)
What we saw: four stat tiles (Copies owned 2,232 · Unique cards 1,178 · Cards known 37,348 · Card data from 15/11/2026), then two buttons.
1. ⏳ **Hidden / Trust.** Two of the four tiles are system facts, not Brayden's: cards known, and the card-data date. They push the only actions (Import, Browse) down. Move them to More → Data. The collection becomes one quiet line.
2. ⏳ **Trap.** With an empty card database, Home says "Run `npm run sync:cards`". That's a developer instruction. First run must do the sync itself, with progress, inside onboarding.
3. ⏳ **Dup.** The page title "Your collection" repeats the Collection page's job. Home should be "Today": what needs you.
4. ✅ **Fake / dead clicks.** In PR #2 the header linked to `/collection` and `/import`, and both returned 404. PR #3 added those pages.
5. ⏳ **Thumb.** Nav links are 17 px tall and the wordmark is 24 px, against the 44 px minimum. There's no thumb-reach navigation on the phone.
6. ✅ **Trust.** Dates were hard-coded to `en-AU` page by page. `main` now formats every date in `src/lib/format.ts`, pinned to `en-AU` and `Australia/Sydney`, which suits Brayden. Currency is still a bare "$" for US dollars (numbers audit **D3**).

### Import (`/import`, `/import/[id]`)
1. ✅ **Loss / Danger.** Importing the same Mythic Tools export a second time, with the default "Add to my collection", **doubled the collection from 2,239 to 4,478 copies with no warning** [real]. Mythic Tools users re-export to sync (persona A3), so this is the normal path, not an edge case. Fix: detect a repeat import and default to "Update from Mythic Tools", with a +new / −gone / changed preview and Undo. Re-checked on `main` (PR #4): re-importing the real file now suggests **Update**, shows +0 / −0 / changed 0, and leaves 115 copies at 115. Choosing Add on purpose still doubles, but **Undo** restores 115.
2. ✅ **Trust.** A row named "Treasure" at TNCC #17 was stored as the **Devil** token, marked *exact* [real]. When name and set+number disagree, send the row to review. Re-checked on `main`: the row now goes to review with the reason "TNCC #17 is Devil, but the row says Treasure".
3. ✅ **Hidden.** Brayden's real export says `Container Type = list`, `Container Name = bulk`. In Mythic Tools, lists include wants and trades, which are cards you *don't* own. The importer ignored the type [real]. Fix: ask in the preview ("This file is your 'bulk' list. Do you own these?"). Re-checked on `main`: the preview now reports the container (list "bulk", 115 copies). Mythic Tools **Deck** containers still become a location named after the deck (see `3-numbers-audit.md`, Part A).
4. ⏳ **Trap.** Unmatched rows are listed with a link to Add cards, which is better than competitors' spreadsheet loop (A3). But each row should be fixable **in place**, with the top three printing guesses and an "I don't own this" option.
5. ⏳ **Calm.** The result page uses three stat tiles (Rows · Matched · Need review). Make it one line: "115 rows · 115 matched exactly · nothing needs you".
6. ✅ Matching quality on real data: **115 of 115 rows matched exactly by Scryfall ID** [real].

### Collection (`/collection`)
1. ✅ partly. **Thumb.** On the phone, one page of results was **9,286 px tall**: a two-column grid of full card images [real]. On `main` it's **4,077 px** with the real 115 (three columns, filters open). Lookup, the most frequent task, still needs a compact list mode with images on demand (⏳).
2. ✅ **Thumb.** 17 tap targets were under 44 px tall: inputs 33–34 px, the commander checkbox 13 px, "Clear" 26 px, "Next" 20 px [real]. Re-checked on `main`: none left on Collection or the card page. The only ones left are Home's two buttons (38 px) and the footer's Scryfall credit link (15 px).
3. ⏳ **Dup / Calm.** Six filter controls, Apply and Clear all sit above the results. The Set dropdown lists every set in the collection [real]. Fix: one search field (Scryfall syntax), with chips for the 3 filters people use (where it lives, colour, in a deck / free) and the rest under "More filters". Filters apply instantly, with no Apply button.
4. ⏳ **Hidden.** There's no filter for **where a card lives** (box, binder, list), even though the location is stored [real]. That's exactly the A4 question.
5. ⏳ **Trust.** The header "115 cards · 115 copies · $1,011.45" is a good single line, but "cards" means unique cards. Label it "115 unique".
6. ✅ **Back.** Search, filters, sort and page live in the URL (`?q=…&sort=…`).

### Card page (`/collection/[oracleId]`)
1. ✅ **Thumb / Fake.** At 390 px the page rendered **456 px wide**. The stack row (− / qty / + / Remove) overflowed, so the page scrolled sideways [real]. Re-checked on `main`: 390 px, no sideways scroll, and Back keeps the search.
2. ⏳ **Danger.** "Remove" sits right next to the "+" stepper [real]. PR #3 added undo, but the button shouldn't sit in the stepper's thumb path. Move it into a "…" menu.
3. ⏳ **Hidden.** "You own 2" doesn't say which decks use them or how many are free. That's the #1 friction pattern across competitors (C1, B1).
4. ⏳ **Calm.** On the phone, the full card image (≈ 600 px) comes first, so ownership is below the fold. Lead with the summary strip (Owned · In decks · Free · Where), with the image beside it on a laptop and collapsed to a thumbnail on the phone.
5. ⏳ **Dup.** The "Add more" form (printing, finish, condition, copies, location) is always open. Put it behind one "Add copies" button.

---

## 1. Collection (rank 1) [sim + real]
Why people struggle:
- **Hidden.** Archidekt and Moxfield show "owned" even when every copy is in a deck. Users compare two tabs in their head (C1, MX-2554, AK-stripe).
- **Back.** Moxfield clears the search box after adding a card (MX-2520). Users "continuously repaste".
- **Danger.** Archidekt's Ctrl+A selects only the loaded page, and bulk delete has no confirm or undo (AK-multisel).
- **Thumb.** A 9,286 px results page on our phone build (real, above).

Fixes:
1. Every row shows **owned · free** and the **location**, e.g. "2 · 1 free · Bulk list". No tab-hopping.
2. Search, filters, sort, scroll position and view mode (list / grid) live in the URL. Adding a card never clears the search.
3. List view by default on the phone (56 px rows, small thumbnail). Grid is one tap away and remembered.
4. Bulk select means "all matching", says so, and shows a review sheet ("Move 37 to Binder: Staples · 3 skipped, already there"). Undo on every bulk action.
5. One search field that understands Scryfall syntax, plus three chips: **Where**, **Colour**, **Free / In a deck**. Everything else under "More filters".
6. The thumb-reach **Scan** button lives here on the phone. On a laptop the same spot says **Add cards**.

## 2. Today / Home (rank 2)
Why people struggle: no competitor has a "what needs me" page. Every app opens on a list or a feed, so the user has to remember what was half-done (A5, C6). That's **Hidden** by omission.

Fixes:
1. Up to five **next-action rows**, each a status chip plus one tap: "6 scanned cards need a home → Sort", "7 cards two decks want → Decide", "Toph · 70/100 · 6 can be placed now → Place", "Last import: 115 matched".
2. Decks strip: each deck with its progress and its single next step.
3. One quiet collection line: "367 cards · 195 unique · $1,162.98". Prices only when they're turned on.
4. No stat tiles, and no number printed twice on the page.
5. A brand-new user sees **only onboarding** until the first import or scan is finished, with a visible way out ("Skip, I'll add cards later"). Existing users are never trapped.

## 3. Card detail (rank 3)
Why people struggle:
- **Hidden.** The available count is "not computed, too slow" at Archidekt and still "in progress" at Moxfield (C1). MythicHub scopes its badge to one binder, so it can say "Need 1 more" when a copy exists elsewhere.
- **Dup.** Archidekt shows ownership in four places: ribbons, search badges, an "In decks" tab and a "Collection records" tab (B1).
- **Fake.** Hover-only actions on desktop, which are invisible on a phone (EDHREC "+", B1).

Fixes:
1. A summary strip first: **Owned 1 · In decks 0 · Free 1 · Bulk list**, then **"Wanted by Toph (+11 % synergy) and Omnath (−6 %)"** with a one-tap "Place in Toph".
2. Where each copy is: a table of stacks (printing, finish, condition, location, deck), editable in place.
3. Printings collapsed by default ("6 printings · yours: NCC #383"), expanded on demand.
4. "Build around this" on commanders, which starts New deck with this commander.
5. No hover-only controls. Every action is a visible button at least 44 px tall.

## 4. Deck · Cards (rank 4)
Why people struggle:
- **Thumb / Loss.** Archidekt's mobile site crashes while removing cards on iOS (B4). Undo is lost on refresh, and autosave is opt-in (C5).
- **Fake.** ManaBox hides multi-select behind long-press, and selects partial quantities by tapping the top or bottom half of a card (B4, C4).
- **Trust.** Moxfield users inflate quantities to mark "definitely in", which breaks the 100 count (B1).

Fixes:
1. **Swap** is one action: tap a card → "Swap out" → search or pick a suggestion → done. You get a toast ("Swapped Rootbound Crag → Rustvale Bridge · Undo") and a history entry.
2. Autosave on every change, a visible "Saved" state, and offline edits queued and synced. Unsaved state survives reload.
3. Each row shows its state as a chip: **placed** (and where from), **shared**, **to get**. Grouped by type, with counts in the group header only.
4. A **pull list** mode for the binder: cards to pull, grouped by box or binder (C6, from ManaBox and Mythic Tools).
5. No long-press-only actions. Every action is reachable by tap.

## 5. Deck · Suggestions (rank 5)
Why people struggle:
- **Trap.** EDHREC can't see the collection, so people install browser extensions to overlay ownership (B1, B5).
- **Clutter.** One commander page has 12 sections and 155+ tiles, a hover-only "+", and an ad-removal upsell (B1).
- **Trust.** Owned is shown, but not available (Archidekt green ribbon, B5).

Fixes:
1. **Your free cards that fit come first**, ranked by synergy. For Toph that's 35 of Brayden's 115 real bulk cards, e.g. Earth Kingdom General +26 %, Rustvale Bridge +15 %, Strionic Resonator +14 %.
2. Then "In your other decks" (shared), then **to get**: buy or proxy, shown last and quietly, per Brayden's answer 6.
3. Grouped by role (ramp, draw, removal, theme, lands), 5–8 per group, with "show more" on demand.
4. Each card shows one stat (synergy) and one action (Add, or Replace…). Inclusion % and deck count are on tap.
5. The source is always shown: "EDHREC · 35,475 Toph decks · cached 2 h ago".

## 6. Deck · Overview (rank 6)
Why people struggle:
- **Trust.** Moxfield rated "every single deck … 2" with no reasons (B3). Price totals disagree on printing, vendor, basics and owned cards (B2).
- **Hidden.** Roles need manual tagging everywhere (B3).

Fixes:
1. A summary strip: **status** (Building) · **progress** (70/100) · **next action** ("Place 6") · **last activity** · **source**.
2. The health line is one quiet row: 36 lands · avg MV 2.92 (no lands) · ramp 19 · draw 9 · removal 7 · wipes 1. Each number explains itself on tap.
3. "Bracket 3+ (estimate): 1 Game Changer, Crop Rotation." Reasons are listed, Brayden's own bracket can be set beside it, and the Game Changer list is versioned.
4. A curve sparkline, not a chart panel.
5. Only this tab carries the summary. Cards, Suggestions and Missing open straight on their content.

## 7. Scan review and Scan (ranks 7 and 10)
Why people struggle:
- **Trust.** Art-based recognition picks the wrong printing, and fixing it means leaving the camera (Dragon Shield) or scrolling a "massive list" (A1, A2).
- **Loss.** "Don't forget to save your changes!" (ManaBox). Dragon Shield scans "act as if it went through". Delver syncs overwrite each other (A1, A2).
- **Thumb.** A foil toggle per card in a bottom menu, while the other hand holds the stack (A1).

Fixes:
1. A live tray under the viewfinder. Each card **saves the moment it's recognised** ("Added Roaming Throne · MAR · $50.16 · Undo").
2. Fix in place: tap a tray row to change printing, finish, language or condition without leaving the camera.
3. Sticky session defaults (set lock, foil, language, destination box), set once at the top of the session.
4. Read the collector line (set + number) first and the art second, and show a confidence label on guesses.
5. End of session: "6 cards · $196 · put them in → [Bulk list ▾]". This is the "needs a home" step that Home surfaces if you skip it.

## 8. Shared cards (rank 8)
Why people struggle:
- **Danger.** ManaBox's "Build" pulls cards out of other decks in one step, with no per-card confirm or undo (C2).
- **Hidden.** Moxfield and Archidekt have no assignment model, so a move is two unlinked edits (C2).

Fixes:
1. One row per contested card, showing both decks with their synergy and inclusion for that card, and a recommendation with its reason ("Toph · +44 % vs +12 %").
2. For cheap staples (cheapest printing under about $2), offer "Get another copy · $0.30" instead of forcing a choice.
3. Choosing leaves a **ghost** in the losing deck ("Zuran Orb went to Toph · needs a replacement → see suggestions"), with Undo and a history entry.
4. Never move more than one card without a review sheet.

## 9. Missing cards (rank 9)
Why people struggle: the shopping list comes out too short because owned ≠ free. Three toggles change the count. Export hides behind a long-tap on a header (B2).

Fixes:
1. Four buckets with counts: **place now** (free copy) · **shared** · **in another deck** · **to get**.
2. "To get" shows its total cost only when prices are on, and the scope is spelled out ("cheapest regular printing · basics excluded").
3. Visible actions: Copy list, Share, Mark as proxy. No hidden gestures.

## 10. Lower-ranked pages
- **Decks list:** each deck shows its status chip (Idea, Building, Built, Retired), progress and next step. Retire is an archive with Undo, never a delete (C4). Deleting goes through Trash with a 30-day restore.
- **Export:** one Share button opens the OS share sheet with formats (text, Moxfield, Arena). There's no separate "Export" vs "Share" (C3, ManaBox duplication).
- **Settings / Data:** card-data sync status, backups and restore, prices on/off, currency.

## Cross-page rules (apply to every page)
1. Tabs, filters, search, sort and dates live in the URL. Back lands exactly where you were (C5).
2. Every destructive action has a review step, archives instead of deleting, and offers Undo.
3. Skeletons, not spinners. No layout jump when data arrives.
4. Tap targets are at least 44 × 44 px, and primary actions sit in the bottom third on the phone.
5. No hover-only controls.
6. The page title lives in the top bar. There's no second H1 on the page.
