import { OverviewSkeleton } from "@/components/deck/DeckSkeletons";

/**
 * Shows while a deck's layout (src/app/decks/[id]/layout.tsx) loads, when you open a deck. Every other
 * page under /decks has its own loading.tsx, so this boundary never shows for them. Give any new page
 * here its own, or it will show a deck's skeleton.
 */
export default function Loading() {
  return <OverviewSkeleton />;
}
