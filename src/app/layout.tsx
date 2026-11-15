import type { Metadata } from "next";
import Link from "next/link";
import { NAV } from "@/lib/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTG Deck Builder",
  description: "Build Commander decks from the cards you own.",
};


export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              MTG Deck Builder
            </Link>
            <ul className="flex gap-4 text-sm text-muted">
              {NAV.slice(1).map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="hover:text-foreground">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted">
          Card data and images from{" "}
          <a className="underline" href="https://scryfall.com">
            Scryfall
          </a>
          . Unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by
          Wizards.
        </footer>
      </body>
    </html>
  );
}
