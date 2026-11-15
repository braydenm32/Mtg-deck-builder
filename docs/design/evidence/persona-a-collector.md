# Persona A: "Table-side collector" — simulated competitor sessions

> **Label: SIMULATED / QUALITATIVE evidence.** None of these sessions was run on a real device. Each one is reconstructed from public vendor docs, store listings, forum threads and feature boards, gathered 2026-11-15. Tap counts, times and time shares are **estimates** made by walking through the documented flow. They are not measurements. No analytics were available. Star ratings appear only where a store page showed them, and every quote below was found on the cited page. Reddit could not be fetched, and search snippets added nothing citable, so this log has no Reddit citations.

**Evidence tags:** `[doc]` = the vendor documents it · `[rep]` = users report it (URL given) · `[inf]` = my inference from how the flow works (reason given).

**Source caveats**
- MythicHub (mythichub.com) is a free web collection and deck app. Its importer lists "Mythic Tools" as a named source. Whether it is the same company as the **Mythic Tools** app (Studio Mythic, mythic.tools) is **not confirmed**. Neither site's pages that I read mention the other, so the two are treated as separate products here.
- game-solver.com and the Scrytics and SortSwift blogs are third parties. Scrytics and SortSwift sell competing apps. Store-review quotes from aggregators are tagged `[rep]` with the aggregator's URL.
- TCGplayer has two different scanning products. The consumer **TCGplayer app** is the one in scope. Seller-only Quicklist and "Scan & Identify" docs are cited only where they show the vendor's own pattern, and are marked as such.

**Persona recap.** The collection's source of truth is Mythic Tools (CSV export includes Scryfall ID and container name). They own a few thousand cards in boxes and binders and build several Commander decks from owned cards. They use the phone one-handed with cards in the other hand, at the kitchen table or the LGS, and a laptop for long sessions.

---

## A1 — Scan 30 freshly opened cards and save them to the collection

### A1 · ManaBox · phone · scan 30 cards
- **Path** (estimated ~28–40 taps, ~4–6 min for 30 cards on a plain background):
  1. **Home → Scan tab** (1 tap). The camera opens. Recognition is automatic, based on artwork. [doc] https://manabox.app/guides/scanner/getting-started/
  2. **Scan settings** (one-time, ~4 taps): lock the set to the booster's set, turn on Quick Mode ("the app will automatically select the first matching version"), and optionally turn on scan sound and the running value total. [doc] same URL
  3. **Bottom menu**: set foil/normal and language before each foil card (~1–2 taps per foil). [doc] same URL
  4. Hold each card in view; it auto-detects. A **single tap re-scans the same card** for duplicates (about 0 taps per card, plus 1 per duplicate). [doc] same URL
  5. **Session list** (top-right button, 1 tap): review the 30 rows. [doc] same URL
  6. **Save into a binder** (~2–3 taps). The page reminds you, "Don't forget to save your changes!" [doc] same URL. The exact save target UI is not documented [inf].
- **Our screens touched (estimated share of task time):** Scan 65% · Scan review 25% · Collection 5% · Settings 5% (set lock and Quick Mode).
- **Friction events**
  - *phone-unfriendly*, sev 2. Before a foil, the user must change the foil toggle in a bottom menu. With one hand holding cards, toggling each time adds reach and breaks the rhythm [inf: the per-card toggle is documented; the rhythm break is inferred from the one-handed posture]. https://manabox.app/guides/scanner/getting-started/
  - *number-mistrust*, sev 2. Recognition is by artwork, so a reprint with the same art lands on the wrong set unless the set is locked. A Play Store reviewer has to "manually change the set on each scan." [rep] The developer's reply points to "Lock Set." https://play.google.com/store/apps/details?id=skilldevs.com.manabox&hl=en_US
  - *phone-unfriendly*, sev 2. "Do not even bother scanning cards in sleeves" (Play Store review). [rep] same URL. This matters less for freshly opened cards.
  - *silent-data-loss*, sev 3. A Play Store reviewer reports "my entire collection has been wiped out," which meant a full rescan. The developer offered recovery by email. [rep] https://play.google.com/store/apps/details?id=skilldevs.com.manabox&hl=en_US
  - *silent-data-loss* risk, sev 2. Scans are only committed after an explicit save ("Don't forget to save your changes!"). Leaving the session or being interrupted before saving could lose the batch [inf from the documented reminder; I found no report of it happening]. https://manabox.app/guides/scanner/getting-started/
