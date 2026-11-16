/**
 * Builds the picture index the scanner recognises cards with
 * (scanner-data/art-index.bin, see src/scanner/artindex.ts).
 *
 *   NODE_USE_ENV_PROXY=1 npm run scan:index -- [--dims=128] [--threads=4]
 *
 * 1. Downloads Scryfall's small image of every printing in the local card
 *    database (data/mtg.db; run the card sync first) to data/art-thumbs/.
 *    Only new ones: run it again after a new set and it fetches just those.
 * 2. Runs each through the art network (scanner-data/art-net.bin), in worker
 *    threads. Results are kept in data/art-features.bin, so a rebuild only
 *    embeds new printings.
 * 3. Centres, whitens and shrinks the features to `dims` numbers (principal
 *    components), stores each as int8 and writes the index.
 *
 * About 25 minutes from scratch on 4 cores (1.7 GB of thumbnails), a minute
 * after a new set. Scryfall's image host has no rate limit, but asks for a
 * User-Agent.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createClient } from "@libsql/client";
import { ArtNet } from "../../src/scanner/artnet";
import { encodeArtIndex, uuidBytes } from "../../src/scanner/artindex";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const DIMS = Number(args.dims ?? 128);
const THREADS = Number(args.threads ?? Math.max(1, os.cpus().length));
const DB_URL = args.db ?? "file:data/mtg.db";
const THUMBS = path.join("data", "art-thumbs");
const FEATURES = args.features ?? path.join("data", "art-features.bin");
const NET = path.join("scanner-data", "art-net.bin");
const OUT = args.out ?? path.join("scanner-data", "art-index.bin");
const UA = "mtg-deck-builder/0.1 (personal collection app)";

const net = new ArtNet(fs.readFileSync(NET));
const F = net.size;
const netName = `mobilenetv3-small-${net.width}x${net.height}`;

// ---------------------------------------------------------------- printings
const db = createClient({ url: DB_URL });
const rows = (await db.execute("select id, image_small from printings where image_small is not null order by id")).rows
  .map((r) => ({ id: String(r.id), url: String(r.image_small) }))
  .slice(0, args.limit ? Number(args.limit) : undefined);
console.log(`${rows.length} printings with a picture`);

// ---------------------------------------------------------------- thumbnails
fs.mkdirSync(THUMBS, { recursive: true });
const thumb = (id: string) => path.join(THUMBS, `${id}.jpg`);
const missing = rows.filter((r) => !fs.existsSync(thumb(r.id)));
if (missing.length) {
  console.log(`downloading ${missing.length} thumbnails`);
  let next = 0;
  let failed = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 24 }, async () => {
      while (next < missing.length) {
        const r = missing[next++];
        let ok = false;
        for (let attempt = 0; attempt < 4 && !ok; attempt++) {
          try {
            const res = await fetch(r.url, { headers: { "User-Agent": UA, Accept: "image/*" } });
            if (res.ok) {
              fs.writeFileSync(thumb(r.id), Buffer.from(await res.arrayBuffer()));
              ok = true;
            }
          } catch {
            // retry
          }
          if (!ok) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
        if (!ok) failed++;
        if (next % 5000 === 0) console.log(`  ${next}/${missing.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
      }
    }),
  );
  if (failed) console.log(`  ${failed} couldn't be downloaded (left out)`);
}

// ---------------------------------------------------------------- features (cached)
/** Cache file: JSON header line { net, features }, then records of 16-byte id + float32 features. */
const cache = new Map<string, Float32Array>();
if (fs.existsSync(FEATURES)) {
  const buf = fs.readFileSync(FEATURES);
  const nl = buf.indexOf(10);
  const head = JSON.parse(buf.subarray(0, nl).toString());
  if (head.net === netName && head.features === F) {
    const rec = 16 + F * 4;
    for (let at = nl + 1; at + rec <= buf.length; at += rec) {
      const id = [...buf.subarray(at, at + 16)].map((b) => b.toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
      const f = new Float32Array(F);
      new Uint8Array(f.buffer).set(buf.subarray(at + 16, at + rec));
      cache.set(id, f);
    }
  }
  console.log(`${cache.size} printings already embedded`);
}
const todo = rows.filter((r) => !cache.has(r.id) && fs.existsSync(thumb(r.id)));
if (todo.length) {
  console.log(`embedding ${todo.length} printings on ${THREADS} threads`);
  const t0 = Date.now();
  let next = 0;
  let done = 0;
  const BATCH = 64;
  await Promise.all(
    Array.from({ length: THREADS }, async () => {
      const w = new Worker(new URL("./art-index-worker.mts", import.meta.url), { workerData: { netPath: NET }, execArgv: ["--import", "tsx"] });
      try {
        while (next < todo.length) {
          const batch = todo.slice(next, next + BATCH);
          next += BATCH;
          const out = await new Promise<(Float32Array | null)[]>((resolve, reject) => {
            w.once("message", resolve);
            w.once("error", reject);
            w.postMessage({ files: batch.map((r) => thumb(r.id)) });
          });
          batch.forEach((r, i) => out[i] && cache.set(r.id, out[i]!));
          done += batch.length;
          if (Math.floor(done / 5000) !== Math.floor((done - batch.length) / 5000)) {
            const s = (Date.now() - t0) / 1000;
            console.log(`  ${done}/${todo.length} (${Math.round(s)} s, ~${Math.round((s / done) * (todo.length - done))} s left)`);
          }
        }
      } finally {
        await w.terminate();
      }
    }),
  );
  const head = Buffer.from(JSON.stringify({ net: netName, features: F }) + "\n");
  const recs: Buffer[] = [head];
  for (const [id, f] of cache) recs.push(Buffer.from(uuidBytes(id)), Buffer.from(f.buffer, f.byteOffset, f.byteLength));
  fs.writeFileSync(FEATURES, Buffer.concat(recs));
}

// ---------------------------------------------------------------- whitening
const included = rows.filter((r) => cache.has(r.id));
const N = included.length;
const prep = (f: Float32Array) => Float64Array.from(f, (v) => Math.sqrt(Math.max(v, 0)));
const mean = new Float64Array(F);
for (const r of included) {
  const v = prep(cache.get(r.id)!);
  for (let i = 0; i < F; i++) mean[i] += v[i] / N;
}
// Covariance from an even sample (plenty for 576 numbers).
const step = Math.max(1, Math.floor(N / 30000));
const cov = new Float64Array(F * F);
let samples = 0;
for (let k = 0; k < N; k += step) {
  const v = prep(cache.get(included[k].id)!);
  for (let i = 0; i < F; i++) v[i] -= mean[i];
  for (let i = 0; i < F; i++) {
    const vi = v[i];
    const row = i * F;
    for (let j = i; j < F; j++) cov[row + j] += vi * v[j];
  }
  samples++;
}
for (let i = 0; i < F; i++)
  for (let j = i; j < F; j++) {
    cov[i * F + j] /= samples;
    cov[j * F + i] = cov[i * F + j];
  }
console.log("principal components…");
const { values, vectors } = jacobiEigen(cov, F);
const order = [...values.keys()].sort((a, b) => values[b] - values[a]).slice(0, DIMS);
const projection = new Float32Array(F * DIMS);
order.forEach((e, d) => {
  const s = 1 / Math.sqrt(Math.max(values[e], 1e-9));
  for (let i = 0; i < F; i++) projection[i * DIMS + d] = vectors[i * F + e] * s;
});
const mean32 = Float32Array.from(mean);

// ---------------------------------------------------------------- vectors
const vecs = new Float32Array(N * DIMS);
included.forEach((r, k) => {
  const v = prep(cache.get(r.id)!);
  const out = vecs.subarray(k * DIMS, (k + 1) * DIMS);
  for (let i = 0; i < F; i++) {
    const c = v[i] - mean[i];
    for (let d = 0; d < DIMS; d++) out[d] += c * projection[i * DIMS + d];
  }
  let n = 0;
  for (let d = 0; d < DIMS; d++) n += out[d] * out[d];
  n = Math.sqrt(n) || 1;
  for (let d = 0; d < DIMS; d++) out[d] /= n;
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodeArtIndex({ net: netName, mean: mean32, projection, ids: included.map((r) => r.id), vectors: vecs }));
console.log(`wrote ${OUT}: ${N} printings, ${DIMS} numbers each, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);

/** Eigen-decomposition of a symmetric n x n matrix (cyclic Jacobi). Vectors are columns of `vectors`. */
function jacobiEigen(m: Float64Array, n: number): { values: number[]; vectors: Float64Array } {
  const a = Float64Array.from(m);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-15) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: Array.from({ length: n }, (_, i) => a[i * n + i]), vectors: v };
}
