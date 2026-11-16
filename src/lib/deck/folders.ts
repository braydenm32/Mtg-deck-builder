/**
 * My decks' folders and pins: decks can be filed in a folder (one each) and pinned. Picking a folder
 * shows only its decks; pinned decks lead, and otherwise the order stays as it was (last changed first).
 */

export type Fileable = { folder: string | null; pinned: boolean };

/** The folders in use with how many decks each holds, A to Z. */
export function folderCounts(decks: readonly Fileable[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of decks) if (d.folder) counts.set(d.folder, (counts.get(d.folder) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The decks to show for a folder (all of them when none is picked or it's gone), pinned first. */
export function arrangeDecks<T extends Fileable>(decks: readonly T[], folder?: string): T[] {
  const inFolder = folder && decks.some((d) => d.folder === folder) ? decks.filter((d) => d.folder === folder) : [...decks];
  return [...inFolder.filter((d) => d.pinned), ...inFolder.filter((d) => !d.pinned)];
}
