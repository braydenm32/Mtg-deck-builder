import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createPackage, packageSchema } from "@/lib/deck/packages";

export const runtime = "nodejs";

/** POST /api/packages { name, notes?, oracleIds? }: make a card package. */
export async function POST(req: Request) {
  const parsed = packageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the package a name." }, { status: 400 });
  return NextResponse.json(await createPackage(await getDb(), parsed.data));
}
