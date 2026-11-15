import type { Metadata } from "next";
import { Scanner } from "@/components/scanner/Scanner";
import { currentLook } from "@/lib/look";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await currentLook()) === "new" ? "Scan cards · Commandery" : "Scan cards · MTG Deck Builder" };
}

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
