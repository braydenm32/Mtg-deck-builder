/**
 * Fuzzy card-name lookup tuned for OCR output.
 *
 * OCR of a title bar gives things like "Dispossess (2@" or "Jhessian lnfiltrator":
 * the name plus junk from mana symbols, with the odd misread letter. We find
 * the catalog name that best aligns with some stretch of that text, charging
 * little for junk after the name, a bit more for junk before it, and less for
 * the letter swaps OCR typically makes (l/I/1, O/0, rn/m...).
 */

export interface NameMatch {
  /** Full Scryfall name, e.g. "Brine Comber // Brinebound Gift". */
  name: string;
  /** The face that matched, e.g. "Brine Comber". */
  matchedFace: string;
  /** 0..1, 1 = exact. */
  score: number;
}

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CONFUSABLE: Record<string, string> = {
  l: 'i1|tf',
  i: 'l1|jt',
  '1': 'li|',
  '|': 'li1',
  o: '0qdce',
  '0': 'oq',
  q: 'o0g',
  s: '5',
  '5': 's',
  b: '8h',
  '8': 'b',
  g: '9q',
  '9': 'g',
  e: 'co',
  c: 'eo',
  n: 'hmr',
  h: 'nb',
  m: 'n',
  u: 'vn',
  v: 'uy',
  y: 'v',
  r: 'n',
  t: 'fi',
  f: 't',
  d: 'o',
  z: '2',
  '2': 'z',
};

function subCost(a: string, b: string): number {
  if (a === b) return 0;
  if (a === ' ' || b === ' ') return 1;
  return CONFUSABLE[a]?.includes(b) ? 0.4 : 1;
}

const LEAD_JUNK = 0.6;
const TRAIL_JUNK = 0.08;
const SPACE_INDEL = 0.35;
/** Mana symbols leave a few junk characters after the name; much more than that means the name probably continues. */
const TRAIL_FREE = 4;
const TRAIL_LONG = 0.3;

function trailCost(chars: number): number {
  return TRAIL_JUNK * Math.min(chars, TRAIL_FREE) + TRAIL_LONG * Math.max(0, chars - TRAIL_FREE);
}

/**
 * Cost of aligning the whole of `name` against the best stretch of `query`.
 * Both must already be normalised.
 */
export function alignCost(name: string, query: string): number {
  const m = name.length;
  const n = query.length;
  // rows[i][j] = cost of aligning name[0..i) with a stretch of query ending at j
  const rows: Float64Array[] = [new Float64Array(n + 1)];
  for (let j = 0; j <= n; j++) rows[0][j] = LEAD_JUNK * j;
  for (let i = 1; i <= m; i++) {
    const prev = rows[i - 1];
    const cur = new Float64Array(n + 1);
    const a = name[i - 1];
    const delA = a === ' ' ? SPACE_INDEL : 1;
    cur[0] = prev[0] + delA;
    for (let j = 1; j <= n; j++) {
      const b = query[j - 1];
      let v = prev[j - 1] + subCost(a, b);
      const del = prev[j] + delA;
      if (del < v) v = del;
      const ins = cur[j - 1] + (b === ' ' ? SPACE_INDEL : 1);
      if (ins < v) v = ins;
      // OCR often reads "rn" as "m" and "m" as "rn"
      if (i >= 2 && b === 'm' && a === 'n' && name[i - 2] === 'r') v = Math.min(v, rows[i - 2][j - 1] + 0.4);
      if (j >= 2 && a === 'm' && b === 'n' && query[j - 2] === 'r') v = Math.min(v, prev[j - 2] + 0.4);
      cur[j] = v;
    }
    rows.push(cur);
  }
  let best = Infinity;
  for (let j = 0; j <= n; j++) best = Math.min(best, rows[m][j] + trailCost(n - j));
  return best;
}

export function similarity(name: string, query: string): number {
  if (!name.length) return 0;
  return Math.max(0, 1 - alignCost(name, query) / name.length);
}

interface Entry {
  norm: string;
  face: string;
  name: string;
}

export class NameIndex {
  private entries: Entry[] = [];
  private bigrams = new Map<string, number[]>();

  /** @param names Scryfall catalog names (GET /catalog/card-names). */
  constructor(names: Iterable<string>) {
    for (const name of names) {
      const faces = name.includes(' // ') ? [name, ...name.split(' // ')] : [name];
      const seen = new Set<string>();
      for (const face of faces) {
        const norm = normalizeName(face);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        const id = this.entries.length;
        this.entries.push({ norm, face, name });
        for (const bg of bigramSet(norm)) {
          let list = this.bigrams.get(bg);
          if (!list) this.bigrams.set(bg, (list = []));
          list.push(id);
        }
      }
    }
  }

  get size(): number {
    return this.entries.length;
  }

  /** Best catalog names for some OCR text, best first. */
  match(ocrText: string, limit = 5): NameMatch[] {
    const q = normalizeName(ocrText);
    if (q.length < 2) return [];
    const counts = new Map<number, number>();
    for (const bg of bigramSet(q)) {
      const list = this.bigrams.get(bg);
      if (!list) continue;
      for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // Shortlist by shared bigrams relative to the name's own bigram count.
    const shortlist = [...counts.entries()]
      .map(([id, c]) => ({ id, r: c / Math.max(1, this.entries[id].norm.length - 1) }))
      .filter((x) => x.r >= 0.25)
      .sort((a, b) => b.r - a.r)
      .slice(0, 400);
    const scored = shortlist.map(({ id }) => {
      const e = this.entries[id];
      return { e, score: similarity(e.norm, q) };
    });
    // Very short names ("Opt", "Ow") can hide inside junk: require more of them.
    const adjusted = scored.map((s) => ({ ...s, rank: s.score - (s.e.norm.length < 5 ? 0.15 : 0) + s.e.norm.length * 1e-4 }));
    adjusted.sort((a, b) => b.rank - a.rank);
    const out: NameMatch[] = [];
    const seen = new Set<string>();
    for (const s of adjusted) {
      if (seen.has(s.e.name)) continue;
      seen.add(s.e.name);
      out.push({ name: s.e.name, matchedFace: s.e.face, score: Math.round(s.score * 1000) / 1000 });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Simple type-ahead for the "that's not it" correction box. */
  search(prefix: string, limit = 10): string[] {
    const q = normalizeName(prefix);
    if (!q) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    const seen = new Set<string>();
    for (const e of this.entries) {
      if (seen.has(e.name)) continue;
      if (e.norm.startsWith(q)) {
        starts.push(e.name);
        seen.add(e.name);
      } else if (contains.length < limit && e.norm.includes(q)) {
        contains.push(e.name);
        seen.add(e.name);
      }
    }
    starts.sort((a, b) => a.length - b.length || a.localeCompare(b));
    return [...starts, ...contains].slice(0, limit);
  }
}

function bigramSet(s: string): Set<string> {
  const out = new Set<string>();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
