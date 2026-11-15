/**
 * The recogniser: photo in, ranked printings out.
 *
 *   1. Find the card in the frame and flatten it (geometry.ts).
 *   2. OCR the title bar and fuzzy-match it against every card name.
 *   3. OCR the collector line (set code, number, language) when there is one.
 *   4. Fetch that name's printings and rank them by collector-line agreement
 *      plus how closely Scryfall's image of each one matches the photo.
 *
 * If the name can't be read (e.g. a non-English card) but the collector
 * line can, the printing is looked up directly by set and number.
 */
import { collectorScore, type CollectorInfo, parseCollectorLine } from './collector';
import { CANON_HEIGHT, CANON_WIDTH, detectCard, guideRect, warpQuad, type CardDetection } from './geometry';
import { hammingHex, pHash } from './hash';
import {
  cropFraction,
  type GrayImage,
  maxChannel,
  minChannel,
  normalizePolarity,
  type Rect,
  resizeGray,
  rotate180,
  type RGBAImage,
  scaleGray,
  stretchContrast,
  toGray,
} from './image';
import { ART_REGION, COLLECTOR_REGION, NAME_BAND, NAME_REGION } from './layout';
import type { CardLookup, Printing } from './lookup';
import { type NameIndex, type NameMatch, normalizeName, similarity } from './names';
import type { OcrEngine } from './ocr';

export interface RecognizerDeps {
  ocr: OcrEngine;
  names: NameIndex;
  lookup: CardLookup;
  /** Loads a Scryfall image URL as RGBA (canvas in the browser, sharp in Node). */
  loadImage: (url: string) => Promise<RGBAImage>;
  /** Shared cache of image hashes by Scryfall id. */
  hashCache?: Map<string, Promise<ImageHashes | null>>;
}

export interface ImageHashes {
  card: string;
  art: string;
}

export interface ReadResult {
  nameText: string;
  nameConfidence: number;
  collectorText: string;
  collector: CollectorInfo;
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
  read: Omit<ReadResult, 'card'>;
  detection?: CardDetection;
  timingsMs: Record<string, number>;
}

const NAME_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',-.!?&:/àáâäéèêëíîïóôöúûüñçæÆ";
const COLLECTOR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•*.- ';
const GOOD_NAME = 0.8;
const MAX_HASHED = 24;

/** Flattens the card found in a camera frame (or the guide box if no edges were found). */
export function extractCard(frame: RGBAImage, guide?: Rect): { card: RGBAImage; detection: CardDetection } {
  const detection = detectCard(frame, guide ?? guideRect(frame.width, frame.height));
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
async function readName(card: RGBAImage, deps: RecognizerDeps): Promise<NameRead> {
  const band = cropFraction(card, NAME_BAND);
  const r1 = await deps.ocr.recognize(prepText(band, 150, 'min'), { mode: 'block', whitelist: NAME_WHITELIST });
  let best: NameRead = { ...r1, matches: matchLines(r1.text, deps.names) };
  if (topScore(best) >= 0.85) return best;
  const bar = cropFraction(card, NAME_REGION);
  const r2 = await deps.ocr.recognize(prepText(bar, 64, 'luma'), { mode: 'line', whitelist: NAME_WHITELIST });
  const second: NameRead = { ...r2, matches: matchLines(r2.text, deps.names) };
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
    if ((alt.matches[0]?.score ?? 0) > (name.matches[0]?.score ?? 0) + 0.1) {
      card = flipped;
      name = alt;
      upsideDown = true;
    }
  }
  const crop = cropFraction(card, COLLECTOR_REGION);
  const col = await deps.ocr.recognize(prepText(crop, 150, 'max'), { mode: 'block', whitelist: COLLECTOR_WHITELIST });
  return {
    nameText: name.text,
    nameConfidence: name.confidence,
    collectorText: col.text,
    collector: parseCollectorLine(col.text),
    nameMatches: name.matches,
    upsideDown,
    card,
  };
}

