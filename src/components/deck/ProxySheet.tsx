"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CustomCardFace } from "@/components/cards/CustomCardFace";
import { proxyPages, type ProxyCard } from "@/lib/deck/proxies";

/**
 * The printable sheets: pages of nine cards at 63 × 88 mm, with thin cut lines. On screen it's a
 * preview; "Print or save as PDF" opens the browser's print dialog, where only the pages print (the
 * app around them is hidden), at 100% scale on the paper you chose.
 */
export function ProxySheet({ cards, paper }: { cards: ProxyCard[]; paper: "a4" | "letter" }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  const pages = proxyPages(cards);
  const size = paper === "a4" ? "A4" : "letter";
  const css = `
@media screen { .proxy-print { display: none; } }
@media print {
  @page { size: ${size}; margin: 0; }
  body > *:not(.proxy-print) { display: none !important; }
  body { background: #fff !important; }
  .proxy-print { display: block; }
  .proxy-page { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; break-after: page; }
  .proxy-page:last-child { break-after: auto; }
  .proxy-grid { display: grid; grid-template-columns: repeat(3, 63mm); grid-template-rows: repeat(3, 88mm); width: 189mm; height: 264mm; gap: 0; align-content: start; }
  .proxy-cell { width: 63mm; height: 88mm; outline: 0.1mm dashed #999; overflow: hidden; font-size: 11pt; }
  .proxy-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

  const cell = (c: ProxyCard) =>
    c.imageNormal ? (
      // eslint-disable-next-line @next/next/no-img-element -- printed at a fixed physical size; next/image would resize it
      <img src={c.imageNormal} alt={c.name} />
    ) : (
      <CustomCardFace name={c.name} manaCost={c.manaCost} typeLine={c.custom ? c.typeLine : c.typeLine || "Card"} oracleText={c.oracleText} print />
    );

  return (
    <>
      <style>{css}</style>
      <div className="space-y-3">
        {pages.map((page, i) => (
          <section key={i} aria-label={`Page ${i + 1} of ${pages.length}`} className="rounded-2xl border border-line bg-panel p-3">
            <p className="mb-2 text-xs text-muted">
              Page {i + 1} of {pages.length}
            </p>
            <ul className="grid grid-cols-3 gap-1.5">
              {page.map((c, j) => (
                <li key={j} className="overflow-hidden rounded-[4.5%] bg-skeleton text-[9px]">
                  {c.imageNormal ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a preview of the printed image
                    <img src={c.imageNormal} alt={c.name} loading="lazy" className="aspect-[63/88] w-full object-cover" />
                  ) : (
                    <CustomCardFace name={c.name} manaCost={c.manaCost} typeLine={c.typeLine} oracleText={c.oracleText} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {host &&
        createPortal(
          <div className="proxy-print" aria-hidden>
            {pages.map((page, i) => (
              <div key={i} className="proxy-page">
                <div className="proxy-grid">
                  {page.map((c, j) => (
                    <div key={j} className="proxy-cell">
                      {cell(c)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          host,
        )}
    </>
  );
}

export function PrintButton({ disabled }: { disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => window.print()} className="h-12 rounded-xl bg-accent px-5 text-base font-semibold text-accent-fg disabled:opacity-50">
      Print or save as PDF
    </button>
  );
}
