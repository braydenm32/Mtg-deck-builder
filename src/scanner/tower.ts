/**
 * Tower mode: the phone looks straight down a scanning tower. Each card slides
 * in at an angle, drops, and lies on top of the pile until the next card lands
 * on it. Nobody holds the card still or takes it away, so "a new card" can't
 * mean "a card appeared": it means the top of the pile CHANGED and then
 * settled.
 *
 * TowerTracker turns one observation per camera frame (where the card is, and
 * a fingerprint of what's on it) into what to do:
 *
 *   empty     nothing that looks like a card
 *   arriving  something is moving: a card is on its way in (collect foil views)
 *   settling  it has stopped, waiting a few frames to be sure
 *   capture   a newly landed card is lying still: read it now
 *   settled   the card that was already read is still on top
 *
 * An identical copy landing on its twin (two Forests in a row) is still a new
 * card: the pile was seen to change while it fell, even though the
 * fingerprint ends up the same.
 */
import type { Quad } from './geometry';
import { hammingHex } from './hash';

export type TowerAction = 'empty' | 'arriving' | 'settling' | 'capture' | 'settled';

export interface TowerObservation {
  /** The card found in the frame, or null. */
  quad: Quad | null;
  /** quickHash of the card at `quad` (null when there is no card). */
  hash: string | null;
}

/** Frames the top card must lie still for before it's read. */
export const TOWER_STEADY_FRAMES = 3;
/** Corner movement (fraction of the card's width) still counted as "not moving". */
const STILL = 0.04;
/** Fingerprint bits that may differ between frames of the same still card (noise, flicker). */
const SAME_CARD = 10;
/** Frames in a row with no card before the pile counts as changed (one missed detection isn't a new card). */
const GONE_FRAMES = 2;
/** A move this big (fraction of the card's width) from where the last card was read means the pile changed. */
const MOVED = 0.15;

function width(q: Quad): number {
  return (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) / 2;
}

/** Largest corner movement between two quads, as a fraction of the card's width. */
function drift(a: Quad, b: Quad): number {
  let d = 0;
  for (let i = 0; i < 4; i++) d = Math.max(d, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return d / Math.max(1, width(a));
}

export class TowerTracker {
  /** Fingerprint of the card last read (the top of the pile). */
  private readHash: string | null = null;
  private readQuad: Quad | null = null;
  /** The pile changed since the last read: whatever settles next is a new card. */
  private changed = false;
  private prev: TowerObservation | null = null;
  private still = 0;
  private missing = 0;

  /** Cards read since the tracker started (the top card is number `count`). */
  count = 0;

  /** Forget everything (e.g. tower mode switched on, or the camera restarted). */
  reset(): void {
    this.readHash = null;
    this.readQuad = null;
    this.changed = false;
    this.prev = null;
    this.still = 0;
    this.missing = 0;
  }

  update(obs: TowerObservation): TowerAction {
    const prev = this.prev;
    this.prev = obs;
    if (!obs.quad || !obs.hash) {
      // Nothing card-like: a card mid-fall, a hand, or an empty tower.
      this.still = 0;
      if (this.readHash && ++this.missing >= GONE_FRAMES) this.changed = true;
      if (!this.readHash) return 'empty';
      return this.changed ? 'arriving' : 'settled';
    }
    this.missing = 0;
    const steady =
      !!prev?.quad && !!prev.hash && drift(prev.quad, obs.quad) <= STILL && hammingHex(prev.hash, obs.hash) <= SAME_CARD;
    // Only real evidence marks the pile as changed (a frame of jitter on the
    // card already read must not read it twice): different content, a big
    // move, or (above) a moment with no card in view.
    if (this.readHash && hammingHex(this.readHash, obs.hash) > SAME_CARD) this.changed = true;
    if (this.readQuad && drift(this.readQuad, obs.quad) > MOVED) this.changed = true;
    if (!steady) {
      this.still = 0;
      return this.readHash && !this.changed ? 'settled' : 'arriving';
    }
    this.still++;
    if (this.readHash && !this.changed) return 'settled';
    if (this.still < TOWER_STEADY_FRAMES) return 'settling';
    this.readHash = obs.hash;
    this.readQuad = obs.quad;
    this.changed = false;
    this.count++;
    return 'capture';
  }

  /** Where the top card was last seen (to look there first next frame). */
  get lastQuad(): Quad | null {
    return this.prev?.quad ?? null;
  }
}
