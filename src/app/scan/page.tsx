import type { Metadata } from "next";
import { Scanner } from "@/components/scanner/Scanner";
import { currentLook } from "@/lib/look";

export const metadata: Metadata = { title: "Scan cards · MTG Deck Tutor" };

export default async function ScanPage() {
  const look = await currentLook();
  return (
    <div className="space-y-3">
      {/* The new look's top bar already says "Add cards", with this page as the "Scan" tab. */}
      <h1 className="sr-only old-look-only">Scan cards</h1>
      <Scanner look={look} />
    </div>
  );
}