- **Copy-worthy:** a sticky **set lock** plus a **Quick Mode** auto-pick for booster-opening sessions. **Tap to repeat the last card** for duplicates. A running **session value total** with an "ignore under $1" option. [doc]
- **One-glance test:** Y for scanning, because the camera opens and auto-detects. N for saving, because the session list sits behind an unlabeled top-right icon and saving needs a reminder [inf].

### A1 · Mythic Tools · phone · scan 30 cards
- **Path** (estimated ~20–35 taps, ~4–5 min):
  1. **Home → Scanner** (1 tap). It "runs continuously, on your device." [doc] https://mythic.tools
  2. Cards "stack up in a running list with prices and a total." [doc] same URL
  3. Fix quantity, foil, condition, language and print "right in the list" without leaving the camera (~1–3 taps per foil or wrong card). [doc] same URL. Eleven card languages are supported. [doc]
  4. Choose a **scan action**: add to a box or binder. Version notes also mention remove-from-collection, move-between-boxes and check-deck-against-list actions. [doc] https://apps.apple.com/app/id1669698500
  5. Confirm (~2 taps).
- **Our screens touched:** Scan 70% · Scan review (inline list) 25% · Collection 5%.
- **Friction events**
  - *number-mistrust*, sev 2. A reviewer reports "Card scanner seems to struggle with darker borderless cards." [rep] https://apps.apple.com/app/id1669698500. Fresh boosters often include borderless cards.
  - *number-mistrust*, sev 2. After a second scan pass, "the price of the whole deck didn't update." The developer replied, "we will look into it." [rep] same URL
- **Copy-worthy:** the review list lives **in the same screen as the camera**, with inline edits for foil, language and print, so there is no mode switch. Scan **actions** (add, remove, move, check deck) reuse one camera for several jobs. A reviewer: "if it gets a set wrong it's easy to change which printing you have." [rep] same URL
- **One-glance test:** Y. One continuous camera with a growing list and a total makes the next action (keep scanning, then commit) obvious [inf from the documented layout].

### A1 · Dragon Shield MTG Scanner · phone · scan 30 cards
- **Path** (estimated ~45–70 taps, ~3–6 min; a blogger reports "as many as 17 cards per minute"):
  1. **Home → create or pick a named folder** (~3 taps). [rep] https://dorcishlibrarian.blogspot.com/2022/08/dragon-shield-mtg-card-manager.html
  2. **Scan**: the app identifies the card from its picture. The user "confirms or corrects the details before saving" each card (~1–2 taps per card). [rep] same URL
  3. Foils: "just be sure to sort out foils into a separate pile." [rep] https://game-solver.com/mtg-scanner-dragon-shield/
  4. The cards save into the folder.
- **Our screens touched:** Scan 55% · Scan review (per-card confirm) 40% · Collection 5%.
- **Friction events**
  - *number-mistrust*, sev 3. "The scan is so insanely fast that it often scans incorrectly"; "it's terrible at selecting the correct version." [rep] https://apps.apple.com/app/id1460657155
  - *rage-click-trap*, sev 2. "it'll get completely stuck on one card"; "recognize a black card in low light as the card Savanna." [rep] https://game-solver.com/mtg-scanner-dragon-shield/
  - *silent-data-loss*, sev 3. A reviewer adds cards to folders and "it will act as if it went through, only to not show up in the collection." [rep] https://apps.apple.com/app/id1460657155. Others: "Too bad it deletes all of the hard work we did scanning all of our cards… We backed up our cards and thats gone too." [rep] https://game-solver.com/mtg-scanner-dragon-shield/
  - *hidden-data*, sev 2. Foil glare: "Horrible filter over foil cards making previews difficult to read." [rep] same URL
- **Copy-worthy:** **name folders after their physical location** ("Names that will tell you exactly where to find the card… six months from now"). [rep] Blogger URL above. Very fast throughput.
- **One-glance test:** N. Speed outruns accuracy, so the user is unsure whether to trust the auto-pick or stop and check each card [rep-based inference].

