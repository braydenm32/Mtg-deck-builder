"use client";

/* eslint-disable @next/next/no-img-element -- Scryfall images are already sized JPGs on a CDN */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { guideRect, type Quad } from "@/scanner/geometry";
import { hammingHex } from "@/scanner/hash";
import { addToCollection, scanImage, undoAdd } from "./api";
import { captureCard, detect, grabFrame, quadDrift, quickHash, WORK_HEIGHT } from "./capture";
import { ReviewSheet } from "./ReviewSheet";
import {
  DEFAULT_SETTINGS,
  type Finish,
  type Printing,
  printingLabel,
  type ReviewItem,
  type ScanResult,
  type ScanSettings,
  type SessionEntry,
} from "./types";
import { useCamera } from "./useCamera";

const SETTINGS_KEY = "scanner.settings.v1";
const SESSION_KEY = "scanner.session.v1";
/** Frames the card must sit still for before auto-capture (~0.6 s at 5 fps). */
const STEADY_FRAMES = 3;
const TICK_MS = 200;

function load<T>(key: string, fallback: T, storage: () => Storage): T {
  try {
    const raw = storage().getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
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

type Toast = { text: string; undo?: () => void; tone?: "ok" | "warn" | "danger" };

export function Scanner() {
  const { videoRef, state: camera, start, stop } = useCamera();
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workCanvas = useRef<HTMLCanvasElement | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
  const [session, setSession] = useState<SessionEntry[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [busy, setBusy] = useState(0);
  const [toast, setToast] = useState<Toast>();
  const [trayOpen, setTrayOpen] = useState(false);
  const [hint, setHint] = useState("Line the card up with the frame");

  // Live-loop state kept in refs so the loop doesn't restart on every render.
  const steady = useRef<{ quad: Quad | null; count: number }>({ quad: null, count: 0 });
  const lastHash = useRef<string | null>(null);
  const inFlight = useRef(false);
  const paused = review.length > 0;

  // Restore sticky settings and this tab's session (so nothing is lost on Back).
  useEffect(() => {
    setSettings(load(SETTINGS_KEY, DEFAULT_SETTINGS, local));
    try {
      const raw = sessionStore().getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => save(SETTINGS_KEY, settings, local), [settings]);
  useEffect(() => {
    // Don't keep whole scan results in storage, they're only for "Fix".
    save(
      SESSION_KEY,
      session.map((e) => ({ ...e, scan: undefined })),
      sessionStore,
    );
  }, [session]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), toast.undo ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------------------------------------------------------------- adding

  const addEntry = useCallback(
    async (printing: Printing, finish: Finish, confidence: "exact" | "guessed", scan?: ScanResult) => {
      const { itemId } = await addToCollection({
        printing,
        finish,
        condition: settings.condition,
        location: settings.location,
        confidence,
      });
      const entry: SessionEntry = {
        key: newKey(),
        itemId,
        printing,
        finish,
        condition: settings.condition,
        location: settings.location,
        confidence,
        addedAt: Date.now(),
        scan,
      };
      setSession((s) => [entry, ...s]);
      return entry;
    },
    [settings.condition, settings.location],
  );

  const removeEntry = useCallback(async (entry: SessionEntry) => {
    await undoAdd(entry.itemId);
    setSession((s) => s.filter((e) => e.key !== entry.key));
  }, []);

  const undoable = useCallback(
    (entry: SessionEntry, verb = "Added") => {
      setToast({
        text: `${verb} ${entry.printing.name} · ${printingLabel(entry.printing)}${entry.finish !== "nonfoil" ? ` · ${entry.finish}` : ""}`,
        tone: "ok",
        undo: () => {
          removeEntry(entry).then(
            () => setToast({ text: `Removed ${entry.printing.name}` }),
            (e) => setToast({ text: String(e.message ?? e), tone: "danger" }),
          );
        },
      });
    },
    [removeEntry],
  );

  /** Decide what to do with a fresh scan: add it, or queue it for the user. */
  const handleResult = useCallback(
    async (scan: ScanResult, preview?: string) => {
      const best = scan.best?.printing;
      const finishOk = best?.finishes.includes(settings.finish);
      if (settings.autoAdd && scan.status === "matched" && best && finishOk) {
        try {
          const entry = await addEntry(best, settings.finish, "exact", scan);
          undoable(entry);
          if (preview) URL.revokeObjectURL(preview);
          return;
        } catch (e) {
          setToast({ text: `Couldn't add: ${e instanceof Error ? e.message : e}`, tone: "danger" });
        }
      }
      setReview((r) => [...r, { key: newKey(), scan, preview }]);
    },
    [addEntry, settings.autoAdd, settings.finish, undoable],
  );

  const runScan = useCallback(
    async (image: Blob, kind: "card" | "photo", preview?: string) => {
      setBusy((b) => b + 1);
      try {
        const scan = await scanImage(image, kind);
        await handleResult(scan, preview);
      } catch (e) {
        setToast({ text: `Scan failed: ${e instanceof Error ? e.message : e}`, tone: "danger" });
      } finally {
        setBusy((b) => b - 1);
      }
    },
    [handleResult],
  );

  // ------------------------------------------------------------ live loop

  const capture = useCallback(
    async (quad: Quad, workScale: number) => {
      const video = videoRef.current;
      if (!video || inFlight.current) return;
      inFlight.current = true;
      try {
        const { jpeg, preview } = await captureCard(video, quad, workScale);
        if (navigator.vibrate) navigator.vibrate(30);
        await runScan(jpeg, "card", preview);
      } finally {
        inFlight.current = false;
      }
    },
    [runScan, videoRef],
  );

  useEffect(() => {
    if (camera.status !== "live") return;
    const video = videoRef.current!;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const overlay = overlayRef.current;
      if (video.videoWidth && overlay) {
        const workScale = Math.min(1, WORK_HEIGHT / video.videoHeight);
        const { img, canvas } = grabFrame(video, workScale, workCanvas.current);
        workCanvas.current = canvas;
        const guide = guideRect(img.width, img.height);
        const det = detect(img, guide);
        drawOverlay(overlay, img.width, img.height, guide, det.usedGuide ? null : det.quad, inFlight.current);

        if (det.usedGuide) {
          steady.current = { quad: null, count: 0 };
          if (!inFlight.current) setHint("Line the card up with the frame");
          // Card gone: the same card may be scanned again next time.
          lastHash.current = null;
        } else {
          const prev = steady.current.quad;
          const still = prev && quadDrift(prev, det.quad, guide.width) < 0.02;
          steady.current = { quad: det.quad, count: still ? steady.current.count + 1 : 1 };
          if (!paused && !inFlight.current && steady.current.count >= STEADY_FRAMES) {
            const h = quickHash(img, det.quad);
            if (lastHash.current && hammingHex(h, lastHash.current) <= 10) {
              setHint("Next card");
            } else {
              lastHash.current = h;
              setHint("Reading…");
              capture(det.quad, workScale);
            }
          } else if (!inFlight.current) {
            setHint(paused ? "Check the card below" : "Hold still");
          }
        }
      }
      timer = window.setTimeout(tick, TICK_MS);
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
    const det = detect(img, guideRect(img.width, img.height));
    lastHash.current = quickHash(img, det.quad);
    capture(det.quad, workScale);
  }, [capture, videoRef]);

  // ------------------------------------------------------------ photos

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      for (const f of Array.from(files)) {
        await runScan(f, "photo", URL.createObjectURL(f));
      }
      if (fileRef.current) fileRef.current.value = "";
    },
    [runScan],
  );

  // ------------------------------------------------------------ review

  const current = review[0];
  const finishReview = useCallback(() => {
    setReview((r) => {
      if (r[0]?.preview) URL.revokeObjectURL(r[0].preview);
      return r.slice(1);
    });
  }, []);

  const onReviewAdd = useCallback(
    async (printing: Printing, finish: Finish) => {
      const item = review[0];
      if (!item) return;
      // The user saw and confirmed the printing; it's only a guess if the finish doesn't exist for it.
      const confidence = printing.finishes.includes(finish) ? "exact" : "guessed";
      if (item.replaces) await removeEntry(item.replaces);
      const entry = await addEntry(printing, finish, confidence, item.scan);
      undoable(entry, item.replaces ? "Changed to" : "Added");
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
    setReview((r) => [{ key: newKey(), scan: { ...scan, best: { printing: entry.printing, score: 1, collectorScore: 0 } }, replaces: entry }, ...r]);
    setTrayOpen(false);
  }, []);

  // ------------------------------------------------------------ render

  const total = session.length;
  const aspect = camera.status === "live" ? `${camera.width} / ${camera.height}` : "3 / 4";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl bg-black"
        // Before the camera starts, keep the box short so photo results stay in view.
        style={camera.status === "live" ? { aspectRatio: aspect, maxHeight: "62vh", maxWidth: `calc(62vh * ${camera.width / camera.height})` } : { minHeight: "11rem" }}
      >
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-fill" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {camera.status !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
            {camera.status === "unavailable" ? (
              <p>{camera.reason}</p>
            ) : camera.status === "starting" ? (
              <p>Starting camera…</p>
            ) : (
              <>
                <p>Point your camera at a card. It scans by itself once the card is steady inside the frame.</p>
                <Button className="min-h-11" onClick={start}>
                  Start camera
                </Button>
              </>
            )}
          </div>
        )}
        {camera.status === "live" && (
          <p className="absolute inset-x-0 top-2 text-center text-sm font-medium text-white drop-shadow">{busy > 0 ? "Reading…" : hint}</p>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm ${
            toast.tone === "danger" ? "bg-danger-bg text-danger" : toast.tone === "warn" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok"
          }`}
        >
          <span className="truncate">{toast.text}</span>
          {toast.undo && (
            <button
              className="min-h-11 shrink-0 px-2 font-medium underline"
              onClick={() => {
                const u = toast.undo!;
                setToast(undefined);
                u();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      {current && (
        <ReviewSheet key={current.key} item={current} settings={settings} onAdd={onReviewAdd} onSkip={finishReview} queued={review.length - 1} />
      )}

      {/* Controls: bottom third, thumb reach. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button
          className={`min-h-11 rounded-md border px-3 text-sm ${settings.finish === "foil" ? "border-accent bg-accent text-accent-fg" : "border-line"}`}
          aria-pressed={settings.finish === "foil"}
          onClick={() => setSettings((s) => ({ ...s, finish: s.finish === "foil" ? "nonfoil" : "foil" }))}
        >
          {settings.finish === "foil" ? "Foil ✓" : "Foil"}
        </button>
        <button
          aria-label="Scan now"
          disabled={camera.status !== "live" || busy > 0}
          onClick={shutter}
          className="h-16 w-16 rounded-full border-4 border-accent bg-panel disabled:opacity-40"
        />
        <button className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => fileRef.current?.click()}>
          Scan from photos
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </div>

      <details className="rounded-lg border border-line bg-panel px-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center">Scan settings</summary>
        <div className="grid grid-cols-2 gap-2 pb-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Condition</span>
            <select
              className="h-11 rounded-md border border-line bg-background px-2"
              value={settings.condition}
              onChange={(e) => setSettings((s) => ({ ...s, condition: e.target.value }))}
            >
              {["NM", "LP", "MP", "HP", "DMG"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Finish</span>
            <select
              className="h-11 rounded-md border border-line bg-background px-2"
              value={settings.finish}
              onChange={(e) => setSettings((s) => ({ ...s, finish: e.target.value as Finish }))}
            >
              <option value="nonfoil">Non-foil</option>
              <option value="foil">Foil</option>
              <option value="etched">Etched</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted">Location (box, binder…)</span>
            <input
              className="h-11 rounded-md border border-line bg-background px-2"
              value={settings.location}
              placeholder="Optional"
              onChange={(e) => setSettings((s) => ({ ...s, location: e.target.value }))}
            />
          </label>
          <label className="col-span-2 flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={settings.autoAdd} onChange={(e) => setSettings((s) => ({ ...s, autoAdd: e.target.checked }))} />
            Add sure matches straight away (you can always undo)
          </label>
          {camera.status === "live" && (
            <Button variant="secondary" className="col-span-2 min-h-11" onClick={stop}>
              Stop camera
            </Button>
          )}
        </div>
      </details>

      <section className="rounded-lg border border-line bg-panel">
        <button className="flex min-h-11 w-full items-center justify-between px-3 text-sm" onClick={() => setTrayOpen((o) => !o)} aria-expanded={trayOpen}>
          <span>
            <strong>{total}</strong> {total === 1 ? "card" : "cards"} this session
            {review.length > 0 && <span className="text-warn"> · {review.length} to check</span>}
          </span>
          <span aria-hidden>{trayOpen ? "▾" : "▴"}</span>
        </button>
        {trayOpen && (
          <ul className="max-h-80 divide-y divide-line overflow-auto border-t border-line">
            {session.length === 0 && <li className="px-3 py-4 text-sm text-muted">Cards you scan show up here.</li>}
            {session.map((e) => (
              <li key={e.key} className="flex items-center gap-2 px-3 py-2">
                {e.printing.imageSmall && <img src={e.printing.imageSmall} alt="" className="h-12 w-auto rounded" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.printing.name}</p>
                  <p className="text-xs text-muted">
                    {printingLabel(e.printing)}
                    {e.finish !== "nonfoil" && ` · ${e.finish}`}
                    {e.confidence === "guessed" && <span className="text-warn"> · printing guessed</span>}
                  </p>
                </div>
                <button className="min-h-11 px-2 text-sm text-accent" onClick={() => fixEntry(e)}>
                  Fix
                </button>
                <button
                  className="min-h-11 px-2 text-sm text-danger"
                  onClick={() => removeEntry(e).catch((err) => setToast({ text: String(err.message ?? err), tone: "danger" }))}
                >
                  Remove
                </button>
              </li>
            ))}
            {session.length > 0 && (
              <li className="flex justify-between gap-2 px-3 py-2">
                <Link href="/collection?sort=added" className="flex min-h-11 items-center text-sm text-accent">
                  See them in your collection
                </Link>
                <button className="min-h-11 px-2 text-sm text-muted" onClick={() => setSession([])}>
                  Clear list
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function drawOverlay(c: HTMLCanvasElement, w: number, h: number, guide: { x: number; y: number; width: number; height: number }, quad: Quad | null, reading: boolean) {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // Dim outside the guide.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, w, h);
  const r = guide.width * 0.045;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  roundRect(ctx, guide.x, guide.y, guide.width, guide.height, r);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  roundRect(ctx, guide.x, guide.y, guide.width, guide.height, r);
  ctx.stroke();
  if (quad) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = reading ? "rgba(250,204,21,0.95)" : "rgba(74,222,128,0.95)";
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

