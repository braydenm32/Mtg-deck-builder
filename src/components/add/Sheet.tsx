"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A sheet for a choice: it slides up from the bottom on a phone and opens as a small dialog on a
 * laptop (900 px and up, like the shell). Esc, the scrim and Close all dismiss it, and focus goes
 * back to whatever opened it.
 *
 * It mounts inside `.app-shell`, so the theme's gradient and type apply.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => setHost(document.querySelector(".app-shell") ?? document.body), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first control, or the sheet itself, once it's on screen.
    const t = requestAnimationFrame(() => {
      const p = panel.current;
      const first = p?.querySelector<HTMLElement>("[data-autofocus]") ?? p?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
      (first ?? p)?.focus();
    });
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open || !host) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        className="fixed inset-x-0 bottom-0 z-[51] max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line bg-panel px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom,0px))] shadow-2xl outline-none transition-[translate,opacity] duration-200 ease-out starting:translate-y-full min-[900px]:inset-x-0 min-[900px]:top-[10vh] min-[900px]:bottom-auto min-[900px]:mx-auto min-[900px]:w-[min(480px,92vw)] min-[900px]:rounded-2xl min-[900px]:border min-[900px]:p-5 min-[900px]:starting:translate-y-3 min-[900px]:starting:opacity-0"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line min-[900px]:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center gap-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="-mr-2 inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </>,
    host,
  );
}
