import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import type { CardFace } from "@/db/schema";
import { cardAvailability, type CardAvailability } from "@/lib/collection/availability";
import { knownLocations } from "@/lib/collection/locations";
import { ownedCard } from "@/lib/collection/query";
import { CHEAP_COPY_USD, sharedCards } from "@/lib/deck/allocate";
import { AddCardForm } from "@/components/AddCardForm";
import { AllPrintings } from "@/components/cards/AllPrintings";
import { CardPrices } from "@/components/cards/CardPrices";
import { CardRulings } from "@/components/cards/CardRulings";
import { SharedCardActions } from "@/components/SharedCardActions";
import { StackEditor, type Stack } from "@/components/StackEditor";
import { TopBar } from "@/components/shell/TopBar";
import { Badge, ColorPips, ManaCost, money } from "@/components/ui";
import { currentLook } from "@/lib/look";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

const NONE: CardAvailability = { owned: 0, proxies: 0, inDecks: 0, free: 0, decks: [], wantedBy: [], commanderOf: [], places: [] };

/** EDHREC synergy in percentage points, as R15 shows it: "+11", "−6". */
const synergy = (n: number | null) => (n === null ? null : `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 100))} synergy`);

/** Scryfall's language codes, as people say them. */
const LANGUAGE: Record<string, string> = { ja: "Japanese", zhs: "Simplified Chinese", zht: "Traditional Chinese", ko: "Korean", ru: "Russian", de: "German", fr: "French", it: "Italian", es: "Spanish", pt: "Portuguese", ph: "Phyrexian", la: "Latin", he: "Hebrew", ar: "Arabic", grc: "Ancient Greek", sa: "Sanskrit", qya: "Quenya" };

