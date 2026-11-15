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
2. **Read the name** (`identify.ts`): OCR the title band as a block of lines using the per-pixel *minimum* of R, G, B (keeps light names on coloured bars readable), and if that isn't a confident match, the tight title bar as one line using luma. Then upside down if both fail.
3. **Match the name** (`names.ts`): every line is aligned against all ~39k card names with an edit distance that's cheap for junk after the name (mana symbols), costlier for junk before it, and lenient on OCR's usual swaps (l/I/1, O/0, rn/m). Double-faced cards match on either face.
4. **Read the collector line** (`collector.ts`): OCR bottom-left, parse number, set total, rarity, set code and language, fixing letters read as digits. If set + number resolve to a printing, that's used to confirm or overrule a shaky name read.
5. **Pick the printing**: every printing of that card is scored by collector-line agreement plus how close the photo's perceptual hashes (whole card and art box) are to Scryfall's image of that printing, with a slight preference for regular printings over The List, promos and Secret Lair copies of the same art.
6. **Decide**: "matched" when the name is confident and one printing clearly wins; "uncertain" otherwise; "not-found" when nothing is readable.

Recognition runs on the server (`POST /api/scan`), so the phone only finds the card and uploads one ~100 KB JPEG, and the same code is what the tests and `scan:eval` measure. Tesseract.js and its English model are installed from npm, so nothing is fetched from a CDN at runtime.

## Saving to the collection

- Sure matches are added straight away with the sticky finish/condition/location, and an "Added X · Undo" toast. Undo uses `POST /api/scan/undo`, which lowers that stack by one.
- A sure match is *not* auto-added if the printing isn't made in the chosen finish (e.g. a foil-only Secret Lair while "Foil" is off). It waits for review instead.
- Unsure scans queue below the camera with the card image, a printing picker, a "Wrong card?" name search and the finish. Adding from there counts as confirmed (`printingConfidence: "exact"`), unless the chosen finish doesn't exist for that printing, in which case it's saved as `"guessed"`.
- The session tray lists everything added this visit (kept in the tab's session storage, so Back doesn't lose it) with Fix and Remove.

## Accuracy

`npm run scan:eval [clean|normal|hard] [count]` downloads a fixed varied sample of 120 cards from Scryfall once, fakes phone photos (tilt, perspective, scale, table backgrounds, uneven light, colour cast, noise, blur, JPEG), and runs the full recogniser against your local database.

| Profile | Right card | Exact printing | Added without asking | Wrong printing among those |
|---|---|---|---|---|
| normal (1080p) | 95.0% | 92.5% | 75% | 1 (a The List reprint identical to the original) |
| hard (720p, more blur/tilt) | 90.8% | 86.7% | 54% | 0 |

Weak spots: 1993-1997 frames (old fonts, low-contrast title bars), battles (printed sideways), and reprints that are pixel-identical to their original (The List, some promos), where nothing on the card tells them apart.

These are simulated photos. Real photos add glare, sleeves and focus problems, so expect somewhat lower numbers until we tune on real ones.

## Next

- Tune on a set of real phone photos (glare, sleeves, foils).
- Read non-English cards' names (only the collector line is used for them today).
- Optional vision-model fallback for cards OCR can't read.
- Multi-card scanning (several cards in one photo, e.g. a binder page).
