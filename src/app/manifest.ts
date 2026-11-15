import type { MetadataRoute } from "next";

/** Lets Brayden add Commandery to his phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Commandery",
    short_name: "Commandery",
    description: "Build Commander decks from the cards you own.",
    start_url: "/?look=new",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0c1b",
    theme_color: "#0f0c1b",
    icons: [
      { src: "/icons/commandery.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/commandery-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/commandery-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/commandery-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
