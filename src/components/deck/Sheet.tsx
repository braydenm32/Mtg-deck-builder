"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * A themed sheet for choices: it slides up from the bottom on a phone and opens as a small dialog on a
 * laptop. It reuses the shell's sheet styles (.sheet in globals.css) and renders in a portal, so a
 * parent's backdrop blur can't trap it. Esc and the scrim close it, and focus goes back to the button
 * that opened it.
 */
export function Sheet({ title, sub, onClose, children }: { title: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => opener?.focus?.();
  }, []);
  return createPortal(
    <>
      <div className="sheet-scrim transition-opacity duration-200 starting:opacity-0" onClick={onClose} />
      <div
        ref={box}
        className="sheet transition-[translate,opacity] duration-200 ease-out max-[899px]:starting:translate-y-full min-[900px]:starting:opacity-0"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="mx-auto mt-1 h-1 w-10 rounded-full bg-line min-[900px]:hidden" aria-hidden />
        <div className="px-3 pb-2 pt-3">
          <div className="truncate text-[17px] font-semibold">{title}</div>
          {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
        </div>
        {children}
        <button type="button" className="sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
    </>,
    document.body,
  );
}
