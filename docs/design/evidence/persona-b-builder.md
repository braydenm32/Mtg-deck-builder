# Persona B: "Kitchen-table builder". Simulated competitor sessions

> **Evidence label: SIMULATED / QUALITATIVE.** None of this comes from real users of our app, and none of it is analytics. Each session is reconstructed from public vendor docs, feature boards, forum threads and app-store listings that were read on 2026-11-15. Tap counts, times and time shares are **estimates [inf]**. The only figures quoted from sources are those printed on the vendor pages that were read (for example EDHREC deck counts and the App Store rating line). Nothing else is invented.
>
> Tags: **[doc]** = documented by the vendor or visible on the vendor's own page · **[rep]** = reported by users (URL given) · **[inf]** = my inference, with the reason.
>
> Research limits: Moxfield.com was not fetched, as instructed. moxfield.nolt.io and the GitHub wiki mirror were used instead. Reddit threads were mostly blocked by bot checks, so only the readable mirror pages are cited. The web-fetch budget ran out near the end, so a few items rest on search snippets or titles only, and they are marked as such. Where this log says "not found in docs", that means the material that was read did not mention the feature. It does not prove the app lacks it.

## Persona recap
- Their collection lives in **Mythic Tools** (iOS). Its App Store listing describes: a collection with value estimates; a scanner; deck lists; "deck analysis, mana base tools, and deck folders"; EDHREC card recommendations; CSV and TXT exports, including a "cards to fetch" list split into owned and needed; and "Why this bracket?" explanations [doc] https://apps.apple.com/app/id1669698500. One reviewer writes "Deck building can feel a bit complicated and I wish there was a way to buy the missing cards like in mana box" [rep] (same URL). The listing shows 4.8 out of 5 from 3.8K ratings, as printed on the page.
- Persona B builds on a laptop and tweaks on a phone at the local game store (LGS). They care about deck health (lands, curve, ramp, draw, removal), brackets and Game Changers.
- **Every app except Mythic Tools needs the collection imported first.** That is a hidden Task 0 in front of B1, B2 and B5. Moxfield users call the "scan in one app, move the list to Moxfield" flow "cumbersome" [rep] https://moxfield.nolt.io/1105.

---

## B1: Pick an owned commander and a theme, then build 100 cards mostly from owned cards

### B1 · EDHREC · desktop · build from owned
- **Path** [inf: rebuilt from [doc] page structure]
  1. Home, then search for the commander: 2 clicks plus typing.
  2. Commander page. Tabs: "Card Recs, Charts, Combos, Similar Commanders, Average Deck, and Decks" [doc] https://edhrec.com/articles/changelog-edhrec-redesign
  3. Set the theme with the Tag filter, which sits next to the Bracket and Budget filters "in the featured area, at the top of the page" [doc] (same URL): 2 clicks.
  4. Scroll the section list. On The Ur-Dragon / Upgraded / Dragons page that meant 12 sections and roughly 155+ cards before the content cut off: New Cards 5, Top Cards 10, Creatures 50, Instants 23, Sorceries 20, Utility Artifacts 10, Enchantments 24, Battles 1, Planeswalkers 7, then Utility Lands, Mana Artifacts and Lands [doc, page observed] https://edhrec.com/commanders/the-ur-dragon/upgraded/dragons
  5. Click "+" on each card you own to add it to the Clipboard, which is "cached on your device" and exportable as text or to certain deck-building apps [doc] https://edhrec.com/guides/how-to-use-edhrec. This takes about 60–90 clicks, and the user has to check ownership from memory or by switching to Mythic Tools.
  6. Export the clipboard to a deck builder, because EDHREC does not hold decks: 2–3 clicks.
- **Total**: about 70–100 clicks and 45–75 min [inf]. Most of the time goes on checking ownership in another app.
- **Our screens touched**: Commander picker 5%, Theme picker 5%, Deck builder (suggestions) 75%, Export 5%, and Collection (as the external lookup) 10% [inf].
- **Friction**
  - hidden-data (sev 3): EDHREC has no collection or ownership feature. The guide's closest feature is the clipboard [doc] https://edhrec.com/guides/how-to-use-edhrec, and the FAQ does not mention collections [doc] https://edhrec.com/faq. A third-party browser extension exists to show "which cards you own" while browsing EDHREC [rep] https://fccmtgdev.github.io/collectionlens. People building workarounds is evidence the gap is real.
  - clutter/ads (sev 2): one commander page holds 12 sections and 155+ card tiles. A Patreon banner reads "remove ads for only $2/month" [doc] https://edhrec.com/commanders/the-ur-dragon/upgraded/dragons. The ad slots themselves were stripped by the fetcher, so their count and position on phone are **unknown**.
  - phone-unfriendly / hover-only (sev 2, desktop sev 1): the "+" appears "when hovering over a card" [rep] https://draftsim.com/how-to-use-edhrec/. EDHREC itself had to slow tooltips down because hover tooltips were "pretty annoying" [doc] https://edhrec.com/articles/changelog-redesign-follow-up
  - clutter (sev 1): after the redesign, card tiles were too big and the team shrank them back "much closer to what they were pre-redesign" [doc] https://edhrec.com/articles/changelog-redesign-follow-up
