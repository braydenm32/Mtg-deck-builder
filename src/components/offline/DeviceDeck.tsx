"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { cardDetails } from "@/lib/offline/card-details";
import { applyDeckEdits, tabCounts, type CardDetail, type OwnedIndex } from "@/lib/offline/deck-model";
import { fetchSnapshot, readSnapshot, type DeckSnapshot } from "@/lib/offline/deck-snapshot";
import type { Kept } from "@/lib/offline/kept";
import { useOutbox } from "@/lib/offline/outbox";
import { ownedIndex, refreshOwned } from "@/lib/offline/owned";
import { useOnline } from "@/lib/offline/use-online";
import { DeckPendingEdits } from "./DeckPendingEdits";
import type { DeviceTabsProps } from "./DeviceTabs";

/** The deck tabs the device can draw itself. Playtest always comes from the server. */
export type DeviceTab = "overview" | "cards" | "missing" | "upgrades";
const TABS: Record<string, DeviceTab> = { "": "overview", "/cards": "cards", "/missing": "missing", "/suggestions": "upgrades" };

export function deviceTab(path: string, deckId: number): DeviceTab | null {
  const base = `/decks/${deckId}`;
  const p = path.replace(/\/$/, "");
  return p.startsWith(base) ? (TABS[p.slice(base.length)] ?? null) : null;
}

/** The tab views, in their own chunk; loaded once the page has settled so it's on the device for offline. */
const loadTabs = () => import("./DeviceTabs").then((m) => m.DeviceTabs);
/** How long the page's deck must stay the same before the device fetches its copy again. */
const SETTLE_MS = 3000;

/**
 * The deck's top bar and tab, drawn by the server as usual, or on this device while the deck has edits
 * waiting to send: then the tab is drawn from the device's copy of the deck
 * (src/lib/offline/deck-snapshot.ts) as the edits leave it (src/lib/offline/deck-model.ts), so the
 * Overview's numbers, the Missing and Upgrades lists and the tab counts include the changes. It stays
 * on the device until the sent edits are on the server's page, so nothing jumps back meanwhile.
 * Keeps the copy fresh: when the page shows a deck the device's copy doesn't match, it's fetched again.
 */
export function DeviceDeck({
  deckId,
  version,
  title,
  counts,
  actions,
  children,
}: {
  deckId: number;
  /** deckVersion() of the deck the server drew. */
  version: string;
  title: string;
  counts: Record<string, number>;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const search = useSearchParams();
  const tab = deviceTab(path, deckId);
  const online = useOnline();
  const { queue, settling, sent, state } = useOutbox();
  const [kept, setKept] = useState<Kept<DeckSnapshot> | null>(null);
  // The newer of what's read from the device and what's fetched, for this deck only.
  const keep = (s: Kept<DeckSnapshot>) => setKept((cur) => (cur && cur.data.v.deck.id === s.data.v.deck.id && cur.savedAt > s.savedAt ? cur : s));
  const snap = kept?.data.v.deck.id === deckId ? kept : null;
  const [owned, setOwned] = useState<OwnedIndex | null>(null);
  const [Tabs, setTabs] = useState<ComponentType<DeviceTabsProps> | null>(null);

  useEffect(() => {
    let live = true;
    void readSnapshot(deckId).then((s) => live && s && keep(s));
    void ownedIndex().then((o) => live && setOwned(o));
    const t = window.setTimeout(() => {
      loadTabs()
        .then((T) => live && setTabs(() => T))
        .catch(() => {});
    }, 1500);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [deckId]);

  // Fetch the device's copy again when the page shows a deck it doesn't match (once per version),
  // after the page has settled and nothing is being sent.
  const fetchedFor = useRef<string | null>(null);
  const sending = state === "sending" || queue.some((e) => e.deckId === deckId);
  useEffect(() => {
    if (!online || sending) return;
    if (snap && snap.data.version === version && !snap.stale) return;
    if (fetchedFor.current === version) return;
    const t = window.setTimeout(() => {
      void fetchSnapshot(deckId).then((s) => {
        if (!s) return;
        fetchedFor.current = version;
        keep(s);
      });
      void refreshOwned().then(() => ownedIndex().then(setOwned));
    }, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [deckId, version, online, sending, snap]);

  // Edits for this deck the server's page doesn't show yet: waiting, or sent and not redrawn.
  const mine = queue.filter((e) => e.deckId === deckId);
  const unsettled = settling.filter((e) => e.deckId === deckId);
  const waiting = mine.length > 0 && (!online || state === "waiting" || state === "locked");
  // Once it's drawing on the device, it keeps drawing until those edits are on the page.
  const [sticky, setSticky] = useState(false);
  useEffect(() => {
    if (waiting) setSticky(true);
    else if (!mine.length && !unsettled.length) setSticky(false);
  }, [waiting, mine.length, unsettled.length]);
  const wanted = (waiting || sticky) && mine.length + unsettled.length > 0;
  // Needed now: don't wait for the page to settle.
  useEffect(() => {
    if (!wanted || Tabs) return;
    let live = true;
    loadTabs()
      .then((T) => live && setTabs(() => T))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wanted, Tabs]);

  // Applied to the copy: every edit sent since it was fetched, then the ones waiting.
  const startedAt = snap?.startedAt ?? 0;
  const edits = useMemo(
    () => [...sent.filter((s) => s.edit.deckId === deckId && s.doneAt > startedAt).map((s) => s.edit), ...mine],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mine` is derived from `queue`
    [sent, queue, deckId, startedAt],
  );

  // Card data for cards added that the copy has no row for.
  const need = useMemo(() => {
    const have = new Set(snap?.data.v.cards.map((c) => c.oracleId));
    const ids = edits.flatMap((e) => (e.kind === "add" ? [e.oracleId] : e.kind === "restore" ? [e.removed.oracleId] : [])).filter((id) => !have.has(id));
    return [...new Set(ids)].sort().join(",");
  }, [edits, snap]);
  const [details, setDetails] = useState<{ key: string; map: Map<string, CardDetail> }>({ key: "", map: new Map() });
  useEffect(() => {
    if (!need) return;
    let live = true;
    void cardDetails(need.split(",")).then((map) => live && setDetails({ key: need, map }));
    return () => {
      live = false;
    };
  }, [need]);

  const ready = wanted && tab && snap && Tabs && (!need || details.key === need);
  const model = useMemo(
    () => (ready ? applyDeckEdits(snap.data.v, edits, { details: details.map, owned: owned ?? undefined }) : null),
    [ready, snap, edits, details, owned],
  );

  return (
    <>
      <TopBar inPage title={title} counts={model ? tabCounts(model) : counts} actions={actions} />
      <DeckPendingEdits deckId={deckId} counted={!!model} />
      {model && Tabs && tab && snap ? <Tabs v={model} snap={snap.data} tab={tab} group={search.get("group")} /> : children}
    </>
  );
}
