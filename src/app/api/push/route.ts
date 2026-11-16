import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { addSubscription, removeSubscription, validEndpoint, vapidKeys } from "@/lib/push";

export const runtime = "nodejs";

const subSchema = z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }).partial().optional() });

/** GET /api/push -> { publicKey }: the key a phone subscribes with (made the first time it's asked for). */
export async function GET() {
  const keys = await vapidKeys(await getDb(), { create: true });
  return NextResponse.json({ publicKey: keys?.publicKey ?? null });
}

/** POST /api/push { endpoint, keys } -> 204: this phone gets notifications. */
export async function POST(req: Request) {
  const parsed = subSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !validEndpoint(parsed.data.endpoint)) return NextResponse.json({ error: "That isn’t a push subscription." }, { status: 400 });
  await addSubscription(await getDb(), parsed.data);
  return new NextResponse(null, { status: 204 });
}

/** DELETE /api/push { endpoint } -> 204: this phone stops getting them. */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Which phone?" }, { status: 400 });
  await removeSubscription(await getDb(), body.endpoint);
  return new NextResponse(null, { status: 204 });
}
