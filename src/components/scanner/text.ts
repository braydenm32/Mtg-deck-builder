/** Wording for the Scan page. Presentation only: nothing here decides what gets saved. */
import { type Finish, type FinishSetting, type Printing, printingLabel, type ReviewItem, type ScanSettings, type ScanTarget } from "./types";

export const FINISH_LABEL: Record<Finish, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };

/** The finish setting, including Auto (the camera looks for foil). */
export const FINISH_SETTING_LABEL: Record<FinishSetting, string> = { ...FINISH_LABEL, auto: "Auto" };

/** The hint on the camera while waiting to see whether a card is foil. */
export const TILT_HINT = "Tilt the card a little so the light moves across it";

export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;

/** Why the camera can't run, as the page explains it. */
export type CameraProblem = "insecure" | "unsupported" | "denied" | "missing" | "busy" | "stopped" | "error";

/** "NM · Binder 3", or "NM · no place set", then where cards go when it isn't just the collection. The finish has its own control. */
export function settingsSummary(s: Pick<ScanSettings, "condition" | "location">, target: ScanTarget = { kind: "collection" }): string {
  if (target.kind === "wants") return "To the want list";
  const place = s.location.trim();
  return `${s.condition} · ${place || "no place set"}${target.kind === "deck" ? ` · into ${target.name}` : ""}`;
}

/** What Undo and Remove say happened. */
export function removedText(name: string, into?: { kind: "deck"; deck: string } | { kind: "wants" }): string {
  if (into?.kind === "wants") return `Removed ${name}. It's off the want list again.`;
  if (into?.kind === "deck") return `Removed ${name} from your collection and ${into.deck}.`;
  return `Removed ${name}. It's out of your collection again.`;
}

/** "Roaming Throne · LCI #258 · foil", with the language when it isn't English ("· JA"). */
export function entryLabel(p: Printing, finish: Finish, lang?: string): string {
  return `${p.name} · ${printingLabel(p)}${lang && lang !== "en" ? ` · ${lang.toUpperCase()}` : ""}${finish !== "nonfoil" ? ` · ${FINISH_LABEL[finish].toLowerCase()}` : ""}`;
}

/** The card was identified, but its title didn't read as English and no language was printed: ask. */
export function languageUnknown(scan: ReviewItem["scan"]): boolean {
  return scan.status !== "not-found" && !!scan.best && !scan.lang;
}

/** The question the review sheet asks, in the scanner's own terms (status and name score). */
export function reviewQuestion(item: Pick<ReviewItem, "scan" | "replaces" | "askFinish">): string {
  if (item.replaces) return "Fix this card";
  if (item.askFinish) return "Is it foil?";
  const { scan } = item;
  if (scan.status === "not-found") return "Couldn't read this card";
  if (languageUnknown(scan)) return "Which language is it?";
  if (!scan.name || scan.name.score < 0.8) return "Is this the card?";
  return "Which printing is it?";
}

/** One line under the question: what was read, and what to do. */
export function reviewHint(item: Pick<ReviewItem, "scan" | "replaces" | "askFinish" | "pile">): string {
  if (item.replaces) return "Pick the printing and finish you have. The old one comes out of your collection.";
  const where = item.pile ? `Card ${item.pile} in the tower. ` : "";
  if (item.askFinish) return `${where}The camera couldn't tell if it's foil. Pick its finish.`;
  return where + reviewHintFor(item);
}

function reviewHintFor(item: Pick<ReviewItem, "scan">): string {
  const { scan } = item;
  if (scan.status === "not-found") return "Type its name and pick the printing.";
  if (languageUnknown(scan)) return "Found by its number and picture. Its title isn't in English: pick the language.";
  if (!scan.name || scan.name.score < 0.8) return "The name was hard to read. Check it, or search for the right card.";
  return "Tap the printing that matches your card.";
}

export function cameraHelp(problem: CameraProblem): { title: string; body: string; retry: boolean } {
  switch (problem) {
    case "insecure":
      return {
        title: "The camera needs a secure address",
        body: "Browsers only open the camera on https:// pages. Open the app from its https address, or scan photos instead: they're read the same way.",
        retry: false,
      };
    case "unsupported":
      return {
        title: "This browser can't open the camera",
        body: "Try Safari or Chrome, or scan photos instead: they're read the same way.",
        retry: false,
      };
    case "denied":
      return {
        title: "Camera access is off",
        body: "Allow the camera for this site in your browser's site settings, then try again. Or scan photos instead: they're read the same way.",
        retry: true,
      };
    case "missing":
      return { title: "No camera found", body: "This device has no camera the browser can use. Scan photos instead.", retry: true };
    case "busy":
      return { title: "The camera is busy", body: "Another app may be using it. Close that app and try again, or scan photos instead.", retry: true };
    case "stopped":
      return { title: "The camera stopped", body: "Your scanned cards are safe. Start it again, or scan photos instead.", retry: true };
    default:
      return { title: "The camera didn't start", body: "Try again, or scan photos instead.", retry: true };
  }
}
