/** Dates are rendered on the server, so pin the time zone (Brayden is in Sydney). Override with APP_TIMEZONE. */
const TZ = process.env.APP_TIMEZONE ?? "Australia/Sydney";

export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-AU", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-AU", { timeZone: TZ, dateStyle: "medium" });
}

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-AU", { timeZone: TZ, timeStyle: "short" });
}
