/**
 * The recogniser: photo in, ranked printings out.
 *
 *   1. Find the card in the frame and flatten it (geometry.ts).
 *   2. Picture first (artindex.ts): compare the artwork with every printing's.
 *      When one card clearly wins, that's the card, and only the collector
 *      line is read, to tell its reprints apart (the edition).
 *   3. Otherwise read it: OCR the title bar and fuzzy-match it against every
 *      card name, and OCR the collector line (set code, number, language).
 *   4. Fetch that name's printings and rank them by collector-line agreement
 *      plus how closely each one's picture matches the photo.
 *
 * If the name can't be read (e.g. a non-English card) but the collector
 * line can, the printing is looked up directly by set and number.
 */
import type { ArtMatch } from './artindex';
import { collectorScore, type CollectorInfo, type CopyrightInfo, parseCollectorLine, parseCopyrightLine, setCodeVariants } from './collector';
import { CANON_HEIGHT, CANON_WIDTH, detectCard, guideRect, warpQuad, type CardDetection } from './geometry';
import { hammingHex, pHash } from './hash';
import {
  cropFraction,
  type GrayImage,
  maxChannel,
  minChannel,
  normalizePolarity,
  type Rect,
  clamp,
  resizeGray,
  rotate180,
  type RGBAImage,
  scaleGray,
  stretchContrast,
  toGray,
} from './image';
import { detectCardAnywhere } from './locate';
import { ART_REGION, COLLECTOR_REGION, COLLECTOR_RETRY_REGIONS, COPYRIGHT_REGION, NAME_BAND, NAME_REGION } from './layout';
import type { CardLookup, Printing } from './lookup';
import { type NameIndex, type NameMatch, normalizeName, similarity } from './names';
import type { OcrEngine } from './ocr';

export interface RecognizerDeps {
  ocr: OcrEngine;
  /** Every card name, or a loader for it (only needed when a card has to be read by its title). */
  names: NameIndex | (() => Promise<NameIndex>);
  lookup: CardLookup;
  /** Picture recognition: the printings whose artwork looks most like this upright card, best first. */
  art?: (card: RGBAImage) => ArtMatch[] | Promise<ArtMatch[]>;
  /** Loads a Scryfall image URL as RGBA (canvas in the browser, sharp in Node). */
  loadImage: (url: string) => Promise<RGBAImage>;
  /** Shared cache of image hashes by Scryfall id. */
  hashCache?: Map<string, Promise<ImageHashes | null>>;
}

export interface ImageHashes {
  card: string;
  art: string;
  /** Coarse colour layout of the art (4x4 cells, RGB relative to the art's average). */
  color?: number[];
  /** The same over the whole card: border and frame colours tell reprints of the same art apart. */
  cardColor?: number[];
}

export interface ReadResult {
  nameText: string;
  nameConfidence: number;
  collectorText: string;
  collector: CollectorInfo;
  /** The bottom copyright line, read when the collector line gave no set code. */
  copyrightText?: string;
  copyright?: CopyrightInfo;
  nameMatches: NameMatch[];
  /** The card was upside down in the photo (we rotated it). */
  upsideDown: boolean;
  /** The flattened, upright card image. */
  card: RGBAImage;
}

export interface CandidateScore {
  printing: Printing;
  /** Combined score, higher is better. */
  score: number;
  collectorScore: number;
  /** Hamming distance between the photo and Scryfall's image (0..64), if compared. */
  hashDistance?: number;
  /** How much this printing's artwork looks like the photo (cosine, see artindex.ts), if compared. */
  artSimilarity?: number;
}

export interface ScanResult {
  /**
   * matched: confident enough to add with one tap.
   * uncertain: we have a guess, ask the user to check name or printing.
   * not-found: nothing usable; let the user type the name.
   */
  status: 'matched' | 'uncertain' | 'not-found';
  best?: CandidateScore;
  candidates: CandidateScore[];
  name?: NameMatch;
  /**
   * The card's language (Scryfall code). Missing when the card was identified
   * but its language couldn't be told (e.g. an older Japanese card); ask.
   * The printing itself is usually the English one: the card database only
   * holds English printings, so a Japanese card is its English printing + lang.
   */
  lang?: string;
  read: Omit<ReadResult, 'card'>;
  detection?: CardDetection;
  /** What the picture said: the best match's similarity, and its lead over the best other card. */
  art?: { name: string; similarity: number; margin: number; sure: boolean };
  timingsMs: Record<string, number>;
}

const NAME_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',-.!?&:/àáâäéèêëíîïóôöúûüñçæÆ";
const COLLECTOR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•*.- ';
const COPYRIGHT_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/&.,- ';
const GOOD_NAME = 0.8;
const MAX_HASHED = 40;
/** A picture match this close names the card without reading its title... */
export const ART_SURE = 0.5;
/** ...when it also beats every other card by this much. */
export const ART_MARGIN = 0.1;
/**
 * Picture matches that are rarely wrong even on blurred, glared, colour-cast copies of all
 * 111k printings (1 in ~900). Below this, a card named by its picture is only added without
 * asking when the collector line or the title agrees.
 */
