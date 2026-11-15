/**
 * Parsing the collector line printed bottom-left on 2015-frame cards and
 * newer:
 *
 *   2015-2022:  "086/269 R"  /  "AKH • EN  ~ Mark Behm"
 *   2023+:      "0086 R"     /  "MOM • EN  ~ Artist"
 *   The List:   same as the original printing, e.g. "AFR • EN" for plst "AFR-6"
 *
 * OCR of this ~1.5 mm text is noisy, so the parse is permissive and the
 * result is only used to score candidate printings, never trusted alone
 * except for non-English cards where the name can't be read.
 */

export interface CollectorInfo {
  collectorNumber?: string;
  /** Printed set total on 2015-2022 cards ("269" in "086/269"). */
  setTotal?: string;
  rarity?: 'C' | 'U' | 'R' | 'M' | 'S' | 'L' | 'T' | 'P';
  /** Uppercase, as printed. */
  setCode?: string;
  /** Scryfall language code ("en", "ja", "zhs"...). */
  lang?: string;
}

/** Language codes as printed on cards, mapped to Scryfall's. */
const PRINTED_LANG: Record<string, string> = {
  EN: 'en',
  ES: 'es',
  SP: 'es',
  FR: 'fr',
  DE: 'de',
  IT: 'it',
  PT: 'pt',
  JP: 'ja',
  JA: 'ja',
  KO: 'ko',
  KR: 'ko',
  RU: 'ru',
  CS: 'zhs',
  CT: 'zht',
  PH: 'ph',
  // Common misreads of the small "JP": no real language prints these.
  ID: 'ja',
  IP: 'ja',
  JD: 'ja',
};

const LANG_ALT = Object.keys(PRINTED_LANG).join('|');