### A1 · TCGplayer app · phone · scan 30 cards
- **Path** (estimated ~35–55 taps, ~5–7 min):
  1. **Settings → close** to reach the **Scan** tab. "Return to Settings and the Close in order to open the Scan tab." [doc] https://help.tcgplayer.com/hc/en-us/articles/23531246396183-How-to-Setup-and-Use-the-TCGplayer-App-for-Card-Scanning
  2. **Collection tab → create a list or collection** to scan into. Saved collections need an account and a login. [doc] same URL; https://help.tcgplayer.com/hc/en-us/articles/115009506407-TCGplayer-App-FAQ
  3. Scan over a white background "around 6-8 inches away." Foil can be tagged "before or after you scan." [doc] same URLs
  4. "Carefully review the cards after scanning each… the amount, set, foiling, condition, and language" (~1–3 taps per card). [doc] setup URL
- **Our screens touched:** Settings 5% · Collection (create a list first) 10% · Scan 50% · Scan review 35%.
- **Friction events**
  - *onboarding-gap*, sev 2. The user has to make a list before scanning has anywhere to go, and "the app does not require an account," but collections do. [doc] FAQ URL
  - *number-mistrust*, sev 2. "The app primarily focuses on the artwork of the card to identify," so same-art printings mis-set. [doc] FAQ URL
  - *rage-click-trap*, sev 1. "The scanner will scan random objects if not pointed directly at the card." [rep] https://apps.apple.com/gb/app/tcgplayer/id1247645833
  - *clutter/ads*, sev 1. The listing says "Contains Advertising," and the scan flow is tied to marketplace product matches. [doc] same URL; https://scrytics.com/blog/best-mtg-card-scanner-app-2026
- **Copy-worthy:** an explicit **"review amount, set, foiling, condition, language"** checklist. **Foil can be tagged before or after** the scan. A **"+ Add a card manually"** escape hatch on the scan screen. [doc]
- **One-glance test:** N. Getting to Scan needs a Settings detour and a list created first [doc].

---

## A2 — Fix a mis-scan (wrong printing, foil or language)

### A2 · ManaBox · phone · fix mis-scan
- **Path** (estimated 5–7 taps, ~30–45 s per card):
  1. **Session list** (1 tap) or **Collection → binder → card** (3 taps).
  2. **Pencil** (1 tap) opens set, language, condition, purchase price, altered and misprint. Foil is in the bottom menu or the bulk edit. [doc] https://manabox.app/guides/scanner/getting-started/
  3. Pick the correct set from the list (2–3 taps, plus scrolling).
  4. Save (1 tap).
  - Bulk: **long-press** to select many, then the pencil, then change foil or language for all of them. [doc] https://manabox.app/guides/collection/faq/
- **Our screens touched:** Scan review 60% · Card detail 35% · Collection 5%.
- **Friction events**
  - *hidden-data*, sev 1. Bulk edit sits behind a **long-press**, which is undiscoverable without the guide [inf: long-press is documented only in the FAQ].
  - *state-lost-on-back*, sev 2. "Don't forget to save your changes!" suggests edits are not auto-saved [inf from a doc reminder]. https://manabox.app/guides/scanner/getting-started/
  - *dangerous-action-no-undo*, sev 2. Bulk select also offers **delete**, and the docs mention no undo [inf: absence in the docs].
- **Copy-worthy:** card edit shows **where the card already lives** ("5 times in the collection… in 8 decks"), which catches duplicates at review time. Partial moves come from "press the upper or lower part of the card to adjust how many copies." [doc]
- **One-glance test:** Y for a single card (pencil icon). N for bulk (long-press).

### A2 · Dragon Shield · phone · fix mis-scan
- **Path** (estimated 8–14 taps, ~60–90 s per card): **leave scan mode → search for the card → open it → edit version or foil → save → reopen the scanner.** "Mistakes can really slow you down," because the user must leave scanning, search, edit and resume. [rep] https://dorcishlibrarian.blogspot.com/2022/08/dragon-shield-mtg-card-manager.html
- **Our screens touched:** Collection (search) 35% · Card detail 45% · Scan 20% (re-entering).
- **Friction events**
  - *state-lost-on-back*, sev 2. Leaving scan mode to fix a card breaks the session [rep] (blogger URL).
  - *phone-unfriendly*, sev 2. "when you go to change it you get a massive list sometimes." [rep] https://game-solver.com/mtg-scanner-dragon-shield/
  - *phone-unfriendly*, sev 2. "changing to a different version from what it mistakenly auto selects is cumbersome." [rep] https://apps.apple.com/app/id1460657155
  - *number-mistrust*, sev 2. "mismatched card thumbnails and card version names" [rep] same URL. "Multiple versions of the same card also aren't totaled automatically." [rep] blogger URL
