# 1 · Usage audit

> **Evidence label: SIMULATED and QUALITATIVE.** The app has one real user (Brayden) and no analytics, page logs or click tracking yet. Nothing in this file is a measurement of real usage. Every visit count, time and phone share below is an estimate from simulated sessions, and it is labelled as one. Brayden's own answers (§1) are the only real usage data, and they win wherever they disagree with the simulation.

_Written 2026-11-15 for the "calm, phone-first" redesign. Inputs: `evidence/persona-*.md` (session logs), `evidence/usage-model.py` (the arithmetic), and a Playwright walkthrough of the current build._

## 1. What the evidence is

| Source | Kind | What it gives us |
|---|---|---|
| Brayden's quiz answers (2026-11-15) | **Real** | Devices, collection size, how decks start, storage, prices, buying (see below) |
| Brayden's Mythic Tools export (115 cards, his "bulk" list) | **Real** | Real column layout, real cards, real prices; imported through the app with 115 of 115 matched |
| Walkthrough of this app (PR #2, PR #3, then `main` at `0a4db95` with PRs #4–#5) at 390 px and 1280 px | **Real (this app)** | Dead links, tap-target sizes, page heights, import behaviour, numbers (see `2-page-forensics.md`, `3-numbers-audit.md`) |
| 3 agent personas × 16 tasks × 7 apps = **63 task-by-app sessions** | **Simulated** | Steps, screens, friction, and task frequency per persona, reconstructed from about 150 cited public sources (vendor docs, feature boards, store reviews, forums) |

**Brayden's answers (real):**
1. Scans on the **phone**. Builds on **both** phone and laptop.
2. Collection between **1,000 and 10,000** cards, with **any number of decks**.
3. Usually starts from **a commander he owns, with a theme in mind**. Suggesting commanders from a theme is also wanted.
4. Cards live in **boxes and binders**, and the app should show where each one is.
5. **Prices are optional**: a setting, not always on.
6. **Build from owned cards first.** Buying or proxying is only a suggestion when a deck needs a card he doesn't own.
7. Wants a **new name and logo**, and likes the purple/pink flair.

**The personas** (all three are facets of Brayden, so the model adds them up):
- **A · Table-side collector**: scans, fixes mis-scans, imports CSVs, looks up "do I own X, where is it?". Apps: ManaBox, Delver Lens, TCGplayer, Dragon Shield, Moxfield, Archidekt, Mythic Tools/MythicHub.
- **B · Kitchen-table builder**: builds from owned cards with EDHREC-style suggestions, checks deck health and bracket, swaps cards at the store. Apps: EDHREC, Moxfield, Archidekt, ManaBox.
- **C · Multi-deck juggler**: works out which copy is in which deck, resolves cards two decks want, exports, retires decks, keeps the collection honest after pulling cards. Apps: Archidekt, Moxfield, ManaBox, Deckbox, Mythic Tools/MythicHub.

## 2. What the brief asked for, and what stands in for it

| Asked for | Not available because | What this audit uses instead |
|---|---|---|
| Visits per page | No users or analytics yet | Estimated monthly task frequency × the screens each task touches |
| Time on page | Same | Estimated minutes per task × each screen's share of that task |
| Rage clicks | Same | Friction events of type *rage-click-trap*, *looks-clickable-not* and *dead-end* that competitors' users hit on the equivalent screen |
| Dead clicks | Same | Real dead clicks in our own build: links to pages that didn't exist (PR #2), plus tap targets under 44 px (PR #3) |
| Phone vs desktop share | Same | Each task's estimated phone share, cross-checked against Brayden's answer 1 |

**Instrumentation to make this real.** Phase 4 adds a tiny first-party event log: page, time on page, device class, and taps that change nothing. It lives in the app's own SQLite, with no third party. After a month of Brayden's own use, this audit can be re-run on real numbers and the menu order re-checked.

## 3. Ranking (simulated)

Model: 15 tasks, about **62 task runs and 168 minutes a month** for one Brayden-like user. Every task run also passes through Home (counted as one visit, 6 seconds). Full inputs are in `evidence/usage-model.py`.

| Rank | Screen | Est. visits / month | Est. minutes / month | Share of time | Phone share of time | Competitor friction found (≈ events) | Driven by tasks |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | **Collection** (search, filter) | 49 | 21 | 13 % | 49 % | 6 | A4 lookup, C1 is-it-free, A1/A2, B4, C4, C6 |
| 2 | **Home / Today** | 62 | 6 | 4 % | 67 % | 0 (no competitor has one) | every session |
| 3 | **Card detail** | 36 | 17 | 10 % | 55 % | 7 | A4, C1, A2, B5 |
| 4 | **Deck · cards** (editor) | 18 | 24 | 14 % | 54 % | 8 | B4 swap at store, C6 pull list, C2, C4, B3 |
| 5 | **Deck · suggestions** (builder) | 2 | 32 | 19 % | 24 % | 8 | B1 build, B5 compare with owned |
| 6 | **Deck · overview** | 13 | 14 | 8 % | 39 % | 6 | B3 health, B2, C2, C3 |
| 7 | **Scan review** (tray) | 14 | 10 | 6 % | 90 % | 9 | A1, A2 |
| 8 | **Shared cards** | 12 | 8 | 5 % | 64 % | 5 | C2, B2, B4, C6 |
| 9 | **Missing cards** | 9 | 10 | 6 % | 55 % | 5 | B2, C6, C2 |
| 10 | **Scan** (camera) | 4 | 13 | 8 % | 94 % | 6 | A1 |
| 11 | Decks list | 12 | 2 | 1 % | 28 % | 4 | C1, C4 |
| 12 | Export | 5 | 2 | 1 % | 55 % | 3 | C3, B2 |
| 13 | Settings / Data | 4 | 1 | 1 % | 95 %* | 0 | A1 (scan defaults) |
| 14 | Import review | 0.6 | 3 | 2 % | 10 % | 11 | A3 |
| 15 | Import | 0.7 | 2 | 1 % | 16 % | (in 14) | A3, A5 |
| 16–17 | Commander picker, Theme picker | 0.8 each | 1 each | 1 % | 15 % | 0 | B1 |
| 18 | Onboarding / first run | 0.1 | 0.5 | 0 % | 60 % | 5 | A5 |

\* The Settings visits are really per-session scan defaults (set lock, foil, language). They belong on the Scan screen, not in Settings.

Overall, **about 51 % of all minutes are on the phone** in the model. That matches Brayden's answer: scanning, lookups and store swaps happen on the phone, and long builds happen on the laptop.

## 4. What the data decides

**Goes first (primary areas, one tap from anywhere):**
1. **Collection**, with search always reachable. It's the most-visited working screen, and its main job ("do I own X, where is it, is a copy free?") happens 8–20 times a month, mostly on the phone. The answer should come back on the search result itself, so Card detail isn't needed for the common case.
2. **Decks.** Overview, Cards, Suggestions and Missing become **tabs of one Deck page**, not separate pages. Together they take 47 % of all time. Overview is short and frequent (the health check); Suggestions is long and rare (the build session).
3. **Scan** is the main action on the phone. It's not a nav tab: a thumb-reach button on Collection and Today opens it. On a laptop the same button reads "Add cards" and offers import or manual add.
4. **Today (Home)** has the most visits and the least time. It must answer "what needs me?" in one glance and send you onward: cards waiting for a home, cards two decks want, decks one step from done.

**Gets deep work:** Card detail (owned / in decks / free / where), the Deck page (all four tabs), Scan with its live tray, and Shared cards. Import review gets deep work too. It's rare after the first month, but it has the most friction of any screen at competitors (11 events: unsupported formats, duplicates on re-import, unmatched rows you can only fix in a spreadsheet), and it's the first thing Brayden does.

**Goes under "More" (still searchable with ⌘K; nothing disappears):** Export (it's also an action on every deck), Settings and data (card-data sync, backups, prices on/off), Import history, the Decks list (as the Decks area's landing page, not a separate nav item), and retired decks.

**Not in navigation at all:** Commander picker and Theme picker. They are steps in the "New deck" flow, which starts from Decks or from a commander's Card detail ("Build around this").

## 5. Friction patterns that recur across apps (simulated, cited in the logs)

Ranked by severity × how often they'd hit Brayden:
1. **"Owned" ignores copies already in other decks.** Moxfield, Archidekt and Deckbox all show it, and it's their top or near-top feature request. Persona B and C logs, sev 3.
2. **Art-based scanners pick the wrong printing, and fixing it means leaving the camera.** Persona A, sev 3.
3. **Silent data loss.** Wiped collections, scans that "act as if it went through", and edits lost on refresh. Persona A and C, sev 3.
4. **Re-importing duplicates the collection instead of merging.** Archidekt documents it [doc], and **our own PR #3 build did it too**. PR #4 fixed it (re-checked; see forensics). Persona A, sev 3.
5. **Unmatched import rows can only be fixed in a spreadsheet.** ManaBox, Archidekt, MythicHub. Persona A, sev 2, and a dead end on a phone.
6. **The recommendations site can't see your collection.** EDHREC has 12 sections and 155+ tiles, a hover-only "+", and no owned/not-owned split. Persona B, sev 3.
7. **Phone editors crash, or hide actions behind long-press.** Archidekt mobile, ManaBox. Persona B, sev 2–3.
8. **Bracket labels with no reasons, and price totals with an unclear scope.** Persona B, sev 2.
9. **Search and filter state lost after an action or Back.** Moxfield clears the search after an add. Persona C, sev 2.
10. **Deletes and bulk actions with no review step and no undo.** Persona C, sev 2–3.

## 6. Limits

- The sessions are reconstructed from documentation and public reports, not observed. Tap counts and minutes are the agents' estimates.
- Competitors' friction doesn't prove ours. It shows where this kind of app usually fails, so the redesign checks those places first.
- Task frequencies come from personas, not Brayden's history. The first month of real use should replace them (see §2, instrumentation).
