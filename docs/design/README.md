# Design: a calm, phone-first app

Work for the redesign brief, in the order the brief asked for it.

| Phase | File | What it is |
|---|---|---|
| 1 · Evidence | [`1-usage-audit.md`](1-usage-audit.md) | Screens ranked by visits, time and phone share. **Simulated** (no analytics yet), plus Brayden's real answers. |
| 1 · Evidence | [`2-page-forensics.md`](2-page-forensics.md) | A numbered fix list for each heavily used page. |
| 1 · Evidence | [`3-numbers-audit.md`](3-numbers-audit.md) | Every number the app shows, checked against the database, and the definitions every screen must use (R1–R15). |
| 2 · Mockups | [`mockups/commandery-directions.html`](mockups/commandery-directions.html) | Nine screens in four directions, phone and laptop, side by side. Self-contained: open it in a browser. **Brayden chose C, "Bold product"** (2026-11-15). |
| 3 · Menu | [`4-information-architecture.md`](4-information-architecture.md) | Four areas, the top-bar tabs, More, the route map and ⌘K. The menu itself lives in `src/lib/nav.ts`, and `tests/nav.test.ts` fails on an orphaned route. |
| 4 · Build | [`5-build-brief.md`](5-build-brief.md) | The brief every Phase 4 builder gets: what to read, how the new look works, the CALM and IN-APP checklists, and the rules. |

Phase 4 (build) follows direction C. All 18 pages are done, and the new look is the default since 16 Nov 2026 (`?look=old` shows the old one). Calm rules on top of C: the gradient appears only on each screen's one main button and its headline number.

## Rebuilding the mockups

The mockup page is built from the app's own database, so its numbers match `3-numbers-audit.md`.

1. `mockups/tools/build_mock.py` builds a mock database: the real Mythic Tools import, plus example boxes and three example decks.
2. `mockups/tools/export_mock.py` runs the queries in `evidence/numbers.sql`, plus the app's own `roleCounts()`, and writes `mock.json` and the card images.
3. `mockups/src/build.py <scratch dir> mockups/commandery-directions.html` puts the page together from `src/`.

The tools were written for a one-off scratch folder. Treat them as a record of how the numbers were made, not as part of the app.

## Evidence

`evidence/` holds the simulated session logs (3 personas × 7 apps, with sources), the usage model, and the canonical SQL for every number.
