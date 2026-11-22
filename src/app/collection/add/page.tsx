import { AddCardForm } from "@/components/AddCardForm";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="max-w-5xl space-y-4">
      <AddCardForm initialQuery={q ?? ""} />
    </div>
  );
}