/** Characters OCR commonly returns for digits. */
function fixDigits(s: string): string {
  return s
    .replace(/[Oo]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')
    .replace(/G/g, '6');
}

export function parseCollectorLine(raw: string): CollectorInfo {
  const text = raw.replace(/\r/g, '').toUpperCase();
  const out: CollectorInfo = {};

  // "SET • LANG": the bullet comes out as all sorts of things, or nothing.
  // "SET • LANG" starts the second line. Prefer the last such pair that begins a
  // line: stray letters above can look like "XYZ IT", and artist names after
  // it like "JOHN DE".
  const setLangs = [...text.matchAll(new RegExp(`(?:^|[^A-Z0-9])([A-Z0-9]{3,5})(?:\\s+|\\s*[^A-Z0-9\\s]{1,3}\\s*)(${LANG_ALT})(?![A-Z])`, 'g'))];
  const atLineStart = (m: RegExpMatchArray) => {
    const codeAt = (m.index ?? 0) + m[0].indexOf(m[1]);
    const lineStart = text.lastIndexOf('\n', codeAt - 1) + 1;
    return text.slice(lineStart, codeAt).replace(/\s/g, '').length <= 3;
  };
  const setLang = setLangs.filter(atLineStart).pop() ?? setLangs[setLangs.length - 1];
  if (setLang) {
    out.setCode = setLang[1];
    out.lang = PRINTED_LANG[setLang[2]];
  }

  const rest = setLang ? text.replace(setLang[0], ' ') : text;
  const D = '[0-9OISBZG|!]';
  // 2015-2022: "086/269 R"
  const old = new RegExp(`(?:^|[^A-Z0-9])(${D}{1,4}[A-Z]?)\\s*/\\s*(${D}{2,4})(?:\\s*([CURMSLTP])(?![A-Z0-9]))?`).exec(rest);
  // 2023+: "R 0189" (rarity, then a zero-padded 4-digit number)
  const neu = /(?:^|[^A-Z0-9])([CURMSLTP])\s*([0-9OISBZG|!]{4})(?![0-9A-Z])/.exec(rest);
  // fallback: "0189 R" / "189 R"
  const loose = new RegExp(`(?:^|[^A-Z0-9])(${D}{3,4})\\s+([CURMSLTP])(?![A-Z0-9])`).exec(rest);
  if (old) {
    const n = fixDigits(old[1]);
    const total = fixDigits(old[2]);
    if (/^\d+[A-Z]?$/.test(n) && /^\d+$/.test(total)) {
      out.collectorNumber = stripZeros(n);
      out.setTotal = stripZeros(total);
      if (old[3]) out.rarity = old[3] as CollectorInfo['rarity'];
    }
  }
  if (!out.collectorNumber && neu) {
    const n = fixDigits(neu[2]);
    if (/^\d{4}$/.test(n)) {
      out.collectorNumber = stripZeros(n);
      out.rarity = neu[1] as CollectorInfo['rarity'];
    }
  }
  if (!out.collectorNumber && loose) {
    const n = fixDigits(loose[1]);
    if (/^\d+$/.test(n)) {
      out.collectorNumber = stripZeros(n);
      out.rarity = loose[2] as CollectorInfo['rarity'];
    }
  }
  return out;
}

function stripZeros(s: string): string {
  const t = s.replace(/^0+(?=\d)/, '');
  return t || '0';
}

export interface PrintingKey {
  set: string;
  collectorNumber: string;
  lang?: string;
}

/**
 * How well the parsed collector line agrees with a printing, 0..1.
 * Set code and number each count half; a set code one letter off counts a
 * little (OCR), and a missing field contributes nothing either way.
 */
export function collectorScore(info: CollectorInfo, p: PrintingKey): number {
  let score = 0;
  let set = p.set.toUpperCase();
  let cn = p.collectorNumber.toUpperCase();
  // The List and similar reprint sets print the original set's line.
  const listStyle = /^([A-Z0-9]{3,5})-(\d+[A-Z]?)$/.exec(cn);
  if (listStyle) {
    set = listStyle[1];
    cn = listStyle[2];
    // The original printing looks identical; prefer it on a tie (it's far more common).
    score -= 0.05;
  }
  if (info.setCode) {
    if (info.setCode === set) score += 0.5;
    else if (editDistance(info.setCode, set) === 1 && set.length >= 3) score += 0.2;
  }
  if (info.collectorNumber) {
    const ours = stripZeros(cn.replace(/[^0-9A-Z★]/g, ''));
    if (info.collectorNumber === ours) score += 0.5;
    else if (ours.replace(/[A-Z★]+$/, '') === info.collectorNumber.replace(/[A-Z]+$/, '')) score += 0.35;
  }
  return Math.max(0, score);
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export interface CopyrightInfo {
  collectorNumber?: string;
  setTotal?: string;
  /** The last year printed ("2011" in "1993-2011"): when the card was printed. */
  year?: number;
}

/** Parses the bottom copyright line: "™ & © 1993-2003 Wizards of the Coast, Inc. 78/143". */
export function parseCopyrightLine(raw: string): CopyrightInfo {
  const text = raw.replace(/\r/g, '').toUpperCase();
  const out: CopyrightInfo = {};
  const years = [...text.matchAll(/(?<![0-9])(19[89][0-9]|20[0-4][0-9])(?![0-9])/g)].map((m) => Number(m[1]));
  if (years.length) out.year = Math.max(...years);
  // The number comes last on the line; take the last "N/T" whose total is
  // at least the number.
  const D = '[0-9OISBZG|!]';
  const pairs = [...text.matchAll(new RegExp(`(?:^|[^0-9])(${D}{1,3})\\s*/\\s*(${D}{2,3})(?![0-9])`, 'g'))];
  for (const m of pairs.reverse()) {
    const n = fixDigits(m[1]);
    const total = fixDigits(m[2]);
    if (!/^\d+$/.test(n) || !/^\d+$/.test(total)) continue;
    if (Number(n) < 1 || Number(n) > Number(total) + 20) continue;
    out.collectorNumber = stripZeros(n);
    out.setTotal = stripZeros(total);
    break;
  }
  return out;
}

/** Letters and digits OCR swaps in the tiny set code. */
const SET_CONFUSIONS: Record<string, string[]> = {
  '0': ['O', 'D'],
  O: ['0', 'D'],
  D: ['O', '0'],
  '1': ['I', 'L'],
  I: ['1', 'L'],
  L: ['1', 'I'],
  '2': ['Z'],
  Z: ['2'],
  '5': ['S'],
  S: ['5'],
  '8': ['B'],
  B: ['8'],
  '6': ['G'],
  G: ['6'],
  '9': ['2'],
};

/**
 * Plausible real set codes for a misread one, closest first: one swapped
 * look-alike character ("C91" -> "C21"), or one extra character dropped
 * ("WADR" -> "WAR"). The caller checks each against the database.
 */
export function setCodeVariants(code: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < code.length; i++) {
    for (const alt of SET_CONFUSIONS[code[i]] ?? []) out.add(code.slice(0, i) + alt + code.slice(i + 1));
  }
  if (code.length >= 4) for (let i = 0; i < code.length; i++) out.add(code.slice(0, i) + code.slice(i + 1));
  out.delete(code);
  return [...out].filter((c) => c.length >= 3);
}
