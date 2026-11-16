import type { MetadataRoute } from "next";

/** Lets Brayden add MTG Deck Tutor to the phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MTG Deck Tutor",
    short_name: "Deck Tutor",
    description: "Build Commander decks from the cards you own.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0c1b",
    theme_color: "#0f0c1b",
    icons: [
      { src: "/icons/tutor.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/tutor-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/tutor-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/tutor-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