- **Copy-worthy**: Bracket, Budget and Tag filters at the top, each bracket option showing its deck count (Exhibition 5 · Core 122 · Upgraded 402 · Optimized 384 · cEDH 17) [doc] https://edhrec.com/commanders/the-ur-dragon/upgraded/dragons. A lock icon that saves sort and filter settings per device [doc] https://edhrec.com/articles/edhrec-just-got-an-upgrade. Group By mana value, rarity or price [doc] (same URL).
- **One-glance test**: **N**. The page answers "what do other people play". It never answers "what do *I* own that fits", and no next action is marked as the primary one.

### B1 · Moxfield · desktop · build from owned
- **Path** [inf]
  1. Export the Mythic Tools collection as CSV, then import it into the Moxfield collection: about 8 taps and clicks, 5–10 min. This is a one-off, but it has to be redone whenever the collection changes.
  2. Create a deck, choose format Commander, set the commander: about 5 clicks.
  3. Search cards with Scryfall syntax [doc] https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features and add them. The deck view shows ownership against the viewer's own collection: "they'll see whether they own any cards in any decks that they view" [rep, user reply] https://moxfield.nolt.io/998
  4. Park candidates in the maybeboard [doc] (wiki URL above), tag roles with deck tags (global or per-deck tags, drag-to-tag in Visual view) [doc] (same).
  5. Cut down to 100.
