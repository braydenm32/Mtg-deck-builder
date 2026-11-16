"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColorPips } from "@/components/ui";
import type { BasicSwap, LandOption, ManaBase } from "@/lib/deck/manabase";
import { showDeckToast } from "./DeckRowActions";

const pct = (n: number) => `${Math.round(n * 100)}%`;

const post = (deckId: number, body: unknown) =>
  fetch(`/api/decks/${deckId}/manabase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);

/**
 * Mana base helper, opened from the deck overview: how the basics should split for the colours the
 * deck casts, and the free lands you own that make two of its colours, each one tap from replacing
 * a basic (with Undo).
 */
export function ManaBaseHelper({ deckId }: { deckId: number }) {
  const router = useRouter();
  const [data, setData] = useState<ManaBase>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string>();

  async function load() {
    setFailed(false);
    const res = await fetch(`/api/decks/${deckId}/manabase`).catch(() => undefined);
    if (!res?.ok) return setFailed(true);
    setData((await res.json()) as ManaBase);
  }

  async function swap(o: LandOption) {
    if (!o.cut) return;
    setBusy(o.oracleId);
    const res = await post(deckId, { cutRowId: o.cut.rowId, inOracleId: o.oracleId });
    setBusy(undefined);
    if (!res?.ok) return showDeckToast({ message: "That didn’t save. Try again.", error: true });
    const { swap: done } = (await res.json()) as { swap: BasicSwap };
    showDeckToast({
      message: `Swapped a ${o.cut.name} for ${o.name}`,
      undo: async () => {
        const r = await post(deckId, { undo: done });
        if (r?.ok) void load();
        return r ?? false;
      },
    });
    router.refresh();
    void load();
  }

  const changes = data?.colours.filter((c) => c.basics !== c.suggested) ?? [];

  return (
    <details className="group rounded-2xl border border-line bg-panel" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && !data && void load()}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4">
        <h2 className="text-lg font-semibold">Mana base helper</h2>
        <span className="text-sm text-accent group-open:hidden">Show</span>
      </summary>
      <div className="space-y-4 px-4 pb-4 text-sm">
        {failed ? (
          <p className="text-muted">
            Couldn&rsquo;t work it out just now.{" "}
            <button type="button" className="font-medium text-accent" onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : !data ? (
          <p className="text-muted">Looking at your lands…</p>
        ) : (
          <>
            <p>
              <span className="font-semibold tabular-nums">{data.lands}</span> lands; about <span className="tabular-nums">{data.recommended}</span> suit this curve.
            </p>
            {data.colours.length > 1 && (
              <div className="space-y-2">
                <table className="w-full text-left">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 font-normal">Colour</th>
                      <th className="py-1 font-normal">Pips</th>
                      <th className="py-1 font-normal">Sources</th>
                      <th className="py-1 font-normal">Basics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.colours.map((c) => (
                      <tr key={c.color} className="border-t border-line">
                        <td className="py-2">
                          <ColorPips identity={c.color} />
                        </td>
                        <td className="tabular-nums">{pct(c.pipShare)}</td>
                        <td className="tabular-nums">{c.landSources}</td>
                        <td className="tabular-nums">
                          {c.basics}
                          {c.basics !== c.suggested && <span className="font-semibold"> → {c.suggested}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[13px] text-muted">
                  {changes.length
                    ? `Splitting your basics by the colours you cast: ${changes.map((c) => `${c.suggested} ${c.basicName}`).join(", ")}.`
                    : "Your basics already split by the colours you cast."}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <h3 className="font-semibold">Lands you own that fit</h3>
              {data.identity.length < 2 ? (
                <p className="text-muted">A one-colour deck runs on basics and utility lands, so there&rsquo;s nothing to suggest here.</p>
              ) : data.options.length === 0 ? (
                <p className="text-muted">None of your free lands make two of this deck&rsquo;s colours.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {data.options.map((o) => (
                    <li key={o.oracleId} className="flex min-h-14 items-center gap-3 py-2 pr-1 pl-3">
                      <span className="relative h-[42px] w-[30px] shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                        {o.imageSmall && <Image src={o.imageSmall} alt="" fill sizes="30px" className="object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{o.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          Makes <ColorPips identity={o.makes} />
                          {o.free > 1 ? ` · ${o.free} free` : " · free"}
                        </span>
                      </span>
                      {o.cut && (
                        <button
                          type="button"
                          className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-accent hover:bg-background disabled:opacity-50"
                          disabled={busy !== undefined}
                          onClick={() => void swap(o)}
                        >
                          {busy === o.oracleId ? "Swapping…" : `For a ${o.cut.name}`}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
