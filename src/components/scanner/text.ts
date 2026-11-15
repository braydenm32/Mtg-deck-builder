/** Wording for the Scan page. Presentation only: nothing here decides what gets saved. */
import { type Finish, type Printing, printingLabel, type ReviewItem, type ScanSettings } from "./types";

export const FINISH_LABEL: Record<Finish, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };

export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;

/** Why the camera can't run, as the page explains it. */
export type CameraProblem = "insecure" | "unsupported" | "denied" | "missing" | "busy" | "stopped" | "error";

/** "NM · Binder 3", or "NM · no place set". The finish has its own control. */
export function settingsSummary(s: Pick<ScanSettings, "condition" | "location">): string {
  const place = s.location.trim();
  return `${s.condition} · ${place || "no place set"}`;
}

/** "Roaming Throne · LCI #258 · foil". */
export function entryLabel(p: Printing, finish: Finish): string {
  return `${p.name} · ${printingLabel(p)}${finish !== "nonfoil" ? ` · ${FINISH_LABEL[finish].toLowerCase()}` : ""}`;
}

/** The question the review sheet asks, in the scanner's own terms (status and name score). */
export function reviewQuestion(item: Pick<ReviewItem, "scan" | "replaces">): string {
  if (item.replaces) return "Fix this card";
  const { scan } = item;
  if (scan.status === "not-found") return "Couldn't read this card";
  if (!scan.name || scan.name.score < 0.8) return "Is this the card?";
  return "Which printing is it?";
}

/** One line under the question: what was read, and what to do. */
export function reviewHint(item: Pick<ReviewItem, "scan" | "replaces">): string {
  if (item.replaces) return "Pick the printing and finish you have. The old one comes out of your collection.";
  const { scan } = item;
  if (scan.status === "not-found") return "Type its name and pick the printing.";
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
