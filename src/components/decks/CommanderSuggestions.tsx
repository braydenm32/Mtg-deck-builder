"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, ColorPips, ManaCost } from "@/components/ui";
import { Sheet } from "@/components/deck/Sheet";
import { ChevronIcon, PRIMARY, SECONDARY } from "./bits";
import type { CommanderSuggestion } from "@/lib/deck/suggest";

/**
 * Find a commander's rows. Tapping a commander shows its picture and rules text; the arrow at the
 * end of the row (or Start a deck in that sheet) starts a new deck with it and the theme.
 */
export function CommanderSuggestions({ list, theme }: { list: CommanderSuggestion[]; theme?: string }) {
  const [open, setOpen] = useState<CommanderSuggestion>();
  const startHref = (s: CommanderSuggestion) => `/decks/new?commander=${encodeURIComponent(s.oracleId)}${theme ? `&theme=${encodeURIComponent(theme)}` : ""}`;
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {list.map((s) => (
          <li key={s.oracleId} className="flex min-h-[68px] items-center gap-1 pr-2 hover:bg-background">
            <button
              type="button"
              aria-haspopup="dialog"
              className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left"
              onClick={() => setOpen(s)}
            >
              <span className="sr-only">See the card </span>
              <span className="relative aspect-[488/680] w-10 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton">
                {s.imageSmall && <Image src={s.imageSmall} alt="" fill sizes="40px" className="object-cover" />}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 font-medium leading-snug">{s.name}</span>
                  <ColorPips identity={s.colorIdentity} />
                </span>
                <span className="block text-[13px] leading-snug text-muted">
                  <Badge tone={s.owned ? "ok" : "muted"} className="mr-1.5">
                    {s.owned ? "Owned" : "Not owned"}
                  </Badge>
                  {s.reason}
                </span>
              </span>
            </button>
            <Link
              href={startHref(s)}
              aria-label={`Start a deck with ${s.name}`}
              title="Start a deck with this commander"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line hover:border-accent hover:bg-panel"
            >
              <ChevronIcon className="text-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {open && <CommanderPreview s={open} href={startHref(open)} onClose={() => setOpen(undefined)} />}
    </>
  );
}

/** The commander's picture and rules text, with the button that starts the deck. */
function CommanderPreview({ s, href, onClose }: { s: CommanderSuggestion; href: string; onClose: () => void }) {
  // A two-faced card shows one face at a time; Turn over shows the other.
  const faces = s.faces?.filter((f) => f.imageNormal) ?? [];
  const [face, setFace] = useState(0);
  // The sheet focuses its first button, which would scroll past the picture: start at the top.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, []);
  const image = faces.length > 1 ? faces[face].imageNormal : (s.imageNormal ?? s.imageSmall);
  const text = s.faces?.length ? s.faces : [{ name: s.name, manaCost: s.manaCost ?? undefined, typeLine: s.typeLine, oracleText: s.oracleText }];
  return (
    <Sheet title={s.name} sub={s.owned ? "In your collection" : "Not in your collection: you’d buy or proxy it"} onClose={onClose}>
      <div ref={body} className="max-h-[min(55dvh,520px)] space-y-4 overflow-y-auto px-3 pb-2">
        <div className="mx-auto w-full max-w-[240px] space-y-2">
          <div className="relative aspect-[488/680] w-full overflow-hidden rounded-[4.5%] bg-skeleton shadow-2xl shadow-black/40">
            {image && <Image src={image} alt={faces.length > 1 ? (s.faces?.[face]?.name ?? s.name) : s.name} fill sizes="240px" className="object-cover" />}
          </div>
          {faces.length > 1 && (
            <button type="button" className={`${SECONDARY} w-full`} onClick={() => setFace((f) => (f + 1) % faces.length)}>
              Turn over
            </button>
          )}
        </div>
        <div className="space-y-3 text-sm">
          {text.map((f) => (
            <div key={f.name} className="space-y-1">
              {text.length > 1 && <p className="font-medium">{f.name}</p>}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
                {f.manaCost ? (
                  <span className="rounded-md border border-line px-1.5 leading-5">
                    <ManaCost cost={f.manaCost} />
                  </span>
                ) : null}
                <span>{f.typeLine}</span>
                {f === text[0] && <ColorPips identity={s.colorIdentity} />}
              </p>
              {f.oracleText && <p className="whitespace-pre-line">{f.oracleText}</p>}
            </div>
          ))}
          <p className="text-[13px] text-muted">{s.reason}</p>
        </div>
      </div>
      {/* Kept below the scrolling card, so starting the deck is always one tap away. */}
      <div className="space-y-2 px-3 pt-3">
        <Link href={href} className={`${PRIMARY} min-h-12 w-full`}>
          Start a deck with {s.name.split(" // ")[0]}
        </Link>
        {s.owned && (
          <Link href={`/collection/${encodeURIComponent(s.oracleId)}`} className={`${SECONDARY} w-full`}>
            Open the card page
          </Link>
        )}
      </div>
    </Sheet>
  );
}
