/** The collection export formats (client-safe: the Settings page lists them). See export.ts. */
export const COLLECTION_EXPORT_FORMATS = ["tutor", "moxfield", "manabox"] as const;
export type CollectionExportFormat = (typeof COLLECTION_EXPORT_FORMATS)[number];

export const COLLECTION_EXPORT_LABELS: Record<CollectionExportFormat, { label: string; help: string }> = {
  tutor: { label: "MTG Deck Tutor CSV", help: "Every detail, including boxes and binders. Imports back into this app exactly." },
  moxfield: { label: "Moxfield CSV", help: "For Moxfield’s collection import." },
  manabox: { label: "ManaBox CSV", help: "For ManaBox’s collection import, with binders." },
};

