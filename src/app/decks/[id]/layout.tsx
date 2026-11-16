import Image from "next/image";
import Link from "next/link";
import { ColorPips, Progress } from "@/components/ui";
import { DeckTabs } from "@/components/DeckTabs";
import { DeckExport } from "@/components/deck/DeckExport";
import { DeviceDeck } from "@/components/offline/DeviceDeck";
import { currentLook } from "@/lib/look";
import { STATUS_LABEL } from "@/lib/deck/store";
import { themeLabel } from "@/lib/deck/themes";
import { deckVersion } from "@/lib/deck/version";
import { tabCounts } from "@/lib/offline/deck-model";
import { loadDeck } from "./data";

export const dynamic = "force-dynamic";

export default async function DeckLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = await params;
  const v = await loadDeck(id);
  const missing = [...v.commanderSlots, ...v.cards.filter((c) => c.board === "main")].filter((c) => c.state !== "placed").length;
  const suggestions = v.cards.filter((c) => c.board === "upgrade").length;
  if ((await currentLook()) === "new") {
    // The new look puts the deck's name, Back, the tabs and Export in the top bar (src/lib/nav.ts).
    // Only the Overview carries the deck's summary (CALM 6), so the other tabs open straight on their
    // content. Upgrades also lists the cards this deck wants that sit in your other decks. While the
    // deck has edits waiting to send, DeviceDeck draws the bar's counts and the tab on the device.
    return (
      <div className="space-y-4">
        <DeviceDeck
          deckId={v.deck.id}
          version={deckVersion(v)}
          title={v.deck.name}
          counts={tabCounts(v)}
          actions={<DeckExport deckId={v.deck.id} name={v.deck.name} />}
        >
          {children}
        </DeviceDeck>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
        ← Decks
      </Link>
      <header className="flex min-w-0 gap-4">
        <div className="flex shrink-0 gap-1">
          {v.commanders.map((c) => (
            <div key={c.oracleId} className="relative aspect-[488/680] w-20 overflow-hidden rounded-[4.5%] bg-skeleton sm:w-28">
              {c.imageNormal && <Image src={c.imageNormal} alt={c.name} fill sizes="112px" className="object-cover" priority />}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{v.deck.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="min-w-0 truncate">{v.commanders.map((c) => c.name).join(" + ")}</span>
            <ColorPips identity={v.deck.colorIdentity} />
          </p>
          <p className="text-sm text-muted">
            {STATUS_LABEL[v.deck.status]}
            {v.deck.theme ? ` · ${themeLabel(v.deck.theme)}` : ""}
          </p>
          <div className="max-w-sm space-y-1">
            <Progress value={v.progress.placed} max={v.progress.of} label="Cards in hand" />
            <p className="text-xs text-muted">
              {v.progress.placed} / {v.progress.of} cards in hand
              {v.claiming ? "" : " (this deck doesn't hold copies while it's an idea or retired)"}
            </p>
          </div>
        </div>
      </header>
      <DeckTabs
        base={`/decks/${v.deck.id}`}
        tabs={[
          { href: "", label: "Overview" },
          { href: "/cards", label: "Cards" },
          { href: "/missing", label: "Missing", count: missing },
          { href: "/suggestions", label: "Upgrades", count: suggestions },
          { href: "/playtest", label: "Playtest" },
        ]}
      />
      {children}
    </div>
  );
}
