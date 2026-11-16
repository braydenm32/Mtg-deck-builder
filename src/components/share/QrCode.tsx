import { useMemo } from "react";
import { qrPath } from "@/lib/qr";

/**
 * A QR code for a link. Always black on white whatever the theme: phone cameras read dark modules on
 * a light ground, and an inverted code fails in many of them. Size it with className (e.g. "size-48").
 */
export function QrCode({ text, label, className = "size-48" }: { text: string; label: string; className?: string }) {
  const { size, d } = useMemo(() => qrPath(text), [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={`rounded-lg ${className}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
