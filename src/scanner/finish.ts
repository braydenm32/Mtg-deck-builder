/**
 * Choosing a scanned card's finish (non-foil, foil, etched).
 *
 * In order of trust:
 *   1. The printing itself: many printings are only made in one finish
 *      (foil-only Secret Lairs and collector boosters, non-foil-only old sets).
 *      Then there is nothing to guess.
 *   2. What the camera saw: foil's rainbow sheen moving as the card tilts
 *      (see foil.ts), when the scanner's finish setting is Auto.
 *   3. The scanner's finish setting.
 */

export type Finish = 'nonfoil' | 'foil' | 'etched';

export type FinishSetting = Finish | 'auto';

/** What the camera concluded about foil, if it looked. */
export type FoilVerdict = 'foil' | 'nonfoil' | 'unsure';

export interface FinishChoice {
  finish: Finish;
  /** Where the answer came from, for the UI ("only made in foil", "looked foil"). */
  source: 'printing' | 'camera' | 'setting';
  /** False when nothing settled it and the user should check. */
  sure: boolean;
}

const ORDER: Finish[] = ['nonfoil', 'foil', 'etched'];

function made(p: { finishes: string[] }): Finish[] {
  return ORDER.filter((f) => p.finishes.includes(f));
}

export function chooseFinish(printing: { finishes: string[] }, setting: FinishSetting, seen?: FoilVerdict): FinishChoice {
  const finishes = made(printing);
  if (finishes.length === 1) return { finish: finishes[0], source: 'printing', sure: true };
  if (finishes.length === 0) {
    // Unknown data: fall back to the setting and let the user check.
    return { finish: setting === 'auto' ? 'nonfoil' : setting, source: 'setting', sure: false };
  }

  if (setting === 'auto') {
    // Shiny but no plain foil made: it's the etched one (etched foils also shimmer).
    const shiny: Finish | undefined = finishes.includes('foil') ? 'foil' : finishes.includes('etched') ? 'etched' : undefined;
    if (seen === 'foil' && shiny) return { finish: shiny, source: 'camera', sure: true };
    if (seen === 'nonfoil' && finishes.includes('nonfoil')) return { finish: 'nonfoil', source: 'camera', sure: true };
    // Not seen (or unsure): most cards are non-foil, but ask.
    return { finish: finishes.includes('nonfoil') ? 'nonfoil' : finishes[0], source: 'setting', sure: false };
  }

  if (finishes.includes(setting)) return { finish: setting, source: 'setting', sure: true };
  // The setting isn't made for this printing (e.g. Etched on, but only non-foil and foil exist).
  return { finish: finishes[0], source: 'setting', sure: false };
}

/** "only made in foil", "looked foil", or nothing for the user's own setting. */
export function finishReason(choice: FinishChoice): string | undefined {
  if (choice.source === 'printing') return `only made in ${choice.finish === 'nonfoil' ? 'non-foil' : choice.finish}`;
  if (choice.source === 'camera') return choice.finish === 'nonfoil' ? 'looked non-foil' : 'looked foil';
  return undefined;
}
