"use client";

import Image from "next/image";
import { useEffect, useReducer, useState } from "react";
import { boardReducer, commanderTax, deal, findCard, type Board, type BoardAction, type BoardCard, type BoardDeckCard, type Zone } from "@/lib/deck/board";
import { Sheet } from "./Sheet";

/**
 * The playtest board: deal the deck and play it out alone. Tap a card for what you can do with it
 * (play it, tap it, counters, send it somewhere); the bar at the top runs the turn. Kept in this
 * browser, so a reload or a locked phone doesn't lose the game; a changed deck deals afresh.
 */

const KEY = (deckId: number) => `play-board.${deckId}`;
const BTN = "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-background disabled:opacity-40";
const panel = "min-w-0 rounded-2xl border border-line bg-panel";

type Token = { id: string; name: string; imageNormal: string | null; imageSmall: string | null };
type State = { board?: Board };
type Act = BoardAction | { type: "set"; board: Board };

function reduce(s: State, a: Act): State {
  if (a.type === "set") return { board: a.board };
  return s.board ? { board: boardReducer(s.board, a) } : s;
}

export function PlayBoard({ deckId, deckKey, cards, commanders }: { deckId: number; deckKey: string; cards: BoardDeckCard[]; commanders: { name: string; image: string | null }[] }) {
  const [{ board }, dispatch] = useReducer(reduce, {});
  const [open, setOpen] = useState<string>();
  const [more, setMore] = useState(false);
  const [tokens, setTokens] = useState<Token[]>();
  const [tokenName, setTokenName] = useState("");
  const [roll, setRoll] = useState<string>();

  const newGame = () => dispatch({ type: "set", board: deal(deckKey, cards, commanders, (Date.now() % 1_000_000) + 1) });

  // A game in progress comes back (read after the first render, so it matches the server's).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY(deckId));
      const saved = raw ? (JSON.parse(raw) as Board) : undefined;
      if (saved?.key === deckKey && saved.zones) return dispatch({ type: "set", board: saved });
    } catch {
      // No storage: deal afresh.
    }
    newGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, deckKey]);
  useEffect(() => {
    if (!board) return;
    try {
      window.localStorage.setItem(KEY(deckId), JSON.stringify(board));
    } catch {
      // Ignore: see above.
    }
  }, [board, deckId]);

  async function loadTokens() {
    if (tokens) return;
    const res = await fetch(`/api/decks/${deckId}/tokens`).catch(() => undefined);
    setTokens(res?.ok ? ((await res.json()) as { tokens: Token[] }).tokens : []);
  }

  if (!board) return <p className={`${panel} p-4 text-sm text-muted`}>Shuffling…</p>;
  const z = board.zones;
  const picked = open ? findCard(board, open) : undefined;
  const lands = z.battlefield.filter((c) => c.land);
  const others = z.battlefield.filter((c) => !c.land);
  const untappedLands = lands.filter((c) => !c.tapped).length;
  const act = (a: BoardAction) => dispatch(a);

  return (
    <div className="min-w-0 space-y-3">
      {/* The turn bar: where you are, and the turn's moves. */}
      <section className={`${panel} space-y-3 p-3`} aria-label="Turn">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0">
            <span className="font-[family-name:var(--font-sora)] text-xl font-bold">Turn {board.turn}</span>
            <span className="block text-[13px] text-muted tabular-nums">
              {z.library.length} in library · {z.hand.length} in hand · {untappedLands} of {lands.length} lands untapped
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-1" aria-label={`Life ${board.life}`}>
            <button type="button" className={BTN} onClick={() => act({ type: "life", by: -1 })} aria-label="Lose 1 life">
              −
            </button>
            <span className="w-12 text-center font-[family-name:var(--font-sora)] text-xl font-bold tabular-nums" aria-live="polite">
              {board.life}
            </span>
            <button type="button" className={BTN} onClick={() => act({ type: "life", by: 1 })} aria-label="Gain 1 life">
              +
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg" onClick={() => act({ type: "next-turn" })}>
            Next turn
          </button>
          <button type="button" className={BTN} onClick={() => act({ type: "draw" })} disabled={!z.library.length}>
            Draw
          </button>
          {board.turn === 1 && (
            <button type="button" className={BTN} onClick={() => act({ type: "mulligan" })}>
              Mulligan
            </button>
          )}
          <button type="button" className={BTN} onClick={() => setMore(true)}>
            More
          </button>
        </div>
        {board.log[0] && (
          <p className="text-[13px] text-muted" aria-live="polite">
            {board.log[0]}
          </p>
        )}
      </section>

      {z.command.length > 0 && (
        <Pile title="Command zone" cards={z.command} onOpen={setOpen} note={(c) => (commanderTax(board, c.name) ? `Tax +${commanderTax(board, c.name)}` : undefined)} />
      )}

      <section className={`${panel} space-y-3 p-3`} aria-labelledby="bf-h">
        <h2 id="bf-h" className="font-semibold">
          Battlefield
        </h2>
        {z.battlefield.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. Tap a card in your hand to play it.</p>
        ) : (
          <>
            {others.length > 0 && <Grid cards={others} onOpen={setOpen} />}
            {lands.length > 0 && <Grid cards={lands} onOpen={setOpen} small />}
          </>
        )}
      </section>

      <section className={`${panel} space-y-2 p-3`} aria-labelledby="hand-h">
        <h2 id="hand-h" className="font-semibold">
          Hand <span className="font-normal text-muted">({z.hand.length})</span>
        </h2>
        {z.hand.length === 0 ? (
          <p className="text-sm text-muted">Empty.</p>
        ) : (
          <ul className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {z.hand.map((c) => (
              <li key={c.uid} className="w-[27%] shrink-0 min-[600px]:w-28">
                <CardButton card={c} onOpen={setOpen} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Pile title="Graveyard" cards={z.graveyard} onOpen={setOpen} collapsed />
      <Pile title="Exile" cards={z.exile} onOpen={setOpen} collapsed />

      {picked && (
        <Sheet title={picked.card.name} sub={zoneLine(picked.zone, picked.card, board)} onClose={() => setOpen(undefined)}>
          <CardActions zone={picked.zone} card={picked.card} act={(a) => act(a)} close={() => setOpen(undefined)} />
        </Sheet>
      )}

      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="space-y-3 px-3 pb-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN} onClick={() => act({ type: "untap-all" })}>
                Untap all
              </button>
              <button type="button" className={BTN} onClick={() => act({ type: "shuffle" })}>
                Shuffle library
              </button>
              <button type="button" className={BTN} onClick={() => act({ type: "draw", count: 7 })}>
                Draw seven
              </button>
              <button type="button" className={BTN} onClick={() => act({ type: "life", by: -5 })}>
                Lose 5 life
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Dice</p>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  ["Flip a coin", () => (Math.random() < 0.5 ? "Heads" : "Tails")],
                  ["Roll a d6", () => `d6: ${1 + Math.floor(Math.random() * 6)}`],
                  ["Roll a d20", () => `d20: ${1 + Math.floor(Math.random() * 20)}`],
                ].map(([label, f]) => (
                  <button
                    key={label as string}
                    type="button"
                    className={BTN}
                    onClick={() => {
                      const r = (f as () => string)();
                      setRoll(r);
                      act({ type: "note", text: `${label}: ${r}` });
                    }}
                  >
                    {label as string}
                  </button>
                ))}
                {roll && (
                  <span className="font-[family-name:var(--font-sora)] text-lg font-bold" aria-live="polite">
                    {roll}
                  </span>
                )}
              </div>
            </div>
            <details className="space-y-2" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void loadTokens()}>
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold">Make a token</summary>
              {tokens === undefined ? (
                <p className="text-sm text-muted">Finding this deck&rsquo;s tokens…</p>
              ) : (
                tokens.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tokens.map((t) => (
                      <button key={t.id} type="button" className={BTN} onClick={() => act({ type: "token", name: t.name, image: t.imageSmall ?? t.imageNormal })}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!tokenName.trim()) return;
                  act({ type: "token", name: tokenName.trim(), image: null });
                  setTokenName("");
                }}
              >
                <input
                  className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-background px-3 text-base md:h-11 md:text-sm"
                  placeholder="Another token, e.g. 1/1 Soldier"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  aria-label="Token name"
                />
                <button type="submit" className={BTN}>
                  Make
                </button>
              </form>
            </details>
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm font-medium text-danger"
              onClick={() => {
                newGame();
                setMore(false);
                setRoll(undefined);
              }}
            >
              Start a new game
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function zoneLine(zone: Zone, card: BoardCard, board: Board): string {
  const where: Record<Zone, string> = { library: "In the library", hand: "In your hand", battlefield: card.tapped ? "On the battlefield, tapped" : "On the battlefield", graveyard: "In the graveyard", exile: "In exile", command: "In the command zone" };
  const bits = [where[zone]];
  if (card.token) bits.push("token");
  if (card.counters) bits.push(`${card.counters > 0 ? "+" : ""}${card.counters} counters`);
  if (card.commander && commanderTax(board, card.name)) bits.push(`tax +${commanderTax(board, card.name)}`);
  return bits.join(" · ");
}

/** What you can do with a card where it is. */
function CardActions({ zone, card, act, close }: { zone: Zone; card: BoardCard; act: (a: BoardAction) => void; close: () => void }) {
  const go = (to: Zone, bottom?: boolean) => {
    act({ type: "move", uid: card.uid, to, bottom });
    close();
  };
  const item = (label: string, onClick: () => void, main = false) => (
    <button key={label} type="button" className={`sheet-link ${main ? "font-semibold text-accent" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
  const list: React.ReactNode[] = [];
  if (zone === "battlefield") {
    list.push(
      item(card.tapped ? "Untap" : "Tap", () => {
        act({ type: "tap", uid: card.uid });
        close();
      }, true),
    );
    list.push(
      <div key="counters" className="flex items-center justify-between gap-2 px-3 py-1">
        <span className="text-sm">Counters{card.counters ? `: ${card.counters > 0 ? "+" : ""}${card.counters}` : ""}</span>
        <span className="flex gap-1">
          <button type="button" className={BTN} onClick={() => act({ type: "counter", uid: card.uid, by: -1 })} aria-label="Take a counter off">
            −1
          </button>
          <button type="button" className={BTN} onClick={() => act({ type: "counter", uid: card.uid, by: 1 })} aria-label="Put a counter on">
            +1
          </button>
        </span>
      </div>,
    );
    list.push(
      item("Make a token copy", () => {
        act({ type: "copy", uid: card.uid });
        close();
      }),
    );
  } else {
    list.push(item(zone === "command" ? "Cast it" : card.land ? "Play it" : zone === "hand" ? "Cast it" : "Put it onto the battlefield", () => go("battlefield"), true));
  }
  if (zone !== "hand") list.push(item("To your hand", () => go("hand")));
  if (card.commander && zone !== "command") list.push(item("To the command zone", () => go("command")));
  if (zone !== "graveyard") list.push(item(card.token ? "It dies (token goes away)" : "To the graveyard", () => go("graveyard")));
  if (zone !== "exile") list.push(item("Exile it", () => go("exile")));
  if (!card.token && !card.commander) {
    list.push(item("On top of the library", () => go("library")));
    list.push(item("On the bottom of the library", () => go("library", true)));
  }
  return <div className="pb-1">{list}</div>;
}

function CardFace({ card }: { card: BoardCard }) {
  return (
    <span className="relative block aspect-[488/680] w-full overflow-hidden rounded-[4.5%] bg-skeleton">
      {card.image ? (
        <Image src={card.image} alt="" fill sizes="(max-width: 600px) 30vw, 120px" className="object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center border border-line p-1 text-center text-[11px] leading-tight font-medium">{card.name}</span>
      )}
      {card.counters ? (
        <span className="absolute right-1 bottom-1 rounded-full bg-accent px-1.5 text-xs font-bold text-accent-fg tabular-nums">
          {card.counters > 0 ? "+" : ""}
          {card.counters}
        </span>
      ) : null}
      {card.token && <span className="absolute top-1 left-1 rounded bg-background/85 px-1 text-[10px] font-semibold">Token</span>}
    </span>
  );
}

function CardButton({ card, onOpen, note }: { card: BoardCard; onOpen: (uid: string) => void; note?: string }) {
  return (
    <button type="button" className="block w-full text-left" onClick={() => onOpen(card.uid)} aria-label={`${card.name}${card.tapped ? ", tapped" : ""}${note ? `, ${note}` : ""}`}>
      <span className={`block transition-transform duration-150 ${card.tapped ? "rotate-90 scale-[0.72] opacity-80" : ""}`}>
        <CardFace card={card} />
      </span>
      {note && <span className="mt-1 block text-center text-xs font-semibold text-accent">{note}</span>}
    </button>
  );
}

function Grid({ cards, onOpen, small }: { cards: BoardCard[]; onOpen: (uid: string) => void; small?: boolean }) {
  return (
    <ul className={`grid gap-2 ${small ? "grid-cols-5 min-[600px]:grid-cols-8" : "grid-cols-4 min-[600px]:grid-cols-6"}`}>
      {cards.map((c) => (
        <li key={c.uid}>
          <CardButton card={c} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

function Pile({ title, cards, onOpen, collapsed, note }: { title: string; cards: BoardCard[]; onOpen: (uid: string) => void; collapsed?: boolean; note?: (c: BoardCard) => string | undefined }) {
  const body =
    cards.length === 0 ? (
      <p className="text-sm text-muted">Empty.</p>
    ) : (
      <ul className="grid grid-cols-4 gap-2 min-[600px]:grid-cols-6">
        {cards.map((c) => (
          <li key={c.uid}>
            <CardButton card={c} onOpen={onOpen} note={note?.(c)} />
          </li>
        ))}
      </ul>
    );
  if (!collapsed)
    return (
      <section className={`${panel} space-y-2 p-3`} aria-label={title}>
        <h2 className="font-semibold">{title}</h2>
        {body}
      </section>
    );
  return (
    <details className={`group ${panel}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3">
        <h2 className="font-semibold">
          {title} <span className="font-normal text-muted">({cards.length})</span>
        </h2>
        <span className="text-sm text-accent group-open:hidden">Show</span>
      </summary>
      <div className="px-3 pb-3">{body}</div>
    </details>
  );
}

