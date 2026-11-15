import { getDb } from "@/db/client";
import { SettingsForm } from "@/components/SettingsForm";
import { audRate, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await getDb();
  const [settings, rate] = await Promise.all([getSettings(db), audRate(db)]);
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm initial={settings} rate={{ audPerUsd: rate.rate, date: rate.date }} />
    </div>
  );
}