- **Copy-worthy:** none for this task. It is a **counter-example**: corrections must never leave the scan context.
- **One-glance test:** N. No in-place fix exists.

### A2 · Delver Lens (Android; "Delver MTG" on iOS) · phone · fix mis-scan
- **Path** (estimated 4–6 taps for one card; bulk 5–8 taps for many): open the scanned list → select a card or several → change the edition. A reviewer switched apps because "I can change the set of multiple cards at a time." [rep] https://play.google.com/store/apps/details?id=delverlab.delverlens&hl=en_US. The Play listing documents no detailed edit UI [inf].
- **Our screens touched:** Scan review 70% · Card detail 30%.
- **Friction events**
  - *number-mistrust*, sev 2. Black and extended-art cards cause issues; "Older sets throw it off a bit." [rep] Play URL above; https://apps.apple.com/app/id6504142186
  - *silent-data-loss*, sev 3. On iOS, "the app will occasionally quietly fail to perform the requested operation," and "old versions of syncs overwriting more recent ones." [rep] https://apps.apple.com/app/id6504142186
  - *hidden-data*, sev 1. "identical cards in your collection don't stack." [rep] same URL
- **Copy-worthy:** **multi-select and change the set in one go** (users name it as a switching reason). [rep]
- **One-glance test:** Y for the scan list itself. Trust is undermined by silent failures [rep].

### A2 · TCGplayer app · phone · fix mis-scan
- **Path** (estimated 3–5 taps): tap the card in the list → choose a different set. Tap **variant info** for foil, language or condition. Use **"Manage variants in list"** to split copies. [doc] https://help.tcgplayer.com/hc/en-us/articles/115009506407-TCGplayer-App-FAQ
- **Our screens touched:** Scan review 80% · Card detail 20%.
- **Friction events**
  - *hidden-data*, sev 1. The price shown depends on the selected variant ("select its language and printing, and view relevant price data"), and prices are USD only ("ONLY in $"). [doc] FAQ URL; [rep] https://apps.apple.com/gb/app/tcgplayer/id1247645833
- **Copy-worthy:** **tap a row to swap the set in place**, plus a separate "manage variants" path for splitting 4 copies into 3 non-foil and 1 foil. The vendor's seller tool also has **"Save as new"** to split a variant into its own row. [doc, seller doc] https://help.tcgplayer.com/hc/en-us/articles/115004173447-Resolving-Card-Scanning-Issues
- **One-glance test:** Y. The row is the edit target [doc].

---

## A3 — Import a Mythic Tools CSV (~2,500 rows) and resolve unmatched rows

Mythic Tools' CSV includes card name, set code, collector number, language, quantity, prices, **Scryfall ID** and container info. Non-English names appear "sometimes in english and sometimes in said language." [rep] https://moxfield.nolt.io/2592

### A3 · ManaBox · phone (no desktop app; import via the phone's file picker) · import CSV
- **Path** (estimated 8–12 taps, plus fix time; ~3–10 min): **Collection tab → top-right menu → Import → CSV → pick file** → error summary "with reasons and line numbers" → **import matched cards only** → **download a CSV of the failed rows** → fix them in Google Sheets → re-import. [doc] https://manabox.app/guides/collection/import-export/. Scryfall ID "can replace name and set" fields, so Mythic Tools rows should mostly match by ID [doc + inf].
- **Our screens touched:** Import 20% · Import review 15% · (outside the app: spreadsheet) 55% · Collection 10%.
- **Friction events**
  - *dead-end*, sev 2. The fix loop leaves the app (download, edit in Sheets, re-import). On a phone this is close to impossible. The guide itself says Excel "needs extra setup" [doc].
  - *hidden-data*, sev 2. The guide doesn't say whether import **adds to or replaces** existing binders [doc gap]. Mythic Tools' **container column** may not map to binders [inf: not listed among the optional columns].
  - *silent-data-loss*, sev 3 (for export). A ManaBox user's 18k collection exported only 9,025 cards ("Manabox is only releasing 9025 cards into the CSV file"). [rep] https://archidekt.com/forum/thread/15349311
