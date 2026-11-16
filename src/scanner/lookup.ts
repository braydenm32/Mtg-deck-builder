/**
 * Where the scanner gets card printings from. For now this is the Scryfall
 * API; once the app's local copy of Scryfall's bulk data exists, a second
 * implementation reads that instead and nothing else changes.
 */

export interface Printing {
  /** Scryfall card id: identifies one printing in one language. */
  scryfallId: string;
  oracleId?: string;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  lang: string;
  releasedAt?: string;
  rarity?: string;
  /** Finishes this printing exists in: nonfoil, foil, etched. */
  finishes: string[];
  borderColor?: string;
  frame?: string;
  frameEffects?: string[];
  fullArt?: boolean;
  promo?: boolean;
  /** How unusual the printing is (0 = regular), from the local card database. */
  variantRank?: number;
  /** Cheapest market price of this printing in each finish, US dollars (from the local card data). */
  prices?: { nonfoil?: number | null; foil?: number | null; etched?: number | null };
  /** Front-face images. */
  imageSmall?: string;
  imageNormal?: string;
  imageArtCrop?: string;
}

export interface CardLookup {
  /** Every paper printing of a card (by its full name), newest first. */
  printingsByName(name: string, opts?: { lang?: string }): Promise<Printing[]>;
  /** One printing by set code and collector number (and language). */
  bySetAndNumber(set: string, collectorNumber: string, lang?: string): Promise<Printing | null>;
  /**
   * Printings with this collector number in sets of about this size ("74/175"
   * on cards that don't print a set code). Optional: not every source can.
   */
  byNumberAndTotal?(collectorNumber: string, setTotal: number): Promise<Printing[]>;
}

// ---------------------------------------------------------------------------
// Scryfall API implementation
// ---------------------------------------------------------------------------

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface ScryfallLookupOptions {
  fetch?: FetchLike;
  /** Scryfall asks API clients to identify themselves (ignored by browsers). */
  userAgent?: string;
  baseUrl?: string;
  /** Minimum gap between /cards/search calls. Scryfall allows 2/s on search. */
  searchIntervalMs?: number;
  /** Most printings to fetch for one name (basic lands have well over a thousand). */
  maxPrintings?: number;
}

interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  lang: string;
  released_at?: string;
  rarity?: string;
  finishes?: string[];
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  full_art?: boolean;
  promo?: boolean;
  image_uris?: { small?: string; normal?: string; art_crop?: string };
  card_faces?: { image_uris?: { small?: string; normal?: string; art_crop?: string } }[];
}

export function fromScryfall(c: ScryfallCard): Printing {
  const img = c.image_uris ?? c.card_faces?.[0]?.image_uris ?? {};
  return {
    scryfallId: c.id,
    oracleId: c.oracle_id,
    name: c.name,
    set: c.set,
    setName: c.set_name,
    collectorNumber: c.collector_number,
    lang: c.lang,
    releasedAt: c.released_at,
    rarity: c.rarity,
    finishes: c.finishes ?? ['nonfoil'],
    borderColor: c.border_color,
    frame: c.frame,
    frameEffects: c.frame_effects,
    fullArt: c.full_art,
    promo: c.promo,
    imageSmall: img.small,
    imageNormal: img.normal,
    imageArtCrop: img.art_crop,
  };
}

export class ScryfallLookup implements CardLookup {
  private readonly fetch: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly base: string;
  private readonly interval: number;
  private readonly maxPrintings: number;
  private nextSearchAt = 0;
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(opts: ScryfallLookupOptions = {}) {
    this.fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.headers = { Accept: 'application/json' };
    if (opts.userAgent) this.headers['User-Agent'] = opts.userAgent;
    this.base = opts.baseUrl ?? 'https://api.scryfall.com';
    this.interval = opts.searchIntervalMs ?? 550;
    this.maxPrintings = opts.maxPrintings ?? 350;
  }

  async printingsByName(name: string, opts: { lang?: string } = {}): Promise<Printing[]> {
    const lang = opts.lang ?? 'en';
    const q = `!"${name.replace(/"/g, '\\"')}" game:paper lang:${lang}`;
    let url: string | null = `${this.base}/cards/search?unique=prints&order=released&dir=desc&include_extras=true&q=${encodeURIComponent(q)}`;
    const out: Printing[] = [];
    while (url && out.length < this.maxPrintings) {
      const page = (await this.get(url, true)) as { data?: ScryfallCard[]; has_more?: boolean; next_page?: string } | null;
      if (!page?.data) break;
      out.push(...page.data.map(fromScryfall));
      url = page.has_more && page.next_page ? page.next_page : null;
    }
    return out;
  }

  async bySetAndNumber(set: string, collectorNumber: string, lang?: string): Promise<Printing | null> {
    const parts = [set.toLowerCase(), encodeURIComponent(collectorNumber)];
    if (lang && lang !== 'en') parts.push(lang);
    const card = (await this.get(`${this.base}/cards/${parts.join('/')}`, false)) as ScryfallCard | null;
    return card?.id ? fromScryfall(card) : null;
  }

  private get(url: string, isSearch: boolean): Promise<unknown> {
    let p = this.cache.get(url);
    if (!p) {
      p = this.request(url, isSearch);
      this.cache.set(url, p);
      p.catch(() => this.cache.delete(url));
    }
    return p;
  }

  private async request(url: string, isSearch: boolean): Promise<unknown> {
    // Scryfall: 2 req/s on search, 10 req/s elsewhere.
    const gap = isSearch ? this.interval : 110;
    const now = Date.now();
    const wait = Math.max(0, this.nextSearchAt - now);
    this.nextSearchAt = Math.max(now, this.nextSearchAt) + gap;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await this.fetch(url, { headers: this.headers });
    if (res.status === 404) return null;
    if (res.status === 429) throw new Error('Scryfall rate limit hit; slow down');
    if (!res.ok) throw new Error(`Scryfall request failed (${res.status})`);
    return res.json();
  }
}
