import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { currentLook } from "@/lib/look";
import { NAV } from "@/lib/nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-sora", display: "swap", preload: false });

const description = "Build Commander decks from the cards you own.";

export async function generateMetadata(): Promise<Metadata> {
  if ((await currentLook()) === "old") return { title: "MTG Deck Builder", description };
  return {
    title: "Commandery",
    description,
    applicationName: "Commandery",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icons/commandery.svg", apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "Commandery", statusBarStyle: "black-translucent" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  if ((await currentLook()) === "old") return {};
  return { themeColor: "#0f0c1b", viewportFit: "cover", colorScheme: "dark" };
}

function Credit({ className }: { className: string }) {
  return (
    <footer className={className}>
      Card data and images from{" "}
      <a className="underline" href="https://scryfall.com">
        Scryfall
      </a>
      . Unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards.
    </footer>
  );
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const look = await currentLook();
  if (look === "new") {
    return (
      <html lang="en" className={`${inter.variable} ${sora.variable}`}>
        <body className="antialiased">
          <AppShell>{children}</AppShell>
        </body>
      </html>
    );
  }
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-1">
            <Link href="/" className="inline-flex min-h-11 items-center font-semibold tracking-tight">
              MTG Deck Builder
            </Link>
            <ul className="flex gap-4 text-sm text-muted">
              {NAV.slice(1).map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="inline-flex min-h-11 items-center hover:text-foreground">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <Credit className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted" />
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs">
          <a href="?look=new" className="text-accent underline">
            Try the new look
          </a>
        </p>
      </body>
    </html>
  );
}
