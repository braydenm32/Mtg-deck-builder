"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PriceRefresh } from "@/lib/prices/daily";

/** "Check prices now": today's prices for the cards you own, without waiting for tomorrow's check. */
export function PriceCheck() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "partway" | "running" | "failed">("idle");

  async function run() {
    setState("busy");
    const res = await fetch("/api/prices", { method: "POST" }).catch(() => undefined);
    const body = res?.ok ? ((await res.json()) as PriceRefresh) : undefined;
    if (!body) return setState("failed");
    if (!body.started) return setState("running");
    setState(body.done ? "idle" : "partway");
    router.refresh();
  }

  const note = {
    idle: null,
    busy: "Checking prices…",
    partway: "Checked part of your collection. The rest carries on next visit, or tap again.",
    running: "Prices are being checked already. Look again in a minute.",
    failed: "Couldn’t reach Scryfall. Try again later.",
  }[state];

  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "busy"}
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent disabled:opacity-60"
      >
        Check prices now
      </button>
      {note && (
        <span className="text-[13px] text-muted" role="status">
          {note}
        </span>
      )}
    </div>
  );
}
