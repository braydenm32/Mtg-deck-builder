# Persona C: "Multi-deck juggler". Simulated competitor sessions

> **Evidence label: SIMULATED / QUALITATIVE.** None of this comes from real users or analytics of our app. I put each session together from public vendor docs, changelogs, feature-request boards, App Store notes and reviews, and forum threads. All tap counts, times and time shares are **estimates [inf]**. I have not invented star ratings, review counts or quotes. Quoted text is reproduced as found, sometimes shortened.
>
> Researched 2026-11-15. Tags: **[doc]** documented by the vendor, **[rep]** reported by users (URL given), **[inf]** inferred by me (reason given).

## Persona recap
- 5–8 Commander decks built from one paper collection, with single copies of staples (Sol Ring, Arcane Signet, Cyclonic Rift).
- Uses a phone at the table and in front of binders, and a laptop for planning.
- Core anxiety: "Is the number on screen the truth about my cardboard?"

## Method notes
- **Archidekt:** archidekt.com forum and news pages fetched without problems. Archidekt has no native app; on phones it is the mobile web ([rep] https://draftsim.com/mtg-collection-tracker/ "the lack of a mobile app is also inconvenient").
- **Moxfield:** I did not fetch moxfield.com. Evidence comes from moxfield.nolt.io (requests and roadmap) and a mirror of the public wiki from 2020. My searches found no official native Moxfield app, so I treat it as mobile web [inf].
- **ManaBox:** official guides at manabox.app/guides and App Store release notes and reviews.
- **Deckbox:** deckbox.org forum threads, including admin replies.
- **"Mythic Tools / MythicHub" are two separate products:**
  - **MythicHub** (mythichub.com) is a web app with a blog and help pages.
  - **Mythic Tools** (mythic.tools, iOS app id1669698500) uses boxes, binders and lists as "containers".
  - I cover both and label each one.

### Recurring sources (short names used below)
| Short name | URL |
|---|---|
| AK-inuse | https://websockets.archidekt.com/forum/thread/15420664 |
| AK-stripe | https://archidekt.com/forum/thread/18014247 |
| AK-tracker | https://websockets.archidekt.com/forum/thread/2349823 |
| AK-indecks | https://archidekt.com/forum/thread/23878223 |
| AK-toggle | https://archidekt.com/forum/thread/625379 |
| AK-v2pp | https://archidekt.com/news/6801001 |
| AK-multisel | https://archidekt.com/news/3962154 |
| AK-deckms | https://archidekt.com/news/2981306 |
| AK-autosave | https://websockets.archidekt.com/news/2890329 |
| AK-search | https://archidekt.com/forum/thread/2703551/3 (Changelog 0.10.0 comments) |
| MX-2554 | https://moxfield.nolt.io/2554 (availability across decks, merged into "Strict Assignment" #776) |
| MX-331 | https://moxfield.nolt.io/331 (exclude cards already in decks from search) |
| MX-2498 | https://moxfield.nolt.io/2498 (multiple decks open, move cards between them) |
| MX-2520 | https://moxfield.nolt.io/2520 (search field cleared after add) |
| MX-2617 | https://moxfield.nolt.io/2617 (decklist snapshots) |
| MX-998 | https://moxfield.nolt.io/998 (show ownership on shared link) |
| MX-2422 | https://moxfield.nolt.io/2422 (confusing main vs considering, lag at 300+ cards) |
| MX-road | https://moxfield.nolt.io/roadmap |
| MX-wiki | https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features (mirror, last edited Oct 2020) |
| MX-check | https://chromewebstore.google.com/detail/moxfield-checkmarker/helkjmnkalhjdejcnihhldjaaieacoig |
| MB-cdeck | https://manabox.app/guides/decks/collection-decks/ |
| MB-dfaq | https://manabox.app/guides/decks/faq |
| MB-cfaq | https://manabox.app/guides/collection/faq/ |
| MB-ie | https://manabox.app/guides/decks/import-export/ |
| MB-ios | https://apps.apple.com/us/app/manabox/id1460407674 (release notes and reviews) |
| DB-31112 | https://deckbox.org/forum/viewtopic.php?id=31112 |
| DB-avail | https://deckbox.org/forum/viewtopic.php?pid=128573 |
| DB-495 | https://deckbox.org/forum/topics/495 |
| MH-usage | https://mythichub.com/blog/binder-matches-deck-usage-and-deduplication |
| MH-status | https://mythichub.com/blog/deckbuilder-stacks-collection-status-proxies |
| MH-bulk | https://mythichub.com/blog/bulk-actions-are-finally-here |
| MT-ios | https://apps.apple.com/app/id1669698500 (Mythic Tools, release notes and reviews) |
| MT-web | https://mythic.tools |
| SCR | https://scrytics.com/blog/mtg-collection-import-export (third-party import/export guide) |

---

# C1: Find which decks use a card, and which copies are "spoken for"

### C1 · Archidekt · desktop · "Where is my Cyclonic Rift, and is it free?"
- **Path** (about 6 clicks, about 60–90 s per card [inf]):
  1. Collection page: search "Cyclonic Rift".
  2. Click the card to open the card details overlay.
  3. Open the "In decks" tab, which lists the decks that play the card ([doc] AK-v2pp: the column "now shows more details of what decks your collection cards are played in").
  4. Toggle "Exact edition match" and "Exclude maybeboards", which are not on by default ([rep] AK-indecks).
  5. Switch to the "Collection records" tab to see the copies you own.
  6. Compare the two tabs in your head to work out which copy is free.
- **Our screens:**
  - Collection: 20%
  - Card detail: 70%
  - Decks list: 10%
- **Friction:**
  - *hidden-data* (sev 3) [rep]. There is no in-use or available count. The developer said "there's not a great way to do this from a technical perspective" and suggested checking each card's "In decks" tab by hand. AK-inuse.
  - *number-mistrust* (sev 3) [rep]. The green stripe means "a card is in your collection" even when every copy is already in another deck, and "There is no mechanism to track the amount of cards being used in decks". AK-stripe.
  - *hidden-data* (sev 2) [rep]. The "In decks" view does not show which edition each deck uses, so "trying to track down my available copies" is hard, and "this gets harder the more cards there are". AK-indecks.
  - *number-mistrust* (sev 2) [rep]. Draft, precon and prototype decks all count in "In decks". One user deleted prototype decks because they "muddied up the collection/in-deck section". AK-toggle.
  - *dead-end* (sev 2) [rep]. The availability-tracker request was archived in August 2023; the team said it "doesn't seem possible due to database limitations". AK-tracker.
- **Copy-worthy:** one card overlay with tabs ("In decks", "Collection records"), and navigation that returns to the search grid "without losing context" [doc] AK-v2pp.
- **One-glance test: N.** The overlay lists decks but never answers "is a copy free?", so you have to compare two tabs yourself.

### C1 · Moxfield · desktop · same task
- **Path** (about 5–8 clicks, about 2 min, or never fully answered [inf]):
  1. Collection: search the card.
  2. The collection shows the owned quantity.
  3. There is no "in decks, spoken for" readout. The user opens each likely deck, or uses the deck page's owned highlighting, to check ([rep] MX-2554: "Moxfield currently shows cards that I own even if all copies of that card are already being used in other decks").
- **Our screens:**
  - Collection: 30%
  - Decks list: 30%
  - Deck list/editor: 40%
- **Friction:**
  - *number-mistrust* (sev 3) [rep]. "Owned" ignores deck commitments. The request asked for "1 of 3 available (2 in other decks)". MX-2554.
  - *hidden-data* (sev 3) [rep]. Users ask to search the collection "but excluding cards that are already used in decks"; one comment calls it the "3rd highest voted request". MX-331.
  - *dead-end* (sev 2) [doc]. "Add Strict Assignment to Collections" is listed as **In Progress** on the roadmap, so it has not shipped as of this research. MX-road.
- **Copy-worthy:** the proposed microcopy "1 of 3 available (2 in other decks)" and making strict assignment **opt-in** for players who proxy or ignore limits ([rep] MX-2554).
- **One-glance test: N.** The owned count is shown, but there is no "spoken for" count.

### C1 · ManaBox · phone · same task
- **Path** (about 4 taps, about 20–30 s [inf]):
  1. Collection tab: open "All collection".
  2. Search the card.
  3. Results list its decks and binders. Optionally filter by Location = Deck ([doc] MB-dfaq).
  4. Tap the card for a "card location summary" (added in v4.2.0, [doc] MB-ios).
  - Alternative: on the Decks tab, switch the search bar to card-search mode ([doc] MB-dfaq).
- **Our screens:**
  - Collection: 40%
  - Card detail: 60%
- **Friction:**
  - *onboarding-gap* (sev 2) [doc] MB-cdeck / [inf]. Location only reflects decks that were "registered in the collection". A deck that was never registered is just a list and does not claim copies. That is a two-tier model a new user will not expect: registering is a separate step in the deck's collection menu.
  - *hidden-data* (sev 1) [inf]. The card-search mode on the Decks tab is a mode switch inside a search bar, which is easy to miss.
- **Copy-worthy:** each copy has exactly one *location* (a binder or a deck), so the answer to "which copy is where" is built into the data model. There is also a location filter on the collection.
- **One-glance test: Y** (for registered decks). Search results show location directly.

### C1 · MythicHub (web) and Mythic Tools (iOS) · phone · same task
- **MythicHub path** (about 3 taps, about 15 s [inf]):
  1. Open the card from a binder.
  2. "Deck usage" tab. Decks are grouped into "Exact printing decks" and "Different printings", with a badge such as **"Have enough (X/Y)"** or **"Need N more (X/Y)"** ([doc] MH-usage).
  3. "Collection Status" tab: "how many copies, which binders" ([doc] MH-status).
- **Mythic Tools path:** in a deck list, group by ownership: "in your collection, in another deck, or not owned" ([doc] MT-ios). Before pulling a card you can "See which cards are already sleeved in a deck" ([doc] MT-web).
- **Our screens:**
  - Card detail: 70%
  - Deck list/editor: 30%
- **Friction:**
  - *number-mistrust* (sev 2) [doc]/[inf]. MythicHub's badge compares deck needs with copies "on that binder entry", and the matching tab covers the "current binder only". Copies of the same card in a second binder may be left out, so the badge can say "Need 1 more" when a copy exists elsewhere (my inference from that scoping). MH-usage.
  - *hidden-data* (sev 1) [doc]. MythicHub never defines "available". MH-usage, MH-status.
- **Copy-worthy:**
  - MythicHub: "Deck usage lists all occurrences of the card regardless of its role", which catches one copy claimed by several decks, plus the "Have enough / Need N more" badge.
  - Mythic Tools: the three-way ownership grouping (owned / in another deck / not owned).
- **One-glance test: Y.** The badge answers the question in words.

### C1 · Deckbox · desktop · same task
- **Path** (about 6+ clicks, several minutes [inf]):
  1. Link deck cards to specific inventory printings.
  2. Enable the "Decks Count" column in inventory ([rep] DB-avail, admin reply).
  3. Read the count per printing.
- **Our screens:**
  - Collection: 60%
  - Deck list/editor: 40%
- **Friction:**
  - *number-mistrust* (sev 3) [rep]. Even with printings linked, the new-deck dropdowns "still list every owned printing, including copies already in use" (Sol Ring with 7 copies). The admin replied "I'll think about this" (Feb 2025). DB-avail.
  - *number-mistrust* (sev 2) [rep]. Only *built* decks count against inventory; "deck ideas" do not. The sideboard counts but the scratchpad does not. DB-31112.
  - *looks-clickable-not* (sev 2) [rep]. The "I will be sharing cards between decks" setting was unchecked, but the user reported it "changed nothing". DB-31112.
  - *dead-end* (sev 2) [rep]. An "available" column has been requested since 2010–2011. DB-495.
- **Copy-worthy:** an explicit deck state (idea vs built) that decides whether a deck claims copies.
- **One-glance test: N.** The numbers need setup and still list in-use copies.

---

# C2: Two decks want their only copy. Decide which deck gets it, and move it

### C2 · ManaBox · phone · Sol Ring is in Deck A; Deck B wants it
- **Path** (about 6–8 taps, about 45–60 s [inf]):
  1. Open Deck B, open the collection menu, and choose "Build from collection", or update the registered deck.
  2. The app "shows which binder or deck holds each" card. It looks for exact printings first, then other versions ([doc] MB-cdeck).
  3. Review the list. Sol Ring shows as held by Deck A.
  4. Tap "Build". Cards "will be moved from your binders or other decks in your collection" ([doc] MB-cdeck).
  5. Deck A now lacks Sol Ring and shows it as missing [inf].
- **Our screens:**
  - Shared cards: 40%
  - Deck list/editor: 30%
  - Missing cards: 20%
  - Deck overview: 10%
- **Friction:**
  - *dangerous-action-no-undo* (sev 3) [doc]/[inf]. "Build" moves cards out of *other decks* in one action. The docs describe no per-card "steal from Deck A? yes/no" step and no undo (my inference: the docs list none).
  - *hidden-data* (sev 2) [inf]. It is unclear whether the source deck gets a visible "taken by Deck B" note. The docs only cover the destination side.
  - *silent-data-loss* (sev 2) [doc]. Fix in v4.1.6: "sync issue when linking a deck in the collection from two devices". Contested moves across phone and laptop were a real bug area. MB-ios.
- **Copy-worthy:** the move is a reviewable *diff* ("which cards remain in the deck and which need to be removed") before you commit, [doc] MB-cdeck. Matching rules (exact printing first, then fallback) are visible settings.
- **One-glance test: Y/N.** The source of each card is shown (Y), but "you are about to take this from Deck A" is not singled out for contested cards (N) [inf].

### C2 · Mythic Tools · phone · same task
- **Path** (about 5 taps, about 30 s [inf]):
  1. Deck B: deck list.
  2. Group by ownership. Sol Ring appears under "in another deck" ([doc] MT-ios).
  3. Manage collection status: "see and take cards from other decks" ([doc] MT-ios).
  4. Confirm [inf].
- **Our screens:**
  - Shared cards: 50%
  - Deck list/editor: 50%
- **Friction:**
  - *hidden-data* (sev 2) [inf]. No documented "decide which deck deserves it" aid, such as role or bracket impact. The user decides from memory.
  - *dangerous-action-no-undo* (sev 2) [inf]. The docs describe no undo for "take".
- **Copy-worthy:** "in another deck" as a first-class group in the deck list. The scanner can also "check a physical deck against its list" after the move ([doc] MT-ios).
- **One-glance test: Y.** The contested card sits in its own group.

### C2 · Archidekt · desktop · same task
- **Path** (about 10+ clicks, 2–4 min [inf]):
  1. Open the card overlay, "In decks" tab, to see that Deck A has it.
  2. Decide.
  3. Open Deck A and remove the card or move it to a "Sideboard/Considering" category.
  4. Save. Autosave is opt-in under Experimental Settings ([doc] AK-autosave).
  5. Open Deck B and add the card.
  6. Optionally tag the collection record by hand, which is the suggested workaround ([rep] AK-stripe: "Managing this yourself with labels").
- **Our screens:**
  - Card detail: 25%
  - Deck list/editor: 60%
  - Decks list: 15%
- **Friction:**
  - *hidden-data* (sev 3) [rep]. There is no assignment model, so nothing records that Deck B now "owns" the physical copy. AK-inuse, AK-stripe.
  - *state-lost-on-back* (sev 2) [doc]. Undo works only "until you refresh the page". Edits made with autosave off can be lost if you leave. AK-autosave.
- **Copy-worthy:** "Recent Changes" keeps the last 100 edits per deck ([doc] AK-deckms), which is good for "what did I just take out?".
- **One-glance test: N.** No single screen shows the conflict.

### C2 · Moxfield · desktop · **not supported** as a move
- **Path** (about 10+ clicks [inf]): edit Deck A (remove), then edit Deck B (add). There is no linked move.
- **Our screens:**
  - Deck list/editor: 80%
  - Decks list: 20%
- **Friction:**
  - *duplicated-controls / phone-unfriendly* (sev 2) [rep]. Users ask for "Multiple decks open at once" for "moving cards owned between decks", with a move-or-copy prompt and a "ghost" left in the emptied slot. MX-2498.
  - *hidden-data* (sev 3) [rep]. Strict assignment has not shipped. MX-2554, MX-road.
- **Copy-worthy (from the request):** a **"ghost" placeholder** in the source deck ("now in Deck B"), and an explicit **Move vs Copy** prompt (MX-2498).
- **One-glance test: N.**

*Deckbox: there is no move action. Admins say "move them to be built decks", and users keep dummy decks as storage containers and move cards by hand (DB-31112).*

---

# C3: Export a deck list (plain text, Moxfield, Arena) and share it

### C3 · Moxfield · desktop
- **Path** (about 3–4 clicks, about 20 s [inf]): Deck, Export, choose Arena or MTGO ([doc] MX-wiki: "We support exporting to Arena and MTGO formats"), copy or download, paste into chat. A share link is the URL.
- **Our screens:**
  - Export: 80%
  - Deck overview: 20%
- **Friction:**
  - *hidden-data* (sev 1) [doc]. Arena export lacked the deck name until "Add deck name to magic arena exports" shipped in Feb 2024. MX-road.
  - *hidden-data* (sev 2) [rep]. Shared links can't show what *the owner* owns. The workaround is tagging cards owned or unowned. MX-998.
- **Copy-worthy:** Moxfield links are the de facto share target. Other apps import Moxfield URLs (ManaBox lists Moxfield among its URL-import sources [doc] MB-ie).
- **One-glance test: Y.**

### C3 · ManaBox · phone
- **Path** (about 4–5 taps, about 20–30 s [inf]): Deck, three-dot menu, then either:
  - "Export": a re-importable text file.
  - "Share": a link (requires sign-in) or a custom text file grouped by property. "Group printings" gives names only ([doc] MB-ie, MB-dfaq).
  - MTGA-format sharing arrived in v4.1.0 ([doc] MB-ios). Then the OS share sheet.
- **Our screens:**
  - Export: 90%
  - Deck overview: 10%
- **Friction:**
  - *duplicated-controls* (sev 1) [doc]. "Export" and "Share" are separate items with overlapping outputs. MB-ie.
  - *number-mistrust / stale* (sev 2) [doc]. "After editing a deck, update the link so the changes appear". A shared link can silently go stale. MB-dfaq.
  - *onboarding-gap* (sev 1) [doc]. Link sharing needs an account. MB-dfaq.
- **Copy-worthy:** "Share with the Missing cards filter" exports a shopping list straight from the deck ([doc] MB-dfaq), and the OS share sheet is phone-native.
- **One-glance test: Y.**

### C3 · Archidekt · desktop
- **Path** (about 3–4 clicks [inf]): Deck, export or text view, then copy. I found no public doc on Archidekt's export modal in this session, so the format list is unverified [inf].
- **Our screens:**
  - Export: 80%
  - Deck list/editor: 20%
- **Friction:**
  - *silent-data-loss* (sev 1) [rep]. In CSV round-trips, "Tags usually don't carry over", conditions are "almost never preserved", and prices "are never preserved" ([rep] SCR, a third-party guide). Applies across apps.
- **Copy-worthy:** category and tag columns travel in CSV (SCR).
- **One-glance test: Y** [inf].

---

# C4: Retire or delete a deck safely, and bulk-edit cards

### C4 · ManaBox · phone · retire a registered deck
- **Path** (about 4 taps, about 20 s [inf]):
  1. Deck: collection deck button.
  2. "Disassemble".
  3. Pick a destination binder.
  4. Done. "This action does not delete the decklist; it simply disassociates the deck from the collection" ([doc] MB-cdeck).
  - Bulk edit: long-press a card for bulk select, then move, tag or mark as proxy. Partial copies are chosen by "press[ing] the upper or lower part of a card" ([doc] MB-dfaq, MB-cfaq).
- **Our screens:**
  - Decks list: 20%
  - Deck list/editor: 50%
  - Collection: 30%
- **Friction:**
  - *phone-unfriendly / hidden-data* (sev 2) [doc]. Choosing quantity by tapping the upper or lower half of a card is an invisible gesture with small targets. MB-cfaq.
  - *dangerous-action-no-undo* (sev 2) [inf]. The docs say nothing about undo for disassemble, or about what happens to copies when a *registered* deck is deleted outright (the docs are silent).
- **Copy-worthy:** **Retire is not the same as delete.** "Disassemble" returns cards to a binder and keeps the list. It is the archive pattern we want.
- **One-glance test: Y.** One button, one destination question.

### C4 · Archidekt · desktop · bulk-edit and delete
- **Path, bulk edit:** Ctrl-click or long-press cards, then Edit menu (quantity, foil, category, and so on), then press **"Apply Changes"** to commit ([doc] AK-deckms). In the collection: multiselect widget, then edit or delete ([doc] AK-multisel).
- **Path, delete deck:** Deck settings, delete, confirm [inf]. I found no public trash or archive in this session.
- **Our screens:**
  - Deck list/editor: 60%
  - Collection: 30%
  - Decks list: 10%
- **Friction:**
  - *dangerous-action-no-undo* (sev 3) [doc]. The collection bulk delete post mentions no confirmation or undo. AK-multisel.
  - *number-mistrust* (sev 2) [doc]. Ctrl+A "only will select the cards you've loaded on your current page, not all cards in your Collection". "Select all" doesn't mean all. AK-multisel.
  - *silent-data-loss* (sev 2) [doc]. Edition and foil bulk changes skip cards that lack the option: "Any other cards selected will remain unchanged" (no per-card report). AK-multisel.
  - *dead-end* (sev 2) [rep]. There is no "don't count this deck" toggle, so users *delete* retired decks to clean up "In decks". AK-toggle.
- **Copy-worthy:** an explicit "Apply Changes" commit for bulk edits, and Recent Changes (last 100 edits).
- **One-glance test: Y** for bulk edit, **N** for retiring (no archive state).

### C4 · Moxfield · desktop · retire a deck
- **Path** (about 4 clicks [inf]): Deck, settings or more, delete, confirm. The History page tracks card changes ([doc] MX-wiki: "All card changes to your decks are tracked in your deck's History page").
- **Our screens:**
  - Decks list: 40%
  - Deck list/editor: 60%
- **Friction:**
  - *dangerous-action-no-undo* (sev 3) [inf]. I found no trash, restore or archive on the roadmap ([doc] MX-road lists none). Users ask for "snapshots" so they don't keep near-duplicate decks (MX-2617).
  - *clutter* (sev 1) [rep]. History is a long list of incremental changes; "the player shouldn't have to wade through tons of incremental changes". MX-2617.
- **Copy-worthy (from the request):** named, timestamped **snapshots** that keep the primer and tags, created only "when a change is actually made" (MX-2617).
- **One-glance test: N** for safe retire.

### C4 · MythicHub / Mythic Tools
- MythicHub bulk actions:
  - Move to another binder: "choose the target binder, review the selected cards, and can decide how many copies should be moved" ([doc] MH-bulk).
  - Delete: no confirmation step is described (*dangerous-action-no-undo*, sev 2, [doc] MH-bulk).
  - Deduplicate writes "a history entry" ([doc] MH-usage).
- Mythic Tools: "Restoring a card from a deleted box brings that box back" ([doc] MT-ios), which is soft delete with recovery.
  - Also v3.1.0 fixed "editing cards cleared their purchase price" (*silent-data-loss*, sev 2, [doc] MT-ios).
- **Copy-worthy:** review-then-commit moves with a copy count; restore that brings back the parent container; a history entry for merges.

---

# C5: Return to a deck or collection view after navigating away on the phone

### C5 · ManaBox · phone (native)
- **Path:**
  1. Collection.
  2. Filter (Location = Deck) and search.
  3. Tap a card to open Card detail.
  4. Back.
  - Native stacks usually keep the list state [inf: standard iOS and Android navigation behaviour; not documented].
- **Friction:**
  - *state-lost-on-back* (sev 2) [rep]. "Tapping the home tab at the bottom doesn't return you to the home page". The developer suggested swiping from the left edge. MB-ios (review, 09/30/2021). Tab and back semantics weren't obvious.
- **Our screens:**
  - Collection: 60%
  - Card detail: 40%
- **Copy-worthy:** native list state survives back [inf].
- **One-glance test: Y** [inf].

### C5 · Archidekt · phone (mobile web)
- **Path:** Collection search, card overlay, move between overlay states, then back out "to the grid of searched cards without losing context" ([doc] AK-v2pp). "Tabs are maintained across sessions on a device" ([doc] AK-search). Search moved to the bottom toolbar "to improve one-handed navigation" ([doc] AK-search).
- **Friction:**
  - *state-lost-on-back* (sev 3) [doc]. Deck edits rely on Save unless the opt-in Autosave is on, and Undo lasts only "until you refresh the page". A phone browser that reloads a backgrounded tab can drop unsaved edits [inf from mobile browsers discarding tabs]. AK-autosave.
  - *phone-unfriendly* (sev 2) [rep]. There is no app ("the lack of a mobile app is also inconvenient", draftsim). Bulk select relies on long-press (AK-deckms).
- **Our screens:**
  - Collection: 50%
  - Card detail: 30%
  - Deck list/editor: 20%
- **Copy-worthy:** an overlay that keeps the grid behind it; tabs remembered per device; search in the bottom toolbar.
- **One-glance test: Y** for browsing, **N** for whether an edit is saved (the orange Save button is the only cue, AK-autosave).

### C5 · Moxfield · phone (mobile web)
- **Path:** Collection, search, add a card to a binder, return. The search box is now empty.
- **Friction:**
  - *state-lost-on-back* (sev 2) [rep]. "adding to a collection/binder erases the contents of the search field when it returns after a card is added", so the user has to "continuously repaste it". MX-2520.
  - *rage-click-trap / phone-unfriendly* (sev 2) [rep]. Lag on large decks: "Moxfield lags with over 300 cards when 'considering' isn't collapsed", and users "forget which section they're viewing". MX-2422.
- **Our screens:**
  - Collection: 70%
  - Card detail: 30%
- **Copy-worthy (from the request):** saved search strings (MX-2520).
- **One-glance test: N.** The section context is lost (MX-2422).

---

# C6: Keep the collection in sync after building (cards pulled from a binder into a deck box)

### C6 · ManaBox · phone
- **Path** (about 6 taps plus physical sorting, 3–5 min for 100 cards [inf]):
  1. Deck: "Build from collection". The list shows which binder or deck holds each card ([doc] MB-cdeck).
  2. Pull cards physically from the named binders.
  3. Add unmatched cards as new entries, individually or in bulk.
  4. Build. Cards move into the deck.
  5. Later edits: the collection deck button "shows which cards remain in the deck and which need to be removed".
- **Our screens:**
  - Deck builder: 20%
  - Shared cards: 20%
  - Missing cards: 20%
  - Deck list/editor: 30%
  - Settings/Data: 10%
- **Friction:**
  - *onboarding-gap* (sev 2) [doc]. "Add cards" (for precons) and "Build from collection" give very different results, and choosing wrong duplicates copies [inf]. MB-cdeck.
  - *number-mistrust* (sev 1) [doc]. Proxies "don't count toward collection value when the deck is registered". This is good, but it only applies to registered decks. MB-dfaq.
  - *silent-data-loss* (sev 2) [doc]. Sync is PRO-only and queued, with bug fixes listed for two-device deck linking. MB-ios.
- **Copy-worthy:** the **pull list lists the binder for each card** (a fetch list), and an "update registered deck" diff.
- **One-glance test: Y.**

### C6 · Mythic Tools · phone
- **Path:**
  1. Deck: export a "cards to fetch" list "split into cards you already own and cards you still need" ([doc] MT-ios).
  2. Pull the cards.
  3. Optionally hide in-deck cards from boxes and binders "globally or per container" ([doc] MT-ios).
  4. Use the scanner to "check a physical deck against its list" or "move them between boxes".
- **Our screens:**
  - Missing cards: 30%
  - Scan / Scan review: 40%
  - Collection: 30%
- **Friction:**
  - *hidden-data* (sev 1) [inf]. Hiding in-deck cards from binders is a setting. If the user forgets it is on, binder counts look short.
- **Copy-worthy:** a **scan-to-verify** pass for a deck box, a "fetch list" export, and a per-container toggle for "hide cards in decks".
- **One-glance test: Y.**

### C6 · Deckbox · desktop
- **Path:** Mark the deck as *built*, not an idea, so it counts. Inventory then reflects usage, but the site has no storage locations ("The site wasn't built with a way to manage where you inventory might be stored" [rep] DB-31112). Users fake binders with dummy decks and move cards between them by hand.
- **Friction:**
  - *hidden-data* (sev 3) [rep]. There is no "which binder did this come from". DB-31112.
  - *number-mistrust* (sev 2) [rep]. Idea vs built status changes counts invisibly. DB-31112.
- **Our screens:**
  - Collection: 60%
  - Deck list/editor: 40%
- **One-glance test: N.**

### C6 · Moxfield · desktop
- **Path:** No deck-to-binder assignment. The user removes cards from a binder by hand (a "Remove from Binder" link shipped Oct 2023 [doc] MX-road), or uses a third-party extension that adds "locally stored checkboxes to Moxfield deck lists" to audit a deck ([rep] MX-check).
- **Friction:**
  - *hidden-data* (sev 3) [rep]. Users want to "allocate cards to a deck or remove all cards in a deck from collection", and another asks to mark decks "sleeved" (MX-331).
- **Our screens:**
  - Collection: 50%
  - Deck list/editor: 50%
- **One-glance test: N.**

---

# Summary

## 1. Top 10 friction patterns, ranked by severity × how often they hit Persona C
| # | Pattern (type) | Sev | Hit frequency | Apps | Evidence |
|---|---|---|---|---|---|
| 1 | "Owned" counts copies already committed to other decks (*number-mistrust*) | 3 | Every build session | Moxfield, Archidekt, Deckbox (dropdowns) | MX-2554, AK-stripe, DB-avail [rep] |
| 2 | No "available / spoken for" figure; the user compares tabs in their head (*hidden-data*) | 3 | Every contested card | Archidekt, Moxfield | AK-inuse, AK-indecks, MX-331 [rep] |
| 3 | Planned, idea, precon and retired decks claim copies, or cannot be excluded (*number-mistrust*) | 2–3 | Weekly | Archidekt, Deckbox | AK-toggle, AK-tracker, DB-31112, DB-495 [rep] |
| 4 | Moving between decks is two unlinked edits, or a bulk "Build" that takes from other decks with no per-card confirmation or undo (*dangerous-action-no-undo*) | 3 | 2–4×/month | Moxfield, Archidekt / ManaBox | MX-2498 [rep], MB-cdeck [doc] |
| 5 | Unsaved deck edits and undo do not survive refresh or tab discard (*state-lost-on-back*) | 3 | Phone sessions | Archidekt | AK-autosave [doc] |
| 6 | Search or filter context cleared after an action or Back (*state-lost-on-back*) | 2 | Many times per session | Moxfield, ManaBox (home tab) | MX-2520, MB-ios review [rep] |
| 7 | Bulk delete or edit without documented confirm or undo; partial skips go unreported (*dangerous-action-no-undo*, *silent-data-loss*) | 2–3 | Monthly | Archidekt, MythicHub | AK-multisel, MH-bulk [doc] |
| 8 | "Select all" selects only the loaded page; partial-copy selection by invisible half-card taps (*number-mistrust*, *phone-unfriendly*) | 2 | Monthly | Archidekt, ManaBox | AK-multisel, MB-cfaq [doc] |
| 9 | No storage location, so "which binder do I pull from" is unknown (*hidden-data*) | 3 | Every build (Deckbox only) | Deckbox, Moxfield | DB-31112 [rep] |
| 10 | Multi-device sync and data integrity bugs (deck linking from two devices, purchase price wiped on edit) (*silent-data-loss*) | 2 | Rare but trust-breaking | ManaBox, Mythic Tools | MB-ios, MT-ios [doc] |

## 2. Estimated task frequency for Persona C (ESTIMATES [inf])
| Task | Times / month | Phone : desktop | Reasoning |
|---|---|---|---|
| C1 Which decks use a card / is it free | 8–12 | 40 : 60 | Happens on every new card considered for a deck and every trade or LGS visit. Planning is mostly on the laptop; "do I already own one free?" in a shop is phone. |
| C2 Contested copy: decide and move | 2–4 | 50 : 50 | 5–8 decks sharing single staples. Each new build or upgrade produces 1–3 conflicts. The decision happens on the laptop; the physical swap is phone at the binder. |
| C3 Export and share list | 2–3 | 60 : 40 | Sharing with the pod before game night (phone) and pasting into Arena or Moxfield to test (desktop). |
| C4 Retire or delete deck | 0.3–0.5 | 20 : 80 | A few decks a year are rotated out. Bulk edit (tags, printings, proxies) about 2/month, mostly desktop. |
| C5 Back and return on phone | 15–30 | 95 : 5 | Every phone session involves card detail, then Back, several times. |
| C6 Sync after pulling cards | 3–5 | 70 : 30 | After each build or upgrade and after swaps at the table. Usually done standing at binders, so phone. |

## 3. How each app defines "owned", "available", "in decks" and "collection value"
| App | Owned | Available | In decks | Collection value |
|---|---|---|---|---|
| **Archidekt** | Collection records. A green stripe means the exact edition is in the collection, blue means a different edition ([rep] AK-stripe). | **Not computed.** The developer calls it too slow; the request was archived Aug 2023 (AK-inuse, AK-tracker). | The "In decks" tab lists decks that play the card, all deck categories unless "Exclude maybeboards" is set; edition matching is optional (AK-v2pp, AK-indecks). A card in multiple categories shows once (AK-multisel). | Purchase price on records exists ([doc] AK-v2pp); the valuation rule is not documented. |
| **Moxfield** | Collection quantity; decks can show only collection cards ([doc] MX-road, Oct 2023). | **Not computed.** "Strict Assignment" is in progress ([doc] MX-road; [rep] MX-2554). | No documented per-card deck list for the collection (MX-331, MX-2554). | Not documented in sources I could reach. |
| **ManaBox** | Cards in **binders** ("designed for cards you own") plus cards in **registered decks**. Lists are not owned ([doc] MB-cfaq). | Implicit: a copy whose location is a binder. Building moves copies, so a copy is either in a binder or in one deck ([doc] MB-cdeck). | Location = Deck, only for decks "registered in the collection" ([doc] MB-dfaq, MB-cdeck). | Market price; the +/- % change is against purchase price, which defaults to the price on the day added. **Proxies excluded** in registered decks ([doc] MB-cfaq, MB-dfaq). |
| **Deckbox** | Inventory count. | Not a column. Inventory minus *built*-deck usage has been requested since 2010 ([rep] DB-495, DB-avail). | "Decks Count" column. Only **built** decks plus sideboard count; scratchpad and idea decks don't ([rep] DB-31112, DB-avail). | Not covered in these sources. |
| **MythicHub** | Copies on a binder entry, and totals across printings ([doc] MH-usage, MH-status). | **Not defined** ([doc] MH-usage). The closest is the badge "Have enough (X/Y)" / "Need N more", scoped to that binder entry. | Deck usage: all occurrences "regardless of its role", split into exact vs different printing ([doc] MH-usage). | Deck price excludes proxies; a toggle shows the full price ([doc] MH-status). |
| **Mythic Tools** | Cards in boxes and binders. Lists (Bulk / Trade / Want) are separate ([doc] MT-web). | Implicit: "in your collection" vs "in another deck" vs "not owned" ([doc] MT-ios). | Linked to collection; in-deck cards can be hidden from containers ([doc] MT-ios). | "Live values in many currencies" ([doc] MT-web); method not documented. |

**Where they disagree (for our numbers spec):**
- **Does a deck card count as owned?**
  - ManaBox, Mythic Tools, Deckbox (built decks): yes, as a location of an owned copy.
  - Archidekt and Moxfield: decks are separate lists that only *match against* the collection, so "owned" double-counts across decks.
- **Which decks claim copies?**
  - Deckbox: built only.
  - ManaBox: registered only.
  - Archidekt: all decks, and maybeboards unless excluded.
  - MythicHub: all roles.
- **Printing match:** exact printing or edition vs any printing differs by app and by toggle (Archidekt "Exact edition match", ManaBox match rules, MythicHub exact vs different).
- **Proxies:**
  - Excluded from value in ManaBox (registered decks only) and MythicHub (deck price, togglable).
  - Not documented elsewhere.
- **Value:**
  - ManaBox shows change against purchase price, defaulting to the price on the day added.
  - Others show market totals.
  - CSV transfers drop prices entirely (SCR).

## 4. Five design rules for multi-deck management and safe actions
1. **Every physical copy has exactly one home, and "available" is a first-class number.**
   - Show it as `Owned 1 · In decks 1 (Kinnan) · Free 0` on Card detail and in deck-builder suggestions.
   - Evidence: the most-requested missing feature on Archidekt, Moxfield and Deckbox (AK-inuse, AK-tracker, MX-2554, MX-331, DB-avail, DB-495). ManaBox and Mythic Tools solve it with location-based models (MB-cdeck, MT-ios).
2. **Decks have an explicit claim state: Idea (claims nothing), Built (claims copies), Retired (releases copies, keeps the list).** Make the state visible on the Decks list.
   - Evidence: Deckbox's idea/built split (DB-31112). Archidekt users delete decks to un-clutter counts (AK-toggle). ManaBox "Disassemble" keeps the list (MB-cdeck).
3. **A contested move is a reviewable, per-card decision that leaves a trace.**
   - The Shared cards screen shows both decks. "Move to Deck B" leaves a ghost in Deck A ("Sol Ring moved to Deck B, needs replacement"), and the source deck's Missing list updates.
   - Every move gets a visible Undo and lands in the deck history.
   - Evidence: MX-2498 (move vs copy, ghost), MB-cdeck (diff before commit, but bulk moves out of other decks), AK-deckms (Recent Changes).
4. **Nothing destructive without recovery, and bulk actions say exactly what they did.**
   - Deck delete goes to Trash, with restore that brings back the deck and its card claims.
   - Bulk edits show "Changed 37, skipped 3 (no foil printing)".
   - "Select all" means all matching items, not the loaded page.
   - Evidence: AK-multisel (page-only select-all, silent skips, no undo described), MH-bulk (no delete confirmation described), MT-ios (restore deleted box), MX-2617 (snapshots).
5. **Phone state is durable: URL-encoded filters, search, sort and tab; drafts autosaved locally; "Saved" always visible.**
   - Back returns to the same scroll position and query. Unsaved deck edits survive reload and tab discard.
   - Evidence: MX-2520 (search cleared after add), AK-autosave (undo lost on refresh, opt-in autosave), AK-v2pp and AK-search (keep grid context, tabs remembered per device), MB-ios review (home-tab confusion).
