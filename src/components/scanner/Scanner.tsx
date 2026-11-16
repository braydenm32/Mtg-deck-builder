"use client";

/* eslint-disable @next/next/no-img-element -- Scryfall images are already sized JPGs on a CDN, and previews are object URLs */
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/add/Sheet";
import { plural } from "@/components/add/text";
import { Icon } from "@/components/shell/icons";
import { Button, Skeleton } from "@/components/ui";
import { guideRect, type Quad } from "@/scanner/geometry";
import { chooseFinish, finishReason } from "@/scanner/finish";
import { FoilWatcher } from "@/scanner/foil";
import { hammingHex } from "@/scanner/hash";
import { TowerTracker } from "@/scanner/tower";
import { formatMoney } from "@/lib/money";
import type { PriceView } from "@/lib/money";
import { cancelCollectionWrite, queueCollectionWrites, sentAnswer, useCollectionOutbox, type NewCollectionWrite } from "@/lib/offline/collection-outbox";
import { dropWaitingScan, keepWaitingScan, waitingScans } from "@/lib/offline/scan-store";
import { addBody, addToCollection, ApiError, scanImage, sendInto, undoAdd, undoInto } from "./api";
import { cue, unlockSound } from "./feedback";
import { captureCard, detect, detectAnywhere, foilView, grabFrame, photoForUpload, quadDrift, quickHash, goodFoilView, WORK_HEIGHT } from "./capture";
import { ReviewSheet } from "./ReviewSheet";
import { Segmented } from "./Segmented";
import { cameraHelp, CONDITIONS, entryLabel, FINISH_LABEL, FINISH_SETTING_LABEL, removedText, reviewQuestion, settingsSummary, TILT_HINT } from "./text";
import {
  DEFAULT_SETTINGS,
  type Finish,
  type FinishSetting,
  type FoilVerdict,
  langLabel,
  type Printing,
  printingLabel,
  priceOf,
  type ReviewItem,
  type ScanDeck,
  type ScanResult,
  type ScanSettings,
  scanTarget,
  type SessionEntry,
} from "./types";
import { useCamera } from "./useCamera";

const SETTINGS_KEY = "scanner.settings.v1";
const SESSION_KEY = "scanner.session.v1";
/** Scans waiting to be checked, so Back or a reload doesn't lose them (without the photo, which can't be kept). */
const REVIEW_KEY = "scanner.review.v1";
/** Frames the card must sit still for before auto-capture (~0.6 s at 5 fps). */
const STEADY_FRAMES = 3;
const TICK_MS = 200;
/** Watching for foil (finish Auto) or a tower: look twice as often, so a tilt or a drop is caught in more views. */
const WATCH_TICK_MS = 100;
/** How long to wait for a tilt when the camera couldn't yet tell whether a card is foil. */
const FOIL_WAIT_MS = 2500;

/** Where a capture came from: the foil views gathered for that card, and its place in a tower pile. */
type CaptureContext = { watcher?: FoilWatcher; pile?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadSettings(): ScanSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadList<T>(key: string): T[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown, storage: () => Storage) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // private mode or full storage: settings just won't stick
  }
}

const local = () => window.localStorage;
const sessionStore = () => window.sessionStorage;
let keySeq = 0;
const newKey = () => `${Date.now()}-${keySeq++}`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What the last scan did, shown on the camera until the next one. */
type Status = { id: string; text: string; tone: "ok" | "danger"; undo?: () => void };
/** A scan that failed (no signal, server down, unreadable file). Kept so it can be sent again or removed. */
type Failed = { key: string; image: Blob; kind: "card" | "photo"; preview?: string; error: string; reached: boolean };

/**
 * Scan: the camera (or photos) on one side, what you've added this visit on the other.
 * `look` only changes sizing: in the new look the camera fills the phone between the shell's bars.
 */
