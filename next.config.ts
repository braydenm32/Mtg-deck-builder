import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@libsql/client", "libsql"],
  images: {
    // Scryfall already serves sized JPGs from a CDN; load them directly rather than re-processing.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
};

export default nextConfig;
