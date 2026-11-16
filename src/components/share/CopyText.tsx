"use client";

import { useState } from "react";

/** A button that copies text and says so for a moment. */
export function CopyText({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState<"ok" | "fail">();
  async function copy() {
    const ok = await navigator.clipboard?.writeText(text).then(
      () => true,
      () => false,
    );
    setDone(ok ? "ok" : "fail");
    setTimeout(() => setDone(undefined), 2000);
  }
  return (
    <button type="button" onClick={() => void copy()} className={className} aria-live="polite">
      {done === "ok" ? "Copied" : done === "fail" ? "Couldn’t copy" : label}
    </button>
  );
}
