"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui";
import type { AverageCard, AverageCompare as Data } from "@/lib/deck/average";
import { showDeckToast } from "./DeckRowActions";

/** Where you'd get the card: a free copy, one in another deck, or none. */
function ownership(c: AverageCard) {
  if (c.free > 0) return <Badge tone="ok">Free in your collection</Badge>;
  if (c.owned > 0) return <Badge tone="accent">In another deck</Badge>;
  return null;
}

/**
 * The deck beside EDHREC's average deck for its commander: the type counts side by side, what the
 * typical list plays that yours doesn't (free copies first, each one tap from your Maybe list), and
 * the picks that are yours alone. Looked up when asked.
 */
export function AverageCompare({ deckId }: { deckId: number }) {
  const router = useRouter();
  const [data, setData] = useState<Data>();
  const [state, setState] = useState<"idle" | "looking" | "failed">("idle");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string>();
  const [all, setAll] = useState(false);

  async function look() {
    setState("looking");
    const res = await fetch(`/api/decks/${deckId}/average`).catch(() => undefined);
    if (!res?.ok) return setState("failed");
    setData((await res.json()) as Data);
    setState("idle");
  }

  async function addToMaybe(c: AverageCard) {
    if (!c.oracleId) return;
    setBusy(c.oracleId);
    const res = await fetch(`/api/decks/${deckId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oracleId: c.oracleId, board: "maybe" }),
    }).catch(() => undefined);
    setBusy(undefined);
    if (!res?.ok) return showDeckToast({ message: "That didn’t save. Try again.", error: true });
    setAdded((s) => new Set(s).add(c.oracleId!));
    showDeckToast({ message: `Added ${c.name} to Maybe` });
    router.refresh();
  }

  const shown = data?.ok ? (all ? data.missing : data.missing.slice(0, 12)) : [];

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="average-h">
      <h2 id="average-h" className="text-lg font-semibold">
        Compare with EDHREC&rsquo;s average deck
      </h2>
      {!data && (
        <>
          <p className="text-sm text-muted">What the typical list for this commander plays that yours doesn&rsquo;t, and the other way round, with its salt score and similar commanders.</p>
          {state === "failed" && <p className="text-sm text-danger">Couldn’t look just now. Check the connection and try again.</p>}
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-background disabled:opacity-50"
            onClick={() => void look()}
            disabled={state === "looking"}
          >
            {state === "looking" ? "Asking EDHREC…" : "Compare"}
          </button>
        </>
      )}
      {data && !data.ok && (
        <p className="text-sm text-muted">
          {data.reason === "edhrec-off" ? "EDHREC is switched off for this app." : "EDHREC has no average deck for this commander yet."}
        </p>
      )}
      {data?.ok && (
        <div className="space-y-4">
          <p className="text-sm">
            You share <span className="font-semibold tabular-nums">{data.shared}</span> of the average deck&rsquo;s{" "}
            <span className="tabular-nums">{data.averageCards}</span> cards (basic lands aside).
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Type</th>
                <th className="py-1 text-right font-normal">Yours</th>
                <th className="py-1 text-right font-normal">Average</th>
              </tr>
            </thead>
            <tbody>
              {data.types.map((t) => (
                <tr key={t.type} className="border-t border-line">
                  <td className="py-1.5">{t.type === "Land" ? "Lands" : `${t.type}s`.replace("Sorcerys", "Sorceries")}</td>
                  <td className="text-right tabular-nums">{t.yours}</td>
                  <td className={`text-right tabular-nums ${Math.abs(t.yours - t.average) >= 4 ? "font-semibold" : "text-muted"}`}>{t.average}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.missing.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">
                In the average deck, not yours <span className="font-normal text-muted tabular-nums">{data.missing.length}</span>
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {shown.map((c) => (
                  <li key={c.name} className="flex min-h-14 items-center gap-3 py-2 pr-1 pl-3">
                    <span className="relative h-[42px] w-[30px] shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                      {c.imageSmall && <Image src={c.imageSmall} alt="" fill sizes="30px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{c.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {c.type}
                        {ownership(c)}
                      </span>
                    </span>
                    {c.oracleId &&
                      (added.has(c.oracleId) ? (
                        <span className="shrink-0 px-3 text-sm text-muted">In Maybe</span>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-accent hover:bg-background disabled:opacity-50"
                          disabled={busy !== undefined}
                          onClick={() => void addToMaybe(c)}
                        >
                          {busy === c.oracleId ? "Adding…" : "Maybe"}
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
              {data.missing.length > shown.length && (
                <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent" onClick={() => setAll(true)}>
                  Show all {data.missing.length}
                </button>
              )}
            </div>
          )}
          {data.extra.length > 0 && (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                <span>
                  Yours alone <span className="font-normal text-muted tabular-nums">{data.extra.length}</span>
                </span>
                <span className="text-sm font-normal text-accent group-open:hidden">Show</span>
              </summary>
              <p className="text-sm text-muted">{data.extra.join(", ")}</p>
            </details>
          )}
          {data.salt !== null && (
            <p className="text-sm">
              <span className="font-semibold">Salt score {data.salt.toFixed(2)}</span>
              <span className="text-muted">
                {" "}
                of 4: how much EDHREC&rsquo;s players dislike facing {data.commander}. {data.salt >= 2 ? "Worth a word at Rule 0." : data.salt >= 1 ? "About usual." : "Few mind it."}
              </span>
            </p>
          )}
          {data.similar.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">Similar commanders</h3>
              <ul className="flex flex-wrap gap-2">
                {data.similar.map((c) => (
                  <li key={c.name}>
                    {c.oracleId ? (
                      <Link
                        href={`/decks/new?commander=${c.oracleId}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line py-1 pr-3 pl-1.5 text-sm hover:bg-background"
                      >
                        <span className="relative h-[34px] w-[24px] shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                          {c.imageSmall && <Image src={c.imageSmall} alt="" fill sizes="24px" className="object-cover" />}
                        </span>
                        {c.name}
                        {c.owned && <Badge tone="ok">Yours</Badge>}
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm text-muted">{c.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">From EDHREC&rsquo;s average deck for {data.commander}, refreshed weekly. A similar commander starts a new deck. &ldquo;Maybe&rdquo; puts a card on your Maybe list to think about.</p>
        </div>
      )}
    </section>
  );
}
