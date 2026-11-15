import type { Metadata } from "next";
import { Scanner } from "@/components/scanner/Scanner";

export const metadata: Metadata = { title: "Scan cards · MTG Deck Builder" };

export default function ScanPage() {
  return (
    <div className="space-y-3">
      <h1 className="sr-only">Scan cards</h1>
      <Scanner />
    </div>
  );
}
