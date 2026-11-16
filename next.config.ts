import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@libsql/client", "libsql", "tesseract.js", "sharp"],
  // Files read at runtime by path rather than imported, which Vercel's bundler can't see on its own:
  // the database migrations (src/db/client.ts) and the OCR engine's English data (src/scanner/server.ts).
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
    "/api/scan": ["./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*", "./node_modules/tesseract.js/src/worker-script/**/*", "./node_modules/tesseract.js-core/**/*"],
  },
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  images: {
    // Scryfall already serves sized JPGs from a CDN; load them directly rather than re-processing.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
};

export default nextConfig;
