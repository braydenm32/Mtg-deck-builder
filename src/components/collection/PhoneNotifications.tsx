"use client";

import { useEffect, useState } from "react";

type State = "checking" | "unsupported" | "install" | "blocked" | "off" | "on";

/** The browser wants the key as bytes. */
function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/**
 * Turn price-alert notifications on or off for this phone (src/lib/push.ts). On an iPhone they
 * only work in the app added to the Home Screen, so it says so there.
 */
export function PhoneNotifications() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !standalone() ? "install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote(undefined);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const { publicKey } = (await (await fetch("/api/push")).json()) as { publicKey: string | null };
      if (!publicKey) throw new Error("no key");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
    } catch {
      setNote("Notifications couldn’t be turned on. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote(undefined);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNote(undefined);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { reached?: number };
      setNote(j.reached ? "Sent. It should show in a few seconds." : "It didn’t reach this phone. Turn notifications off and on again.");
    } finally {
      setBusy(false);
    }
  }

  const BTN = "inline-flex min-h-11 items-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-background disabled:opacity-50";
  const text: Record<State, string> = {
    checking: "Checking this phone…",
    unsupported: "This browser can’t show notifications. Alerts still show on Today.",
    install: "On an iPhone, notifications work in the app on your Home Screen. Tap Share, then Add to Home Screen, and open it from there.",
    blocked: "Notifications are blocked for this app. Allow them in your phone’s settings, then come back.",
    off: "Get a notification on this phone when an alert goes off. They show on Today either way.",
    on: "This phone gets a notification when an alert goes off.",
  };

  return (
    <section className="space-y-2 rounded-2xl border border-line bg-panel p-4" aria-labelledby="notify-h">
      <h2 id="notify-h" className="font-semibold">
        Notifications
      </h2>
      <p className="text-sm text-muted">{text[state]}</p>
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap gap-2">
          {state === "off" ? (
            <button type="button" className={BTN} disabled={busy} onClick={turnOn}>
              Turn on for this phone
            </button>
          ) : (
            <>
              <button type="button" className={BTN} disabled={busy} onClick={test}>
                Send a test
              </button>
              <button type="button" className={BTN} disabled={busy} onClick={turnOff}>
                Turn off
              </button>
            </>
          )}
        </div>
      )}
      {note && (
        <p className="text-sm text-muted" aria-live="polite">
          {note}
        </p>
      )}
    </section>
  );
}
