# 5 · Build brief (Phase 4)

Every builder gets this brief and one area. Read it in full before changing anything.

## Read first

- `docs/design/4-information-architecture.md`: the areas, tabs, More, the route map and ⌘K. The menu is `src/lib/nav.ts`.
- `docs/design/3-numbers-audit.md`, Part B: the definitions every number must follow (R1 to R15) and the per-screen number spec. Show numbers from the named library functions. Never re-derive a number in a page.
- `docs/design/2-page-forensics.md`: the numbered fix list for your pages.
- `docs/design/1-usage-audit.md` §3–4: what's used most, on which device. Order and emphasis come from this, not taste.
- The chosen look is direction C in `docs/design/mockups/commandery-directions.html` (open it and pick "C · Bold product"). The tokens are in `src/app/globals.css` under "The new look".

## How the new look works

- The new look is on when the `look=new` cookie is set (open any page with `?look=new`). The shell and theme only exist then. Scope new styling to `.app-shell` so the old look can't half-change.
- The theme is token-based (`bg-panel`, `text-muted`, `border-line`, `bg-accent` and so on), so most existing markup already turns dark. Don't hard-code colours.
- **The top bar is the page header.** Pages under the new look don't render their own big `<h1>`. For a page whose title isn't the menu label, render `<TopBar inPage title=… actions=… />` from `src/components/shell/TopBar.tsx` as the first element. To keep the old look's heading, give the old `<h1>` the class `old-look-only`, which is hidden inside the shell.
- **The gradient is for one thing per screen**: the main button (`bg-accent`) and, if there is one, the headline number (`grad-text`). Every other button is secondary.
- A new page needs an entry in `PAGES` in `src/lib/nav.ts`, or `tests/nav.test.ts` fails.

## The CALM checklist (every page must pass all of these)

1. It feels like a deck builder, and is as easy as sitting down with real cards.
2. The next action is obvious. Surface what needs doing (cards waiting for a home, decks one step from done, shared cards to decide) with one-tap actions. Status chips beat paragraphs.
3. One glance, no hunting. What matters is above the fold on a laptop. Fewer clicks. No rage-click traps.
4. State persists. Tabs, filters, search and sort live in the URL, so Back lands where you were.
5. Calm surfaces. The page header moves into the top bar. Stat tiles become one quiet line. No duplicate titles. No number printed twice. Skeletons (`loading.tsx` with `Skeleton`) instead of spinners.
6. Summary first, detail on demand. Detail pages lead with a summary strip (status, value, next action, last activity, source), then expandable history. Only the overview tab carries the summary. Other tabs open straight on their own content.
7. Nothing disappears. Rare things move under More. They don't vanish. Dangerous tools get a review step, archive instead of delete, and Undo.
8. The numbers are trustworthy. Same queries as before, never recomputed differently.
9. Data-driven. Order and emphasis come from the usage audit.

## The IN-APP checklist (every page, on a phone)

1. Works one-handed at 390 px: tap targets 44 px or more, nothing important only on hover, no horizontal page scroll, inputs at least 16 px so iOS doesn't zoom.
2. Feels like an app, not a website: the top bar and bottom bar stay put, sheets slide up from the bottom for choices, and there are no full-page reloads for small actions.
3. New users aren't dropped into empty tools. Until there's a collection, Today shows only the first step (import a file, scan, or type a name), and no one can get stuck. Never trap existing users.
4. No silent data loss: unsaved text survives an unrelated change, saves don't race each other, and every save says that it saved.

## Rules

- Keep URLs as they are. Every old link must keep working.
- Change presentation, not logic. If a number or behaviour looks wrong, write it down in your report instead of changing the library.
- Don't touch other areas' pages, `src/lib/nav.ts` (unless you add a page), or the shell, without saying why in your report.
- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` before you finish. All must pass.
- Check each page with the new look on at 390 × 844 and 1280 × 800 with Playwright: no console errors, no horizontal scroll. Check the old look still renders.
- Commit on your own branch with a clear message. Don't push. Your report lists each page, what changed, what you checked, and anything you weren't sure about.
