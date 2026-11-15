/**
 * Where things are on a flattened card, as fractions of its width and height.
 * Measured on Scryfall scans of the main frames (1993, 1997, 2003, 2015 and
 * the 2023+ collector line). Regions are deliberately generous: OCR output is
 * cleaned up and fuzzy-matched afterwards, so a little extra is cheaper than
 * clipping a letter.
 */
import type { FractionRect } from './image';

/** Title bar: card name on the left, mana cost on the right. */
export const NAME_REGION: FractionRect = { x: 0.055, y: 0.035, width: 0.86, height: 0.08 };

/**
 * A taller band around the title bar, read as a block of lines. It also
 * catches names that sit lower (1993/1997 frames, transform cards with the
 * face icon, borderless frames); every line is matched and the best wins.
 */
export const NAME_BAND: FractionRect = { x: 0.04, y: 0.025, width: 0.92, height: 0.125 };

/**
 * Bottom-left info block on 2015+ frames:
 *   "086/269 R"            (2015-2022)   or   "0086 R"  (2023+)
 *   "AKH • EN  ~ Artist"
 */
export const COLLECTOR_REGION: FractionRect = { x: 0.03, y: 0.915, width: 0.5, height: 0.07 };

/** Art box on regular 2003/2015 frames; on other frames it still mostly holds art. */
export const ART_REGION: FractionRect = { x: 0.1, y: 0.13, width: 0.8, height: 0.42 };
