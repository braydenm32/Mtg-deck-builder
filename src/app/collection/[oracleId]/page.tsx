import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import type { CardFace } from "@/db/schema";
import { ownedCard } from "@/lib/collection/query";
import { AddCardForm } from "@/components/AddCardForm";
import { StackEditor, type Stack } from "@/components/StackEditor";
import { ColorPips } from "@/components/ui";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: Promise<{ oracleId: string }> }) {
  const { oracleId } = await params;
  const [owned, pv] = await Promise.all([getDb().then((db) => ownedCard(db, oracleId)), getPriceView()]);
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
  }));
  const image = (owned.stacks[0]?.image_normal as string) ?? (c.image_normal as string);
  const total = stacks.reduce((n, s) => n + s.quantity, 0);
  return (
    <div className="space-y-6">
      <Link href="/collection" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
        ← Collection
      </Link>
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="relative mx-auto aspect-[488/680] w-full max-w-[300px] overflow-hidden rounded-[4.5%] bg-skeleton">
          {image && <Image src={image} alt={String(c.name)} fill sizes="300px" className="object-cover" priority />}
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">{String(c.name)}</h1>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>{String(c.type_line)}</span>
              <ColorPips identity={String(c.color_identity)} />
            </div>
          </div>
          <div className="space-y-2 whitespace-pre-line text-sm">
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
          <p className="text-xs text-muted">
            Commander: {String(c.legal_commander).replace("_", " ")}
            {Number(c.can_be_commander) ? " · can be your commander" : ""}
            {c.edhrec_rank != null && ` · EDHREC rank #${Number(c.edhrec_rank).toLocaleString()}`}
            {Number(c.game_changer) ? " · Game Changer" : ""}
          </p>
          <section className="space-y-2">
            <h2 className="font-semibold">You own {total}</h2>
            <StackEditor stacks={stacks} prices={pv} />
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Add more</h2>
            <AddCardForm lockedName={String(c.name)} />
          </section>
        </div>
      </div>
    </div>
  );
}