- **Copy-worthy:** an **error summary with reasons and line numbers**, **"import what matched, keep the rest"**, a downloadable failed-rows file, and Scryfall ID treated as a first-class key. [doc]
- **One-glance test:** Y on the summary screen. The next step after that happens outside the app.

### A3 · Archidekt · desktop · import CSV
- **Path** (estimated 10–20 clicks; ~5–15 min): **Collection → importer page (top link) → upload file → pick a predefined site format *or* map columns manually** → the ambiguity warning stays until the printing is identifiable ("Scryfall ID alone removes ambiguity") → choose **skip** or **import as "Unsure"** for ambiguous rows → import → **copy or export the not-found rows** as a CSV → fix → re-import. [doc] https://archidekt.com/news/5891613
- **Our screens touched:** Import (mapping) 45% · Import review 25% · outside the app 20% · Collection 10%.
- **Friction events**
  - *looks-clickable-not / hidden-data*, sev 2. After selecting a preset, the user must also click "adjacent green buttons" to set the columns, or they get the error "Not enough identifiable information was provided for card lookups." [rep] https://archidekt.com/news/5891613
  - *number-mistrust*, sev 3. In the new importer, cards already in the collection "will always be added as a new entry." Re-importing an updated Mythic Tools export **duplicates** cards. The merge-capable old importer is "an order of magnitude slower." [doc] same URL. The documented workaround is to wipe and re-upload. [rep] https://archidekt.com/forum/thread/1285226
  - *phone-unfriendly / dead-end*, sev 2. A semicolon-delimited CSV failed with no resolution in the thread ("is there an easy way to change the semicolons to commas"). [rep] https://archidekt.com/forum/thread/8054462
  - *hidden-data*, sev 2. Mapping the Mythic Tools container to Archidekt **labels** only works "if I create all the labels beforehand." The maintainer declined auto-creating labels. [rep] https://websockets.archidekt.com/forum/thread/21307027. The box or binder location is therefore at risk of being dropped [inf].
- **Copy-worthy:** an **explicit ambiguity state**, with **"import as Unsure" tagging** instead of dropping or guessing. The Scryfall-ID-first rule. [doc]
- **One-glance test:** N. The preset plus the green-button step isn't obvious, per a staff reply [rep].

### A3 · Moxfield · desktop · import CSV
- **Path:** **not supported natively for Mythic Tools CSV.** A user reports the Mythic Tools export is "not supported as an import format in moxfield." [rep] https://moxfield.nolt.io/2592. The workaround is to rewrite the columns in a spreadsheet to Moxfield's format (Count, Name, Edition/Set code, Collector Number, Condition, Language, Foil…) and then import (estimated 20–40 min the first time) [inf, using the Moxfield export columns listed at https://scrytics.com/blog/mtg-collection-import-export].
- **Our screens touched:** outside the app 75% · Import 15% · Import review 10%.
- **Friction events**
  - *dead-end*, sev 3. No source preset exists, and users ask for "auto detection of CSV format… without having to think about which app or website it was originally exported from." [rep] https://moxfield.nolt.io/2467
  - *onboarding-gap*, sev 2. The same pattern hit Dragon Shield users for years ("Pretty frustrating, especially since Dragon Shield is such a common tool"). The maintainer pointed to a third-party converter. [rep] https://moxfield.nolt.io/847
- **Copy-worthy:** using **Scryfall IDs when present, falling back on other fields**. It was implemented for Deckbox and marked Completed. [rep/doc] https://moxfield.nolt.io/1796
- **One-glance test:** N. The persona's source isn't on the list.