export function Scanner({
  look = "old",
  prices,
  decks = [],
  initialInto,
}: {
  look?: "new" | "old";
  /** Price display (currency, hidden); none hides prices. */
  prices?: PriceView;
  /** Decks cards can be scanned into. */
  decks?: ScanDeck[];
  /** "deck:<id>" or "wants" from the address (a deck's "Scan cards into it"), which overrides the saved choice. */
  initialInto?: string;
}) {
  const fill = look === "new";
  const { videoRef, state: camera, start, stop, torchSupported, torchOn, setTorch } = useCamera();
  const torchOnRef = useRef(torchOn);
  torchOnRef.current = torchOn;
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workCanvas = useRef<HTMLCanvasElement | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
  const [session, setSession] = useState<SessionEntry[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [busy, setBusy] = useState(0);
  const [status, setStatus] = useState<Status>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hint, setHint] = useState("Line the card up with the frame");
  /** Waiting for the user to tilt the card so the foil check can see the light move. */
  const [tilting, setTilting] = useState(false);

  // Live-loop state kept in refs so the loop doesn't restart on every render.
  const steady = useRef<{ quad: Quad | null; count: number }>({ quad: null, count: 0 });
  const lastHash = useRef<string | null>(null);
  const inFlight = useRef(false);
  /** Views of the card in front of the camera, for the foil check. A new card gets a new watcher. */
  const foil = useRef(new FoilWatcher());
  const tower = useRef(new TowerTracker());
  /** Tower mode: the watcher of the landed card whose foil check is flashing the torch right now. */
  const flashFor = useRef<FoilWatcher | null>(null);
  /** Tower mode: what the tracker said last frame. */
  const lastAct = useRef<string>("empty");
  /** The collection save in progress, so saves go one after another. */
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  /** Tower mode: a card is on its way in (its foil views are being gathered). */
  const arriving = useRef(false);
  /** Frames in a row without a card (by hand): a tilted card often drops out for a frame or two. */
  const missing = useRef(0);
  /** The loop reads settings through this, so changing one doesn't restart the camera loop. */
  const settingsRef = useRef(settings);
  const outbox = useCollectionOutbox();
  const stillWaiting = new Set(outbox.queue.map((w) => w.key));
  // Memoised so the add callbacks (and the camera loop that uses them) don't change every render.
  const target = useMemo(() => scanTarget(settings.into, decks), [settings.into, decks]);
  // Browsers only play sound after a tap: unlock it on the first one.
  useEffect(() => {
    const on = () => unlockSound();
    window.addEventListener("pointerdown", on, { once: true });
    return () => window.removeEventListener("pointerdown", on);
  }, []);
  settingsRef.current = settings;
  const current = review[0];
  const reviewShown = reviewOpen && !!current;
  // Don't capture while a sheet covers the camera. Closing the review sheet lets scanning carry on;
  // the unsure cards wait in "to check".
  const paused = reviewShown || settingsOpen;

  // Restore sticky settings, this tab's list and anything still to check (so nothing is lost on Back).
  useEffect(() => {
    setSettings({ ...loadSettings(), ...(initialInto ? { into: initialInto } : {}) });
    setSession(loadList<SessionEntry>(SESSION_KEY));
    setReview(loadList<ReviewItem>(REVIEW_KEY));
    setReady(true);
  }, [initialInto]);
  useEffect(() => {
    if (ready) save(SETTINGS_KEY, settings, local);
  }, [ready, settings]);
  useEffect(() => {
    // Don't keep whole scan results in storage, they're only for "Fix".
    if (ready) save(SESSION_KEY, session.map((e) => ({ ...e, scan: undefined })), sessionStore);
  }, [ready, session]);
  useEffect(() => {
    if (ready) save(REVIEW_KEY, review.filter((r) => !r.replaces).map(({ key, scan }) => ({ key, scan })), sessionStore);
  }, [ready, review]);

  // Open the camera straight away when the browser already allows it (or already refuses it, so the
  // page can say why at once). Otherwise wait for "Start camera", so the permission prompt has a reason.
  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      start();
      return;
    }
    navigator.permissions?.query({ name: "camera" as PermissionName }).then(
      (p) => {
        if (p.state !== "prompt") start();
      },
      () => {},
    );
  }, [start]);

  // Switching tower mode on starts a new pile: whatever is on top now gets read.
  useEffect(() => {
    tower.current = new TowerTracker();
  }, [settings.tower]);

  // Keep the torch as the settings say (it goes off whenever the camera restarts).
  // (Not while a foil check is flashing it.)
  useEffect(() => {
    if (camera.status === "live" && torchSupported && !flashFor.current && settings.torch !== torchOn) setTorch(settings.torch);
  }, [camera.status, settings.torch, setTorch, torchOn, torchSupported]);

  const say = useCallback((text: string, tone: Status["tone"] = "ok", undo?: () => void) => setStatus({ id: newKey(), text, tone, undo }), []);

  // ---------------------------------------------------------------- adding

  const addEntry = useCallback(
    async (printing: Printing, finish: Finish, confidence: "exact" | "guessed", scan?: ScanResult, lang = printing.lang, pile?: number) => {
      // One save at a time: in a tower, cards land faster than they're read, and the database takes one write at a time.
      // The want list takes the card instead of the collection; a deck takes it as well as the collection.
      const save = saving.current.then(async (): Promise<{ itemId: number; into?: SessionEntry["into"]; waitKeys?: string[] }> => {
        const oracleId = printing.oracleId;
        const opts = { printing, finish, lang, condition: settings.condition, location: settings.location, confidence };
        try {
          if (target.kind === "wants" && oracleId) {
            const r = await sendInto({ kind: "wants", oracleId });
            return { itemId: 0, into: { kind: "wants", previous: r.previous ?? 0 } };
          }
          const { itemId } = await addToCollection(opts);
          if (target.kind !== "deck" || !oracleId) return { itemId };
          try {
            const r = await sendInto({ kind: "deck", deckId: target.deckId, oracleId });
            return { itemId, into: { kind: "deck", deckId: target.deckId, deck: r.deck ?? target.name, cardId: r.cardId ?? null } };
          } catch (e) {
            if (e instanceof ApiError) throw e;
            // The copy is in; the deck step waits on this device.
            queueCollectionWrites([{ label: `${printing.name} into ${target.name}`, url: "/api/scan/into", method: "POST", body: { kind: "deck", deckId: target.deckId, oracleId } }]);
            return { itemId, into: { kind: "deck", deckId: target.deckId, deck: target.name, cardId: null } };
          }
        } catch (e) {
          if (e instanceof ApiError || !oracleId) throw e;
          // No connection: keep the add (and its deck or want-list step) on this device, to go when it's back.
          const label = entryLabel(printing, finish, lang);
          const writes: NewCollectionWrite[] =
            target.kind === "wants"
              ? [{ label: `Want ${printing.name}`, url: "/api/scan/into", method: "POST", body: { kind: "wants", oracleId } }]
              : [
                  { label: `Add ${label}`, url: "/api/collection/items", method: "POST", body: addBody(opts) },
                  ...(target.kind === "deck" ? [{ label: `${printing.name} into ${target.name}`, url: "/api/scan/into", method: "POST" as const, body: { kind: "deck", deckId: target.deckId, oracleId } }] : []),
                ];
          const waitKeys = queueCollectionWrites(writes);
          const into: SessionEntry["into"] =
            target.kind === "wants" ? { kind: "wants", previous: 0 } : target.kind === "deck" ? { kind: "deck", deckId: target.deckId, deck: target.name, cardId: null } : undefined;
          return { itemId: 0, into, waitKeys };
        }
      });
      saving.current = save.catch(() => undefined);
      const { itemId, into, waitKeys } = await save;
      const entry: SessionEntry = {
        key: newKey(),
        itemId,
        printing,
        finish,
        lang,
        condition: settings.condition,
        location: settings.location,
        confidence,
        addedAt: Date.now(),
        scan,
        pile,
        into,
        ...(waitKeys ? { waitKeys } : {}),
      };
      setSession((s) => [entry, ...s]);
      if (settingsRef.current.sound) cue("added");
      return entry;
    },
    [settings.condition, settings.location, target],
  );

  const removeEntry = useCallback(async (entry: SessionEntry) => {
    const into = entry.into;
    const keys = entry.waitKeys;
    if (keys?.length) {
      // Kept on this device: still waiting, so just drop it; or sent since, so undo what the server did.
      if (cancelCollectionWrite(keys[0])) return setSession((s) => s.filter((e) => e.key !== entry.key));
      if (keys[1]) cancelCollectionWrite(keys[1]);
      const first = sentAnswer(keys[0]) as { added?: { itemId: number }[]; previous?: number } | undefined;
      if (!first) throw new Error("it went through before this visit, so change it in your collection instead");
      if (into?.kind === "wants") {
        if (entry.printing.oracleId) await undoInto({ kind: "wants", oracleId: entry.printing.oracleId, previous: first.previous ?? 0 });
      } else {
        const second = keys[1] ? (sentAnswer(keys[1]) as { cardId?: number | null } | undefined) : undefined;
        if (into?.kind === "deck" && second?.cardId) await undoInto({ kind: "deck", deckId: into.deckId, cardId: second.cardId });
        const itemId = first.added?.[0]?.itemId;
        if (itemId) await undoAdd(itemId);
      }
      return setSession((s) => s.filter((e) => e.key !== entry.key));
    }
    if (into?.kind === "wants") {
      if (entry.printing.oracleId) await undoInto({ kind: "wants", oracleId: entry.printing.oracleId, previous: into.previous });
    } else {
      if (into?.kind === "deck" && into.cardId) await undoInto({ kind: "deck", deckId: into.deckId, cardId: into.cardId });
      await undoAdd(entry.itemId);
    }
    setSession((s) => s.filter((e) => e.key !== entry.key));
  }, []);

  const undoable = useCallback(
    (entry: SessionEntry, verb = "Saved", note?: string) => {
      const which = entry.pile ? `card ${entry.pile}, ` : "";
      if (entry.waitKeys) verb = "No connection, so kept on this device:";
      say(`${verb} ${which}${entryLabel(entry.printing, entry.finish, entry.lang)}${note ? ` (${note})` : ""}`, "ok", () => {
        removeEntry(entry).then(
          () => say(removedText(entry.printing.name, entry.into)),
          (e) => say(`Couldn't undo: ${message(e)}`, "danger"),
        );
      });
    },
    [removeEntry, say],
  );

  /**
   * The foil check's answer for a card. When it can't tell yet and the card is
   * in the hand, ask for a tilt and keep watching for a moment. (A card lying
   * in a tower can't be tilted: no wait there.)
   */
  const judgeFoil = useCallback(
    async (watcher: FoilWatcher, ctx: CaptureContext): Promise<FoilVerdict> => {
      const verdict = watcher.evidence().verdict;
      if (verdict !== "unsure") return verdict;
      if (ctx.pile !== undefined) return flashCheck(watcher, ctx.pile);
      return tiltCheck(watcher);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the helpers below only use refs and stable setters
    [torchSupported],
  );

  /**
   * Tower: the card lies flat and can't be tilted, so move the light instead.
   * Switch the torch over for a moment while the camera keeps watching the
   * card: foil's shine changes colour, ink just gets brighter. Only while that
   * card is still the one on top.
   */
  async function flashCheck(watcher: FoilWatcher, pile: number): Promise<FoilVerdict> {
    const onTop = () => tower.current.count === pile && lastAct.current === "settled";
    if (!torchSupported || !onTop() || flashFor.current) return "unsure";
    flashFor.current = watcher;
    const was = torchOnRef.current;
    try {
      await setTorch(!was);
      await sleep(700);
      await setTorch(was);
      await sleep(400);
    } finally {
      flashFor.current = null;
    }
    return onTop() ? watcher.evidence().verdict : "unsure";
  }

  async function tiltCheck(watcher: FoilWatcher): Promise<FoilVerdict> {
    let verdict: FoilVerdict = "unsure";
    setTilting(true);
    try {
      const until = Date.now() + FOIL_WAIT_MS;
      let seen = watcher.added;
      while (Date.now() < until && verdict === "unsure") {
        await sleep(250);
        if (watcher.added === seen) continue;
        seen = watcher.added;
        verdict = watcher.evidence().verdict;
      }
    } finally {
      setTilting(false);
    }
    return verdict;
  }

  /** Decide what to do with a fresh scan: add it, or queue it for the user. */
  const handleResult = useCallback(
    async (scan: ScanResult, preview?: string, ctx: CaptureContext = {}) => {
      const best = scan.best?.printing;
      // Auto: when the printing comes in more than one finish, see what the camera made of it.
      const madeIn = best ? (["nonfoil", "foil", "etched"] as const).filter((f) => best.finishes.includes(f)) : [];
      const seen = settings.finish === "auto" && ctx.watcher && madeIn.length > 1 ? await judgeFoil(ctx.watcher, ctx) : undefined;
      // For tuning the foil check on real footage (dev builds only).
      if (seen && process.env.NODE_ENV !== "production") console.debug("[scanner] foil check", best?.name, ctx.watcher?.evidence());
      // A printing made in only one finish settles it; then what the camera saw; then the Foil setting.
      const choice = best ? chooseFinish(best, settings.finish, seen) : undefined;
      // "matched" already implies the card's language is known (scan.lang).
      if (settings.autoAdd && scan.status === "matched" && best && choice?.sure && scan.lang) {
        try {
          const entry = await addEntry(best, choice.finish, "exact", scan, scan.lang, ctx.pile);
          const note = choice.source === "camera" || choice.finish !== settings.finish ? finishReason(choice) : undefined;
          undoable(entry, "Saved", note);
          if (preview) URL.revokeObjectURL(preview);
          return;
        } catch (e) {
          say(`Couldn't add: ${message(e)}. It's waiting below to check.`, "danger");
        }
      }
      // Sure of the card, its printing and language: only the finish is open.
      const askFinish = scan.status === "matched" && !!scan.lang && !!choice && !choice.sure;
      setReview((r) => [...r, { key: newKey(), scan, preview, foil: seen, askFinish, pile: ctx.pile }]);
      if (settings.sound) cue("check");
      if (settings.tower) {
        // Cards keep dropping: don't stop for a sheet. Say which card it was, so it can be found in the pile.
        say(`Card ${ctx.pile ?? ""} needs a check. Carry on, and check it when you're done.`.replace("Card  ", "A card "), "danger");
      } else if (!settingsOpen) setReviewOpen(true);
    },
    [addEntry, judgeFoil, say, settings.autoAdd, settings.finish, settings.sound, settings.tower, settingsOpen, undoable],
  );

  const runScan = useCallback(
    async (image: Blob, kind: "card" | "photo", preview?: string, ctx?: CaptureContext) => {
      setBusy((b) => b + 1);
      try {
        const scan = await scanImage(image, kind);
        await handleResult(scan, preview, ctx);
      } catch (e) {
        // Keep the picture, so it can be sent again (or removed) instead of vanishing. One that never
        // reached the app is kept on the device too, and read as soon as the connection is back.
        const reached = e instanceof ApiError;
        const key = newKey();
        if (!reached) void keepWaitingScan({ key, image, kind, at: Date.now() });
        setFailed((f) => [...f, { key, image, kind, preview, error: reached ? message(e) : "Read as soon as you’re back online.", reached }]);
        const what = kind === "photo" ? "photo" : "scan";
        say(reached ? `Couldn't read that ${what}: ${message(e)}. It's kept below.` : `No connection: that ${what} is kept on this device and read when you're back online.`, "danger");
      } finally {
        setBusy((b) => b - 1);
      }
    },
    [handleResult, say],
  );

  const retry = useCallback(
    (f: Failed) => {
      setFailed((list) => list.filter((x) => x.key !== f.key));
      void dropWaitingScan(f.key);
      runScan(f.image, f.kind, f.preview);
    },
    [runScan],
  );

  // Scans kept on this device from an earlier visit come back to the list, and every scan waiting for
  // a connection is read as soon as it's back.
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const failedRef = useRef(failed);
  failedRef.current = failed;
  useEffect(() => {
    let live = true;
    void waitingScans().then((kept) => {
      if (!live || !kept.length) return;
      setFailed((list) => [
        ...list,
        ...kept
          .filter((k) => !list.some((f) => f.key === k.key))
          .map((k) => ({ key: k.key, image: k.image, kind: k.kind, preview: URL.createObjectURL(k.image), error: "Read as soon as you’re back online.", reached: false })),
      ]);
      if (navigator.onLine) window.setTimeout(() => failedRef.current.filter((f) => !f.reached).forEach((f) => retryRef.current(f)), 500);
    });
    const onOnline = () => failedRef.current.filter((f) => !f.reached).forEach((f) => retryRef.current(f));
    window.addEventListener("online", onOnline);
    return () => {
      live = false;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const dropFailed = useCallback((f: Failed) => {
    void dropWaitingScan(f.key);
    setFailed((list) => list.filter((x) => x.key !== f.key));
    if (f.preview) URL.revokeObjectURL(f.preview);
  }, []);

  // ------------------------------------------------------------ live loop

  const capture = useCallback(
    async (quad: Quad, workScale: number, ctx?: CaptureContext) => {
      const video = videoRef.current;
      if (!video) return;
      // By hand, one card at a time. In a tower the next card can land while one is still being read.
      if (ctx?.pile === undefined) {
        if (inFlight.current) return;
        inFlight.current = true;
      }
      try {
        const { jpeg, preview } = await captureCard(video, quad, workScale);
        if (navigator.vibrate) navigator.vibrate(30);
        await runScan(jpeg, "card", preview, ctx);
      } finally {
        if (ctx?.pile === undefined) inFlight.current = false;
      }
    },
    [runScan, videoRef],
  );

  useEffect(() => {
    if (camera.status !== "live") return;
    const video = videoRef.current!;
    const colors = overlayColors(overlayRef.current);
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const overlay = overlayRef.current;
      const { finish: finishSetting, tower: towerMode } = settingsRef.current;
      const watching = finishSetting === "auto";
      if (video.videoWidth && overlay) {
        const workScale = Math.min(1, WORK_HEIGHT / video.videoHeight);
        const { img, canvas } = grabFrame(video, workScale, workCanvas.current);
        workCanvas.current = canvas;

        if (towerMode) {
          // Tower: no guide. Find the top card wherever it is and read each one that lands.
          const det = paused ? null : detectAnywhere(img, tower.current.lastQuad);
          const quad = det?.quad ?? null;
          drawOverlay(overlay, img.width, img.height, null, quad, false, colors);
          if (!paused) {
            const act = tower.current.update({ quad, hash: quad ? quickHash(img, quad) : null });
            // A new card on its way: start its own set of foil views (the slide and drop are the tilt).
            if (act === "arriving" && foil.current.added && !arriving.current) foil.current = new FoilWatcher();
            arriving.current = act === "arriving" || act === "settling";
            lastAct.current = act;
            const flashing = act === "settled" && flashFor.current;
            if (quad && goodFoilView(quad, img.width, img.height)) {
              if (flashing) flashFor.current!.add(foilView(img, quad));
              else if (watching && act !== "settled" && act !== "empty") foil.current.add(foilView(img, quad));
            }
            if (act === "capture" && quad) {
              const pile = tower.current.count;
              setHint(`Reading card ${pile}…`);
              capture(quad, workScale, { watcher: watching ? foil.current : undefined, pile });
              foil.current = new FoilWatcher();
            } else if (act === "empty") setHint("Drop a card into the tower");
            else if (act === "settled") setHint(`Ready for card ${tower.current.count + 1}`);
          } else setHint("Paused");
        } else {
          const guide = guideRect(img.width, img.height);
          const det = detect(img, guide);
          drawOverlay(overlay, img.width, img.height, guide, det.usedGuide ? null : det.quad, inFlight.current, colors);

          if (det.usedGuide) {
            steady.current = { quad: null, count: 0 };
            if (!inFlight.current) setHint("Line the card up with the frame");
            // Card gone (not just lost for a frame while it's tilted): the same card may be scanned again
            // next time, and the next card gets fresh foil views.
            missing.current++;
            if (missing.current >= 3) lastHash.current = null;
            if (missing.current >= 5 && foil.current.added) foil.current = new FoilWatcher();
          } else {
            missing.current = 0;
            if (watching && goodFoilView(det.quad, img.width, img.height)) foil.current.add(foilView(img, det.quad));
            const prev = steady.current.quad;
            const still = prev && quadDrift(prev, det.quad, guide.width) < 0.02;
            steady.current = { quad: det.quad, count: still ? steady.current.count + 1 : 1 };
            // Same ~0.6 s of stillness whatever the tick rate.
            const needed = watching ? STEADY_FRAMES * 2 : STEADY_FRAMES;
            if (!paused && !inFlight.current && steady.current.count >= needed) {
              const h = quickHash(img, det.quad);
              if (lastHash.current && hammingHex(h, lastHash.current) <= 10) {
                setHint("Next card");
              } else {
                lastHash.current = h;
                setHint("Reading…");
                capture(det.quad, workScale, { watcher: watching ? foil.current : undefined });
              }
            } else if (!inFlight.current) {
              setHint(paused ? "Paused" : "Hold still");
            }
          }
        }
      }
      timer = window.setTimeout(tick, watching || settingsRef.current.tower ? WATCH_TICK_MS : TICK_MS);
    };
    let timer = window.setTimeout(tick, TICK_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [camera.status, capture, paused, videoRef]);

  /** Shutter button: scan whatever is in the frame now, even if it isn't steady. */
  const shutter = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const workScale = Math.min(1, WORK_HEIGHT / video.videoHeight);
    const { img } = grabFrame(video, workScale, workCanvas.current);
    const det = (settingsRef.current.tower && detectAnywhere(img, tower.current.lastQuad)) || detect(img, guideRect(img.width, img.height));
    lastHash.current = quickHash(img, det.quad);
    capture(det.quad, workScale, { watcher: settingsRef.current.finish === "auto" ? foil.current : undefined });
  }, [capture, videoRef]);

  // ------------------------------------------------------------ photos

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      for (const f of Array.from(files)) {
        if (f.type && !f.type.startsWith("image/")) {
          say(`“${f.name}” isn't a photo. Choose a picture of a card.`, "danger");
          continue;
        }
        await runScan(await photoForUpload(f), "photo", URL.createObjectURL(f));
      }
      if (fileRef.current) fileRef.current.value = "";
    },
    [runScan, say],
  );
  const choosePhotos = useCallback(() => fileRef.current?.click(), []);

  // ------------------------------------------------------------ review

  const finishReview = useCallback(() => {
    setReview((r) => {
      if (r[0]?.preview) URL.revokeObjectURL(r[0].preview);
      return r.slice(1);
    });
  }, []);

  const onReviewAdd = useCallback(
    async (printing: Printing, finish: Finish, lang: string) => {
      const item = review[0];
      if (!item) return;
      // The user saw and confirmed the printing; it's only a guess if the finish doesn't exist for it.
      const confidence = printing.finishes.includes(finish) ? "exact" : "guessed";
      // Add the corrected card first, so a failed add never leaves the old one removed with nothing in its place.
      const entry = await addEntry(printing, finish, confidence, item.scan, lang);
      if (item.replaces) await removeEntry(item.replaces);
      undoable(entry, item.replaces ? "Changed to" : "Saved");
      finishReview();
    },
    [addEntry, finishReview, removeEntry, review, undoable],
  );

  const fixEntry = useCallback((entry: SessionEntry) => {
    const scan: ScanResult = entry.scan ?? {
      status: "uncertain",
      best: { printing: entry.printing, score: 1, collectorScore: 0 },
      candidates: [{ printing: entry.printing, score: 1, collectorScore: 0 }],
      read: { nameText: entry.printing.name, nameConfidence: 100, collectorText: "", collector: {}, nameMatches: [], upsideDown: false },
      timingsMs: {},
    };
    setReview((r) => [{ key: newKey(), scan: { ...scan, lang: entry.lang ?? scan.lang, best: { printing: entry.printing, score: 1, collectorScore: 0 } }, replaces: entry }, ...r]);
    setReviewOpen(true);
  }, []);

  const closeReview = useCallback(() => {
    setReviewOpen(false);
    // Cancelling a fix drops it: the card is already saved as it was.
    setReview((r) => (r[0]?.replaces ? r.slice(1) : r));
  }, []);

  // ------------------------------------------------------------ render

  const live = camera.status === "live";
  const total = session.length;
  // The visit's running value, in the app's currency (null when prices are hidden or unknown).
  const worth = (e: SessionEntry) => priceOf(e.printing, e.finish);
  const value = prices && session.some((e) => worth(e) != null) ? formatMoney(session.reduce((n, e) => n + (worth(e) ?? 0), 0), prices) : null;
  const toCheck = review.filter((r) => !r.replaces).length;
  const video = camera.status === "live" && camera.width && camera.height ? { w: camera.width, h: camera.height } : null;
  const help = camera.status === "unavailable" ? cameraHelp(camera.problem) : null;
  const showVisit = () => document.getElementById(`${ids}-visit`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Old look: the box takes the video's shape, as before. New look: CSS sizes it (see "Scan" in globals.css).
  const viewStyle: React.CSSProperties | undefined = fill
    ? video
      ? ({ "--scan-ratio": `${video.w} / ${video.h}`, "--scan-ratio-n": video.w / video.h } as React.CSSProperties)
      : undefined
    : video
      ? { aspectRatio: `${video.w} / ${video.h}`, maxHeight: "62vh", maxWidth: `calc(62vh * ${video.w / video.h})` }
      : { minHeight: "21rem" };
  const pill = live
    ? "border-white/15 bg-black/55 text-white backdrop-blur-sm"
    : "border-line bg-background/80 text-foreground";

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] min-[900px]:items-start">
      {/* ------------------------------------------------ camera, or photos */}
      <section
        aria-label="Camera"
        className="scan-stage flex min-w-0 flex-col gap-3"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        <div
          className={`scan-view relative mx-auto flex w-full flex-col overflow-hidden rounded-2xl ${live || camera.status === "starting" ? "bg-black" : "border border-line bg-panel"}`}
          style={viewStyle}
        >
          <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full ${fill ? "object-contain" : "object-fill"}`} />
          <canvas ref={overlayRef} className={`pointer-events-none absolute inset-0 h-full w-full ${fill ? "object-contain" : "object-fill"} ${live ? "" : "hidden"}`} />

          {/* What happens when the camera isn't running. In the page's flow, so the box grows to fit it where it can. */}
          {!live && (
            <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-16 pb-20 text-center">
              <div className="my-auto flex flex-col items-center gap-4">
                {camera.status === "starting" ? (
                  <>
                    <Skeleton className="h-40 w-28 rounded-xl opacity-40" />
                    <p className="text-sm text-white/80">Starting the camera…</p>
                  </>
                ) : help ? (
                  <>
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-warn-bg text-warn">
                      <Glyph name="camera-off" />
                    </span>
                    <div className="max-w-sm space-y-1">
                      <h2 className="text-lg font-semibold">{help.title}</h2>
                      <p className="text-sm text-muted">{help.body}</p>
                      {camera.status === "unavailable" && camera.reason && <p className="text-xs text-muted">({camera.reason})</p>}
                    </div>
                    <div className="flex w-full max-w-xs flex-col gap-2">
                      <Button className="min-h-12 w-full text-base" onClick={choosePhotos}>
                        <Glyph name="photo" /> Scan from photos
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          href="/collection/add"
                          className={`inline-flex min-h-12 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-medium hover:bg-background ${help.retry ? "" : "col-span-2"}`}
                        >
                          Type a name
                        </Link>
                        {help.retry && (
                          <Button variant="secondary" className="min-h-12" onClick={start}>
                            Try again
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="grid h-12 w-12 place-items-center rounded-full border border-line text-accent">
                      <Glyph name="camera" />
                    </span>
                    <p className="max-w-xs text-sm text-muted">
                      Hold a card under the camera. It scans by itself once the card is steady in the frame.
                      <span className="hidden min-[900px]:inline"> Or drop photos of cards here.</span>
                    </p>
                    <Button className="min-h-12 px-6 text-base" onClick={start}>
                      Start camera
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Sticky choices for this pile of cards, on the camera where the thumb is. */}
          <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
            <div className="flex shrink-0 gap-2">
              {/* Foil pill: off → on → Auto (the camera looks for foil) → off. */}
              <button
                type="button"
                aria-label={`Finish: ${FINISH_SETTING_LABEL[settings.finish]}. Tap to change.`}
                onClick={() => setSettings((s) => ({ ...s, finish: nextFinish(s.finish) }))}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${pill} ${settings.finish !== "nonfoil" ? "ring-2 ring-accent" : ""}`}
              >
                <span aria-hidden="true">{settings.finish === "auto" ? "◐" : settings.finish !== "nonfoil" ? "✦" : "○"}</span>
                {settings.finish === "etched" ? "Etched" : settings.finish === "auto" ? "Foil: auto" : "Foil"}
              </button>
              {live && torchSupported && (
                <button
                  type="button"
                  aria-pressed={torchOn}
                  onClick={() => setSettings((s) => ({ ...s, torch: !torchOn }))}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium ${pill} ${torchOn ? "ring-2 ring-accent" : ""}`}
                >
                  Torch
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Scan settings: ${FINISH_SETTING_LABEL[settings.finish]}, ${settingsSummary(settings, target)}`}
              className={`inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${pill}`}
            >
              <Icon name="settings" className="h-[18px]! w-[18px]! shrink-0" />
              <span className="truncate">{settingsSummary(settings, target)}</span>
            </button>
          </div>

          {live && (
            <p className="pointer-events-none absolute inset-x-0 top-16 text-center text-sm font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
              {tilting ? TILT_HINT : busy > 0 && !settings.tower ? "Reading…" : hint}
            </p>
          )}

          {/* The last scan: saved (with Undo), or what went wrong. Always in the same place. */}
          <div role="status" aria-live="polite" className="absolute inset-x-2 bottom-2 flex justify-center">
            {!live && busy > 0 ? (
              <p className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 text-sm font-medium shadow-xl">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
                Reading your photo…
              </p>
            ) : (
              status && (
                <p
                  key={status.id}
                  className={`flex min-h-11 max-w-full items-center gap-2 rounded-xl border bg-panel py-1 pl-3 text-sm font-medium shadow-xl transition-[translate,opacity] duration-200 starting:translate-y-2 starting:opacity-0 ${
                    status.undo ? "pr-1" : "pr-4"
                  } ${status.tone === "ok" ? "border-ok/30 text-foreground" : "border-danger/40 text-danger"}`}
                >
                  <span aria-hidden="true" className={status.tone === "ok" ? "text-ok" : "text-danger"}>
                    {status.tone === "ok" ? "✓" : "!"}
                  </span>
                  <span className="min-w-0 flex-1 line-clamp-2">{status.text}</span>
                  {status.undo && (
                    <button
                      type="button"
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 font-semibold text-accent hover:bg-background"
                      onClick={() => {
                        const u = status.undo!;
                        setStatus(undefined);
                        u();
                      }}
                    >
                      <Glyph name="undo" className="h-4 w-4" /> Undo
                    </button>
                  )}
                </p>
              )
            )}
          </div>
        </div>

        {/* Thumb row: photos · shutter · what's waiting. */}
        {camera.status !== "unavailable" && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <button
              type="button"
              onClick={choosePhotos}
              className="inline-flex min-h-12 items-center gap-2 justify-self-start rounded-xl border border-line bg-panel px-3 text-left text-sm leading-tight font-medium hover:bg-background"
            >
              <Glyph name="photo" className="shrink-0 text-muted" />
              Scan from photos
            </button>
            <button
              type="button"
              aria-label="Scan now"
              disabled={!live || busy > 0}
              onClick={shutter}
              className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-foreground/85 disabled:cursor-not-allowed disabled:border-line"
            >
              {/* The screen's one gradient while the camera runs; a sheet on top has its own. */}
              <span className={`h-[52px] w-[52px] rounded-full ${live && !paused ? "bg-accent" : "bg-skeleton"} ${busy > 0 ? "animate-pulse" : ""}`} />
            </button>
            {toCheck > 0 && !reviewShown ? (
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className="inline-flex min-h-12 items-center gap-2 justify-self-end rounded-xl border border-warn/40 bg-warn-bg px-3 text-sm font-semibold text-warn"
              >
                {toCheck} to check
              </button>
            ) : total > 0 ? (
              <button
                type="button"
                onClick={showVisit}
                className="inline-flex min-h-12 items-center gap-1 justify-self-end rounded-xl px-3 text-sm font-medium text-muted hover:text-foreground min-[900px]:hidden"
              >
                {plural(total, "card", "cards")}
                <span aria-hidden="true">↓</span>
              </button>
            ) : (
              <span />
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </section>

      {/* ------------------------------------------------ this visit */}
      <section aria-labelledby={`${ids}-visit`} className="min-w-0 scroll-mt-32 space-y-2 min-[900px]:sticky min-[900px]:top-32">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id={`${ids}-visit`} className="scroll-mt-32 text-sm font-semibold text-muted">
            Added this visit
          </h2>
          {total > 0 && (
            <span className="text-sm text-muted tabular-nums">
              <span className="hidden min-[900px]:inline">{plural(total, "card", "cards")}</span>
              {value && (
                <>
                  <span className="hidden min-[900px]:inline"> · </span>
                  <span className="font-semibold text-foreground">{value}</span>
                </>
              )}
            </span>
          )}
        </div>

        {toCheck > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-warn/40 bg-warn-bg py-1 pr-1 pl-3">
            <span className="min-w-0 flex-1 text-sm font-medium text-warn">
              {plural(toCheck, "card needs", "cards need")} you to check {toCheck === 1 ? "it" : "them"}
            </span>
            <Button variant="secondary" className="min-h-11 shrink-0" onClick={() => setReviewOpen(true)}>
              Check
            </Button>
          </div>
        )}

        {failed.map((f) => (
          <div key={f.key} className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger-bg py-1 pr-1 pl-2">
            {f.preview ? <img src={f.preview} alt="" className="h-14 w-10 shrink-0 rounded-[4px] object-cover" /> : <span className="h-14 w-10 shrink-0" />}
            <span className="min-w-0 flex-1 text-sm text-danger">
              <span className="block font-medium">{f.reached ? "Couldn't read this" : "Waiting for a connection"}</span>
              <span className="block truncate text-xs">{f.error}</span>
            </span>
            <Button variant="secondary" className="min-h-11 shrink-0" onClick={() => retry(f)}>
              Try again
            </Button>
            <button type="button" className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-muted hover:text-foreground" onClick={() => dropFailed(f)}>
              Remove
            </button>
          </div>
        ))}

        {session.length > 0 || busy > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
            {busy > 0 && (
              <li className="flex items-center gap-3 px-3 py-2" aria-label="Reading a card">
                <Skeleton className="h-14 w-10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            )}
            {session.map((e) => (
              <li key={e.key} className="flex items-center gap-3 py-2 pr-1 pl-3">
                {e.printing.imageSmall ? (
                  <img src={e.printing.imageSmall} alt="" className="h-14 w-10 shrink-0 rounded-[4px] bg-skeleton object-cover" />
                ) : (
                  <span className="h-14 w-10 shrink-0 rounded-[4px] bg-skeleton" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {e.pile && <span className="text-muted tabular-nums">#{e.pile} </span>}
                    {e.printing.name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {prices && worth(e) != null && <span className="font-medium text-foreground tabular-nums">{formatMoney(worth(e), prices)} · </span>}
                    {printingLabel(e.printing)}
                    {e.lang && e.lang !== "en" && ` · ${langLabel(e.lang)}`}
                    {e.finish !== "nonfoil" && ` · ${FINISH_LABEL[e.finish]}`}
                    {e.location && e.into?.kind !== "wants" && ` · ${e.location}`}
                    {e.into?.kind === "deck" && ` · into ${e.into.deck}`}
                    {e.into?.kind === "wants" && " · want list"}
                  </p>
                  {e.waitKeys?.some((k) => stillWaiting.has(k)) && <span className="mt-0.5 inline-block rounded bg-warn-bg px-1.5 py-0.5 text-xs font-medium text-warn">Waiting to send</span>}
                  {e.confidence === "guessed" && <span className="mt-0.5 inline-block rounded bg-warn-bg px-1.5 py-0.5 text-xs font-medium text-warn">Printing guessed</span>}
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 text-sm font-medium text-accent"
                  onClick={() => fixEntry(e)}
                >
                  Fix
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-muted hover:text-foreground"
                  onClick={() =>
                    removeEntry(e).then(
                      () => say(removedText(e.printing.name, e.into)),
                      (err) => say(`Couldn't remove: ${message(err)}`, "danger"),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Each card you scan shows here once it&apos;s saved.</p>
        )}

        {session.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            {target.kind === "wants" ? (
              <Link href="/collection/wants" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
                See the want list
              </Link>
            ) : target.kind === "deck" ? (
              <Link href={`/decks/${target.deckId}/cards`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
                See {target.name}
              </Link>
            ) : (
              <Link href="/collection?sort=added" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
                See them in your collection
              </Link>
            )}
            <button type="button" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground" onClick={() => setSession([])}>
              Clear this list
            </button>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ sheets */}
      <Sheet open={reviewShown} onClose={closeReview} title={current ? reviewQuestion(current) : ""}>
        {current && (
          <ReviewSheet key={current.key} item={current} settings={settings} onAdd={onReviewAdd} onSkip={finishReview} queued={review.length - 1} />
        )}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Scan settings">
        <div className="space-y-4">
          <p className="-mt-1 text-sm text-muted">These stay set for every card you scan, until you change them.</p>
          <label className="block space-y-1">
            <span className="block text-sm font-medium text-muted">Scan into</span>
            <select
              className="h-12 w-full min-w-0 rounded-lg border border-line bg-background px-3 text-base text-foreground"
              value={target.kind === "deck" ? `deck:${target.deckId}` : target.kind}
              onChange={(e) => setSettings((s) => ({ ...s, into: e.target.value }))}
            >
              <option value="collection">Your collection</option>
              {decks.length > 0 && (
                <optgroup label="Your collection and a deck">
                  {decks.map((d) => (
                    <option key={d.id} value={`deck:${d.id}`}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="wants">The want list (cards you don&apos;t own)</option>
            </select>
            {target.kind === "deck" && <span className="block text-sm text-muted">Each card joins your collection and {target.name}, so you can scan a deck in from the table.</span>}
            {target.kind === "wants" && <span className="block text-sm text-muted">For a friend&apos;s binder or a shop&apos;s case: cards go on your want list, not into your collection.</span>}
          </label>
          <div className="space-y-1">
            <p id={`${ids}-finish`} className="text-sm font-medium text-muted">
              Finish
            </p>
            <Segmented
              name={`${ids}-finish`}
              labelledBy={`${ids}-finish`}
              value={settings.finish}
              onChange={(f) => setSettings((s) => ({ ...s, finish: f as FinishSetting }))}
              options={(["nonfoil", "foil", "etched", "auto"] as FinishSetting[]).map((f) => ({ value: f, label: FINISH_SETTING_LABEL[f] }))}
            />
            {settings.finish === "auto" && (
              <p className="text-sm text-muted">
                The camera watches for foil&apos;s rainbow shine as the card moves. Tilt each card a little under a light. If it can&apos;t tell, it asks. Still being tuned: check the first few.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p id={`${ids}-condition`} className="text-sm font-medium text-muted">
              Condition
            </p>
            <Segmented
              name={`${ids}-condition`}
              labelledBy={`${ids}-condition`}
              value={settings.condition}
              onChange={(c) => setSettings((s) => ({ ...s, condition: c }))}
              options={CONDITIONS.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <label className="block space-y-1">
            <span className="block text-sm font-medium text-muted">Where they&apos;ll live (optional)</span>
            <input
              className="h-12 w-full min-w-0 rounded-lg border border-line bg-background px-3 text-base text-foreground placeholder:text-muted"
              value={settings.location}
              placeholder="Binder, box…"
              onChange={(e) => setSettings((s) => ({ ...s, location: e.target.value }))}
            />
          </label>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line bg-background p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
              checked={settings.autoAdd}
              onChange={(e) => setSettings((s) => ({ ...s, autoAdd: e.target.checked }))}
            />
            <span className="text-sm">
              <span className="block font-medium">Add sure matches straight away</span>
              <span className="block text-muted">Each one says it saved, with Undo. Unsure ones always ask.</span>
            </span>
          </label>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line bg-background p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
              checked={settings.tower}
              onChange={(e) => setSettings((s) => ({ ...s, tower: e.target.checked }))}
            />
            <span className="text-sm">
              <span className="block font-medium">Scanning tower</span>
              <span className="block text-muted">
                The phone looks down a tower and cards drop onto a pile. Each card is read when it lands and numbered, so one that needs a check can be found in the pile.
              </span>
            </span>
          </label>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line bg-background p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
              checked={settings.sound}
              onChange={(e) => {
                unlockSound();
                setSettings((s) => ({ ...s, sound: e.target.checked }));
              }}
            />
            <span className="text-sm">
              <span className="block font-medium">Sound and buzz for each card</span>
              <span className="block text-muted">One chime when a card is saved, two lower ones when it needs a check, so you can scan without looking.</span>
            </span>
          </label>
          {settings.tower && live && !torchSupported && (
            <p className="text-sm text-muted">This browser can&apos;t switch the phone&apos;s torch, so use room light.</p>
          )}
          <div className={`grid gap-2 ${live ? "grid-cols-2" : ""}`}>
            {live && (
              <Button variant="secondary" className="min-h-12" onClick={stop}>
                Stop camera
              </Button>
            )}
            <Button variant="secondary" className="min-h-12" onClick={() => setSettingsOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/** The Foil pill's next setting: off → on → Auto → off (Etched, set in the sheet, goes back to off). */
function nextFinish(f: FinishSetting): FinishSetting {
  return f === "nonfoil" ? "foil" : f === "foil" ? "auto" : "nonfoil";
}

/* --------------------------------------------------------------- drawing */

type OverlayColors = { guide: string; found: string; reading: string; guideWidth: number };

/** The guide and found-card outline. In the new look they come from the theme; the old look keeps its colours. */
function overlayColors(c: HTMLCanvasElement | null): OverlayColors {
  if (c?.closest(".app-shell")) {
    const css = getComputedStyle(c);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return { guide: v("--accent-text", "#f0abfc"), found: v("--ok", "#4ade80"), reading: v("--warn", "#fbbf24"), guideWidth: 3 };
  }
  return { guide: "rgba(255,255,255,0.7)", found: "rgba(74,222,128,0.95)", reading: "rgba(250,204,21,0.95)", guideWidth: 2 };
}

function drawOverlay(
  c: HTMLCanvasElement,
  w: number,
  h: number,
  guide: { x: number; y: number; width: number; height: number } | null,
  quad: Quad | null,
  reading: boolean,
  colors: OverlayColors,
) {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // Dim outside the guide (tower mode has no guide: the card can be anywhere).
  if (guide) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);
    const r = guide.width * 0.045;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    roundRect(ctx, guide.x, guide.y, guide.width, guide.height, r);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = colors.guideWidth;
    ctx.strokeStyle = colors.guide;
    roundRect(ctx, guide.x, guide.y, guide.width, guide.height, r);
    ctx.stroke();
  }
  if (quad) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = reading ? colors.reading : colors.found;
    ctx.beginPath();
    quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* --------------------------------------------------------------- icons */

const GLYPHS = {
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.6-2.2h5.4L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  "camera-off": (
    <>
      <path d="M9.3 4.8h5.4L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v8.2M18.2 19H5.5A1.5 1.5 0 0 1 4 17.5v-9A1.5 1.5 0 0 1 5.5 7h1.3" />
      <path d="M9.8 10.7a3.4 3.4 0 0 0 4.6 4.8M3.5 3.5l17 17" />
    </>
  ),
  photo: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m20.5 15.5-4.8-4.8L6 19" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4.5 9.5 9 5" />
      <path d="M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3" />
    </>
  ),
} as const;

function Glyph({ name, className = "" }: { name: keyof typeof GLYPHS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-5 w-5 ${className}`}
    >
      {GLYPHS[name]}
    </svg>
  );
}
