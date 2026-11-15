import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { ColorPips, Panel, Progress } from "@/components/ui";
import { sharedCards } from "@/lib/deck/allocate";
import { listDecks, STATUS_LABEL } from "@/lib/deck/store";
import { themeLabel } from "@/lib/deck/themes";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const db = await getDb();
  const [decks, shared] = await Promise.all([listDecks(db), sharedCards(db)]);
  const active = decks.filter((d) => d.status !== "retired");
  const retired = decks.filter((d) => d.status === "retired");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Decks</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/decks/commanders" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm">
            Find a commander
          </Link>
          <Link href="/decks/import" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm">
            Import a list
          </Link>
          <Link href="/decks/new" className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg">
            New deck
          </Link>
        </div>
      </div>
      {shared.length > 0 && (
        <Link href="/decks/shared" className="block">
          <Panel className="flex items-center justify-between gap-3 hover:border-accent">
            <span className="text-sm">
              <span className="font-medium">{shared.length} shared {shared.length === 1 ? "card" : "cards"}</span>
              <span className="text-muted"> · more decks want them than you have copies. See which deck each should go to.</span>
            </span>
            <span aria-hidden>→</span>
          </Panel>
        </Link>
      )}
      {decks.length === 0 ? (
        <Panel className="space-y-2 text-sm">
          <p className="font-medium">No decks yet.</p>
          <p className="text-muted">Pick a commander you own and a theme, and the builder fills the 99 from your collection first.</p>
        </Panel>
      ) : (
        <DeckGrid decks={active} />
      )}
      {retired.length > 0 && (
        <details className="space-y-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-muted">Retired ({retired.length})</summary>
          <DeckGrid decks={retired} />
        </details>
      )}
    </div>
  );
}

function DeckGrid({ decks }: { decks: Awaited<ReturnType<typeof listDecks>> }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {decks.map((d) => (
        <li key={d.id}>
          <Link href={`/decks/${d.id}`} className="flex min-w-0 gap-3 rounded-lg border border-line bg-panel p-3 hover:border-accent">
            <div className="relative aspect-[488/680] w-16 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton">
              {d.commanders[0]?.imageSmall && <Image src={d.commanders[0].imageSmall} alt="" fill sizes="64px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium">{d.name}</p>
              <p className="flex items-center gap-2 text-xs text-muted">
                <ColorPips identity={d.colorIdentity} />
                {STATUS_LABEL[d.status]}
                {d.theme ? ` · ${themeLabel(d.theme)}` : ""}
              </p>
              <Progress value={d.progress.placed} max={d.progress.of} label={`${d.name} progress`} />
              <p className="text-xs text-muted">
                {d.progress.placed}/{d.progress.of} in hand{d.toAcquire ? ` · ${d.toAcquire} to get` : ""}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
