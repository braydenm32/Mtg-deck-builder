import type { Metadata, Viewport } from "next";
import { Inter, Nunito, Nunito_Sans, Sora } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { THEME_COLOR, currentTheme } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-sora", display: "swap", preload: false });
// Kitchen Table's type. Not preloaded, so only a device using that theme downloads it.
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito-sans", display: "swap", preload: false });

const description = "Build Commander decks from the cards you own.";

export const metadata: Metadata = {
  title: "MTG Deck Tutor",
  description,
  applicationName: "MTG Deck Tutor",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/tutor.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Deck Tutor", statusBarStyle: "black-translucent" },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  if (theme === "kitchen") return { themeColor: THEME_COLOR.kitchen, viewportFit: "cover", colorScheme: "light" };
  if (theme === "auto") {
    return {
      themeColor: [
        { media: "(prefers-color-scheme: light)", color: THEME_COLOR.kitchen },
        { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.commandery },
      ],
      viewportFit: "cover",
      colorScheme: "light dark",
    };
  }
  return { themeColor: THEME_COLOR.commandery, viewportFit: "cover", colorScheme: "dark" };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // data-theme picks the palette in globals.css: commandery, kitchen, or auto (follows light or dark mode).
  return (
    <html lang="en" data-theme={await currentTheme()} className={`${inter.variable} ${sora.variable} ${nunito.variable} ${nunitoSans.variable}`}>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
