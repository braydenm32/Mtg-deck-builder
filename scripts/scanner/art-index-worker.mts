/** Worker for build-art-index.mts: card thumbnails in, art network features out. */
import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import sharp from "sharp";
import { ArtNet } from "../../src/scanner/artnet";
import { artInput, THUMB_HEIGHT, THUMB_WIDTH } from "../../src/scanner/artindex";

const net = new ArtNet(fs.readFileSync(workerData.netPath as string));

parentPort!.on("message", async (job: { files: string[] }) => {
  const out: (Float32Array | null)[] = [];
  for (const file of job.files) {
    try {
      const { data, info } = await sharp(file).resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const card = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
      out.push(net.embed(artInput(card, net.width, net.height).data));
    } catch {
      out.push(null);
    }
  }
  parentPort!.postMessage(out);
});
