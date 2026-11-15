"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function UndoImportButton({ batchId, label }: { batchId: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/import/${batchId}/undo`, { method: "POST" });
          setBusy(false);
          if (!res.ok) return setError((await res.json()).error ?? "Couldn't undo.");
          router.refresh();
        }}
      >
        {busy ? "Undoing…" : `Undo this import`}
      </Button>
      <p className="text-xs text-muted">Puts your {label} cards back exactly as they were before. Other cards aren&apos;t touched.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
