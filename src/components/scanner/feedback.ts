/**
 * A sound and a buzz for each scan, so you can keep feeding cards without looking at the screen:
 * one short high note when a card is saved, two lower notes when one needs you to check it.
 * Web Audio tones (no sound files to download); the buzz is the phone's vibration where the
 * browser has it (not iPhones). The audio has to be unlocked by a tap first: `unlockSound` is called
 * when you start the camera or pick photos.
 */

let ctx: AudioContext | undefined;

export function unlockSound() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // No Web Audio: the buzz still works.
  }
}

function tone(at: number, freq: number, ms: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // A soft attack and release, so it's a chime rather than a click.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.02);
}

export type Cue = "added" | "check";

export function cue(kind: Cue) {
  try {
    if (ctx && ctx.state === "running") {
      const t = ctx.currentTime;
      if (kind === "added") tone(t, 1320, 110);
      else {
        tone(t, 520, 120);
        tone(t + 0.17, 440, 160);
      }
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(kind === "added" ? 40 : [70, 60, 70]);
  } catch {
    // Feedback is a nicety; never let it break a scan.
  }
}