export function imageHashes(img: RGBAImage): ImageHashes {
  // Compare at a common size so Scryfall's 488x680 and our 630x880 agree.
  const g = resizeGray(toGray(img), 244, 340);
  const art = cropFraction(g, ART_REGION);
  return { card: pHash(g), art: pHash(art) };
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
export async function rankPrintings(read: ReadResult, printings: Printing[], deps: RecognizerDeps): Promise<CandidateScore[]> {
  const photo = imageHashes(read.card);
  const scored: CandidateScore[] = printings.map((printing) => ({
    printing,
    collectorScore: collectorScore(read.collector, printing),
    score: 0,
  }));
  // Hash the most promising ones: best collector agreement, then newest.
  const order = [...scored].sort((a, b) => b.collectorScore - a.collectorScore);
  const toHash = printings.length <= 1 ? [] : order.slice(0, MAX_HASHED);
  await Promise.all(
    toHash.map(async (c) => {
      const h = await hashFor(c.printing, deps);
      if (h) c.hashDistance = (hammingHex(h.card, photo.card) + hammingHex(h.art, photo.art)) / 2;
    }),
  );
  for (const c of scored) {
    // ~32 bits differ between unrelated images; identical art is usually < 10.
    const hashSim = c.hashDistance === undefined ? 0 : Math.max(0, 1 - c.hashDistance / 28);
    c.score = c.collectorScore + hashSim + reprintPrior(c.printing);
  }
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Looks up the printing named by the collector line, if it was read. Used to
 * confirm or overrule a shaky name read: "DOM 1" is Karn, Scion of Urza even
 * when the title bar came out as "Econ of Urza".
 */
async function collectorPrinting(read: ReadResult, deps: RecognizerDeps): Promise<Printing | null> {
  const { setCode, collectorNumber, lang } = read.collector;
  if (!setCode || !collectorNumber) return null;
  try {
    return await deps.lookup.bySetAndNumber(setCode, collectorNumber, lang);
  } catch {
    return null;
  }
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

/** Full pipeline on an already-flattened, upright-or-upside-down card image. */
export async function identifyCard(cardImg: RGBAImage, deps: RecognizerDeps): Promise<ScanResult> {
  const t0 = now();
  const read = await readCard(cardImg, deps);
  const t1 = now();
  const readOut = withoutCard(read);
  const timingsMs: Record<string, number> = { read: t1 - t0 };

  let name: NameMatch | undefined = read.nameMatches[0];
  const byCollector = await collectorPrinting(read, deps);
  let collectorAgrees = false;
  if (byCollector) {
    // How well does the collector line's card fit what we read in the title bar?
    const face = byCollector.name.split(' // ')[0];
    const fit = Math.max(similarity(normalizeName(face), normalizeName(read.nameText)), similarity(normalizeName(byCollector.name), normalizeName(read.nameText)));
    const sameAsName = name && name.name === byCollector.name;
    if (sameAsName) collectorAgrees = true;
    else if (fit >= 0.45 || !name || name.score < 0.55 || (name.score < GOOD_NAME && rarityAgrees(read.collector, byCollector))) {
      // A full set+number hit that also resembles the title (or beats an unreadable one).
      // Score reflects how well the title read agrees; the hit itself is trusted.
      name = { name: byCollector.name, matchedFace: face, score: Math.max(fit, 0.6) };
      collectorAgrees = fit >= 0.45;
    }
  }
  timingsMs.collector = now() - t1;

  if (!name || name.score < 0.55) {
    return { status: 'not-found', candidates: [], read: readOut, timingsMs };
  }

  const t2 = now();
  let printings = await deps.lookup.printingsByName(name.name, { lang: read.collector.lang });
  if (byCollector && byCollector.name === name.name && !printings.some((p) => p.scryfallId === byCollector.scryfallId)) {
    printings = [byCollector, ...printings]; // e.g. a non-English printing
  }
  timingsMs.lookup = now() - t2;
  const t3 = now();
  const candidates = await rankPrintings(read, printings, deps);
  timingsMs.rank = now() - t3;
  const best = candidates[0];
  if (!best) return { status: 'not-found', candidates, name, read: readOut, timingsMs };
  const second = candidates[1];
  const clearPrinting = !second || best.score - second.score >= 0.2 || best.collectorScore >= 1;
  const goodName = name.score >= GOOD_NAME || collectorAgrees;
  const status: ScanResult['status'] = goodName && clearPrinting ? 'matched' : 'uncertain';
  return { status, best, candidates, name, read: readOut, timingsMs };
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