### A3 · MythicHub · desktop · import CSV
- **Path** (estimated 5–8 clicks; ~2–5 min): **Collections → Import → (auto-detected) "Mythic Tools" → upload → import → summary.** Scryfall IDs are preferred, with name, set and collector number as the fallback. Language, condition and finish (nonfoil, foil, etched) are mapped. **Container Name can go into card notes.** [doc] https://mythichub.com/help/importing-collection. The source is auto-detected and can be overridden. [doc] https://mythichub.com/blog/better-import-source-detection-and-collectr-matching
- **Our screens touched:** Import 40% · Import review 40% · Collection 20%.
- **Friction events**
  - *dead-end*, sev 2. "Rows that still cannot be matched appear in the import summary so you can copy them." There is no in-app fix flow. Troubleshooting says to export the unmatched rows, correct them, and retry. [doc] https://mythichub.com/help/import-troubleshooting
  - *hidden-data*, sev 2. The container lands in **notes**, not as a box or binder entity, so "where it lives" becomes free text [doc + inf]. The page also doesn't say whether import adds or replaces [doc gap].
  - *number-mistrust*, sev 1. "Assigned price is always imported as empty." [doc]
- **Copy-worthy:** **source auto-detection with a visible override**, **Scryfall-ID-first matching**, and a **30-day restore of deleted binders** (https://mythichub.com/blog/next-level-collection-management). [doc]
- **One-glance test:** Y. The source is preselected, so the next action is Upload [doc].

---

## A4 — "Do I own X, and where is it?" at the store (phone)

### A4 · Mythic Tools · phone · lookup
- **Path** (estimated 3–5 taps, ~10–20 s): **Search → type the name → card → boxes, binders and decks holding it.** "Every deck is linked to your collection… what's in another deck." [doc] https://mythic.tools. The exact per-card location UI is **not documented** [doc gap; inf from the box/binder model].
- **Our screens touched:** Collection (search) 40% · Card detail 60%.
- **Friction events:** none documented. Possible *hidden-data*, sev 1: there is no explicit "locate" feature described [inf].
- **Copy-worthy:** the scanner can also act as a lookup ("scan to check a physical deck against its list"). [doc] https://apps.apple.com/app/id1669698500. Offline search is the sensible default for LGS signal [inf].
- **One-glance test:** Y (probable).

### A4 · ManaBox · phone · lookup
- **Path** (estimated 3–4 taps, ~10–15 s): **Search (offline) → card → card detail shows counts in the collection, lists and decks**, and binders name "where they are stored." [doc] https://manabox.app/guides/collection/getting-started ; https://manabox.app/guides/scanner/getting-started/ ; https://apps.apple.com/app/id1460407674 (offline search)
- **Our screens touched:** Collection 35% · Card detail 65%.
- **Friction events**
  - *clutter/ads*, sev 1. The listing says "Contains Advertising," with a $1.99 remove-ads purchase. [doc] https://apps.apple.com/app/id1460407674
- **Copy-worthy:** binders **mirror physical storage**, and the card detail answers "5 in collection, 0 in lists, in 8 decks" in one view. Offline search. [doc]
- **One-glance test:** Y.

### A4 · Archidekt · phone (mobile web) · lookup
- **Path** (estimated 5–8 taps, ~30–60 s): **Collection → search → card → "Collection records" tab (copies owned) → "In decks" tab (decks using it).** [rep] https://archidekt.com/forum/thread/23878223. A location requires labels the user set up [inf].
- **Our screens touched:** Collection 40% · Card detail 60%.
- **Friction events**
  - *hidden-data*, sev 2. "In-use vs available" is not computed. Staff say it's too slow ("upwards of a few minutes for… 20k+ card collections") and point to checking per-card tabs. [rep] https://archidekt.com/forum/thread/15420664
  - *number-mistrust*, sev 2. "In decks" includes maybeboards by default, and the edition used isn't shown. [rep] https://archidekt.com/forum/thread/23878223
- **Copy-worthy:** none strong for this task.
- **One-glance test:** N. The answer is split across two tabs.

### A4 · Moxfield · phone (mobile web) · lookup
- **Path** (estimated 4–6 taps): **Collection → search (Scryfall syntax supported) → card → binder.** Binders exist ("Remove from Binder" link, Completed). "Strict Assignment to Collections" is **In Progress**. [doc] https://moxfield.nolt.io/roadmap
- **Friction events**
  - *phone-unfriendly*, sev 2. There is no native app. Users keep asking for scanning or a PWA ("If y'all don't have the dev staff to do a full mobile app a PWA"). [rep] https://moxfield.nolt.io/1105
  - *hidden-data*, sev 2. Strict deck-to-copy assignment is not shipped yet [doc, roadmap].
- **Copy-worthy:** Scryfall syntax inside your own collection. [doc]
- **One-glance test:** Partial. Search is clear, but contested copies aren't assigned [doc].

---

## A5 — First run with an empty collection

### A5 · ManaBox · phone
- **What it shows (inferred):** Collection tab with a binder and list model. The guide frames binders as "cards you own" and lists as wants. [doc] https://manabox.app/guides/collection/getting-started. Entry points are the Scan tab, the `+` button on a binder (including "Add set"), and Import in the top-right menu. [doc] https://manabox.app/guides/collection/faq/
- **Friction events**
  - *onboarding-gap*, sev 2. Two concepts (binder vs list) have to be learned before the first save. The import entry point is a top-right overflow menu. [doc + inf]
  - *dead-end*, sev 1. No empty-state guidance is documented [doc gap].
- **Copy-worthy:** the binder = physical storage metaphor, and the "Add set" bulk entry. [doc]
- **One-glance:** N (probable). Three entry points, none labeled as the "start here" path [inf].

### A5 · Dragon Shield · phone
- **What it shows:** the folders model. Reviewers hit a paywall on their own data: "we had to subscribe to a free trial/pay to view and access our collection." [rep] https://game-solver.com/mtg-scanner-dragon-shield/
- **Friction events:** *dead-end/empty-state-trap*, sev 3 (paywall on viewing your own scans) [rep]. *onboarding-gap*, sev 2. Folders can't be merged and there is no bulk add. [rep] https://dorcishlibrarian.blogspot.com/2022/08/dragon-shield-mtg-card-manager.html
- **One-glance:** N.

### A5 · Delver MTG (iOS) · phone
- **Friction events:** *dead-end*, sev 3. "You also can't export your collection as a list" without paying, and "If I had not paid for the full version I would have lost my scans." [rep] https://apps.apple.com/app/id6504142186
- **One-glance:** N for anyone planning to move data later.

### A5 · TCGplayer app · phone
- **What it shows:** it works without an account, but scans then go to a temporary list. Saved collections need login. [doc] https://help.tcgplayer.com/hc/en-us/articles/115009506407-TCGplayer-App-FAQ
- **Friction events:** *silent-data-loss* risk, sev 2. A brand-new user scans into a temporary list before signing up [inf from the documented temporary list vs account-only collections]. *onboarding-gap*, sev 2. The Scan tab is reached via Settings → Close. [doc]
- **One-glance:** N.

### A5 · Mythic Tools · phone
- **What it shows:** free tracking with "no card limits and no paywall on your own data," import from 14 apps, and sync across iOS, Android and the web. [doc] https://mythic.tools
- **Friction events:** none documented for first run.
- **Copy-worthy:** an explicit **"your data is yours, no paywall"** promise, plus import from 14 named apps on day one.
- **One-glance:** Y (probable, from the marketing structure) [inf].

---

## Summary

### 1. Top 10 friction patterns (severity × frequency for this persona)
Severity is 1 to 3. Frequency is my estimate of how often the persona would hit it.

| # | Pattern | Type | Sev | Hits persona | Evidence |
|---|---|---|---|---|---|
| 1 | Art-based recognition picks the wrong printing; fixing it is per-card, a long list, or leaves scan mode | number-mistrust / state-lost-on-back | 3 | every scan session | [doc] TCGplayer FAQ; [rep] Dragon Shield App Store, blogger; [rep] ManaBox Play review |
| 2 | Collection or scans silently lost, or "acts as if it went through" | silent-data-loss | 3 | rare, catastrophic | [rep] Dragon Shield App Store and game-solver; Delver iOS; ManaBox Play ("entire collection has been wiped out") |
| 3 | Re-import duplicates instead of merging, so counts drift | number-mistrust | 3 | every re-sync from Mythic Tools | [doc] archidekt.com/news/5891613; [rep] archidekt thread 1285226 |
| 4 | The persona's source format isn't supported, or needs manual column mapping or a delimiter fix | dead-end | 3 | first import, then each re-import | [rep] moxfield.nolt.io/2592, /2467, /847; archidekt 8054462 |
| 5 | Unmatched rows can only be copied or downloaded and fixed outside the app | dead-end | 2 | every import (~0.5–2% of rows, est.) | [doc] MythicHub troubleshooting; ManaBox import guide; Archidekt news |
| 6 | Paywall on your own data or on export | dead-end / onboarding-gap | 3 | first week | [rep] Dragon Shield (game-solver), Delver iOS |
| 7 | Location (box or binder) dropped or flattened on import | hidden-data | 2 | every import | [doc] MythicHub (container → notes); [rep] Archidekt labels thread |
| 8 | "In use vs available" not computed; answer split across tabs | hidden-data | 2 | every store lookup and deck build | [rep] archidekt 15420664, 23878223; [doc] Moxfield roadmap (strict assignment in progress) |
| 9 | Foil and glare handling: separate pile, unreadable previews, manual toggle per card | phone-unfriendly | 2 | every pack (1+ foil) | [rep] game-solver Dragon Shield; [doc] ManaBox bottom menu, TCGplayer FAQ |
| 10 | Edits need an explicit save; bulk edit hidden behind long-press; no undo on bulk delete | state-lost-on-back / hidden-data / dangerous-action-no-undo | 2 | weekly | [doc] ManaBox scanner guide and FAQ [inf on the risk] |

An honourable mention is export truncation (ManaBox export capped at 9,025 cards, [rep] archidekt 15349311). It doesn't hit a 2,500-card collection, but it is a trust breaker.

### 2. Task frequency for this persona (ESTIMATES, not data)
| Task | Times / month | Phone : desktop | Reasoning |
|---|---|---|---|
| A1 Scan new cards | 3–5 | 95 : 5 | Prerelease packs, Commander precons, singles from the LGS, and trades. Each event is a small batch (10–60 cards), done at the kitchen table. |
| A2 Fix mis-scan | 6–15 (2–3 per scan session) | 85 : 15 | Mostly reprints with the same art and foils. Some cleanup happens later on the laptop. |
| A3 Import Mythic Tools CSV | 0.3–1 (first month: 1–3) | 10 : 90 | Heavy at onboarding. Later only if Mythic Tools stays the scanner of record, which makes A3 a recurring **sync**, not a one-off. |
| A4 "Do I own X / where?" | 8–20 | 95 : 5 | At every LGS visit, trade and deck idea. This is the most frequent task. |
| A5 First run | once (per device) | 60 : 40 | Often discovered on the phone, with the import done later on the laptop. |

### 3. Five design rules for scanning and importing
1. **Fix in place, never leave the camera.** The review list lives under the viewfinder, with inline set, foil and language edits and sticky per-session defaults (set lock, foil, language). *Evidence:* Mythic Tools edits "right in the list" [doc], and ManaBox has set lock and Quick Mode [doc]. In contrast, Dragon Shield's leave-search-edit-resume loop "really slow[s] you down" [rep], and "changing to a different version… is cumbersome" [rep].
2. **Every scan is saved the moment it's recognized, and you can see that it saved.** Each recognized card is written locally right away, with a visible "saved · synced" state and undo, not a "don't forget to save" step. *Evidence:* ManaBox's save reminder [doc]; Dragon Shield's "act as if it went through, only to not show up" [rep]; Delver's sync overwrites and "quietly fail" [rep].
3. **Match by Scryfall ID first, auto-detect the source, and treat Mythic Tools as a first-class preset.** Fall back to set + collector number + language, never to name alone, because Mythic Tools' non-English names are inconsistent. *Evidence:* MythicHub and Archidekt prefer Scryfall ID [doc]; Moxfield users ask for auto-detection and Mythic Tools support [rep 2467, 2592].
4. **Resolve unmatched rows inside Import review, with suggestions, and import the rest first.** Show "2,487 imported · 13 need you" with line numbers, each with a top-3 printing guess and an "Unsure" option, fixable one-handed. Never send the user to a spreadsheet. *Evidence:* the ManaBox line-numbered summary [doc]; Archidekt's "Unsure" tag [doc]. The copy/download-and-retry loops in MythicHub, ManaBox and Archidekt are dead ends on a phone [doc].
5. **Preview before commit, with explicit add / merge / replace, and keep a restorable snapshot.** Also keep the box or binder as a real location, not as notes. *Evidence:* Archidekt's new importer duplicates existing cards, so the workaround is wipe-and-reimport [doc/rep]; MythicHub puts containers in notes [doc] and offers a 30-day binder restore [doc]; labels drop unless pre-created [rep]. Also, never paywall export or viewing ([rep] Dragon Shield, Delver).
