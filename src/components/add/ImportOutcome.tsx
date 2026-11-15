"use client";

import { useEffect, useState } from "react";
import type { ImportSummary } from "@/lib/collection/import";
import { plural } from "./text";

/** The parts of the import's own result (from importCollection) that the review page can't read back from the batch. */
export type StoredOutcome = Pick<ImportSummary, "copies" | "diff" | "skipped">;

const key = (batchId: number) => `import-outcome:${batchId}`;

/** Called by the import form right after a successful import. Browser storage only: it's a convenience, never the record. */
export function rememberOutcome(batchId: number, s: StoredOutcome) {
  try {
    sessionStorage.setItem(key(batchId), JSON.stringify({ copies: s.copies, diff: s.diff, skipped: s.skipped }));
  } catch {
    // Private mode or blocked storage: the review page just won't show this line.
  }
}

/**
 * "What changed" on the review page, straight from the import's result. Only on the device that ran
 * the import, in the same session: the batch row doesn't keep these numbers (see the build report).
 */
export function ImportOutcome({ batchId }: { batchId: number }) {
  const [o, setO] = useState<StoredOutcome | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key(batchId));
      if (raw) setO(JSON.parse(raw) as StoredOutcome);
    } catch {
      // Nothing to show.
    }
  }, [batchId]);
  if (!o) return null;
  const d = o.diff;
  return (
    <p className="text-sm tabular-nums">
      <span className="text-muted">This import: </span>
      {d ? (
        <>
          {d.added} new · {d.changed} changed · <span className={d.removed > 0 ? "text-warn" : ""}>{d.removed} gone</span> · {d.unchanged} the same
          <span className="text-muted">
            {" "}
            · copies {d.copiesBefore.toLocaleString("en-AU")} → {d.copiesAfter.toLocaleString("en-AU")}
          </span>
        </>
      ) : (
        `added ${plural(o.copies, "copy", "copies")}`
      )}
      {o.skipped > 0 && <span className="text-muted"> · {plural(o.skipped, "row", "rows")} skipped</span>}
    </p>
  );
}