const and = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export default async function CardPage({ params }: { params: Promise<{ oracleId: string }> }) {
  const { oracleId } = await params;
  const db = await getDb();
  const [owned, pv, look] = await Promise.all([ownedCard(db, oracleId), getPriceView(), currentLook()]);
  if (!owned) notFound();
  const c = owned.card;
  const faces: CardFace[] | null = c.card_faces ? JSON.parse(String(c.card_faces)) : null;
  const stacks: Stack[] = owned.stacks.map((s) => ({
    id: Number(s.id),
    printingId: String(s.printing_id),
    quantity: Number(s.quantity),
    finish: String(s.finish),
    condition: String(s.condition ?? ""),
    lang: String(s.lang),
    location: String(s.location ?? ""),
    altered: Boolean(s.altered),
    signed: Boolean(s.signed),
    misprint: Boolean(s.misprint),
    proxy: Boolean(s.proxy),
    purchasePrice: s.purchase_price == null ? null : Number(s.purchase_price),
    setCode: String(s.set_code),
    setName: String(s.set_name),
    collectorNumber: String(s.collector_number),
    unitPrice: s.unit_price == null ? null : Number(s.unit_price),
    source: String(s.source),
    printingConfidence: String(s.printing_confidence),
    matchNote: String(s.match_note ?? ""),
    tags: s.tags ? (JSON.parse(String(s.tags)) as string[]) : [],
  }));
  const image = (owned.stacks[0]?.image_normal as string) ?? (c.image_normal as string);
  const name = String(c.name);
  // Copies printed in another language: the text below is the English Oracle text, and says so.
  const foreignLangs = [...new Set(stacks.map((s) => s.lang).filter((l) => l && l !== "en"))];
  const foreign = foreignLangs.length > 0;
  const cardText = (
    <div className="space-y-2 whitespace-pre-line text-sm">
      {foreign && <p className="text-[13px] whitespace-normal text-muted">Your {and(foreignLangs.map((l) => LANGUAGE[l] ?? l.toUpperCase()))} {stacks.length === 1 && stacks[0].quantity === 1 ? "copy is" : "copies are"} printed in another language. This is the English text.</p>}
      {faces
        ? faces.map((f) => (
            <p key={f.name}>
              <span className="font-medium">{f.name}</span> {f.manaCost}
              {"\n"}
              {f.oracleText}
            </p>
          ))
        : String(c.oracle_text)}
    </div>
  );

  if (look === "new") {
    const [availability, places] = await Promise.all([cardAvailability(db, [oracleId]), knownLocations(db)]);
    const a = availability.get(oracleId) ?? NONE;
    // A card more active decks want than you have copies of (R6): its decision can be made right here.
    const shared = a.wantedBy.length > 0 ? (await sharedCards(db)).find((s) => s.oracleId === oracleId) : undefined;
    const canLead = Number(c.can_be_commander) === 1;
    const legality = String(c.legal_commander);
    const decided = shared && !shared.settled;
    const buildIsMain = canLead && !decided && a.commanderOf.length === 0;
    // The screen's one gradient button: give the shared card to its best deck, or build around a commander.
    const mainAction = Boolean(decided) || buildIsMain;

    // One row per deck that holds, leads or wants this card. A deck it leads holds its copy too, but shows once, as "Commander".
    const leads = new Set(a.commanderOf.map((d) => d.id));
    const rows: { id: number; name: string; state: string; tone: "ok" | "accent" | "muted"; note?: string | null; recommended?: boolean }[] = [
      ...a.commanderOf.map((d) => ({ id: d.id, name: d.name, state: d.status === "idea" ? "Idea · commander" : "Commander", tone: "accent" as const })),
      ...a.decks.filter((d) => !leads.has(d.id)).map((d) => ({ id: d.id, name: d.name, state: "In deck", tone: "ok" as const })),
      ...a.wantedBy.map((d) => ({ id: d.id, name: d.name, state: d.status === "idea" ? "Idea · wants it" : "Wants it", tone: "muted" as const, note: synergy(d.synergy) })),
    ];
    for (const r of rows) {
      const s = shared?.decks.find((d) => d.deckId === r.id);
      if (s) {
        r.recommended = s.recommended;
        r.note ??= synergy(s.synergy);
      }
    }
    // The best fit first when two decks want it.
    rows.sort((x, y) => Number(Boolean(y.recommended)) - Number(Boolean(x.recommended)));

    const where =
      a.places.length === 0 ? (
        "—"
      ) : a.places.length > 2 ? (
        `${a.places.length} places`
      ) : (
        a.places.map((p) => (
          <span key={p.location} className="block">
            {p.location || <span className="text-warn">Needs a home</span>}
            {a.places.length > 1 && <span className="font-normal text-muted"> ×{p.copies}</span>}
          </span>
        ))
      );

    return (
      <div className="space-y-4">
        <TopBar inPage title={name} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-10">
          {/* Laptop: the card and its text beside the summary. */}
          <aside className="hidden space-y-5 lg:block">
            <div className="relative aspect-[488/680] w-full overflow-hidden rounded-[4.5%] bg-skeleton shadow-2xl shadow-black/40">
              {image && <Image src={image} alt={name} fill sizes="300px" className="object-cover" priority />}
            </div>
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Card text{foreign ? " in English" : ""}</h2>
              {cardText}
            </section>
          </aside>

          <div className="min-w-0 space-y-6">
            <header className="flex items-start gap-3">
              <div className="relative aspect-[488/680] w-16 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton lg:hidden">
                {image && <Image src={image} alt="" fill sizes="64px" className="object-cover" priority />}
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  {c.mana_cost ? (
                    <span className="rounded-md border border-line px-1.5 leading-5">
                      <ManaCost cost={c.mana_cost as string} />
                    </span>
                  ) : null}
                  <span>{String(c.type_line)}</span>
                  {String(c.color_identity) && <ColorPips identity={String(c.color_identity)} />}
                </p>
                <p className="flex flex-wrap gap-1.5">
                  {canLead && <Badge>Can be your commander</Badge>}
                  {Number(c.game_changer) === 1 && <Badge tone="warn">Game Changer</Badge>}
                  {legality !== "legal" && <Badge tone="danger">{legality === "banned" ? "Banned in Commander" : "Not legal in Commander"}</Badge>}
                </p>
              </div>
            </header>

            {/* The summary strip (R4): owned · in decks · free · where. */}
            <dl className="grid grid-cols-4 overflow-hidden rounded-2xl border border-line bg-panel">
              <div className="p-3">
                <dt className="text-xs text-muted">Owned</dt>
                <dd className="font-[family-name:var(--font-sora)] text-2xl font-bold tabular-nums">{a.owned}</dd>
                {a.proxies > 0 && <dd className="text-xs text-muted">{a.proxies === 1 ? "1 proxy" : `${a.proxies} proxies`}</dd>}
              </div>
              <div className="border-l border-line p-3">
                <dt className="text-xs text-muted">In decks</dt>
                <dd className="font-[family-name:var(--font-sora)] text-2xl font-bold tabular-nums">{a.inDecks}</dd>
              </div>
              <div className="border-l border-line p-3">
                <dt className="text-xs text-muted">Free</dt>
                <dd className="grad-text font-[family-name:var(--font-sora)] text-2xl font-bold tabular-nums">{a.free}</dd>
              </div>
              <div className="min-w-0 border-l border-line p-3">
                <dt className="text-xs text-muted">Where</dt>
                <dd className="break-words text-sm font-semibold leading-snug">{where}</dd>
              </div>
            </dl>

            {rows.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  {shared ? `${and(shared.decks.map((d) => d.deckName))} ${shared.decks.length === 2 ? "both " : ""}want it` : "Decks"}
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                  {rows.map((r) => (
                    <li key={`${r.state}-${r.id}`}>
                      <Link href={`/decks/${r.id}`} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 hover:bg-(--panel-2)">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.name}</span>
                          {r.note && <span className="block text-[13px] text-muted">{r.note}</span>}
                        </span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          {r.recommended && <Badge tone="ok">Best fit</Badge>}
                          <Badge tone={r.tone}>{r.state}</Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {decided && (
                  <div className="space-y-2">
                    <SharedCardActions oracleId={oracleId} decks={shared.decks} />
                    <p className="text-[13px] text-muted">
                      Giving it to a deck locks it there; a deck that&rsquo;s still being built is rebuilt to fill the gap.
                      {shared.getAnother &&
                        (pv.hide
                          ? " It’s a cheap card, so another copy may be easier than choosing."
                          : ` It’s cheap (${money(shared.priceUsd, pv)}, under ${money(CHEAP_COPY_USD, pv)}), so another copy may be easier than choosing.`)}
                    </p>
                  </div>
                )}
                {a.commanderOf.some((d) => d.status === "idea") && a.decks.length === 0 && (
                  <p className="text-[13px] text-muted">An idea doesn&rsquo;t hold its commander&rsquo;s copy, so it stays free until you start building.</p>
                )}
              </section>
            ) : (
              a.owned > 0 && <p className="text-sm text-muted">No deck uses {name} yet.</p>
            )}

            {canLead && (
              <Link
                href={`/decks/new?commander=${encodeURIComponent(oracleId)}`}
                className={`inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold ${buildIsMain ? "bg-accent text-accent-fg" : "border border-line"}`}
              >
                {a.commanderOf.length > 0 ? "Build another deck around it" : "Build a deck around it"}
              </Link>
            )}

            <section className="space-y-2">
              <h2 className="text-lg font-semibold">{stacks.length === 1 && stacks[0].quantity === 1 ? "Your copy" : "Your copies"}</h2>
              {stacks.length === 0 && <p className="text-sm text-muted">You don&rsquo;t own {name} any more.</p>}
              <StackEditor stacks={stacks} prices={pv} look="new" places={places} />
            </section>

            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="text-lg leading-none text-muted group-open:hidden">
                  +
                </span>
                <span className="group-open:hidden">Add copies</span>
                <span className="hidden group-open:inline">Close</span>
              </summary>
              {/* Inputs at 16px on a phone, so iOS doesn't zoom. When the page already has its one main
                  button (a deck to give the card to, or a deck to build), the form's Add is secondary. */}
              <div
                className={`mt-3 max-md:[&_input]:text-base max-md:[&_select]:text-base ${
                  mainAction ? "[&_.bg-accent]:border [&_.bg-accent]:border-line [&_.bg-accent]:bg-none! [&_.bg-accent]:bg-(--panel-2)!" : ""
                }`}
              >
                <AddCardForm lockedName={name} />
              </div>
            </details>

            <section className="space-y-2 lg:hidden">
              <h2 className="text-lg font-semibold">Card text{foreign ? " in English" : ""}</h2>
              {cardText}
            </section>

            <CardPrices db={db} oracleId={oracleId} name={name} stacks={stacks} prices={pv} />

            <AllPrintings db={db} oracleId={oracleId} owned={stacks.map((s) => s.printingId)} prices={pv} />

            <CardRulings oracleId={oracleId} />

            {c.edhrec_rank != null && <p className="text-[13px] text-muted">Popularity #{Number(c.edhrec_rank).toLocaleString("en-AU")} on EDHREC, across all of Commander.</p>}
          </div>
        </div>
      </div>
    );
  }

  const total = stacks.reduce((n, s) => n + s.quantity, 0);
  return (
    <div className="space-y-6">
      <Link href="/collection" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
        ← Collection
      </Link>
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="relative mx-auto aspect-[488/680] w-full max-w-[300px] overflow-hidden rounded-[4.5%] bg-skeleton">
          {image && <Image src={image} alt={name} fill sizes="300px" className="object-cover" priority />}
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">{name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>{String(c.type_line)}</span>
              <ColorPips identity={String(c.color_identity)} />
            </div>
          </div>
          {cardText}
          <p className="text-xs text-muted">
            Commander: {String(c.legal_commander).replace("_", " ")}
            {Number(c.can_be_commander) ? " · can be your commander" : ""}
            {c.edhrec_rank != null && ` · EDHREC rank #${Number(c.edhrec_rank).toLocaleString()}`}
            {Number(c.game_changer) ? " · Game Changer" : ""}
          </p>
          <CardRulings oracleId={oracleId} />
          <CardPrices db={db} oracleId={oracleId} name={name} stacks={stacks} prices={pv} />
          <section className="space-y-2">
            <h2 className="font-semibold">You own {total}</h2>
            <StackEditor stacks={stacks} prices={pv} />
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Add more</h2>
            <AddCardForm lockedName={name} />
          </section>
        </div>
      </div>
    </div>
  );
}
