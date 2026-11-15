"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastMessage = { id: number; text: string; tone: "ok" | "danger" };

/** A short "Saved" or "Couldn't save" note that every save shows, then fades after a few seconds. */
export function useToast(ms = 4000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback(
    (text: string, tone: ToastMessage["tone"] = "ok") => {
      clearTimeout(timer.current);
      setToast({ id: Date.now(), text, tone });
      timer.current = setTimeout(() => setToast(null), ms);
    },
    [ms],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show };
}

/**
 * Sits above the phone's bottom bar (new look) or at the bottom corner on a laptop. The live region
 * is always there, so screen readers hear each message.
 */
export function Toast({ toast }: { toast: ToastMessage | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[45] flex justify-center min-[900px]:inset-x-auto min-[900px]:right-8 min-[900px]:bottom-8 [.app-shell_&]:max-[899px]:bottom-[calc(84px+env(safe-area-inset-bottom,0px))]"
    >
      {toast && (
        <p
          key={toast.id}
          className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl transition-[translate,opacity] duration-200 starting:translate-y-2 starting:opacity-0 ${
            toast.tone === "ok" ? "border-ok/30 bg-panel text-foreground" : "border-danger/40 bg-panel text-danger"
          }`}
        >
          <span aria-hidden="true" className={toast.tone === "ok" ? "text-ok" : "text-danger"}>
            {toast.tone === "ok" ? "✓" : "!"}
          </span>
          <span>{toast.text}</span>
        </p>
      )}
    </div>
  );
}
