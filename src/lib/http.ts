import { gunzipSync, gzipSync } from "node:zlib";

/**
 * A file download. With `gzip`, the body is gzipped and sent as that file type (a ".gz" name):
 * Vercel refuses function responses over 4.5 MB, a big collection's backup passes that as plain
 * JSON, and Next.js drops a Content-Encoding header, so the compression has to be the file itself.
 */
export function downloadResponse(body: string, contentType: string, fileName: string, opts: { gzip?: boolean } = {}): Response {
  const headers: Record<string, string> = {
    "Content-Type": opts.gzip ? "application/gzip" : contentType,
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  };
  return new Response(opts.gzip ? new Uint8Array(gzipSync(body)) : body, { headers });
}

/** The text of an uploaded file, gzipped or not (recognised by gzip's magic bytes). */
export async function uploadedText(req: Request): Promise<string> {
  const buf = Buffer.from(await req.arrayBuffer());
  const gz = buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? gunzipSync(buf) : buf).toString("utf8");
}
