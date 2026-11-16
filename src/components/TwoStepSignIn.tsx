"use client";

import { useEffect, useState } from "react";
import { CopyText } from "@/components/share/CopyText";
import { newTotpSecret, otpauthUrl, totpStep } from "@/lib/totp";

const KEY = "totp-setup";
const BTN = "inline-flex min-h-11 items-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-background";

/**
 * Settings › Two-step sign-in. When it's on, says how to turn it off. When it's off, makes a secret
 * for your authenticator app, checks a code from it here on the device (nothing is sent), then says
 * how to add the secret to the app's environment (TOTP_SECRET, src/lib/totp.ts). The secret waits
 * in this browser until then, so a reload doesn't lose it.
 */
export function TwoStepSignIn({ on }: { on: boolean }) {
  const [secret, setSecret] = useState<string>();
  const [code, setCode] = useState("");
  const [check, setCheck] = useState<"ok" | "wrong">();

  useEffect(() => {
    if (on) {
      try {
        window.localStorage.removeItem(KEY);
      } catch {
        // No storage: nothing to clear.
      }
      return;
    }
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved) setSecret(saved);
    } catch {
      // No storage: a reload starts again.
    }
  }, [on]);

  function start() {
    const s = newTotpSecret();
    setSecret(s);
    setCheck(undefined);
    setCode("");
    try {
      window.localStorage.setItem(KEY, s);
    } catch {
      // Ignore: see above.
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setCheck((await totpStep(secret, code)) != null ? "ok" : "wrong");
  }

  const grouped = secret?.match(/.{1,4}/g)?.join(" ");

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="two-step-h">
      <h2 id="two-step-h" className="font-semibold">
        Two-step sign-in
      </h2>
      {on ? (
        <p className="text-sm text-muted">
          On. A device unlocking the app asks for your password and a code from your authenticator app. To turn it off (if you lose your phone, say), delete TOTP_SECRET in
          Vercel&rsquo;s Environment Variables and redeploy.
        </p>
      ) : !secret ? (
        <>
          <p className="text-sm text-muted">Off. Turn it on and the app asks for a code from your phone as well as the password, so the password alone can&rsquo;t open it.</p>
          <button type="button" className={BTN} onClick={start}>
            Set it up
          </button>
        </>
      ) : (
        <ol className="space-y-4 text-sm">
          <li className="space-y-2">
            <p className="font-medium">1. Add it to your authenticator app</p>
            <p className="text-muted">On this phone, open the link. Or, in the app, add an account by setup key and type this key.</p>
            <p className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-[15px] break-all select-all">{grouped}</p>
            <div className="flex flex-wrap gap-2">
              <a href={otpauthUrl(secret)} className={BTN}>
                Open in authenticator app
              </a>
              <CopyText text={secret} label="Copy the key" className={BTN} />
            </div>
          </li>
          <li className="space-y-2">
            <p className="font-medium">2. Type the code it shows</p>
            <form onSubmit={verify} className="flex flex-wrap items-center gap-2">
              <input
                className="h-12 w-36 rounded-xl border border-line bg-background px-3 text-base tabular-nums md:h-11 md:text-sm"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                placeholder="123 456"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCheck(undefined);
                }}
                aria-label="Code from your authenticator app"
              />
              <button type="submit" className={BTN}>
                Check
              </button>
            </form>
            {check === "wrong" && <p className="text-danger">That code isn&rsquo;t right. Check the key, and that your phone&rsquo;s clock is set automatically.</p>}
            {check === "ok" && <p className="text-ok">That&rsquo;s right.</p>}
          </li>
          {check === "ok" && (
            <li className="space-y-2">
              <p className="font-medium">3. Turn it on in Vercel</p>
              <p className="text-muted">
                In Vercel, open this project&rsquo;s Settings › Environment Variables, add <span className="font-mono text-foreground">TOTP_SECRET</span> with the key as its value, then
                redeploy. Every device then asks for your password and a code once.
              </p>
              <CopyText text={secret} label="Copy the key" className={BTN} />
            </li>
          )}
          <li>
            <button type="button" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground" onClick={start}>
              Start again with a new key
            </button>
          </li>
        </ol>
      )}
    </section>
  );
}
