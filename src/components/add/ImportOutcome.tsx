import type { ImportResult } from "@/lib/collection/import";
import { plural } from "./text";

/**
 * "What this import did", from the result the import stored with its batch. Imports made before
 * results were kept have none, so the line is left out.
 */
export function ImportOutcome({ result }: { result: ImportResult | null }) {
  if (!result) return null;
  const d = result.diff;
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
        `added ${plural(result.copies, "copy", "copies")}`
      )}
      {result.guessed > 0 && <span className="text-muted"> · {plural(result.guessed, "printing", "printings")} guessed from the name</span>}
      {result.skipped > 0 && <span className="text-muted"> · {plural(result.skipped, "row", "rows")} skipped</span>}
    </p>
  );
}
