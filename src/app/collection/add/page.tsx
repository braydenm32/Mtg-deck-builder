import { AddCardForm } from "@/components/AddCardForm";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Add cards</h1>
      <p className="text-sm text-muted">Search for a card, pick the printing you have, and add it.</p>
      <AddCardForm initialQuery={q ?? ""} />
    </div>
  );
}