- **Total**: about 120–180 clicks, 60–90 min, plus 10 min of import [inf].
- **Our screens**: Import 10%, Commander picker 3%, Deck builder 60%, Deck list/editor 25%, Deck overview 2% [inf].
- **Friction**
  - hidden-data / number-mistrust (sev 3): Moxfield does not show whether an owned copy is already used in another deck. "Collection Availability Tracking Across Decks" (for example, "1 of 3 available") was closed and merged into "Add Strict Assignment to Collections" (#776) [rep] https://moxfield.nolt.io/2554. A long-running request to exclude cards already in decks from search was the "3rd highest voted request" [rep] https://moxfield.nolt.io/331
  - number-mistrust (sev 2): there is no way to flag "definitely in". One user raises the card's quantity to 2 as a marker, which "throws off deck count" [rep] https://moxfield.nolt.io/2451
  - onboarding-gap (sev 2): the collection has to be imported from the scanner app, which users call "cumbersome" [rep] https://moxfield.nolt.io/1105
  - dead-end (sev 2): users get to "101+ cards and struggle to cut back" [rep] https://lr.in.psf.lt/r/EDH/comments/1fv56a9/i_know_theres_edhrec_but_what_about_edhcuts. This is generic, but it hits hardest in builders that have no keep/cut state.
- **Copy-worthy**: global plus per-deck tags as roles. A History page that logs every card change [doc] https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features. A maybeboard.
- **One-glance test**: **N** for this persona. The builder starts from search, not from "your owned cards that fit this commander". [inf: no documented owned-first suggestion surface]

### B1 · Archidekt · desktop · build from owned
- **Path** [inf, from [doc] features]
  1. Import the collection CSV: one-off, 5–10 min.
  2. New deck, then the commander: about 5 clicks. A sandbox works without an account [doc] https://edhrec.com/guides/how-to-use-archidekt-the-mtg-deckbuilding-site
  3. Left panel, "EDH Recs" tab: "Clicking this will send off the cards in the current deck to EDHREC" and returns recommendations you can add [doc] https://edhrec.com/articles/archidekt-and-edhrec-announce-partnership
  4. Add cards. Search results show "if a card found in search is already in your deck" or in the deck "but with a different printing" [doc] https://archidekt.com/news/20605672. Green and blue corner ribbons show collection status [doc, staff comment] (same URL).
  5. Categorise. Cards are grouped by primary category [doc] (guide URL), and oracle tags such as `otag:removal` can be applied as main or secondary categories [doc] https://websockets.archidekt.com/news/24799503
  6. Landbase tab for on-identity lands [doc] (guide URL).
- **Total**: about 100–150 clicks, 45–75 min [inf]. Recs and ownership appear together in one editor.
- **Our screens**: Import 10%, Commander picker 3%, Deck builder 55%, Deck list/editor 27%, Deck overview 5% [inf].
- **Friction**
  - number-mistrust / silent-data-loss (sev 3): green means "in your collection" with an exact edition and blue means a different printing. A card already used in another deck still shows green, and one user says this confusion led them not to export a card they actually needed to buy. A respondent states "There is no mechanism to track the amount of cards being used in decks" [rep] https://archidekt.com/forum/thread/18014247
  - hidden-data (sev 2): a request for "in-use" versus "available" banners got the reply that it is too slow to compute on the fly; users are pointed to the "In decks" and "collection records" tabs instead [rep] https://websockets.archidekt.com/forum/thread/15420664
  - duplicated-controls (sev 1): ownership appears as ribbons, search badges, an "In decks" tab and a "Collection records" tab [doc] https://archidekt.com/news/6801001. That is four places for one question [inf].
- **Copy-worthy**: recommendations live **inside** the editor, sent from the current deck, plus a Landbase tab and oracle-tag roles.
- **One-glance test**: **Y/partial**. The EDH Recs tab is a clear next step, but owned recs are not ranked first [inf: no documented owned-only filter on the Recs tab].

### B1 · ManaBox · phone · build from owned
- **Path** [doc steps from https://manabox.app/guides/decks/getting-started/]
  1. Decks tab, new deck: enter a name and format Commander (about 4 taps).
  2. The empty "Commander" section; commanders can only be added from there (about 3 taps plus typing).
  3. Search, with a collection filter that "limits results to cards in your collection binders", then "+" on each tile (about 2 taps per card, around 200 taps in total).
  4. EDHREC recommendations sit in "the collapsible arrow menu on the deck screen", Commander only [doc] https://manabox.app/guides/decks/faq/
  5. Basic lands: a collapsible menu "can autofill lands based on the mana needed" [doc] (getting-started URL).
  6. "Build from collection" moves the actual copies from binders into the registered deck [doc] https://manabox.app/guides/decks/collection-decks/
- **Total**: about 220–300 taps, 60–90 min on a phone [inf]. It is feasible but long for a 100-card build on a small screen.
- **Our screens**: Commander picker 3%, Deck builder 60%, Deck list/editor 25%, Shared cards 7%, Deck overview 5% [inf].
- **Friction**
  - onboarding-gap (sev 2): the collection is in Mythic Tools, so the user would have to re-scan or import into ManaBox [inf: two separate apps].
  - phone-unfriendly (sev 2): adding about 100 cards one search at a time on a phone [inf].
  - dangerous-action-no-undo (sev 2): "Build" moves cards out of their binders, and the docs describe no undo or warning. Disassembling returns the cards to a destination you choose [doc] https://manabox.app/guides/decks/collection-decks/. An undo is [inf]-absent; the docs simply do not mention one.
- **Copy-worthy**: auto-filling basics from the pips of the non-land cards. **Build from collection** treats owned copies as physical objects and says which binder or deck each one is in [doc].
- **One-glance test**: **Y**. The empty Commander section, search and "+" are obvious. The recommendations are tucked behind a collapsible arrow [doc], so suggestions are not the first thing the user sees.

---

## B2: Which recommended cards am I missing, and what would they cost?

### B2 · ManaBox · phone · missing cards
- **Path** [doc] https://manabox.app/guides/decks/missing-cards
  1. Open the deck, tap the collection icon: 2 taps.
  2. Review the **Missing** section (partially missing and missing) and the **Available** section (exact versions or "other versions").
  3. Settings: which boards, basics and proxies count; "Use specified versions"; "Look in other decks"; "Allow proxies" (3–6 taps).
  4. Export: long-tap the *Missing* header and copy to a List, or Share with the *Missing cards* filter [doc] https://manabox.app/guides/decks/faq/
  5. Price: the third tab shows total value from a chosen provider, with boards, basics or tags excluded, and can "purchase the filtered cards" [doc] https://manabox.app/guides/decks/getting-started/
- **Total**: about 10–15 taps, 3–5 min [inf].
- **Our screens**: Missing cards 60%, Shared cards 15% ("look in other decks"), Deck overview (price) 20%, Export 5% [inf].
- **Friction**
  - looks-clickable-not / hidden gesture (sev 2): the export is behind a **long-tap on a section header** [doc]. Nothing visible offers it [inf].
  - number-mistrust (sev 2): the missing count changes with three match toggles, and the docs do not say what the default for "Look in other decks" is [doc gap] (missing-cards URL).
  - number-mistrust (sev 2): the price tab totals "filtered cards" from a chosen provider. It is unclear whether that total is for missing cards only or the whole deck unless filters are set [inf from doc wording].
- **Copy-worthy**: a two-bucket Missing/Available split, with "partially missing" as its own state and "Other versions" kept separate [doc]. Mythic Tools users ask for exactly this ("buy the missing cards like in mana box") [rep] https://apps.apple.com/app/id1669698500
- **One-glance test**: **Y**. Missing comes first, but the export and buy actions are hidden.

### B2 · Archidekt · desktop · missing cards plus cost
- **Path** [doc] https://websockets.archidekt.com/news/24799503
  1. Deck page: hover or tap the deck price to open an overlay with multiple vendors. Options include "cheapest edition, excluding basics, excluding cards in collection" (2–4 clicks).
  2. Breakdown by category and price range, plus tabs for buying and selling and for optimising printings.
  3. Archidekt "shows you two price sources for comparison" [doc] https://edhrec.com/guides/how-to-use-archidekt-the-mtg-deckbuilding-site
  4. Missing *recommended* cards come from the EDH Recs tab (B1). Their price is shown per card, not as a "missing recs" total [inf].
- **Total**: about 6–10 clicks, 3–5 min [inf].
- **Our screens**: Deck overview (price) 50%, Missing cards 40%, Export 10% [inf].
- **Friction**
  - silent-data-loss (sev 3): "excluding cards in collection" uses the same ownership logic that does not account for copies already in other decks. The real shopping list can therefore be too short [rep] https://archidekt.com/forum/thread/18014247
  - hover-only (sev 1 desktop, 2 phone): the overlay opens on "tapping or hovering" the price [doc]. Discoverability is low [inf].
- **Copy-worthy**: price toggles stated in plain words ("cheapest edition", "excluding basics", "excluding cards in collection") [doc].
- **One-glance test**: **N**. The price looks like a label. Nothing says it is the entry point to a shopping list [inf].

### B2 · Moxfield · desktop · missing cards plus cost
- **Path** [doc/inf]
  1. Open the deck. Owned or unowned shows against your collection [rep] https://moxfield.nolt.io/998
  2. Buy button. The Mana Pool integration sends the deck to Mass Entry: choose "Any Printings" or "Exact Printings", then the Cart Optimizer (lowest price, fewest packages, or balanced) [doc partner] https://manapool.com/library/platform/2025/05/30/moxfield-manapool-integration.html
  3. Remove owned cards from the cart by hand with Replace/Modify [inf: the article does not say owned cards are excluded].
- **Total**: about 10–25 clicks, 5–10 min [inf].
- **Our screens**: Missing cards 50%, Deck overview (price) 20%, Export 30% [inf].
- **Friction**
  - number-mistrust (sev 2): prices exist for USD, EUR and tix, normal and foil, across TCGPlayer, CardMarket and CardHoarder [doc] https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features. The deck total depends on which printing and source is picked [inf].
  - hidden-data (sev 2): no documented "missing only" view. A request to compare a deck to the collection "to see which cards they have or are missing" was closed with no visible outcome [rep] https://moxfield.nolt.io/756
- **Copy-worthy**: the explicit **Any versus Exact printing** choice before money is spent [doc].
- **One-glance test**: **N/unclear**. Not verified, since moxfield.com could not be fetched.

### B2 · EDHREC · not supported
EDHREC has no ownership data [doc absence]. It shows per-card prices (for example Card Kingdom and TCGplayer) and a Budget filter (Any / Inexpensive / Expensive) [doc] https://edhrec.com/commanders/the-ur-dragon/upgraded/dragons. The Average Deck page shows no total price [doc] https://edhrec.com/average-decks/the-ur-dragon/core. **Not supported** for "missing and cost".

---

## B3: Deck health. Lands, curve, ramp/draw/removal, bracket and Game Changers, colour identity

### B3 · Moxfield · desktop · deck health
- **Path**
  1. Deck page, Stats/Analysis: mana curve, curve per colour, "average CMC with and without lands", average lands in the opening hand, percentage of playing cards on curve [doc] https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features (2–3 clicks).
  2. Role counts (ramp, draw, removal) come from the user's own tags [doc] (same URL). There is no automatic role count in the docs that were read [inf].
  3. Bracket: Moxfield shows an automatic bracket identifier; Draftsim says Moxfield and EDHREC "have also included tools to identify Game Changers" [rep] https://draftsim.com/mtg-edh-game-changers/
  4. Colour identity: "format rules are enforced automatically" [doc] (wiki URL).
- **Total**: about 5–8 clicks, 3–5 min if tags already exist; 20+ min to tag 99 cards by hand [inf].
- **Our screens**: Deck overview 80%, Deck list/editor 20% [inf].
- **Friction**
  - number-mistrust (sev 2): users report "Every single deck i have in moxfield is rated 2, which they obviously arent" and "All my decks are apparently 2s according to moxfield". The original poster's deck was labelled "bracket 2 (precon level) even though it can win on turn 4 or 5" [rep] https://reddit.birdcat.cafe/r/EDH/comments/1inf3rv/psa_your_powerful_decks_that_happen_to_not_have. A follow-up thread is titled "Changes to Moxfield's Bracket Identifier - quick updates show they're listening to feedback" [rep, title only] https://redlib.hbubli.cc/r/magicTCG/comments/1iolvus/changes_to_moxfields_bracket_identifier_quick
  - onboarding-gap (sev 2): role counts need manual tagging [inf].
- **Copy-worthy**: average mana value **with and without lands**, shown side by side so the definition is visible. "Average lands in opening hand" as a health number people can feel.
- **One-glance test**: **Y** for curve and lands. **N** for roles, because those depend on tags.

### B3 · Archidekt · desktop · deck health
- **Path**
  1. Categories view: counts per category, such as Ramp, Draw and Removal when cards are categorised [doc] https://edhrec.com/guides/how-to-use-archidekt-the-mtg-deckbuilding-site. Oracle tags can apply categories [doc] https://websockets.archidekt.com/news/24799503
  2. Combos tab: "can help you tailor your deck's bracket level" [doc] (guide URL).
  3. Salt Sum, the total of the cards' salt scores [doc] https://edhrec.com/guides/how-to-use-edhrec
  4. Price overlay, as in B2.
- **Total**: about 4–8 clicks, 3–6 min if categorised [inf].
- **Our screens**: Deck overview 70%, Deck list/editor 30% [inf].
- **Friction**
  - hidden-data (sev 2): no bracket or Game Changer counter appears in the Archidekt material that was read. The bracket guidance points only to the Combos tab [doc gap].
  - number-mistrust (sev 1): Salt Sum is a sum, so it grows with deck size and can be confused with EDHREC's per-card 0–4 average [inf from the definitions].
- **Copy-worthy**: categories double as role counts. Oracle-tag shortcuts make categorising quick.
- **One-glance test**: **Partial**. Categories are a strong summary, but no single health panel exists [inf].

### B3 · ManaBox · phone · deck health
- **Path** [doc] https://manabox.app/guides/decks/getting-started/
  1. Deck screen, stats section: mana value curve, mana production, mana cost distribution, types distribution, tokens produced (2 taps).
  2. A custom mana value per card is available (unlock the deck, then the three-dot menu, then "Custom mana value") [doc] https://manabox.app/guides/decks/faq/
  3. Opening-hand and draw simulator at the bottom of the third tab [doc].
- **Total**: about 3–6 taps, 2–3 min [inf].
- **Our screens**: Deck overview 100% [inf].
- **Friction**
  - hidden-data (sev 2): ramp, draw and removal counts, brackets and Game Changers are not in the ManaBox docs that were read [doc gap].
  - number-mistrust (sev 1): a custom per-card mana value means ManaBox's curve may not match other apps for the same list [inf from doc].
- **Copy-worthy**: "mana production" against "mana cost distribution", which answers whether the sources match the pips.
- **One-glance test**: **Y** for curve. **N** for roles and bracket.

### B3 · EDHREC · partial (reference only)
EDHREC shows no health check for *your* deck. The Average Deck page does give a reference: 100 cards including the commander, 37 lands, and counts by type (for example Creatures 33, Instants 5) [doc] https://edhrec.com/average-decks/the-ur-dragon/core. Brackets map as Exhibition (1), Core (2), Upgraded (3), Optimized (4), cEDH (5). Brackets 1–2 allow "No Game Changers" and Bracket 3 allows "Up to three Game Changers" [doc] https://edhrec.com/guides/edhrec-guide-to-commander-brackets. **Mythic Tools** advertises "Why this bracket?" explanations [doc] https://apps.apple.com/app/id1669698500. That is the only explained-bracket feature found.

---

## B4: Swap 3 cards on the phone at the store just before a game

### B4 · ManaBox · phone · swap 3
- **Path** [doc/inf]
  1. Decks, open the deck (2 taps). It may need unlocking for edits; "Unlock the deck" is mentioned for custom mana value [doc] https://manabox.app/guides/decks/faq/
  2. Long-press a card to bulk select, then move it to another board with ↑↓ [doc] (same URL), or remove it. About 3 taps per card out.
  3. Search, then "+" for each card in: about 3 taps per card.
  4. If this is a built (collection) deck, commit through the collection deck button, which shows "which cards are still in the deck and which ones need to be removed" [doc] https://manabox.app/guides/decks/collection-decks/
- **Total**: about 20–25 taps, 2–4 min [inf].
- **Our screens**: Deck list/editor 75%, Shared cards 15% (moving physical copies), Collection 10% [inf].
- **Friction**
  - looks-clickable-not / hidden gesture (sev 2): multi-select is long-press only [doc] (FAQ URL).
  - dangerous-action-no-undo (sev 2): committing to a built deck moves copies between binders and decks, and no undo is documented [doc gap/inf].
- **Copy-worthy**: a native app that is fast to open. The commit step is an explicit diff showing what to physically pull [doc].
- **One-glance test**: **Y**. The list, search and "+" are standard. The swap is not a single "replace" action, though [inf].

### B4 · Archidekt · phone (PWA) · swap 3
- **Path** [doc/inf]
  1. Open the home-screen web app. There is no native app, only "Chrome on Android, and Safari on iOS" installs, and "no plans" for a native app [doc] https://archidekt.com/app
  2. Deck page. The mobile deck page UI was overhauled six months ago [doc, post title] https://www.archidekt.com/news
  3. Tap a card to open details ("clicking anywhere on the card that isn't a button") or use the three-dot menu, then remove or move it to the maybeboard [doc] https://archidekt.com/news/20605672. About 3 taps per card.
  4. Search, then add: about 3 taps per card. Autosave [doc, post title "New Views and the Reign of Autosave"] https://archidekt.com/news/3189294
- **Total**: about 20–25 taps, 3–5 min on a good connection [inf].
- **Our screens**: Deck list/editor 90%, Deck overview 10% [inf].
- **Friction**
  - rage-click-trap / phone-unfriendly (sev 3): "If I scroll at more than a snails pace on IOS the site will keep crashing". A second user hits it while removing cards from the sideboard or maybeboard, which is exactly the B4 action. The staff-adjacent reply blames iOS 26 on older iPhones [rep] https://archidekt.com/forum/thread/20484182
  - phone-unfriendly (sev 2): reports include a dropdown hidden behind the search fields in the EDHRecs tab on mobile, and a long-press that opens a large menu instead of selecting [rep, comments] https://archidekt.com/news/20605672
  - hidden-data (sev 2): no documented offline mode [inf]. Store wifi is often poor, and Moxfield users ask for a PWA for "underconnected places" [rep] https://moxfield.nolt.io/1105
- **Copy-worthy**: autosave, so no Save button is needed at the table.
- **One-glance test**: **Y/fragile**. The action is clear, but the scrolling crash risk undermines it.

### B4 · Moxfield · phone (mobile web) · swap 3
- **Path** [inf]: open the browser, find the deck, edit mode, remove 3, search and add 3. About 25 taps, 3–5 min.
- **Our screens**: Deck list/editor 90%, Decks list 10% [inf].
- **Friction**
  - phone-unfriendly (sev 2): there is no Moxfield mobile app. Users say "I really miss the pleasant use of the site in mobile form", and the app request was merged into "Scan cards" [rep] https://moxfield.nolt.io/1294
  - onboarding-gap (sev 1): a separate scanner app is still needed. "only on Android" workaround [rep] https://moxfield.nolt.io/1105
- **Copy-worthy**: the History page means every swap is logged and can be traced [doc] https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features
- **One-glance test**: **Unknown**. Not verifiable without fetching moxfield.com.

### B4 · EDHREC · not supported (no deck storage).

---

## B5: Compare EDHREC's suggestions for a commander with what I own

### B5 · EDHREC (+ Recs) · desktop · compare with owned
- **Path**
  1. Recs page: "Import a partial or full decklist", commander required. "A commander alone returns that commander's average deck" [doc] https://edhrec.com/guides/how-to-use-edhrec. About 4 clicks plus pasting.
  2. Read the suggested adds and cuts. Cuts are "the cards least used for your commander among your list" [rep] https://lr.in.psf.lt/r/EDH/comments/1fv56a9/i_know_theres_edhrec_but_what_about_edhcuts
  3. Check each suggestion against Mythic Tools by hand. EDHREC cannot see it [doc absence]. With an extension, ownership can be overlaid [rep] https://fccmtgdev.github.io/collectionlens
  4. Sort by inclusion (the default), deck count, mana value, price, synergy or salt; cap the inclusion % "to find less-played cards" [doc] https://edhrec.com/articles/edhrec-just-got-an-upgrade
- **Total**: about 40–80 clicks, 30–45 min, mostly cross-checking [inf].
- **Our screens**: Deck builder (suggestions) 60%, Collection (external lookup) 35%, Export 5% [inf].
- **Friction**
  - dead-end (sev 3): "suggested and owned" cannot be answered on EDHREC [doc absence].
  - clutter/ads (sev 2): see B1.
  - number-mistrust (sev 2): the commander page tiles show "13% Inclusion / 15 Decks / 1 Lift" [doc] https://edhrec.com/commanders/the-ur-dragon/upgraded/dragons, while the long-known metric is "synergy" [rep] https://draftsim.com/how-to-use-edhrec/. The FAQ defines neither synergy nor lift precisely; it only says "inclusion and lift measure how often two cards are run together" [doc] https://edhrec.com/faq
- **Copy-worthy**: recommendations conditioned on the cards already in the deck (more cards in the 99 makes them "more specific") [doc]. The "potential decks" denominator respects colour identity, release date and active filters [doc] https://edhrec.com/faq
- **One-glance test**: **N**. There is no owned/not-owned split.

### B5 · Archidekt · desktop · compare with owned
- **Path**: deck editor, EDH Recs tab (sends the current deck to EDHREC) [doc] https://edhrec.com/articles/archidekt-and-edhrec-announce-partnership. Scan the results for green or blue ribbons [doc] https://archidekt.com/news/20605672. About 5–15 clicks, 10–15 min [inf].
- **Our screens**: Deck builder 85%, Card detail 15% [inf].
- **Friction**: number-mistrust (sev 3). Green means owned, not *available*, so a card used in another deck still reads as owned [rep] https://archidekt.com/forum/thread/18014247
- **Copy-worthy**: EDHREC recs inside the builder, with an ownership signal on the same tile.
- **One-glance test**: **Partial**. The ribbon exists, but recs are not filtered or sorted to owned first [inf].

### B5 · ManaBox · phone · compare with owned
- **Path**: deck screen, collapsible arrow menu, EDHREC recommendations for Commander decks [doc] https://manabox.app/guides/decks/faq/. Whether an ownership marker appears on recommended cards is **not documented**.
- **Our screens**: Deck builder 100% [inf].
- **Friction**: hidden-data (sev 2). Recommendations sit behind a collapsed control [doc].
- **One-glance test**: **N**. Collapsed by default [doc wording "collapsible arrow menu"].

### B5 · Moxfield · not documented
No EDHREC recommendation panel turned up in the Moxfield sources that were read. [inf] The persona would use EDHREC in a second tab.

---

## Summary

### 1. Top 10 friction patterns (ranked by severity × how often they hit Persona B) [synthesis]
| # | Pattern (type) | Sev | Freq for B | Evidence |
|---|---|---|---|---|
| 1 | "Owned" ignores copies already in other decks (hidden-data / number-mistrust) | 3 | every build, every shopping list | [rep] https://moxfield.nolt.io/2554 · https://moxfield.nolt.io/331 · https://archidekt.com/forum/thread/18014247 · https://websockets.archidekt.com/forum/thread/15420664 |
| 2 | Shopping list too short because of printing or ownership ambiguity (silent-data-loss) | 3 | each B2 | [rep] https://archidekt.com/forum/thread/18014247; ManaBox needs 3 toggles [doc] https://manabox.app/guides/decks/missing-cards |
| 3 | Recommendations site cannot see the collection (dead-end) | 3 | each B1/B5 | [doc absence] https://edhrec.com/faq; extension workaround [rep] https://fccmtgdev.github.io/collectionlens |
| 4 | Collection has to be moved from the scanner app into the builder (onboarding-gap) | 2 | every collection change | [rep] https://moxfield.nolt.io/1105 |
| 5 | Phone web editors crash or misbehave mid-edit (rage-click / phone-unfriendly) | 3 | most B4 | [rep] https://archidekt.com/forum/thread/20484182 · https://archidekt.com/news/20605672 · https://moxfield.nolt.io/1294 |
| 6 | Automatic bracket label not trusted, with no explanation (number-mistrust) | 2 | each B3 | [rep] https://reddit.birdcat.cafe/r/EDH/comments/1inf3rv/psa_your_powerful_decks_that_happen_to_not_have |
| 7 | Price totals with an unclear scope: printing, vendor, basics, owned (number-mistrust) | 2 | each B2 | [doc] https://websockets.archidekt.com/news/24799503 · https://manapool.com/library/platform/2025/05/30/moxfield-manapool-integration.html · https://manabox.app/guides/decks/getting-started/ |
| 8 | Long, cluttered recommendation pages (about 12 sections, 155+ tiles, ad-removal upsell) and hover-only "+" (clutter / hover-only) | 2 | each B1/B5 | [doc] https://edhrec.com/commanders/the-ur-dragon/upgraded/dragons · [rep] https://draftsim.com/how-to-use-edhrec/ |
| 9 | No keep/cut state; workarounds break the card count; the cut from 101 is painful (number-mistrust / dead-end) | 2 | each B1 | [rep] https://moxfield.nolt.io/2451 · https://lr.in.psf.lt/r/EDH/comments/1fv56a9/i_know_theres_edhrec_but_what_about_edhcuts |
| 10 | Key actions hidden behind long-press, long-tap on a header, a collapsed arrow or deck unlock (looks-clickable-not / onboarding-gap) | 1–2 | B2/B4/B5 on phone | [doc] https://manabox.app/guides/decks/faq/ |

### 2. Task frequency for Persona B (ESTIMATES [inf])
| Task | Times/month | Phone : desktop | Reasoning |
|---|---|---|---|
| B1 Build a new deck | 0.5–1 | 15 : 85 | Several decks already exist. New builds cluster around set releases. Planning happens on the laptop. |
| B2 Missing cards and cost | 1–3 | 40 : 60 | After each build, and again when an order or LGS visit is coming up. Checking prices at the store is a phone job. |
| B3 Deck health | 3–6 | 40 : 60 | After every edit session plus a pre-game bracket check, which is why the phone share is high. |
| B4 Swap 3 at the store | 2–4 | 95 : 5 | Weekly game nights, swapping on about half of them. Done under time pressure, often on poor wifi. |
| B5 EDHREC compared with owned | 1–2 | 30 : 70 | When starting or refreshing a deck, and after a set release. |

B3 and B4 are the most frequent tasks and are mostly on the phone. B1 and B5 are rarer, longer and on the desktop.

### 3. Numbers shown on deck screens (input for a numbers spec)
| Number | App(s) | Definition where documented | Disagreements |
|---|---|---|---|
| Deck card count | EDHREC Average Deck: 100 including the commander [doc] https://edhrec.com/average-decks/the-ur-dragon/core · Moxfield / Archidekt / ManaBox | Not documented in the material read for Moxfield, Archidekt or ManaBox | Whether the commander and maybe/sideboards count; Moxfield users inflate quantities as a marker [rep] https://moxfield.nolt.io/2451. The spec must say "100 = 99 + commander, maybeboard excluded". |
| Land count | EDHREC average: 37 including basics [doc] | Type count | Whether MDFCs and land-backed cards count as lands: not documented anywhere [inf]. |
| Avg mana value | Moxfield "with and without lands" [doc] https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features · ManaBox curve with a user-set "Custom mana value" [doc] https://manabox.app/guides/decks/faq/ | Moxfield gives both | Lands included or not; ManaBox overrides; whether the commander is included is undocumented. |
| Mana curve | Moxfield (also per colour) · ManaBox · EDHREC Charts tab [doc] | Bars by MV | Same caveats as avg MV. |
| Avg lands in opening hand; % on curve | Moxfield [doc] | Sample-hand based ("Sample Hands of 7 cards") | Only Moxfield. |
| Mana production vs cost distribution; type distribution; tokens | ManaBox [doc] https://manabox.app/guides/decks/getting-started/ | Distributions | Only ManaBox. |
| Role counts (ramp/draw/removal) | Archidekt categories, oracle tags [doc] https://websockets.archidekt.com/news/24799503 · Moxfield tags [doc] | User or community tagging | No app computes them automatically in the docs read, so counts depend on the tagger. |
| Deck price total | ManaBox: chosen provider, excluding boards, basics or tags [doc] · Archidekt: multi-vendor; "cheapest edition, excluding basics, excluding cards in collection"; two sources [doc] · Moxfield: USD/EUR/tix, normal/foil, TCGPlayer/CardMarket/CardHoarder [doc] · Mana Pool: Any vs Exact printings [doc] · EDHREC Average Deck: no total [doc] | Varies by toggle | Which printing, which vendor, whether basics and owned cards are included. **The biggest source of disagreement.** |
| Missing / partially missing / available / other versions | ManaBox [doc] https://manabox.app/guides/decks/missing-cards | Depends on "Use specified versions", "Look in other decks", "Allow proxies" | Archidekt green (exact edition) versus blue (other printing), with no count and no allocation across decks [rep]. Moxfield has no allocation across decks [rep]. |
| Inclusion % | EDHREC: "% of decks with the chosen theme containing the card" [rep] https://draftsim.com/how-to-use-edhrec/; shown as "13% Inclusion / 15 Decks" [doc] | Denominator is "potential decks": decks able to run the card (colour identity, release date), narrowed by the active Budget, Bracket and Tag filters [doc] https://edhrec.com/faq | Shifts with filters, so the same card shows different % on different filtered views. |
| Deck count (sample size) | EDHREC: per commander (e.g. 2,787 for Core average) and per bracket option [doc] | Number of decks in the sample | The page label does not always say which filter it applies to [inf]. |
| Synergy % | EDHREC: (% of commander/theme decks running it) minus (% of same-colour-identity decks running it) [rep] https://draftsim.com/how-to-use-edhrec/; still a sort option [doc] https://edhrec.com/articles/edhrec-just-got-an-upgrade | Third-party formula | EDHREC's own FAQ does not define it. |
| Lift | EDHREC tiles, e.g. "1 Lift", "0.74 Lift" [doc] | Only "inclusion and lift measure how often two cards are run together" [doc] https://edhrec.com/faq | Not defined against synergy. Users may read them as the same thing. |
| Salt | EDHREC per card: average of 0–4 annual survey votes [doc] https://edhrec.com/faq · Archidekt "Salt Sum" = total for the deck [doc] https://edhrec.com/guides/how-to-use-edhrec | Average vs sum | Same word, different scale. |
| Bracket | EDHREC label mapping: Exhibition 1 · Core 2 · Upgraded 3 · Optimized 4 · cEDH 5 [doc] https://edhrec.com/guides/edhrec-guide-to-commander-brackets · Moxfield automatic identifier [rep] · Mythic Tools "Why this bracket?" [doc] | EDHREC filter uses the deck's bracket (user-set per Draftsim [rep]); Moxfield goes by parameters | Automatic vs declared; users distrust automatic labels [rep]. Criteria changed in Oct 2025 (tutor restriction removed, Bracket 2 no longer "the precon bracket") [rep] https://draftsim.com/mtg-october-2025-commander-bracket-changes/ |
| Game Changer count | Moxfield and EDHREC identify them [rep] https://draftsim.com/mtg-edh-game-changers/ | Limits: B1–2 = 0, B3 ≤ 3 [doc] | The list changes (e.g. Food Chain and Deflecting Swat removed in Oct 2025) [rep], so counts must be versioned. |
| Combos | EDHREC Combos tab; Archidekt Combos tab "complete and partial" [doc] | n/a | Complete vs partial. |
| Views | Archidekt eyeball: "views by anyone other than the owner" [doc] | n/a | Not health-relevant. |

### 4. Five design rules for our deck building
1. **Ownership has four states and knows about other decks**: *free copy* / *owned but in deck X* / *owned, other printing* / *missing*. Printing-agnostic by default, with an exact-printing toggle. Every competitor gets this wrong or buries it: Moxfield #2554 and #331 [rep]; Archidekt "no mechanism to track... cards being used in decks" [rep]; ManaBox needs 3 toggles [doc]. This feeds our Shared cards screen directly.
2. **Every number explains its scope when tapped and states its defaults in words**: "100 = 99 + commander", "Avg MV 3.1 (no lands)", "$84 · cheapest printing · missing cards only · basics excluded". Price scope is where the apps disagree most (ManaBox, Archidekt and Mana Pool toggles [doc]), and users distrust numbers they cannot see the logic of (bracket reports [rep]).
3. **The bracket is an estimate with reasons, never a verdict**: list the Game Changers, combos and other triggers it found, version the GC list, and let the user set a declared bracket next to it. Moxfield's unexplained automatic "2" drew "every single deck... rated 2" [rep], Mythic Tools already ships "Why this bracket?" [doc], and the GC list changed in Oct 2025 [rep].
4. **Suggestions show owned cards first, grouped by role and kept short**: about 5–8 per role (ramp, draw, removal, theme, lands), each with an ownership state and one stat, then a separate "To buy" tab. EDHREC's page has about 12 sections and 155+ tiles with a hover "+" and no owned split [doc/rep], and someone built a browser extension just to add ownership [rep]. Archidekt shows that recommendations inside the editor work [doc].
5. **Phone edits are pair swaps (out → in) that can be undone, are logged, and work offline**, with no long-press-only actions. Archidekt mobile crashes while removing cards [rep]; ManaBox multi-select and export are long-press only [doc]; Moxfield users ask for a PWA for "underconnected places" [rep]; Moxfield's History page and Archidekt's autosave are the patterns to copy [doc].
