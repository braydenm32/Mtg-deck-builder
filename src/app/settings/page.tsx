import { getDb } from "@/db/client";
import { SettingsForm } from "@/components/SettingsForm";
import { formatDate } from "@/lib/format";
import { currentLook } from "@/lib/look";
import { audRate, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await getDb();
  const [settings, rate, look] = await Promise.all([getSettings(db), audRate(db), currentLook()]);
  if (look === "new") {
    // The top bar says "Settings", so the page is just the form.
    return <SettingsForm look="new" initial={settings} rate={{ audPerUsd: rate.rate, date: rate.date ? formatDate(rate.date) : null }} />;
  }
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm initial={settings} rate={{ audPerUsd: rate.rate, date: rate.date }} />
    </div>
  );
}
