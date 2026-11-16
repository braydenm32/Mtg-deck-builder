import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { meta } from "@/db/schema";
import { notifyPhones } from "@/lib/push";

export const runtime = "nodejs";

/** POST /api/push/test -> { reached }: a test notification to every subscribed phone. */
export async function POST() {
  const db = await getDb();
  const value = new Date().toISOString();
  await db.insert(meta).values({ key: "push:test", value }).onConflictDoUpdate({ target: meta.key, set: { value } });
  return NextResponse.json({ reached: await notifyPhones(db) });
}
