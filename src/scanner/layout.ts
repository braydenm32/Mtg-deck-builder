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

/**
 * Where else to look when the collector line doesn't parse: a card found a
 * little too tight or loose in a photo moves the line by a few percent.
 */
export const COLLECTOR_RETRY_REGIONS: FractionRect[] = [
  { x: 0.03, y: 0.935, width: 0.5, height: 0.063 },
  { x: 0.03, y: 0.945, width: 0.5, height: 0.054 },
  { x: 0.02, y: 0.895, width: 0.52, height: 0.075 },
];

/** Art box on regular 2003/2015 frames; on other frames it still mostly holds art. */
export const ART_REGION: FractionRect = { x: 0.1, y: 0.13, width: 0.8, height: 0.42 };

/**
 * The copyright line along the bottom. Before 2015 it ends in the collector
 * number ("™ & © 1993-2011 Wizards of the Coast LLC 74/175"); its year helps
 * place the card in a set either way.
 */
export const COPYRIGHT_REGION: FractionRect = { x: 0.2, y: 0.925, width: 0.78, height: 0.072 };
