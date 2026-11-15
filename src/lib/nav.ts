/** Top-level navigation. One list drives the header (and later the sidebar/menu config). */
export type NavItem = { href: string; label: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/collection", label: "Collection" },
  { href: "/collection/add", label: "Add cards" },
  { href: "/import", label: "Import" },
];
