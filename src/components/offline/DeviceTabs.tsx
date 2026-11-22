"use client";

import { useMemo } from "react";
import type { LoadedDeck } from "@/app/decks/[id]/data";
import { cardGroups, groupLabel, groupOf, GROUPS } from "@/components/deck/card-groups";
import { CardsView } from "@/components/deck/CardsView";
import { MissingView } from "@/components/deck/MissingView";
import { OverviewView } from "@/components/deck/OverviewView";
import { UpgradesView } from "@/components/deck/UpgradesView";
import { finishAnalysis, inputsFor } from "@/lib/deck/analysis";
import type { DeviceDeck } from "@/lib/offline/deck-model";
import type { DeckSnapshot } from "@/lib/offline/deck-snapshot";
import type { DeviceTab } from "./DeviceDeck";

export type DeviceTabsProps = { v: DeviceDeck; snap: DeckSnapshot; tab: DeviceTab; group: string | null };

/**
 * A deck tab drawn on the device (see DeviceDeck): the same views the server draws, from the device's
 * copy of the deck as its waiting edits leave it. The Overview's analysis is worked out here too, with
 * the combos found again among the ones Spellbook gave for the deck.
 */
export function DeviceTabs({ v: model, snap, tab, group }: DeviceTabsProps) {
  const v = model as LoadedDeck;
  switch (tab) {
    case "overview":
      return <Overview v={v} snap={snap} />;
    case "cards": {
      const g = groupOf(group ?? undefined);
      return <CardsView v={v} groups={[...GROUPS]} group={g} keys={cardGroups(v, g)} label={(k) => groupLabel(k, g)} />;
    }
    case "missing":
      return <MissingView v={v} pv={snap.pv} />;
    case "upgrades":
      return <UpgradesView v={v} pv={snap.pv} />;
  }
}

function Overview({ v, snap }: { v: LoadedDeck; snap: DeckSnapshot }) {
  const a = useMemo(() => {
    // Cards you own, for "one card away" combos: those the server said you own, and the deck's own.
    const owned = new Set([
      ...snap.inputs.near.filter((n) => n.owned).map((n) => n.missing),
      ...[...snap.v.cards, ...v.cards].filter((c) => c.owned > 0).map((c) => c.name),
    ]);
    return finishAnalysis(v, inputsFor(v, snap.inputs, owned));
  }, [v, snap]);
  return <OverviewView v={v} a={a} pv={snap.pv} />;
}
