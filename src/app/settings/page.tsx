import { getDb } from "@/db/client";
import { passwordConfigured } from "@/lib/auth";
import { SettingsForm } from "@/components/SettingsForm";
import { ThemeChoice } from "@/components/ThemeChoice";
import { TwoStepSignIn } from "@/components/TwoStepSignIn";
import { YourData } from "@/components/YourData";
import { formatDate } from "@/lib/format";
import { audRate, getSettings } from "@/lib/settings";
import { currentTheme } from "@/lib/theme";
import { totpConfigured } from "@/lib/totp";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await getDb();
  const [settings, rate, theme] = await Promise.all([getSettings(db), audRate(db), currentTheme()]);
  // The top bar says "Settings", so the page is just the form: prices, this device's theme, then your data.
  return (
    <div className="max-w-xl space-y-3">
      <SettingsForm initial={settings} rate={{ audPerUsd: rate.rate, date: rate.date ? formatDate(rate.date) : null }} />
      <ThemeChoice initial={theme} />
      <YourData />
      {passwordConfigured() && <TwoStepSignIn on={totpConfigured()} />}
      {passwordConfigured() && <SignOut />}
    </div>
  );
}

/** Lock this device again; the password opens it. A plain form, so it works without JavaScript. */
function SignOut() {
  return (
    <form action="/api/auth/signout" method="post" className="overflow-hidden rounded-2xl border border-line bg-panel">
      <button type="submit" className="flex min-h-14 w-full items-center justify-between gap-4 p-4 text-left hover:bg-(--panel-2)">
        <span className="min-w-0">
          <span className="block font-medium">Sign out on this device</span>
          <span className="block text-[13px] text-muted">The app asks for your password next time it opens here.</span>
        </span>
      </button>
    </form>
  );
}