const ART_VERY_SURE = 0.65;
const ART_VERY_SURE_MARGIN = 0.15;
/** Printings compared by picture: enough to cover every reprint of a card with the same art. */
const ART_CANDIDATES = 100;
/**
 * Scryfall's scans of the same art differ a little (colour, crop): printings within ART_SAME of
 * the best count as the same art, and from there to ART_SAME + ART_SPREAD below it, less and less.
 */
const ART_SAME = 0.06;
const ART_SPREAD = 0.1;
/** Enough to confirm a card that the collector line named. */
const ART_LOOKS_LIKE = 0.5;
/** Below this, a title read is junk that happened to spell a real name. */
const ART_UNLIKE = 0.4;

/**
 * Flattens the card found in a camera frame.
 *
 * With a guide (the live camera), the card is expected near it; if its edges
 * aren't there, the whole frame is searched. Without one (an uploaded photo),
 * the whole frame is searched first. The guide box itself is the last resort.
 */
export function extractCard(frame: RGBAImage, guide?: Rect): { card: RGBAImage; detection: CardDetection } {
  let detection: CardDetection | null = null;
  if (guide) {
    detection = detectCard(frame, guide);
    if (detection.usedGuide) detection = detectCardAnywhere(frame) ?? detection;
  } else {
    detection = detectCardAnywhere(frame) ?? detectCard(frame, guideRect(frame.width, frame.height, 0.92));
  }
  return { card: warpQuad(frame, detection.quad, CANON_WIDTH, CANON_HEIGHT), detection };
}

type Channel = 'luma' | 'min' | 'max';

function prepText(img: RGBAImage, targetHeight: number, channel: Channel): GrayImage {
  const g = channel === 'min' ? minChannel(img) : channel === 'max' ? maxChannel(img) : toGray(img);
  const scaled = scaleGray(g, targetHeight / g.height);
  return normalizePolarity(stretchContrast(scaled));
}

interface NameRead {
  text: string;
  confidence: number;
  matches: NameMatch[];
}

/** Matches the whole OCR text and each line of it; the best-scoring line wins. */
function matchLines(text: string, names: NameIndex): NameMatch[] {
  const lines = [text, ...text.split('\n')].map((l) => l.trim()).filter((l) => l.length >= 2);
  let best: NameMatch[] = [];
  for (const l of [...new Set(lines)]) {
    const m = names.match(l, 5);
    if (m.length && (!best.length || m[0].score > best[0].score)) best = m;
  }
  return best;
}

const topScore = (r: NameRead) => r.matches[0]?.score ?? 0;

/**
 * Reads the name with a short cascade, stopping as soon as a read is good:
 *   1. the tall band as a block, min-channel (best single variant in tests)
 *   2. the tight title bar as one line, luma
 * The two fail on different cards, so together they cover most frames.
 */
async function namesOf(deps: RecognizerDeps): Promise<NameIndex> {
  if (typeof deps.names === 'function') deps.names = await deps.names();
  return deps.names;
}

async function readName(card: RGBAImage, deps: RecognizerDeps): Promise<NameRead> {
  const names = await namesOf(deps);
  const band = cropFraction(card, NAME_BAND);
  const r1 = await deps.ocr.recognize(prepText(band, 150, 'min'), { mode: 'block', whitelist: NAME_WHITELIST });
  let best: NameRead = { ...r1, matches: matchLines(r1.text, names) };
  if (topScore(best) >= 0.85) return best;
  const bar = cropFraction(card, NAME_REGION);
  const r2 = await deps.ocr.recognize(prepText(bar, 64, 'luma'), { mode: 'line', whitelist: NAME_WHITELIST });
  const second: NameRead = { ...r2, matches: matchLines(r2.text, names) };
  if (topScore(second) > topScore(best)) best = second;
  return best;
}

/** Stage 1: read the text on an already-flattened card. */
export async function readCard(cardImg: RGBAImage, deps: RecognizerDeps): Promise<ReadResult> {
  let card = cardImg;
  let upsideDown = false;
  let name = await readName(card, deps);
  if ((name.matches[0]?.score ?? 0) < GOOD_NAME) {
    const flipped = rotate180(card);
    const alt = await readName(flipped, deps);
    // Only turn it over for a convincing read: junk from a non-English title
    // can fuzzy-match some short name either way up.
    const altScore = alt.matches[0]?.score ?? 0;
    if (altScore >= GOOD_NAME && altScore > (name.matches[0]?.score ?? 0) + 0.1) {
      card = flipped;
      name = alt;
      upsideDown = true;
    }
  }
  // Only cards that print one (2015 frame on) have a collector line; a frame
  // with a readable name and nothing there is probably older, so don't retry.
  const lines = await readBottomLines(card, deps, (name.matches[0]?.score ?? 0) >= GOOD_NAME);
  return {
    nameText: name.text,
    nameConfidence: name.confidence,
    ...lines,
    nameMatches: name.matches,
    upsideDown,
    card,
  };
}

