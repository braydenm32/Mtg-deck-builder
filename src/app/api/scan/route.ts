import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CANON_HEIGHT, CANON_WIDTH, guideRect } from "@/scanner/geometry";
import { identifyCard, scanFrame, type ScanResult } from "@/scanner/identify";
import { decodeImage, getRecognizerDeps, NoCardDataError } from "@/scanner/server";
import sharp from "sharp";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CANDIDATES = 24;

/**
 * POST /api/scan            body: JPEG/PNG of the flattened card (the camera page sends this)
 * POST /api/scan?kind=photo body: any photo with one card roughly centred (finds the card first)
 *
 * -> ScanResult: status "matched" | "uncertain" | "not-found", the best printing and the
 *    other printings ranked, plus what was read (for the confirm/correct step).
 */
export async function POST(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") ?? "card";
  const body = Buffer.from(await req.arrayBuffer());
  if (!body.length) return NextResponse.json({ error: "Send an image in the request body" }, { status: 400 });
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "Image too large (8 MB max)" }, { status: 413 });

  let result: ScanResult;
  try {
    const db = await getDb();
    const deps = await getRecognizerDeps(db);
    if (kind === "photo") {
      // Shrink big phone photos first; 1600 px tall keeps the collector line legible.
      const resized = await sharp(body).rotate().resize({ height: 1600, width: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
      const frame = await decodeImage(resized);
      result = await scanFrame(frame, deps, guideRect(frame.width, frame.height, 0.92));
    } else {
      const card = await decodeImage(
        await sharp(body).resize(CANON_WIDTH, CANON_HEIGHT, { fit: "fill" }).png().toBuffer(),
      );
      result = await identifyCard(card, deps);
    }
  } catch (e) {
    if (e instanceof NoCardDataError) return NextResponse.json({ error: e.message }, { status: 503 });
    const message = e instanceof Error ? e.message : String(e);
    if (/unsupported image format|Input buffer/i.test(message)) {
      return NextResponse.json({ error: "That file isn't an image we can read" }, { status: 415 });
    }
    console.error("scan failed", e);
    return NextResponse.json({ error: "Scan failed: " + message }, { status: 500 });
  }
  return NextResponse.json({ ...result, candidates: result.candidates.slice(0, MAX_CANDIDATES) });
}
