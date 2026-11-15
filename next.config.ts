import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@libsql/client", "libsql"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
};

export default nextConfig;
