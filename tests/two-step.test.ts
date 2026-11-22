import { afterEach, describe, expect, it, vi } from "vitest";
import { newSession, validSession } from "@/lib/auth";
import { base32Decode, base32Encode, newTotpSecret, otpauthUrl, totpCode, totpStep } from "@/lib/totp";
import { POST } from "@/app/unlock/route";

// RFC 6238's SHA-1 test key, "12345678901234567890", in base32.
const RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

afterEach(() => vi.unstubAllEnvs());

describe("authenticator codes", () => {
  it("match the standard's test values", async () => {
    expect(await totpCode(RFC, Math.floor(59 / 30))).toBe("287082");
    expect(await totpCode(RFC, Math.floor(1111111109 / 30))).toBe("081804");
    expect(await totpCode(RFC, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("accept a code half a minute either way, and nothing else", async () => {
    const now = 1111111109_000;
    expect(await totpStep(RFC, "081 804", now)).toBe(Math.floor(1111111109 / 30));
    expect(await totpStep(RFC, "081804", now + 30_000)).not.toBeNull();
    expect(await totpStep(RFC, "081804", now + 90_000)).toBeNull();
    expect(await totpStep(RFC, "12345", now)).toBeNull();
  });

  it("make and read keys", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(otpauthUrl(s)).toBe(`otpauth://totp/MTG%20Deck%20Tutor?secret=${s}&issuer=MTG%20Deck%20Tutor&algorithm=SHA1&digits=6&period=30`);
  });
});

describe("unlocking with two-step sign-in", () => {
  const unlock = (fields: Record<string, string>) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return POST(new Request("http://localhost/unlock", { method: "POST", body }));
  };

  it("signs devices out when it's turned on", async () => {
    vi.stubEnv("APP_PASSWORD", "pw");
    const before = await newSession();
    vi.stubEnv("TOTP_SECRET", RFC);
    expect(await validSession(before)).toBe(false);
    expect(await validSession(await newSession())).toBe(true);
  });

  it("needs the password and a fresh code, each code once", async () => {
    vi.stubEnv("APP_PASSWORD", "pw");
    vi.stubEnv("TOTP_SECRET", RFC);
    const code = await totpCode(RFC, Math.floor(Date.now() / 30_000));
    const noCode = await unlock({ password: "pw" });
    expect(noCode.headers.get("location")).toContain("/unlock?e=1");
    const ok = await unlock({ password: "pw", code });
    expect(ok.headers.get("location")).toBe("http://localhost/");
    expect(ok.headers.get("set-cookie")).toContain("tutor_session=");
    const again = await unlock({ password: "pw", code });
    expect(again.headers.get("location")).toContain("/unlock?e=1");
  }, 10_000);
});
