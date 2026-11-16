"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { showDeckToast } from "@/components/deck/DeckRowActions";

type Box = { location: string; copies: number; url: string };
type NdefWriter = { write: (msg: { records: { recordType: string; data: string }[] }) => Promise<void> };

/**
 * A box or binder's link, for a label or an NFC tag: tap the tag with your phone (or type the link)
 * and the collection opens on what's inside. Writing tags needs a phone browser with Web NFC
 * (Chrome on Android); elsewhere, copy the link into any NFC app, or print the labels.
 */
export function BoxLabels({ boxes }: { boxes: Box[] }) {
  const [nfc, setNfc] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [writing, setWriting] = useState<string>();
  useEffect(() => {
    setNfc("NDEFReader" in window);
    setHost(document.body);
  }, []);

  async function write(b: Box) {
    const Reader = (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader;
    setWriting(b.location);
    showDeckToast({ message: `Hold an NFC tag to the back of your phone to write ${b.location}…` });
    try {
      await new Reader().write({ records: [{ recordType: "url", data: b.url }] });
      showDeckToast({ message: `Written. Tapping that tag now opens ${b.location}.` });
    } catch (e) {
      showDeckToast({ message: (e as Error).name === "NotAllowedError" ? "The phone didn’t allow NFC. Allow it and try again." : "That tag couldn’t be written. Try again, or another tag.", error: true });
    } finally {
      setWriting(undefined);
    }
  }

  async function copy(b: Box) {
    const ok = await navigator.clipboard?.writeText(b.url).then(
      () => true,
      () => false,
    );
    showDeckToast(ok ? { message: `Copied the link to ${b.location}` } : { message: "Couldn’t copy the link.", error: true });
  }

  const css = `
@media screen { .label-print { display: none; } }
@media print {
  @page { margin: 10mm; }
  body > *:not(.label-print) { display: none !important; }
  body { background: #fff !important; }
  .label-print { display: grid; grid-template-columns: repeat(2, 90mm); grid-auto-rows: 50mm; gap: 4mm; justify-content: center; }
  .label { border: 0.3mm dashed #888; padding: 5mm; display: flex; flex-direction: column; justify-content: space-between; color: #000; break-inside: avoid; font-family: system-ui, sans-serif; }
  .label b { font-size: 18pt; line-height: 1.15; }
  .label small { font-size: 8pt; color: #333; word-break: break-all; }
}`;

  return (
    <>
      <style>{css}</style>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => window.print()} className="h-12 rounded-xl bg-accent px-5 text-base font-semibold text-accent-fg">
          Print labels
        </button>
        <span className="text-sm text-muted">Two to a row, 90 × 50 mm, with the box&rsquo;s name and link.</span>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {boxes.map((b) => (
          <li key={b.location} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{b.location}</span>
              <span className="block truncate text-[13px] text-muted">{b.url}</span>
            </span>
            {nfc && (
              <button
                type="button"
                disabled={!!writing}
                onClick={() => void write(b)}
                className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-background disabled:opacity-50"
              >
                {writing === b.location ? "Writing…" : "Write NFC tag"}
              </button>
            )}
            <button type="button" onClick={() => void copy(b)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted hover:text-foreground">
              Copy link
            </button>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[13px] text-muted">
        {nfc
          ? "Write NFC tags here: tap Write, then hold a blank tag to the back of the phone."
          : "This browser can't write NFC tags (Chrome on Android can). On an iPhone, copy a link into an NFC app such as NFC Tools, then tapping the tag opens that box here."}
      </p>
      {host &&
        createPortal(
          <div className="label-print" aria-hidden>
            {boxes.map((b) => (
              <div key={b.location} className="label">
                <b>{b.location}</b>
                <span>{b.copies.toLocaleString("en-AU")} cards</span>
                <small>{b.url}</small>
              </div>
            ))}
          </div>,
          host,
        )}
    </>
  );
}