/**
 * The collector line (set code, number, language), retried at nearby crops
 * unless `noRetry`, plus the copyright line when no set code was read.
 * `enough`: what was read already settles it (no retries, no copyright line).
 */
async function readBottomLines(
  card: RGBAImage,
  deps: RecognizerDeps,
  noRetry: boolean,
  enough?: (info: CollectorInfo) => boolean,
): Promise<Pick<ReadResult, 'collectorText' | 'collector' | 'copyrightText' | 'copyright'>> {
  const readCollector = async (region: typeof COLLECTOR_REGION) => {
    const r = await deps.ocr.recognize(prepText(cropFraction(card, region), 150, 'max'), { mode: 'block', whitelist: COLLECTOR_WHITELIST });
    return { text: r.text, info: parseCollectorLine(r.text) };
  };
  let col = await readCollector(COLLECTOR_REGION);
  const nameIsGood = noRetry || !!enough?.(col.info);
  for (const region of COLLECTOR_RETRY_REGIONS) {
    if ((col.info.setCode && col.info.collectorNumber) || nameIsGood) break;
    const alt = await readCollector(region);
    // Keep what each read got right: one may catch the number, another the set.
    const merged: CollectorInfo = alt.info.setCode ? { ...col.info, ...alt.info } : { ...alt.info, ...col.info };
    if (!alt.info.collectorNumber && col.info.collectorNumber) {
      merged.collectorNumber = col.info.collectorNumber;
      merged.setTotal = col.info.setTotal;
      merged.rarity = col.info.rarity;
    }
    if (alt.info.setCode || alt.info.collectorNumber) col = { text: `${col.text}\n${alt.text}`, info: merged };
  }
  const collector = col.info;
  let copyrightText: string | undefined;
  let copyright: CopyrightInfo | undefined;
  if (!collector.setCode && !enough?.(collector)) {
    // No set code: an older frame (number and year are in the copyright
    // line) or a misread one. Either way the copyright line helps.
    const strip = cropFraction(card, COPYRIGHT_REGION);
    const r = await deps.ocr.recognize(prepText(strip, 120, 'luma'), { mode: 'block', whitelist: COPYRIGHT_WHITELIST });
    copyrightText = r.text;
    copyright = parseCopyrightLine(r.text);
  }
  return { collectorText: col.text, collector, copyrightText, copyright };
}

export function imageHashes(img: RGBAImage): ImageHashes {
  // Compare at a common size so Scryfall's 488x680 and our 630x880 agree.
  const g = resizeGray(toGray(img), 244, 340);
  const art = cropFraction(g, ART_REGION);
  return { card: pHash(g), art: pHash(art), color: colorLayout(cropFraction(img, ART_REGION)), cardColor: colorLayout(img) };
}

/**
 * Mean colour of each cell of a 4x4 grid, each channel divided by its mean
 * over the whole art, so white balance and exposure mostly cancel out.
 * Separates unrelated arts that happen to share a similar brightness layout.
 */
export function colorLayout(art: RGBAImage, grid = 4): number[] {
  const cells: number[][] = [];
  const total = [0, 0, 0];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const sum = [0, 0, 0];
      let n = 0;
      const y1 = Math.floor(((gy + 1) * art.height) / grid);
      const x1 = Math.floor(((gx + 1) * art.width) / grid);
      for (let y = Math.floor((gy * art.height) / grid); y < y1; y += 2) {
        for (let x = Math.floor((gx * art.width) / grid); x < x1; x += 2) {
          const i = (y * art.width + x) * 4;
          sum[0] += art.data[i];
          sum[1] += art.data[i + 1];
          sum[2] += art.data[i + 2];
          n++;
        }
      }
      const mean = sum.map((v) => v / Math.max(1, n));
      cells.push(mean);
      for (let c = 0; c < 3; c++) total[c] += mean[c] / (grid * grid);
    }
  }
  return cells.flatMap((m) => m.map((v, c) => v / (total[c] + 1)));
}

/**
 * How different two card images look, weighting the art (the same in every
 * language and frame treatment) over the whole card. ~15-21 for the right
 * card in a real photo, 25+ for others.
 */
export function imageDistance(a: ImageHashes, b: ImageHashes): number {
  const hash = (hammingHex(a.card, b.card) + 2 * hammingHex(a.art, b.art)) / 3;
  return hash + 40 * colorDiff(a.color, b.color);
}

