# Card scanner

_Built 2026-11-15. Scope: scan a card with a phone camera (or photos), recognise the exact printing, add it to the app's own collection._

## Approaches considered

| Approach | Verdict |
|---|---|
| **OCR of the name + collector line, then Scryfall data** | ✅ Chosen. Works offline against our own card database, needs no training data, and the collector line ("086/269 R · AKH • EN" on 2015-2022 cards, "R 0189 · FRA • EN" since 2023) names the exact printing. |
| **Image matching only** (perceptual hash of the photo vs every printing's image) | Used as a *second* signal, not alone. A hash index of all ~110k printings would need every image downloaded (~1 GB) and still confuses reprints that share art. Hashing only the printings of the name we read needs a handful of small images per scan, cached after first use. |
| **On-device ML model** (card detector + embedding) | Not now. Needs a labelled dataset and model hosting; OCR + hashing already gets ~95% of cards. Could replace the OCR step behind the same `OcrEngine` interface later. |
| **Vision LLM** (send the photo to a model) | Not now: costs per scan and needs an API key. Easy to add later as another recogniser for cards OCR can't read. |
| **Commercial scanner apps' databases** | Not available to us, and the point is to not depend on other apps. |

## Pipeline

1. **Find the card** (`geometry.ts`, in the browser): the page draws a card-shaped guide. Every ~200 ms it looks for the card's four edges near the guide: brightness steps along each side, a small Hough vote for straight lines, and the *outermost* well-supported line wins (inside a card there are other long straight edges: border to frame, frame to art box). When the corners hold still for ~0.6 s it captures, flattens the card to 630×880 with a perspective warp, and sends that JPEG. A quick hash of the card stops it re-scanning a card that's still in view.
   - **Anywhere in a photo** (`locate.ts`): uploaded photos, and camera frames where the card isn't in the guide, are searched whole. The table is modelled from the frame's edges as a smooth brightness surface (so uneven light doesn't count), pixels that differ in brightness, colour or detail are marked, small gaps closed, and each blob is scored on card shape, solidity and size. Paper notes and fingers lose on shape. The edges are then fitted in a crop around the winning blob (taking the line *nearest* the blob's outline, since it already traces the card), and the blob's own rotated rectangle is used if the fit disagrees.
2. **Read the name** (`identify.ts`): OCR the title band as a block of lines using the per-pixel *minimum* of R, G, B (keeps light names on coloured bars readable), and if that isn't a confident match, the tight title bar as one line using luma. Then upside down if both fail.
3. **Match the name** (`names.ts`): every line is aligned against all ~39k card names with an edit distance that's cheap for junk after the name (mana symbols), costlier for junk before it, and lenient on OCR's usual swaps (l/I/1, O/0, rn/m). Double-faced cards match on either face.
4. **Read the collector line** (`collector.ts`): OCR bottom-left, parse number, set total, rarity, set code and language, fixing letters read as digits. If it doesn't parse, two slightly shifted regions are tried and what each got right is merged. A set code that doesn't exist is retried as its look-alikes ("C91" → C21, "WADR" → WAR), and "ID"/"IP" read as "JP". If set + number resolve to a printing, that's used to confirm or overrule a shaky name read; when the title can't confirm it (a Japanese card), the picture has to.
5. **Older cards** (no set code, 1993-2014 frames): the copyright line along the bottom ends in "78/143" and carries the print year. Cards numbered 78 in sets whose numbering runs to about 143, printed within a year of it, are the candidates; the readable title picks one, or else the picture does (art-weighted hash plus a coarse colour layout, so it works for foreign-language cards too). If the title and the number disagree, whichever card looks more like the photo wins.
6. **Pick the printing**: every printing of that card is scored by collector-line agreement plus how close the photo's perceptual hashes (whole card and art box) are to Scryfall's image of that printing, with a slight preference for regular printings over The List, promos and Secret Lair copies of the same art. The whole card's colour layout also counts, which separates same-art reprints with different borders (Unlimited's white border vs a modern frame).
7. **Language**: as printed on the collector line; else English if the title reads as the English name; else unknown (the card was identified, but its title isn't English). The card database only holds English printings, so a Japanese card is saved as its English printing with `lang: "ja"`.
8. **Decide**: "matched" when the name is confident (or the collector line plus the picture vouch for it), one printing clearly wins, the language is known, and the photo looks like that card; "uncertain" otherwise; "not-found" when nothing is readable.

Recognition runs on the server (`POST /api/scan`), so the phone only finds the card and uploads one ~100 KB JPEG, and the same code is what the tests and `scan:eval` measure. Tesseract.js and its English model are installed from npm, so nothing is fetched from a CDN at runtime.

## Saving to the collection

- Sure matches are added straight away with the sticky finish/condition/location, and an "Added X · Undo" toast. Undo uses `POST /api/scan/undo`, which lowers that stack by one.
- **Finish** (`src/scanner/finish.ts`): about half of all printings are made in only one finish (foil-only Secret Lairs and collector-booster cards, non-foil-only older sets). For those the printing settles it, whatever the Foil toggle says, and the toast says so ("only made in foil"). Otherwise the toggle decides, or, on **Auto**, the camera (below). A sure match is only held for review when the toggle's finish isn't made for that printing and the printing comes in more than one (e.g. Etched on, but only non-foil and foil exist).
- Unsure scans queue below the camera with the card image, a printing picker, a "Wrong card?" name search, the finish and the language (which must be picked when the scanner couldn't tell). Adding from there counts as confirmed (`printingConfidence: "exact"`), unless the chosen finish doesn't exist for that printing, in which case it's saved as `"guessed"`.
- The session tray lists everything added this visit (kept in the tab's session storage, so Back doesn't lose it) with Fix and Remove.

## Foil from the camera (finish setting "Auto")

`src/scanner/foil.ts`. A still photo can't tell foil from ink, but a moving card can: as it tilts, foil's rainbow sheen sweeps across it and the *colour* of each spot changes, while glare on a non-foil card only makes spots brighter and paler. The live loop keeps a small flattened 60x84 view of the card every frame (`FoilWatcher`, at most 16 views, dropping the most repetitive); when a scan comes back for a printing made in more than one finish, the views are judged:

1. Line each view up with the others (shift and a few % of scale: hand-held edge fits wobble).
2. Even out exposure and white balance per channel, measured on the dimmer half of the pixels (glare only brightens).
3. In linear light, take each 4x4 cell's chromaticity and how far it moved from the cell's median over all views in a way glare (scaling towards grey) can't explain. Skip dark, clipped, much darker (a finger) and detail-mismatched (something in front) cells, and take off the shift shared by the surrounding 7x7 cells (the phone's tone curve shifts whole regions).
4. "foil" when, in its top-quarter view, at least 6% of cells changed colour; "non-foil" only when nothing changed at all (not even the phone's shifts) across at least 6 views while the light moved; "unsure" otherwise.

By hand: if it's unsure when the scan returns, the camera says "Tilt the card a little" and keeps watching for up to 2.5 s. Still unsure: the card waits in "to check" with only "Is it foil?" to answer.

Tuning: Brayden's 5 tilt videos (16 Nov, room light, hand-held; in the project files, `scan-real/tilt/`): of the 3 foils, 2 were called foil and the subtlest one asked; both non-foils asked. None were wrong. On simulated footage (tests) it never calls a non-foil foil or a foil non-foil. It asks often: Auto is opt-in, and the default stays the Foil toggle.

## Scanning tower

`src/scanner/tower.ts`, setting "Scanning tower". For a 3D-printed tower where the phone looks straight down, each card slides in at about 15 degrees about 70 mm from the camera, drops to about 155 mm and lies on the pile until the next lands on it.

- No guide: the top card is found anywhere in the frame (tracked near where it was last frame, else searched for).
- `TowerTracker` reads a card once it has lain still for 3 frames *after the pile changed* (different content, a big move, or the card gone for 2+ frames). So an identical copy landing on its twin is still read, and one missed detection doesn't read the same card twice.
- Cards are numbered as they land (#1, #2, ...). Unsure ones don't stop scanning: they queue in "to check" with "Card 7 in the tower", so they can be found in the pile.
- Reads can overlap (the next card can land while one is still being read); saves are queued one at a time.
- Foil: the slide and drop give only a few clean views, so on Auto, when it's unsure, it flashes the phone's torch for a moment on the landed card (moving the light instead of the card), where the browser can switch the torch (Chrome on Android). The torch can also be kept on with the Torch button.
- Checked on a simulated tower video in Chromium (fake camera): 3 cards per pass read once each, including the identical copy. Not yet run on the real tower.

## Accuracy

`npm run scan:eval [clean|normal|hard] [count]` downloads a fixed varied sample of 120 cards from Scryfall once, fakes phone photos (tilt, perspective, scale, table backgrounds, uneven light, colour cast, noise, blur, JPEG), and runs the full recogniser against your local database.

| Profile | Right card | Exact printing | Added without asking | Wrong printing among those |
|---|---|---|---|---|
| normal (1080p) | 96.7% | 95.0% | 90% | 1 (a The List reprint identical to the original) |
| hard (720p, more blur/tilt) | 90.0% | 86.7% | 70% | 0 |

Weak spots: 1993-1997 frames (old fonts, low-contrast title bars), battles (printed sideways), and reprints that are pixel-identical to their original (The List, some promos), where nothing on the card tells them apart.

### Real photos

`npm run scan:real [dir]` runs a folder of real photos plus an `expected.json` through the same path as "Scan from photos". Brayden's first set (16 Nov 2026): 20 unsleeved cards on dark cloth, the card filling about half the frame and off-centre, paper "FOIL!" notes under some, 7 foils, 6 Japanese and 1 Chinese, frames from Unlimited to 2025. A copy lives in the project files (`scan-real/`).

| | Before tuning | After |
|---|---|---|
| Right card | 7/20 | 19/20 |
| Exact printing | 3/20 | 19/20 |
| Language right | 14/20 (and saved as English regardless) | 17/20 (the other 3 ask) |
| Added without asking | 0/20 | 14/20, none wrong |

The one miss is a photo with a blurred finger over the card. Foil isn't detected from a single photo; see "Foil from the camera" for the moving-card check.

## Next

- Tune on sleeved cards (glare off the sleeve, a second edge around the card).
- Tune the foil check on more footage, and on the real tower (with and without the torch).
- Read the ★ on the collector line (foil promos), which OCR can't yet tell from •.
- Read non-English cards' names (the collector line, the number and the picture are used for them today).
- Optional vision-model fallback for cards OCR can't read.
- Multi-card scanning (several cards in one photo, e.g. a binder page).
