import { AddCardForm } from "@/components/AddCardForm";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="max-w-5xl space-y-4">
      {/* The new look's top bar already says "Add cards", with this page as the "Type a name" tab. */}
      <div className="old-look-only space-y-1">
        <h1 className="text-2xl font-semibold">Add cards</h1>
        <p className="text-sm text-muted">Search for a card, pick the printing you have, and add it.</p>
      </div>
      <AddCardForm initialQuery={q ?? ""} />
    </div>
  );
}