/** Mean absolute difference of two colour layouts (0 when either is missing). */
export function colorDiff(a?: number[], b?: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / a.length;
}

function hashFor(p: Printing, deps: RecognizerDeps): Promise<ImageHashes | null> {
  const cache = deps.hashCache ?? (deps.hashCache = new Map());
  let h = cache.get(p.scryfallId);
  if (!h) {
    const url = p.imageNormal ?? p.imageSmall;
    h = url
      ? deps.loadImage(url).then(imageHashes, () => {
          cache.delete(p.scryfallId);
          return null;
        })
      : Promise.resolve(null);
    cache.set(p.scryfallId, h);
  }
  return h;
}

/** Stage 2: rank the printings of the read name. */
export async function rankPrintings(
  read: ReadResult,
  printings: Printing[],
  deps: RecognizerDeps,
  /** A printing the collector number already pinned down (counts as a full collector match). */
  pinned?: Printing,
  /** Picture matches: when given, they say which printings look like the photo (no downloads). */
  art?: ArtEvidence,
): Promise<CandidateScore[]> {
  const scored: CandidateScore[] = printings.map((printing) => ({
    printing,
    collectorScore: printing.scryfallId === pinned?.scryfallId ? 1 : collectorScore(read.collector, printing),
    score: 0,
    artSimilarity: art?.sims.get(printing.scryfallId),
  }));
  if (art) {
    const top = Math.max(0, ...scored.map((c) => c.artSimilarity ?? 0));
    for (const c of scored) c.score = c.collectorScore + artFit(c.artSimilarity, top) + reprintPrior(c.printing);
    return scored.sort((a, b) => b.score - a.score);
  }
  const photo = imageHashes(read.card);
  // Hash the most promising ones: best collector agreement, then newest.
  const order = [...scored].sort((a, b) => b.collectorScore - a.collectorScore);
  const toHash = printings.length <= 1 ? [] : order.slice(0, MAX_HASHED);
  const colorOff = new Map<CandidateScore, number>();
  await Promise.all(
    toHash.map(async (c) => {
      const h = await hashFor(c.printing, deps);
      if (h) {
        c.hashDistance = (hammingHex(h.card, photo.card) + hammingHex(h.art, photo.art)) / 2;
        colorOff.set(c, colorDiff(h.cardColor, photo.cardColor));
      }
    }),
  );
  for (const c of scored) {
    // ~32 bits differ between unrelated images; identical art is usually < 10.
    const hashSim = c.hashDistance === undefined ? 0 : Math.max(0, 1 - c.hashDistance / 28);
    // Same art, different border or frame (Unlimited vs a modern reprint): colour tells them apart.
    const colorPenalty = 3 * (colorOff.get(c) ?? 0);
    c.score = c.collectorScore + hashSim - colorPenalty + reprintPrior(c.printing);
  }
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Looks up the printing named by the collector line, if it was read. Used to
 * confirm or overrule a shaky name read: "DOM 1" is Karn, Scion of Urza even
 * when the title bar came out as "Econ of Urza".
 */
async function collectorPrinting(read: ReadResult, deps: RecognizerDeps, expectFace?: string): Promise<Printing | null> {
  const { setCode, collectorNumber, lang } = read.collector;
  if (!setCode || !collectorNumber) return null;
  const find = (code: string) => deps.lookup.bySetAndNumber(code, collectorNumber, lang).catch(() => null);
  const exact = await find(setCode);
  if (exact) return exact;
  // A misread set code ("C91" for C21): accept a look-alike code only when the
  // card it names also fits the title or the printed rarity.
  const title = normalizeName(read.nameText);
  for (const code of setCodeVariants(setCode)) {
    const p = await find(code);
    if (!p) continue;
    const fit = similarity(normalizeName(p.name.split(' // ')[0]), title);
    if (fit >= 0.45 || rarityAgrees(read.collector, p) || frontFace(p.name) === expectFace) return p;
  }
  return null;
}

/**
 * Older cards print "74/175" and a year instead of a set code. Finds the sets
 * of that size with that card number, keeps those printed around that year,
 * then picks by the title (if readable) or by the picture (if not, e.g. a
 * Japanese card). `sure` means the pick is unambiguous.
 */
async function numberPrinting(read: ReadResult, deps: RecognizerDeps): Promise<{ printing: Printing; sure: boolean; distance?: number } | null> {
  if (!deps.lookup.byNumberAndTotal) return null;
  const number = read.collector.collectorNumber ?? read.copyright?.collectorNumber;
  const total = Number(read.collector.setTotal ?? read.copyright?.setTotal);
  if (!number || !total) return null;
  let cands = await deps.lookup.byNumberAndTotal(number, total).catch(() => [] as Printing[]);
  const year = read.copyright?.year;
  if (year) {
    const near = cands.filter((p) => {
      const y = Number(p.releasedAt?.slice(0, 4));
      return !y || (y >= year - 1 && y <= year + 1);
    });
    if (near.length) cands = near;
  }
  if (!cands.length) return null;

  // A readable title settles it.
  const title = normalizeName(read.nameText);
  const fits = cands
    .map((p) => ({ p, fit: similarity(normalizeName(p.name.split(' // ')[0]), title) }))
    .sort((a, b) => b.fit - a.fit);
  if (fits[0].fit >= 0.6 && (fits.length === 1 || fits[0].fit - fits[1].fit >= 0.2)) return { printing: fits[0].p, sure: true };
  if (fits.length > 20) return null;

  // Otherwise compare the pictures (the art is the same in every language).
  const photo = imageHashes(read.card);
  const scored = (
    await Promise.all(
      cands.map(async (p) => {
        const h = await hashFor(p, deps);
        return h ? { p, d: imageDistance(h, photo) } : null;
      }),
    )
  )
    .filter((x): x is { p: Printing; d: number } => !!x)
    .sort((a, b) => a.d - b.d);
  // Real photos: foreign text and lighting keep even the right card well above zero.
  if (!scored.length || scored[0].d > 28) return null;
  const margin = scored.length > 1 ? scored[1].d - scored[0].d : 32;
  if (margin < 4) return null;
  const titleAgrees = fits[0].p.scryfallId === scored[0].p.scryfallId && fits[0].fit >= 0.4;
  return { printing: scored[0].p, sure: margin >= 6 && (scored[0].d <= 24 || titleAgrees), distance: scored[0].d };
}

/**
 * Whether the photo looks like Scryfall's image of this printing: confirms a
 * set + number read when the title can't (a Japanese card, say).
 */
async function looksLike(read: ReadResult, p: Printing, deps: RecognizerDeps, art?: ArtEvidence): Promise<boolean> {
  const sim = art?.sims.get(p.scryfallId);
  if (sim !== undefined) return sim >= ART_LOOKS_LIKE;
  const h = await hashFor(p, deps);
  if (!h) return false;
  const d = imageDistance(h, imageHashes(read.card));
  return d <= 24;
}

function rarityAgrees(info: CollectorInfo, p: Printing): boolean {
  return !!info.rarity && !!p.rarity && p.rarity[0].toUpperCase() === info.rarity;
}

/**
 * A small nudge towards the ordinary printing when two look the same: The
 * List reprints ("plst", numbers like "AFR-6") and promos copy the original's
 * art and frame exactly.
 */
function reprintPrior(p: Printing): number {
  if (p.variantRank !== undefined) return -0.006 * Math.min(p.variantRank, 10);
  let prior = 0;
  if (/^[A-Z0-9]{3,5}-\d/i.test(p.collectorNumber)) prior -= 0.03;
  if (p.promo) prior -= 0.02;
  return prior;
}

/** What the picture said about a card. */
export interface ArtEvidence {
  /** Similarity by printing id (the closest ART_CANDIDATES printings). */
  sims: Map<string, number>;
  /** Cards (by front face), best first, with their best printing's similarity. */
  names: { name: string; face: string; similarity: number }[];
  /** The top card is clearly the one in the photo. */
  sure: boolean;
  /** The card was matched turned around (it was upside down in the photo). */
  upsideDown: boolean;
}

const frontFace = (name: string) => name.split(' // ')[0];

/** 1 for the printing that looks most like the photo (and its same-art reprints), 0 for different art. */
function artFit(sim: number | undefined, top: number): number {
  return sim === undefined ? 0 : clamp(1 - (top - sim - ART_SAME) / ART_SPREAD, 0, 1);
}

async function artLook(card: RGBAImage, deps: RecognizerDeps, upsideDown: boolean): Promise<ArtEvidence | null> {
  const matches = (await deps.art!(card)).slice(0, ART_CANDIDATES);
  if (!matches.length) return null;
  const printings = await deps.lookup.byIds!(matches.map((m) => m.id));
  const sims = new Map(matches.map((m) => [m.id, m.similarity]));
  // Group by front face: an art-series card "X // X" and a token named like a card aren't rivals.
  const byFace = new Map<string, { name: string; face: string; similarity: number }>();
  for (const p of printings) {
    const sim = sims.get(p.scryfallId) ?? 0;
    const face = frontFace(p.name);
    const had = byFace.get(face);
    if (!had) byFace.set(face, { name: p.name, face, similarity: sim });
    else {
      had.similarity = Math.max(had.similarity, sim);
      // The card's own name rather than an art-series card's "X // X".
      if (p.name.length < had.name.length) had.name = p.name;
    }
  }
  const names = [...byFace.values()].sort((a, b) => b.similarity - a.similarity);
  const top = names[0];
  const sure = !!top && top.similarity >= ART_SURE && top.similarity - (names[1]?.similarity ?? 0) >= ART_MARGIN;
  return { sims, names, sure, upsideDown };
}

/** Picture recognition, upright first, then turned around. Null without an index or card data. */
export async function artEvidence(card: RGBAImage, deps: RecognizerDeps): Promise<{ evidence: ArtEvidence; card: RGBAImage } | null> {
  if (!deps.art || !deps.lookup.byIds) return null;
  const up = await artLook(card, deps, false);
  if (up?.sure) return { evidence: up, card };
  const flipped = rotate180(card);
  const down = await artLook(flipped, deps, true);
  // Only a clear match counts the other way up (art upside down can look a little like anything).
  if (down?.sure) return { evidence: down, card: flipped };
  return up ? { evidence: up, card } : null;
}

function artSummary(ev: ArtEvidence | undefined): ScanResult['art'] {
  if (!ev?.names.length) return undefined;
  const [top, next] = ev.names;
  return { name: top.name, similarity: round3(top.similarity), margin: round3(top.similarity - (next?.similarity ?? 0)), sure: ev.sure };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Full pipeline on an already-flattened, upright-or-upside-down card image. */
export async function identifyCard(cardImg: RGBAImage, deps: RecognizerDeps): Promise<ScanResult> {
  const t0 = now();
  const art = await artEvidence(cardImg, deps).catch((e) => {
    // A broken index must not stop scanning: read the card instead.
    console.warn('art recognition failed', e);
    return null;
  });
  const artMs = now() - t0;
  if (art?.evidence.sure) {
    const res = await identifyByArt(art.card, art.evidence, deps);
    if (res && (res.name?.score ?? 0) >= 1) return { ...res, timingsMs: { art: artMs, ...res.timingsMs } };
    if (res) {
      // Only the picture vouches for it (no collector line or title agrees): read the card, and
      // keep the picture's guess unless the title clearly reads as another card.
      const read = await identifyByReading(cardImg, deps, art.evidence);
      const other = read.name && read.name.score >= GOOD_NAME && frontFace(read.name.name) !== frontFace(res.name!.name);
      const pick = other ? { ...read, art: res.art } : res;
      return { ...pick, timingsMs: { art: artMs, ...res.timingsMs, reread: read.timingsMs.read } };
    }
  }
  const res = await identifyByReading(cardImg, deps, art?.evidence);
  return { ...res, art: artSummary(art?.evidence), timingsMs: { ...(art ? { art: artMs } : {}), ...res.timingsMs } };
}

/**
 * The picture named the card: read only the bottom lines for the edition (and
 * the title only when the language isn't printed). Null when the collector
 * line names a different card: then it's read in full.
 */
async function identifyByArt(card: RGBAImage, art: ArtEvidence, deps: RecognizerDeps): Promise<ScanResult | null> {
  const t0 = now();
  const top = art.names[0];
  // The name's printings first, so reading can stop as soon as the collector line matches one.
  const english = await deps.lookup.printingsByName(top.name);
  const lines = await readBottomLines(card, deps, false, (info) => {
    // The language, and set and number or a number only one printing has (not also a The List copy).
    const hits = english.filter((p) => collectorScore(info, p) >= 0.45);
    return !!info.lang && (hits.some((p) => collectorScore(info, p) >= 1) || hits.length === 1);
  });
  const read: ReadResult = { nameText: '', nameConfidence: 0, ...lines, nameMatches: [], upsideDown: art.upsideDown, card };
  // Older cards print their number in the copyright line ("57/350"): it tells same-art reprints apart too.
  const { collector, copyright } = lines;
  if (!collector.collectorNumber && copyright?.collectorNumber) {
    read.collector = { ...collector, collectorNumber: copyright.collectorNumber, setTotal: collector.setTotal ?? copyright.setTotal };
  }
  const t1 = now();
  const timingsMs: Record<string, number> = { read: t1 - t0 };

  const byCollector = await collectorPrinting(read, deps, top.face);
  if (byCollector && frontFace(byCollector.name) !== top.face) return null;
  let printings = read.collector.lang && read.collector.lang !== 'en' ? await deps.lookup.printingsByName(top.name, { lang: read.collector.lang }) : english;
  if (!printings.length) return null;
  if (byCollector && !printings.some((p) => p.scryfallId === byCollector.scryfallId)) printings = [byCollector, ...printings];
  // ...and its year: "1993-1998" isn't Eighth Edition's 57/350.
  const year = byCollector ? undefined : copyright?.year;
  const byYear = (list: CandidateScore[]) => {
    if (!year) return list;
    for (const c of list) {
      const y = Number(c.printing.releasedAt?.slice(0, 4));
      if (y && (y < year - 1 || y > year + 1)) c.score -= 0.5;
    }
    return list.sort((a, b) => b.score - a.score);
  };
  let candidates = byYear(await rankPrintings(read, printings, deps, byCollector ?? undefined, art));
  // Same art and nothing on the collector line to tell them apart (older cards): compare the
  // whole card, borders and all, with Scryfall's pictures of the few that tie.
  const tied = candidates.filter((c) => candidates[0].score - c.score < 0.2);
  if (tied.length > 1 && !byCollector) {
    const reranked = byYear(await rankPrintings(read, tied.slice(0, 12).map((c) => c.printing), deps));
    const order = new Map(reranked.map((c, i) => [c.printing.scryfallId, { i, c }]));
    candidates = [
      ...reranked.map((c) => ({ ...c, artSimilarity: art.sims.get(c.printing.scryfallId) })),
      ...candidates.filter((c) => !order.has(c.printing.scryfallId)),
    ];
  }
  timingsMs.rank = now() - t1;
  const best = candidates[0];
  const second = candidates[1];
  const clearPrinting = !second || best.score - second.score >= 0.2 || best.collectorScore >= 1;

  // A second opinion before adding without asking: the collector line agrees (set or number),
  // or the picture is very clear, or the title reads as this card.
  const margin = top.similarity - (art.names[1]?.similarity ?? 0);
  const collectorAgrees = best.collectorScore >= 0.5;
  const verySure = top.similarity >= ART_VERY_SURE && margin >= ART_VERY_SURE_MARGIN;
  // The title is also how an unmarked card's language is told (English if it reads as the name).
  const needTitle = (!read.collector.lang && (best.printing.lang ?? 'en') === 'en') || (!collectorAgrees && !verySure);
  let titleAgrees = false;
  if (needTitle) {
    const t2 = now();
    const title = await readTitleText(card, deps, best.printing.name);
    read.nameText = title.text;
    read.nameConfidence = title.confidence;
    titleAgrees = titleFit(read.nameText, best.printing.name) >= 0.4;
    timingsMs.title = now() - t2;
  }
  const lang = cardLanguage(read, best.printing);
  const confirmed = collectorAgrees || verySure || titleAgrees;
  const name: NameMatch = { name: best.printing.name, matchedFace: frontFace(best.printing.name), score: confirmed ? 1 : 0.7 };
  return {
    status: clearPrinting && lang && confirmed ? 'matched' : 'uncertain',
    best,
    candidates,
    name,
    lang,
    read: withoutCard(read),
    art: artSummary(art),
    timingsMs,
  };
}

/**
 * The title's text, checked against the name the picture gave (no list of every name needed):
 * enough to tell an English card from another language. The same two reads as readName.
 */
async function readTitleText(card: RGBAImage, deps: RecognizerDeps, expect: string): Promise<{ text: string; confidence: number }> {
  const r1 = await deps.ocr.recognize(prepText(cropFraction(card, NAME_BAND), 150, 'min'), { mode: 'block', whitelist: NAME_WHITELIST });
  if (titleFit(r1.text, expect) >= 0.85) return r1;
  const r2 = await deps.ocr.recognize(prepText(cropFraction(card, NAME_REGION), 64, 'luma'), { mode: 'line', whitelist: NAME_WHITELIST });
  return titleFit(r2.text, expect) > titleFit(r1.text, expect) ? r2 : r1;
}

/** Reading the card: the title, then the collector line, with the picture (if any) as a second opinion. */
async function identifyByReading(cardImg: RGBAImage, deps: RecognizerDeps, art?: ArtEvidence): Promise<ScanResult> {
  const t0 = now();
  const read = await readCard(cardImg, deps);
  const t1 = now();
  const readOut = withoutCard(read);
  const timingsMs: Record<string, number> = { read: t1 - t0 };

  let name: NameMatch | undefined = read.nameMatches[0];
  // A shaky title read that the picture agrees with: one of the close spellings is also one of
  // the closest pictures.
  if (art && (name?.score ?? 0) < GOOD_NAME) {
    const pictured = new Map(art.names.slice(0, 5).filter((n) => n.similarity >= 0.45).map((n) => [n.face, n] as const));
    const both = read.nameMatches.find((m) => m.score >= 0.5 && pictured.has(frontFace(m.name)));
    if (both) name = { ...both, score: Math.max(both.score, GOOD_NAME) };
  }
  let byCollector = await collectorPrinting(read, deps);
  let pinned: Printing | undefined;
  let byNumber = false;
  let numberDistance: number | undefined;
  if (!byCollector) {
    const found = await numberPrinting(read, deps);
    if (found) {
      byCollector = found.printing;
      byNumber = true;
      numberDistance = found.distance;
      if (found.sure) pinned = found.printing;
    }
  }
  let collectorAgrees = false;
  if (byCollector) {
    // How well does the collector line's card fit what we read in the title bar?
    const face = byCollector.name.split(' // ')[0];
    const fit = Math.max(similarity(normalizeName(face), normalizeName(read.nameText)), similarity(normalizeName(byCollector.name), normalizeName(read.nameText)));
    const sameAsName = name && name.name === byCollector.name;
    if (sameAsName) collectorAgrees = true;
    else if (byNumber && (!name || name.score < GOOD_NAME)) {
      // Number, set size and year agree, and the picture matches (`pinned`
      // when clearly). A shaky title read doesn't outvote that.
      name = { name: byCollector.name, matchedFace: face, score: Math.max(fit, 0.6) };
      collectorAgrees = !!pinned;
    } else if (fit >= 0.45 || !name || name.score < 0.55 || (name.score < GOOD_NAME && rarityAgrees(read.collector, byCollector))) {
      // A full set+number hit that also resembles the title (or beats an unreadable one).
      // Score reflects how well the title read agrees; the hit itself is trusted.
      name = { name: byCollector.name, matchedFace: face, score: Math.max(fit, 0.6) };
      collectorAgrees = fit >= 0.45 || (await looksLike(read, byCollector, deps, art));
    }
  }
  timingsMs.collector = now() - t1;

  if (!name || name.score < 0.55) {
    return { status: 'not-found', candidates: [], read: readOut, timingsMs };
  }

  const t2 = now();
  const rankName = async (cardName: string) => {
    let printings = await deps.lookup.printingsByName(cardName, { lang: read.collector.lang });
    if (byCollector && byCollector.name === cardName && !printings.some((p) => p.scryfallId === byCollector.scryfallId)) {
      printings = [byCollector, ...printings]; // e.g. a non-English printing
    }
    return rankPrintings(read, printings, deps, pinned ?? (byCollector?.name === cardName ? byCollector : undefined), art);
  };
  let candidates = await rankName(name.name);
  // The title said one card, the number another: trust whichever looks like the photo.
  if (byNumber && byCollector && byCollector.name !== name.name && numberDistance !== undefined) {
    const photo = imageHashes(read.card);
    const top = await Promise.all(candidates.slice(0, 4).map((c) => hashFor(c.printing, deps)));
    const d = Math.min(64, ...top.filter((h): h is ImageHashes => !!h).map((h) => imageDistance(h, photo)));
    if (d > numberDistance + 2) {
      const face = byCollector.name.split(' // ')[0];
      name = { name: byCollector.name, matchedFace: face, score: 0.6 };
      candidates = await rankName(byCollector.name);
    }
  }
  timingsMs.rank = now() - t2;
  const best = candidates[0];
  if (!best) return { status: 'not-found', candidates, name, read: readOut, timingsMs };
  const second = candidates[1];
  const clearPrinting = !second || best.score - second.score >= 0.2 || best.collectorScore >= 1;
  let goodName = name.score >= GOOD_NAME || collectorAgrees;
  // Before adding a card on the title alone, check it looks like the photo:
  // junk OCR from a non-English or worn title can spell some short real name.
  if (goodName && !collectorAgrees) {
    const sim = art?.sims.get(best.printing.scryfallId);
    if (sim !== undefined) goodName = sim >= ART_UNLIKE;
    else {
      const h = await hashFor(best.printing, deps);
      if (h && imageDistance(h, imageHashes(read.card)) > 28) goodName = false;
    }
  }
  const lang = cardLanguage(read, best.printing);
  const status: ScanResult['status'] = goodName && clearPrinting && lang ? 'matched' : 'uncertain';
  return { status, best, candidates, name, lang, read: readOut, timingsMs };
}

/**
 * The card's language: as printed on the collector line, else English if the
 * title reads as the English name. When the title is unreadable yet the card
 * was identified some other way, it's most likely not in English, but we
 * can't tell which language, so the user is asked.
 */
function cardLanguage(read: ReadResult, p: Printing): string | undefined {
  if (read.collector.lang) return read.collector.lang;
  if (p.lang && p.lang !== 'en') return p.lang;
  return titleFit(read.nameText, p.name) >= 0.4 ? 'en' : undefined;
}

/** How well OCR'd title text (any of its lines) spells this card's name or one of its faces, 0..1. */
function titleFit(text: string, cardName: string): number {
  const names = [cardName, ...cardName.split(' // ')].map(normalizeName);
  const lines = [text, ...text.split('\n')].map(normalizeName).filter((l) => l.length >= 2);
  return Math.max(0, ...lines.flatMap((l) => names.map((n) => similarity(n, l))));
}

/** Convenience: camera frame in, result out. */
export async function scanFrame(frame: RGBAImage, deps: RecognizerDeps, guide?: Rect): Promise<ScanResult> {
  const { card, detection } = extractCard(frame, guide);
  const res = await identifyCard(card, deps);
  return { ...res, detection };
}

function withoutCard(r: ReadResult): Omit<ReadResult, 'card'> {
  const out: Partial<ReadResult> = { ...r };
  delete out.card;
  return out as Omit<ReadResult, 'card'>;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
