import Link from "next/link";
import { PrintButton, ProxySheet } from "@/components/deck/ProxySheet";
import { PROXY_WHICH, proxyCards, type ProxyWhich } from "@/lib/deck/proxies";
import { loadDeck } from "../data";

const LABEL: Record<ProxyWhich, string> = { marked: "Marked to proxy", missing: "All you don't own", all: "Whole deck" };

const chip = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-accent bg-panel font-medium" : "border-line hover:bg-background"}`;

/**
 * A deck's proxy sheet: the cards you marked to proxy (or everything you don't own, or the whole
 * deck), nine to a page at real card size, to print or save as a PDF. ?which= and ?paper= pick.
 */
export default async function DeckProxies({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ which?: string; paper?: string }> }) {
  const v = await loadDeck((await params).id);
  const sp = await searchParams;
  const which = (PROXY_WHICH as readonly string[]).includes(sp.which ?? "") ? (sp.which as ProxyWhich) : "marked";
  const paper = sp.paper === "letter" ? "letter" : "a4";
  const rows = [...v.commanderSlots, ...v.cards];
  const list = proxyCards(rows, which);
  const href = (w: ProxyWhich, p: string) => `/decks/${v.deck.id}/proxies?which=${w}${p === "letter" ? "&paper=letter" : ""}`;
  const pages = Math.ceil(list.length / 9);

  return (
    <div className="max-w-2xl space-y-3">
      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold">Proxy sheet</h2>
        <p className="text-sm text-muted">
          Nine cards to a page at real card size (63 × 88 mm). Print at 100% (&ldquo;actual size&rdquo;), cut on the lines, and sleeve each in front of a basic land. Your own cards print as text.
        </p>
        <nav aria-label="Which cards" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {PROXY_WHICH.map((w) => (
            <Link key={w} href={href(w, paper)} className={chip(which === w)} aria-current={which === w ? "page" : undefined} scroll={false}>
              {LABEL[w]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Paper" className="flex gap-2">
          {(["a4", "letter"] as const).map((p) => (
            <Link key={p} href={href(which, p)} className={chip(paper === p)} aria-current={paper === p ? "page" : undefined} scroll={false}>
              {p === "a4" ? "A4" : "US Letter"}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <PrintButton disabled={!list.length} />
          <span className="text-sm text-muted tabular-nums">
            {list.length} {list.length === 1 ? "card" : "cards"}
            {pages > 0 && `, ${pages} ${pages === 1 ? "page" : "pages"}`}
          </span>
        </div>
      </section>
      {list.length === 0 ? (
        <p className="px-1 text-sm text-muted">
          {which === "marked"
            ? "No cards are marked to proxy. Mark a card you don’t own from its ⋯ menu, or pick “All you don’t own”."
            : "Nothing to print: you own every card in this deck."}
        </p>
      ) : (
        <ProxySheet cards={list} paper={paper} />
      )}
    </div>
  );
}
